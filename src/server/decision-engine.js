'use strict';
/**
 * THE DECISION ENGINE (lane decision-core, D1 of docs/design-decision-api.zh.md) — ORCH, and the ONLY caller of
 * a decisions API in the tree (scripts/test-vendor-whitelist.mjs allowlists this file alone, by its gates).
 *
 * `judge(use, parts, {questions, memo, accountNever, perHour})`:
 *   1. the MEMO (data/decision-memo.json, LRU 5 000, + memory) — a hit makes NO call;
 *   2. the key from the registry row (`resolveIntegration('llm')`: the user's own > the cluster preset > none) and the
 *      LLM plugin's switches + budget + judging model (src/plugins/llm.js attaches its record here — lane
 *      llm-plugin-rename: the model is the plugin's `judgeModel` row, else the cluster preset's `model` while its key is
 *      in use, else the provider's default);
 *   3. RESERVE (lane decision-verify-fixes, F1–F5): `budgetVerdict` (PURE) — no key, a switch off, a key the
 *      provider refused, a backoff, the day's budget spent (SETTLED + the open RESERVATIONS + this estimate, in USD),
 *      the hour: a QUIET named refusal (journalled once per reason per 5 min; the day's budget stop says ONE server
 *      notice) — and on a pass the estimate is reserved IN THE SAME synchronous step (`reserve`), so N judgments in
 *      flight with room for one make exactly one call;
 *   4. ONE fetch to the dialect's URL (every question's owner-written text through `M.scrubQuestions` first — the ONE
 *      scrub, B-d375); the body FROZEN where it is built, serialized ONCE into bytes and sent as a ONE-SHOT stream with
 *      its length (`M.oneShotBody`, the text client's own — lane judge-one-shot-body: Node's fetch re-sends a string body
 *      on an HTTP 421 over a new connection, empty but with the key — a second request); a 3xx is never followed —
 *      429 ⇒ its Retry-After (else the ladder), 5xx / a network failure ⇒ backoff 1 → 5 → 15 min;
 *      a ROW STOP (`M.rowStopOf`, lane decision-vendor-hygiene): 401 / 403 ⇒ the row needs a new key (`reconnect`),
 *      402 ⇒ the plan does not allow the model (`plan`), 400 ⇒ the model refused the request shape (`shape`) — no
 *      call until the key, the provider or the model changes (the owner's Test still calls; its 200 lifts the stop),
 *      `plan` / `shape` say ONE server notice; NEVER a retry, never one call a record;
 *   5. SETTLE: the reservation is replaced by `settleUsd` (the vendor's recorded usage.cost, else the reservation —
 *      never 0 for a 200; an answered 4xx / 5xx costs 0) in the counter per day per use (data/decision-usage.json,
 *      tmp + rename; it also keeps the row's recorded cost per token, which prices the next estimates), and a journal
 *      line per call (data/decision-journal.jsonl, bounded 5 000 lines / 30 days: use, memo key, tokens, reserved →
 *      USD, dialect, model, outcome — no key, no text).
 * The input is bounded by the use's plan and asserted again here. A judgment opens no turn: no SPEND_REASONS
 * (design §2.11); a wake caused by a hit rides the turn ceiling where D3 wakes it.
 *
 * USE ④ — THE FOR-YOU PASS (lane inbox-decision-group): `attachInbox(store)` (the user-todos manager) arms a 60 s
 * tick, never a wake path: a moved switch redraws the tray (the store's own broadcast), and every 5 minutes ≤ 10
 * eligible items (PURE `inboxEligible`: open, normal urgency, no options / buttons, no reply, ≥ 1 min old, not scored
 * under this level table) are scored ONE item a call through `judge('inbox', …)` — the same memo, reserve / settle and
 * journal as every use. The verdict lands beside the item (`store.setJudged`: `judged {group, p, at, v}`); the item's
 * urgency is never written.
 * v2 (lane decision-inbox-rank): each pass first reads the BOARD once (`attachInbox(store, {board})` — the wiring's
 * reader of vibespace-status's record + history and the newest vibespace-task progress note of a conversation; never a
 * store of its own) and writes every sortable item's PURE `inboxFacts` (`store.setFacts`, only when they changed — no
 * call); then the items the rules do not place already (a blocked fact, the 48 h decay) are judged with their facts line
 * (`judged {group, why, p, at, v, facts, sig}`). A pass a refusal stopped is SAID: a log line when the reason changes and
 * `status().inbox` {at, judged, placed, stopped} (the plugin's status carries it).
 * lane foryou-folds (design q-044 decision 3): THE JUDGE IS A TIE-BREAKER. The facts half runs on every pass whatever the
 * switch (free — the attention list's bands 2–3 read them: a blocked board, a named date), and the judge scores ONLY the
 * rows src/attention-model.js `tieCandidates` names (band-5 asks that share their minute with another) — every other row
 * is placed by facts, so the For-you judge went from 25–100 calls a day to about none. `status().inbox` adds `untied`
 * (eligible rows the rule left alone).
 *
 * USE reply-infer (lane dm-reply-infers, B-6b4b): the channels engine's pre-pass asks ONE fixed question
 * (`M.REPLY_INFER_QUESTION`) per candidate — a peer's plain message after a send of the principal, in the rule's scope —
 * with the memo = the candidate record + the sent message (judged once, for ever); the Rules switch gates it, the day's
 * budget bounds it like every use, and its journal line carries the score (`p`).
 *
 * THE JUDGED ROAD (lane judged-watch-state, B-f42e): `roadFacts(use)` = what M.judgedRoadState reads for a judged rule
 * (the plugin, its switch, the key, what is left today against one judgment's price) — the channels engine's pre-passes,
 * the watch answers and `watches` ask it; `notePaused(names)` = the owner's ONE For-you item a day when the budget paused
 * judged rules (a plugin row filed low, the door = the plugin's settings).
 *
 * THE LEDGER (lane rule-learning, design q-037 P0): the ONE other paid caller on this pool — src/server/text-model-client.js
 * (the chat completions that DRAFT the person's 「我关心什么」 block, use `learn`) — is created HERE (`textModel`) over
 * `ledger`: the plugin's switches + budget, what the day spent (settled + reserved, every use), one use's share, a
 * reservation in the SAME `open` map (`hold`), the settle and the journal — one counter, one journal, one daily budget.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const M = require('../decision-model.js');
const SR = require('../store-read.js');        // B-f276 family (r3175): one read's answer — data / missing / unreadable / corrupt
const HOLD = require('../store-read-hold.js');  // …and the family's hold: held, read again off the loop, torn bytes kept aside once
const A = require('../attention-model.js'); // PURE: THE attention list (lane foryou-folds) — the judge scores only a band-5 tie

const ROW_ID = 'llm';   // lane llm-plugin-rename: the Language model row (the key) — its data files keep their decision-* names
const FEATURE_OF = Object.freeze({ attention: 'attention', rule: 'rules', routing: 'routing', inbox: 'inbox', webhook: 'rules', 'reply-infer': 'rules', 'vault-use-policy': null, test: null });   // + reply-infer (lane dm-reply-infers): a reply rule's judgment rides the Rules switch; + vault-use-policy (lane vault-use-grants): its switch is the vault's own (vault.policyJudge, default OFF) — the plugin, the key and the money still gate it
const JOURNAL_MAX = 5000;
const JOURNAL_DAYS = 30;
// B-0248 (r2417 law 2): a call's RESERVATION line is on disk within this bound, or the judgment is refused by name (nothing is asked)
const RESERVE_LAND_MS = 20000;
// B-f276 family (r4121 (a), (b)): the hold's words — the ONE notice (its i18n key is its English sentence; zh / ja in the dictionaries),
// and the owner's Test answers the drafter card's sentence for each code (src/lib/learn-card.js), never the bare code
const UNREAD_NOTICE = Object.freeze({
  'spend-unread': 'The language model plugin is paused: VibeSpace cannot read its record of what it spent today right now. Nothing is judged and nothing is spent until it reads again — it tries again by itself.',
  'memo-unread': 'The language model plugin is paused: VibeSpace cannot read its saved answers right now. Nothing is judged and nothing is spent until it reads again — it tries again by itself.',
});
const HELD_TEST_WORDS = Object.freeze({
  'spend-unread': 'the LLM plugin\'s record of what it spent today could not be read — nothing was spent; try again in a few minutes (it reads it again by itself)',
  'memo-unread': 'the LLM plugin\'s saved answers could not be read — nothing was spent; try again in a few minutes (it reads them again by itself)',
});
const HELD_READ_MS = 60_000;   // B-f276 family (r4121 must 2): the journal's read again is BOUNDED as the family's helper's (READ_MS): past it the hold says a read waits
// r2581 (3): the Test's words for that refusal — the storage, not the provider (the Integrations window shows them in the person's language)
const TEST_RESERVATION_WORDS = 'the call was not sent: its spending line could not be written to the data folder — nothing was charged; test again once the storage writes';
const QUIET_MS = 5 * 60 * 1000;
const TEST_SENTENCE = 'The invoice for the March order is due tomorrow — please confirm you will pay it.';
const TEST_QUESTION = Object.freeze({ type: 'predicate', name: 'deadline_or_money', instructions: 'Does the text mention a deadline or money the reader owes?' });
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');


function create({ dataDir, integrations = null, fetchImpl = (...a) => globalThis.fetch(...a), now = () => Date.now(),
  tzOffset = (ms) => new Date(ms).getTimezoneOffset(), serverNotice = null, log = console, baseUrlFor = null, timeoutMs = 15000, writer = null,
  settingsHeld = () => null, reserveLandMs = RESERVE_LAND_MS, heldReadMs = HELD_READ_MS } = {}) {
  // B-225b R3/R11 (the persistence holds): data/settings.json HELD — the plugin's rows (its daily dollar cap among them) read their
  // DEFAULTS, so no billed call may lean on them: NOT NOW by name ('settings-unread'), nothing reserved, nothing spent
  const settingsUnread = () => { try { return !!settingsHeld(); } catch { return false; } };
  const file = (n) => path.join(dataDir, n);
  const fetch = fetchImpl;                             // the request primitive by its census name (tests hand in a fake)
  const F = { memo: file('decision-memo.json'), usage: file('decision-usage.json'), journal: file('decision-journal.jsonl') };
  // lane lg-store-writes (B-0248 U1): THE MEMO AND THE DAY'S COUNTER GO THROUGH THE STORE WRITER (src/store-writer.js — its
  // own thread): the main loop never waits on their rename (decision-memo.json held the owner's hub 1.3 s and 1.5 s in one
  // calm hour on .396; a judged call wrote the counter up to three times). The memo is the hub's own cache — PACED (a lost
  // last write re-asks the judge once); the counter is money — an ACT (rank 0, urgent) and A CALL
  // THAT CHANGED IT ANSWERS ONLY ONCE THE COUNTER HOLDING IT IS ON DISK (its own promise waits; the loop never does): an
  // ANSWERED call's cost is on disk. The gap left is «billed, not answered yet» — a kill between the vendor's answer and the
  // counter's landing — the write in flight, at most one paced write (the writer alternates acts and paced stores;
  // 2K + 1 writes for K acts owed), then its own: ms on a local disk; on the measured slow mount about 1.5 s with the
  // writer idle and up to about 5 s behind the channels index's write (renames there took 1.3–2.6 s) — forgets that one
  // call — B-a85f: THE BOOT REBUILDS IT (below: each use raised to at least today's journal sum). Since B-0248's next part the
  // journal's money line is the call's RESERVATION, on disk BEFORE the vendor is asked (a reservation with no result line counts
  // as spent, once), so the journal holds every billed call. The journal stays a named row.
  const W = () => writer || require('../store-writer.js').storeWriter();
  // ── THE JOURNAL THROUGH THE STORE WRITER (B-0248's next part, the coordinator's r2403 / r2417 — measured: a judgment held the loop
  // with its line's synchronous append, the first after a start re-read the whole file to count it, the 6 000th rewrote it). Its
  // lines are ONE store's appends on the writer's thread (rank 0, urgent: money); its trim is a REWRITE job of that store from its
  // own byte ranges, in order with every append (src/store-writer-worker.js rewriteJob — the OTel stash's road). A billed call's
  // money belt (B-a85f) is its RESERVATION line, ON DISK before the vendor request is built (law 1); a reservation with no result
  // line is counted SPENT, once, by the boot's rebuild (law 4, decision-model daySpendByUse). The index: every whole line the
  // boot's tail read saw and every line written since, by its byte offset (the count and the trim come from it — law 6).
  let jIdx = [];          // [{off, len, at, call, out}] the file's known lines, in its order (len: bytes without the newline)
  let jSize = 0;          // the file's bytes as the index knows them
  let jWhole = true;      // the boot's tail read reached the file's start
  let jTorn = false;      // the file may end without its newline: the next append starts on a new line
  let jKnown = false;     // the index matches the file (false after a write the writer never confirmed, or a failed append: no trim until the next start)
  let jOwed = [];         // lines not handed to a write yet (each ends with its newline)
  let jWriting = null;    // {lines, lead, trim} the write in flight
  let jTrimDue = false, jFailSaid = false, jSeq = 0;
  let jKeptFloor = 0;     // what the last trim kept: the next trim is due past 1.2 × the larger of it and JOURNAL_MAX (a day the belt keeps whole never rewrites at every write)
  const CALL_TAG = crypto.randomBytes(6).toString('hex');   // this engine's calls: «<tag>.<seq>» on the reservation and its result
  const callOf = (id) => `${CALL_TAG}.${id}`;
  /** the journal's rows from a BOUNDED tail (≤ 2 MB: the journal itself is cut at 5 000 lines / 30 days) — the month's readout and
   *  the boot's rebuild of the day's counter (B-a85f) */
  // B-f276 family (form 3 rank 6, lane bl-loop-a, 主开发 r3175): «not there» is told from «the read failed» — a journal that could
  // not be read is UNREAD (the day's spend is then unknown), never «no calls today»; a line that does not parse is skipped, as before
  const tailRows = (buf, size) => buf.toString('utf8').split('\n').slice(buf.length < size ? 1 : 0).map((l) => { try { return JSON.parse(l); } catch { return null; } });
  function journalRead() {
    let fd;
    try { fd = fs.openSync(F.journal, 'r'); } catch (e) {
      if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) { jIdx = []; jSize = 0; jWhole = true; jTorn = false; jKnown = true; return { rows: [] }; }   // not there: a new instance
      return { unread: SR.codeOf(e) };   // unread for another reason: the day's spend unknown (B-f276 family), and no trim this start
    }
    try {
      const size = fs.fstatSync(fd).size, n = Math.min(size, 2 * 1024 * 1024), buf = Buffer.alloc(n);
      fs.readSync(fd, buf, 0, n, size - n);
      // the index (law 6: the count comes from this read — no second whole read): each whole line by its byte offset; a tail that
      // starts inside a line skips it, as the rows always did
      const base = size - n, idx = [], rows = [];
      let i = 0;
      if (n < size) { const nl = buf.indexOf(0x0a); i = nl < 0 ? n : nl + 1; }
      while (i < n) {
        let e = buf.indexOf(0x0a, i); if (e < 0) e = n;
        if (e > i) { let r = null; try { r = JSON.parse(buf.toString('utf8', i, e)); } catch { } if (!r || typeof r !== 'object') r = null; rows.push(r); idx.push(idxOf(base + i, e - i, r)); }
        i = e + 1;
      }
      jIdx = idx; jSize = size; jWhole = n === size; jTorn = n > 0 && buf[n - 1] !== 0x0a; jKnown = true;
      return { rows };
    } catch (e) { return { unread: SR.codeOf(e) }; } finally { try { fs.closeSync(fd); } catch (e) { holdLog(`the journal's descriptor could not be closed (${SR.codeOf(e)}) — what was read is used`); } }
  }
  const idxOf = (off, len, r) => ({ off, len, at: r ? Number(r.at) : NaN, call: r && typeof r.call === 'string' ? r.call : null, out: r && typeof r.outcome === 'string' ? r.outcome : null });
  let rebuiltAtBoot = false;   // B-a85f: the boot raised the day's counter from the journal — written once saveUsage exists
  // A LOAD READS WHAT THIS PROCESS STILL OWES: an engine made again in the same process (a suite's restart) lands the
  // write the last one handed the writer BEFORE it reads the files — a hub's boot owes nothing (no wait)
  { const owed = [F.memo, F.usage, F.journal].filter((f) => W().pending(f)); if (owed.length) W().flushSync(owed); }
  let plugin = null;                                   // {peek} — the plugin row's own record (enabled + config)
  // B-f276 family (form 3 rank 6, lane bl-loop-a, 主开发 r3175): THE PAID JUDGE's THREE FILES UNDER THE STORE-READ LAW. The release
  // read ANY failure of the counter, the memo or the journal as «nothing»: today's spend started at zero (the daily budget could be
  // OVERSPENT), the memo's paid answers were asked again, and the next write landed over the file. NOW «not there» (a new
  // instance), «the read failed» and «the bytes do not parse» are three answers (src/store-read.js): a counter or a journal that
  // could not be read makes the day's spend UNKNOWN, and unknown REFUSES every paid judgment BY NAME before anything is reserved
  // ('spend-unread' — the inbox's clock pass, an agent's ask, a rule's, the owner's Test alike: each spends against this one
  // counter); a memo that could not be read refuses too ('memo-unread' — never pay again for an answer it may hold). Nothing is
  // written over a held file; torn bytes are kept aside ONCE (the family's hold), then the store starts empty and the counter is
  // raised from the journal (B-a85f); the person is told once; each is read again off the loop, and a read again lifts it.
  const readOf = (f) => { try { return { text: fs.readFileSync(f, 'utf8') }; } catch (error) { return { error }; } };
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const MEMO_SHAPE = (v) => isObj(v) && (v.entries === undefined || Array.isArray(v.entries));
  const USAGE_SHAPE = (v) => isObj(v) && (v.byUse === undefined || isObj(v.byUse));
  const holdLog = (line) => log.warn?.(`[decision] ${line}`);
  const memo = new Map();
  const memoLoad = (v) => { memo.clear(); for (const e of ((v && v.entries) || []).filter((x) => Array.isArray(x) && x.length === 2).slice(-M.MEMO_MAX)) memo.set(e[0], e[1]); };
  let usage = { day: null, byUse: {} };
  let journalUnread = null;   // {code, since} — the journal could not be read: the day's spend is unknown until a read again answers
  // r4121 MUST 1 — THE RAISE AT A LIFT COMES FROM WHAT THIS LIFE's OWN READ OF THE JOURNAL GAVE: the rows the boot read (or the journal's
  // own read again) are KEPT while the counter is held — no paid call can join the journal meanwhile (every one is refused before its
  // reservation), so they are the whole truth of that day; the counter's lift raises from them and drops them. No second read of the
  // journal is made on the loop in mid-life, and its index is never replaced there. A day that turned while held starts at what was
  // paid since: nothing (rebuildFromJournal counts the rows of TODAY only)
  let bootRows = null;
  /** a hold of the judge is on (the counter, the memo or the journal) — the person was told once, and is told again only after none is */
  function anyHeld() { return !!(usageHold.held() || memoHold.held() || journalUnread); }
  const memoHold = HOLD.create({ file: F.memo, valid: MEMO_SHAPE, code: 'memo-unread', aside: (mark) => `${F.memo}.corrupt-${mark}`, log: holdLog,
    words: (h) => `the language model plugin's saved answers (decision-memo.json) could not be read (${h.code}): nothing is judged until they read again — none is asked of the provider twice`,
    onLift: (v) => { memoLoad(v); if (!anyHeld()) heldSaid = false; } });
  const usageHold = HOLD.create({ file: F.usage, valid: USAGE_SHAPE, code: 'spend-unread', aside: (mark) => `${F.usage}.corrupt-${mark}`, log: holdLog,
    words: (h) => `the language model plugin's spending record for today (decision-usage.json) could not be read (${h.code}): nothing is judged until it reads again — never on a spend of zero`,
    onLift: (v) => {
      usage = USAGE_SHAPE(v) ? v : { day: null, byUse: {} };
      if (journalUnread) { if (!anyHeld()) heldSaid = false; return; }   // the journal still held: ITS lift raises the counter, from its own read
      const rows = bootRows; bootRows = null;
      if (!rows) {   // r4121 law 2: the journal's rows of the day not known at a lift ⇒ the spend STAYS UNKNOWN (never zero, never «raised by nothing»).
        // NOT REACHABLE TODAY (r4201): a hold begins only at a start, and the start either keeps the rows (the counter held, the journal read)
        // or holds the journal; the journal's own lift refills them while the counter is held. Kept as the fail-closed default: the journal's
        // own hold reads it off the loop (and no paid call is on its way here — every one was refused while the counter was held)
        journalUnread = { code: 'rows-not-kept', since: now() }; holdLog('the counter read again, but no read of the journal is kept for its raise — the spend stays unknown until the journal is read again off the loop'); journalArm(); return;
      }
      if (!anyHeld()) heldSaid = false;
      if (rebuildFromJournal(rows)) saveUsage();
    } });
  { const a = SR.storeAnswer(readOf(F.memo), { valid: MEMO_SHAPE }); if (memoHold.start(a) === 'data') memoLoad(a.value); }
  { const a = SR.storeAnswer(readOf(F.usage), { valid: USAGE_SHAPE }); if (usageHold.start(a) === 'data') usage = a.value; }
  let heldSaid = false;   // the person told ONCE a hold of the judge (a server notice), said again only after NONE is held and a new hold begins (r4121 (c))
  // B-a85f — THE DAY'S COUNTER IS REBUILT FROM THE JOURNAL AT BOOT (the money crash window of B-0248 U1): a kill between a billed
  // call's journal line and its counter's landing left the counter short (its reservation line is on disk before the ask) — the next
  // calls would spend past the daily budget by that much. Each use is raised to AT LEAST the journal's sum for today, never
  // lowered (a counter ahead of its journal — a trimmed journal — keeps its own); a raise is written (an act) and said once.
  /** B-a85f's raise, as a step of its own: each use raised to AT LEAST the journal's sum for today — run at a start that read both
   *  files, and again when a held one lifts (B-f276 family). → true when it raised (the caller writes it) */
  function rebuildFromJournal(rows) {
    const day0 = M.dayOf(now(), tzOffset(now()));
    const j = M.daySpendByUse(rows, day0, tzOffset);
    if (usage.day !== day0) usage = { day: day0, byUse: {}, rate: usage.rate || {} };
    const raised = [];
    for (const [use, js] of Object.entries(j.byUse)) {
      const x = usage.byUse[use] || (usage.byUse[use] = { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 });
      if (js.usd > (Number(x.usd) || 0) + 1e-9 || js.calls > (Number(x.calls) || 0)) {
        raised.push(`${use} ${(Number(x.usd) || 0).toFixed(4)} → ${js.usd.toFixed(4)} USD`);
        x.usd = Math.max(Number(x.usd) || 0, js.usd); x.calls = Math.max(Number(x.calls) || 0, js.calls);
        x.inputTokens = Math.max(Number(x.inputTokens) || 0, js.inputTokens); x.outputTokens = Math.max(Number(x.outputTokens) || 0, js.outputTokens);
      }
    }
    if (raised.length) log.warn?.(`[decision] the day's counter was behind its journal (a stop before its write landed) — raised to the journal's sum: ${raised.join('; ')}`);
    return raised.length > 0;
  }
  {
    const jr = journalRead();
    if (jr.unread) { journalUnread = { code: jr.unread, since: now() }; holdLog(`the journal (decision-journal.jsonl) could not be read (${jr.unread}) — the day's spend is unknown: nothing is judged, nothing is written to it, and it is read again off the main loop`); }
    else if (!usageHold.held()) rebuiltAtBoot = rebuildFromJournal(jr.rows);
    else bootRows = jr.rows;   // r4121 must 1: the counter held — its lift raises from THESE rows (no second read)
  }
  let backoff = { step: 0, until: 0 };
  const open = new Map();                              // reservation id → {use, usd}: estimates of the calls in flight
  let openSeq = 0;
  let stop = null;                                     // {sig, why, status, at}: the provider refused THIS key + model (a row stop)
  let state = 'ok';                                    // ok | backoff | reconnect | plan | shape — logged once per change
  let noticedStop = null;                              // the row stop whose notice reached a client (one per stop)
  let lastOutcome = null;
  const quietAt = new Map();                           // why → last journalled at
  let noticedDay = null;
  const hourCalls = [];                                // call times, the per-hour window

  const attachPlugin = (h) => { plugin = h && typeof h.peek === 'function' ? h : null; };
  function settings() {
    const rec = plugin ? plugin.peek() || {} : {};
    // lane plugin-settings-p0: the values are the plugin's settings rows (h.settings via the plugin), never rec.config
    const c = plugin && typeof plugin.settings === 'function' ? plugin.settings() || {} : {};
    return {
      pluginOn: !!rec.enabled,
      features: Object.fromEntries(M.FEATURES.map((f) => [f, c[f] === true])),
      dailyBudgetCents: Number.isFinite(Number(c.dailyBudgetCents)) && Number(c.dailyBudgetCents) >= 0 ? Number(c.dailyBudgetCents) : M.DAILY_BUDGET_CENTS_DEFAULT,
      threshold: Number.isFinite(Number(c.threshold)) ? Number(c.threshold) : M.THRESHOLD_DEFAULT,
      learnModel: typeof c.learnModel === 'string' ? c.learnModel : null,   // lane rule-learning: the drafter's tier (flash | sonnet)
      learnOn: c.learn !== false,   // lane llm-plugin-rename: the drafter's own switch (the text-model client's availability)
      judgeModel: typeof c.judgeModel === 'string' ? c.judgeModel.trim() : '',   // the plugin's row ('' = the preset's / the provider's)
    };
  }
  /** The row's answer, as the engine needs it — never logged, never returned. */
  function credential(resolved = null) {
    let r = resolved;
    if (!r) { if (!integrations || typeof integrations.resolveIntegration !== 'function') return null; try { r = integrations.resolveIntegration(ROW_ID); } catch { return null; } }
    const v = (r && r.values) || {};
    const provider = M.dialectOf(String(v.provider || '').trim().toLowerCase());
    if (!provider || !v.apiKey) return null;
    // the judging model: the plugin's row > the cluster preset's choice while ITS key is in use (a model named for the
    // cluster's provider never rides the user's own key) > the provider's default
    const preset = r.source === 'cluster' ? String(v.model || '').trim() : '';
    return { provider, model: settings().judgeModel || preset || M.DEFAULT_MODEL[provider], key: String(v.apiKey), source: r.source || null };
  }
  function today() {
    const day = M.dayOf(now(), tzOffset(now()));
    if (usage.day !== day) usage = { day, byUse: {}, rate: usage.rate || {} };   // the recorded cost per token outlives the day
    return usage;
  }
  const totalOf = (u) => Object.values(u.byUse).reduce((s, x) => ({ calls: s.calls + x.calls, inputTokens: s.inputTokens + x.inputTokens, outputTokens: s.outputTokens + x.outputTokens, usd: s.usd + x.usd }), { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 });
  const reservedUsd = () => [...open.values()].reduce((a, r) => a + r.usd, 0);
  const rateKey = (cred) => `${cred.provider} ${cred.model}`;
  /** A row stop holds while the credential is the one refused: the same key, provider and model (a change of any lifts it). */
  const credSig = (cred) => sha(`${cred.provider}\n${cred.model}\n${cred.key}`);
  const stopOf = (cred) => (stop && cred && stop.sig === credSig(cred) ? stop.why : null);
  function say(next, line) { if (next !== state) { state = next; log.warn?.(`[decision] ${line}`); } }
  /** RESERVE — the verdict and the write in ONE synchronous step (no await between them): the ceiling sees every
   *  call in flight. → {v, id?}. */
  function reserve(use, { s, cred, accountNever, est, perHour, t }) {
    const rate = cred ? M.rateOf((usage.rate || {})[rateKey(cred)], M.PRICE_PER_MTOK_USD[cred.provider]) : 0;
    const estUsd = est * rate;
    const v = verdictOf(use, { s, cred, accountNever, estUsd, perHour, t });
    if (!v.ok) return { v };
    const id = ++openSeq;
    open.set(id, { use, usd: estUsd });
    hourCalls.push(t);
    return { v, id, estUsd };
  }
  /** the owner's gates and the ceiling, as they stand at `t` → budgetVerdict's answer. `mine` (B-0248): judged AGAIN for a call whose
   *  reservation just landed — its own slot (estimate and hour) is not counted against itself; every other call in flight is */
  function verdictOf(use, { s, cred, accountNever, estUsd, perHour, t, mine = false }) {
    const feature = FEATURE_OF[use];
    while (hourCalls.length && hourCalls[0] <= t - 3600e3) hourCalls.shift();
    const held = use === 'test' ? null : stopOf(cred);   // the owner's Test always calls: it is how a fixed plan is seen
    return M.budgetVerdict({
      pluginOn: use === 'test' || s.pluginOn, featureOn: feature === null || s.features[feature] === true, keyPresent: !!cred, accountNever,
      reconnect: held === 'reconnect', plan: held === 'plan', shape: held === 'shape', backoffUntil: backoff.until, now: t,
      spentUsd: totalOf(today()).usd + reservedUsd() - (mine ? estUsd : 0), estUsd, ceilingCents: s.dailyBudgetCents, hourCount: hourCalls.length - (mine ? 1 : 0), perHour,
    });
  }
  /** SETTLE — the reservation leaves; what the call cost lands in the day's counter (a 0-cost error counts nothing).
   *  → the counter's durable() promise (true once on disk), or null when nothing changed */
  function settle(id, use, u, usd, est) {
    open.delete(id);
    if (!(usd > 0) && !u.inputTokens) return null;
    const d = today();
    const x = d.byUse[use] || (d.byUse[use] = { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 });
    x.calls += 1; x.inputTokens += u.inputTokens || est; x.outputTokens += u.outputTokens; x.usd = Math.round((x.usd + usd) * 1e8) / 1e8;
    return saveUsage();
  }
  /** THE DAY'S COUNTER, AN ACT through the store writer (lg-store-writes U1): the bytes are the counter as it is when the
   *  write is due (a burst of calls is one write); a write that FAILED is said once (kept in memory, the writer retries)
   *  and the next write that lands says so once — each write's own outcome (onWritten), not a caller's wait.
   *  → its durable() promise (true once the counter holding this change is on disk; false: failed, or still queued) */
  let usageOwedSaid = false;
  function saveUsage() {
    if (!usageHold.writable('the day\'s counter')) return Promise.resolve(false);   // B-f276 family: nothing written over a counter that was not read
    try {
      W().dirty(F.usage, { name: 'decision-usage.write', rank: 0, mode: 0o600, produce: () => JSON.stringify(usage),
        onWritten: (ok, e) => {
          if (!ok && !usageOwedSaid) { usageOwedSaid = true; log.warn?.(`[decision] the day's counter is not on disk (its write failed: ${(e && (e.code || e.message)) || 'an error'}) — kept in memory, the store writer retries`); }
          else if (ok && usageOwedSaid) { usageOwedSaid = false; log.warn?.('[decision] the day\'s counter is on disk again'); }
        } });
      return W().durable(F.usage).catch(() => false);
    } catch (e) { log.warn?.(`[decision] usage not saved: ${e.message}`); return Promise.resolve(false); }
  }
  /** ONE journal line: handed to the store writer (an append of this store, rank 0 — money), never written on the loop. → this
   *  line's seq (a caller that must see it on disk awaits W().durable(F.journal)) */
  function journal(o) {
    if (journalUnread) return;   // B-f276 family: no line appended and no trim over a journal that was not read (said once at the start)
    const row = M.journalRow({ at: now(), rubric: M.RUBRIC.version, ...o });
    jOwed.push(JSON.stringify(row) + '\n'); jSeq++;
    if (jKnown && (!jWhole || jIdx.length + (jWriting ? jWriting.lines.length : 0) + jOwed.length > Math.max(JOURNAL_MAX, jKeptFloor) * 1.2)) jTrimDue = true;   // law 6: the count from the index (+ the lines on their way)
    try { W().dirty(F.journal, { name: 'decision-journal.write', rank: 0, urgent: true, mode: 0o600, produce: produceJournal, onWritten: journalWritten }); }
    catch (e) { log.warn?.(`[decision] journal: ${e.message}`); }
    return jSeq;
  }
  /** the bytes of the journal's next write, made when it is due: the owed lines as ONE append — or, when a trim is owed and the
   *  index matches the file, ONE rewrite of the file from the byte ranges it keeps, then those lines (law 5: in order with every
   *  append; a synchronous flush — the exit — never rewrites: the next write trims) */
  function produceJournal(o) {
    if (jWriting) {   // the writer never confirmed the last write (its thread restarted and asks again): offered again on a new line —
      // the file holds it or not; the boot's pairing counts a line written twice once — and the index no longer knows the file
      if (jWriting.trim) log.warn?.('[decision] the journal\'s trim was not confirmed (the store writer\'s thread restarted) — the file is the trimmed one or the old one, whole; the next start trims');
      jOwed = jWriting.lines.concat(jOwed); jTorn = true; jKnown = false; jWriting = null;
    }
    if (!jOwed.length) return null;
    const lines = jOwed; jOwed = [];
    const trim = jTrimDue && jKnown && !(o && o.sync) ? keptRanges() : null;
    const lead = !trim && jTorn ? '\n' : '';   // a rewrite ends every kept line with its newline itself
    jWriting = { lines, lead, trim };
    if (!trim) return { append: lead + lines.join('') };
    jTrimDue = false;
    return { rewrite: { ranges: trim.ranges, size: trim.size }, then: lines.join(''), as: 'decision-journal.write' };
  }
  /** law 5: the byte ranges a trim keeps (decision-model journalKeep: the belt's day, every reservation with no result line, the
   *  newest inside JOURNAL_DAYS up to JOURNAL_MAX; a line that is not a row kept as it is, outside that count — r3739); a line the
   *  index does not hold (before the boot's tail) is not kept */
  function keptRanges() {
    const keepI = M.journalKeep(jIdx.map((x) => ({ at: x.at, call: x.call, outcome: x.out })), { day: M.dayOf(now(), tzOffset(now())), offsetMinOf: tzOffset, now: now(), max: JOURNAL_MAX, days: JOURNAL_DAYS });
    const keep = keepI.map((k) => jIdx[k]), ranges = new Float64Array(keep.length * 2);
    keep.forEach((x, k) => { ranges[2 * k] = x.off; ranges[2 * k + 1] = x.off + x.len + 1; });   // each with its newline (one the file lacks: size + 1)
    return { ranges, size: jSize, keep, dropped: jIdx.length - keep.length, notRows: keep.filter((x) => !Number.isFinite(x.at)).length };
  }
  /** the write's outcome — the index follows the file: an append's lines at its end, a trim's kept lines and then its own */
  function journalWritten(ok, err) {
    const w = jWriting; jWriting = null;
    if (!w) return;
    const renamed = !ok && w.trim && err && err.code === 'ERENAMEDNOSYNC';   // the trim landed, its directory's fsync did not: the file is the trimmed one
    if (!ok && !renamed) {
      jOwed = w.lines.concat(jOwed);   // nothing of this write is on disk as written: owed again, first
      // NO TRIM UNTIL THE NEXT START (the coordinator's r2581 (2)): after a failed TRIM the next write is a plain APPEND — a trim that
      // keeps failing (the writer gone main-only refuses a rewrite job, EREWRITEMAIN; a file shorter than its index, ESHRUNK / ENOENT)
      // never locks the journal (every reservation refused for hours); a failed APPEND is truncated back at best — the offsets untrusted
      jKnown = false; jTrimDue = false;
      if (!w.trim) jTorn = true;       // a failed TRIM leaves the file whole as it was (the job copies, then renames): no torn tail
      if (!jFailSaid) { jFailSaid = true; log.warn?.(`[decision] the journal was not written (${(err && (err.code || err.message)) || 'an error'}) — its lines are kept in memory and the store writer retries`); }
      return;
    }
    if (jFailSaid) { jFailSaid = false; log.warn?.('[decision] the journal is written again'); }
    if (w.trim) {
      let off = 0; const kept = [];
      for (const x of w.trim.keep) { kept.push({ ...x, off }); off += x.len + 1; }
      jIdx = kept; jSize = off; jWhole = true; jTorn = false; jKeptFloor = kept.length;
      log.log?.(`[decision] the journal trimmed by its writer: ${w.trim.size} → ${off} B (${w.trim.dropped} line(s) dropped; kept the day's, every reservation with no result, the newest inside ${JOURNAL_DAYS} days, and ${w.trim.notRows} line(s) that are not rows as they are)${renamed ? ' — but its folder\'s fsync failed' : ''}`);
    }
    if (jKnown) {
      let off = jSize + Buffer.byteLength(w.lead);
      for (const l of w.lines) { const len = Buffer.byteLength(l) - 1; let r = null; try { r = JSON.parse(l); } catch { } jIdx.push(idxOf(off, len, r)); off += len + 1; }
      jSize = off;
    }
    jTorn = false;
  }
  /** law 1 + 2: a reservation line ON DISK (the writer's own durable answer) before the vendor request is built → {ok: true}; else the
   *  judgment is REFUSED BY NAME: its slot given back in memory (law 3), and a 'released' line paired with the reservation, so a
   *  reservation that lands late is never counted (nothing twice when it is asked again) */
  async function reservationLanded(id, use, t = null) {
    let ok = false;
    try { ok = (await W().durable(F.journal, { timeoutMs: reserveLandMs })) === true; } catch { ok = false; }
    if (ok) return { ok: true };
    let nd = null; try { nd = W().whyNotDurable(F.journal); } catch { }
    giveBack(id, t);
    journal({ use, call: callOf(id), outcome: 'released', why: 'reservation-unwritten' });
    const detail = nd && nd.why === 'queued' ? `its journal line was still queued after ${Math.round(reserveLandMs / 1000)} s` : `its journal line was not written (${(nd && (nd.code || nd.why)) || 'the storage'})`;
    lastOutcome = { at: now(), use, outcome: 'refused', why: 'reservation-unwritten' };
    log.warn?.(`[decision] a ${use} judgment was refused before the provider was asked: ${detail} — nothing was sent, nothing counted`);
    return { ok: false, why: 'reservation-unwritten', detail };
  }
  /** law 2 + 3: a reservation given back frees its slot — the day's estimate and the hour's call */
  function giveBack(id, t) {
    open.delete(id);
    if (t !== null && t !== undefined) { const k = hourCalls.lastIndexOf(t); if (k >= 0) hourCalls.splice(k, 1); }
  }
  function memoPut(key, answers) {
    memo.delete(key); memo.set(key, answers);
    while (memo.size > M.MEMO_MAX) memo.delete(memo.keys().next().value);
    saveMemo();
  }
  /** THE MEMO, PACED through the store writer (lg-store-writes U1): the hub's own cache — a burst of answers is one write */
  function saveMemo() {
    if (!memoHold.writable('the memo')) return;   // B-f276 family: nothing written over answers that were not read
    try { W().dirty(F.memo, { name: 'decision-memo.write', mode: 0o600, produce: () => JSON.stringify({ entries: [...memo.entries()] }) }); }
    catch (e) { log.warn?.(`[decision] memo not saved: ${e.message}`); }
  }
  // lane decision-vendor-hygiene: a row stop the owner must act on (the plan, the request shape) says ONE server notice — the
  // client words it from the i18n key, `text` stays the English; a notice no client received is said again at the next refusal
  const STOP_NOTICE = Object.freeze({
    plan: 'The LLM plugin stopped: the provider says the plan does not allow this model (HTTP 402). Change the judging model in the plugin’s settings, or the key on its Integrations card.',
    shape: 'The LLM plugin stopped: the model refused the request shape (HTTP 400). Change the judging model in the plugin’s settings, or the key on its Integrations card.',
  });
  function stopNotice(why) {
    if (!stop || !STOP_NOTICE[why]) return;
    const key = `decision-stop:${why}:${stop.sig.slice(0, 12)}`;
    if (noticedStop === key) return;
    try { const d = serverNotice?.(key, STOP_NOTICE[why], { level: 'warn', i18n: { key: STOP_NOTICE[why] } }); if (d !== 0) noticedStop = key; } catch { }
  }
  /** B-f276 family: why a paid judgment is refused now, or null — the day's spend unknown (its counter or its journal not read) or
   *  the memo not read. The person is told ONCE a hold (a server notice); the reason rides every refusal by name */
  function storesUnread({ memo: withMemo = true } = {}) {
    const why = usageHold.held() || journalUnread ? 'spend-unread' : withMemo && memoHold.held() ? 'memo-unread' : null;
    if (why && !heldSaid) {
      heldSaid = true;
      const text = UNREAD_NOTICE[why];   // r4121 (a): its i18n form, as the stop notices carry theirs (zh / ja in the dictionaries)
      try { serverNotice?.('decision-unread', text, { level: 'warn', i18n: { key: text } }); } catch { }
    }
    return why;
  }
  // THE JOURNAL's OWN HOLD (B-f276 family; r4121 MUST 2: it follows the family's helper, src/store-read-hold.js as it stands at
  // 5ed0769ee, in these points — the helper parses a whole file as JSON, so the journal of lines keeps this small hold of its own):
  //   the next try is armed FIRST at each try (store-read's ladder: 30 s doubling to 5 min), ONE read in flight;
  //   a «not there» right after an unread answer only arms the next try, and lifts as an empty journal on a SECOND such answer (a storage
  //   coming back answers ENOENT first);
  //   the read is BOUNDED (heldReadMs, the helper's READ_MS): past it the hold SAYS a read waits (once a hold), no second read starts
  //   while it hangs, and its answer is judged the moment it comes.
  // LIFTED: the counter still held keeps these rows for ITS lift (must 1); else the counter is raised from them. It is a row of the
  // family's held list (heldRow below: the person's «Read again now» reaches it).
  let jTries = 0, jTimer = null, jBusy = false, jMissingAt = 0, jWaiting = 0, jWaitSaid = false, jNextAt = 0;
  const jLifts = new Set();   // the held list's lift signal
  const SLOW = Symbol('a read past its bound');
  function journalArm() {
    if (jTimer || !journalUnread) return;
    const ms = SR.retryDelay(++jTries);
    jNextAt = now() + ms;
    jTimer = setTimeout(() => { jTimer = null; journalAgain().catch((e) => { holdLog(`the journal's read again failed (${(e && e.message) || e})`); journalArm(); }); }, ms);
    if (jTimer.unref) jTimer.unref();
  }
  /** ONE read again of the journal, off the loop → true when it lifted */
  async function journalAgain() {
    if (!journalUnread) return false;
    journalArm();   // the next try armed FIRST: a try that meets one in flight, a read that hangs, or a read that fails never ends the tries
    if (jBusy) return false;
    jBusy = true;
    const p = fs.promises.readFile(F.journal).then((buf) => ({ buf }), (error) => ({ error }));
    let tm = null;
    const first = await Promise.race([p, new Promise((r) => { tm = setTimeout(() => r(SLOW), heldReadMs); if (tm.unref) tm.unref(); })]);
    clearTimeout(tm);
    if (first !== SLOW) return journalJudge(first);
    jWaiting = now();
    if (!jWaitSaid) { jWaitSaid = true; holdLog(`the journal (decision-journal.jsonl): a read again has not answered in ${heldReadMs / 1000} s — its answer is used the moment it comes; no second read starts meanwhile`); }
    p.then((late) => journalJudge(late)).catch((e) => { jBusy = false; holdLog(`the journal's late answer could not be judged (${(e && e.message) || e})`); });
    return false;
  }
  /** one read's answer (a try's, or a late one's) — lifts the journal's hold, or keeps it; the read's turn ends here */
  function journalJudge(r) {
    let rows = null;
    try {
      jWaiting = 0;
      if (!journalUnread) return false;
      if (r.error) {
        const c = r.error.code;
        if (c !== 'ENOENT' && c !== 'ENOTDIR') { journalUnread.code = SR.codeOf(r.error); jMissingAt = 0; return false; }
        if (!jMissingAt) { jMissingAt = now(); return false; }   // «not there» right after an unread answer: read once more first
        rows = []; jTorn = false;
      } else {
        const buf = r.buf, tail = buf.length > 2 * 1024 * 1024 ? buf.subarray(buf.length - 2 * 1024 * 1024) : buf;
        rows = tailRows(tail, buf.length);
        jTorn = buf.length > 0 && buf[buf.length - 1] !== 0x0a;   // the next append starts on a new line; the index stays unknown (no trim this start)
      }
    } finally { if (rows === null) jBusy = false; }
    journalUnread = null; jTries = 0; jMissingAt = 0; jWaitSaid = false; jNextAt = 0; jBusy = false;
    if (jTimer) { clearTimeout(jTimer); jTimer = null; }
    if (!anyHeld()) heldSaid = false;
    holdLog(`the journal (decision-journal.jsonl) is read again${rows.length ? '' : ' (not there twice: an empty journal)'} — the day's spend is known`);
    if (usageHold.held()) bootRows = rows;   // the counter still held: ITS lift raises from these rows (must 1)
    else if (rebuildFromJournal(rows)) saveUsage();
    for (const fn of [...jLifts]) { try { fn(); } catch { /* a listener's own */ } }
    return true;
  }
  if (journalUnread) journalArm();
  /** the journal's hold as the family's held list reads an older hold (src/server/held-lists.js `older`): its facts, its read again, its lift */
  const heldRow = Object.freeze({
    key: 'decision-journal.jsonl',
    facts: () => (journalUnread ? { since: journalUnread.since, next: jNextAt || null } : null),   // the list carries since and next only (r4201): a read that waits is said in status().today.unknown.waiting
    readAgain: () => journalAgain(),
    onLift: (fn) => { if (typeof fn !== 'function') return false; jLifts.add(fn); return true; },
  });
  /** a read again of every held file of the judge, now (a person's act, a suite) → the held set after it: {spend, memo} (false = known) */
  async function readAgain() {
    await Promise.all([usageHold.held() ? usageHold.again() : null, memoHold.held() ? memoHold.again() : null, journalUnread ? journalAgain() : null]);
    return { spend: !!(usageHold.held() || journalUnread), memo: !!memoHold.held() };
  }
  function quiet(use, why, extra = {}) {
    lastOutcome = { at: now(), use, outcome: 'refused', why };
    if (why === 'plan' || why === 'shape') stopNotice(why);
    const k = `${use}:${why}`;
    if (!(now() - (quietAt.get(k) || 0) < QUIET_MS)) { quietAt.set(k, now()); journal({ use, outcome: 'refused', why, ...extra }); }
    if (why === 'daily-budget' && noticedDay !== usage.day) {
      noticedDay = usage.day;
      try { serverNotice?.('decision-budget', 'The LLM plugin stopped for today: its daily budget is spent. It resumes tomorrow (⚙ → Plugins → LLM).', { level: 'warn' }); } catch { }
    }
    return { ok: false, why, ...extra };
  }

  /** ONE judgment. → {ok:true, answers, memo:bool, usage?, usd?} | {ok:false, why, status?, retryAt?}. */
  /** THE ONE JUDGE CALL — its answer waits until the day's counter it changed is on disk (lg-store-writes U1: money, an
   *  answered act is on disk; the loop never waits — only this call's promise) */
  async function judge(use, parts, opts = {}) {
    const call = { counted: null }, j0 = jSeq;
    const r = await judgeCall(use, parts, opts, call);
    if (call.counted) await call.counted;
    if (jSeq !== j0 && !(r && r.why === 'reservation-unwritten')) { try { await W().durable(F.journal, { timeoutMs: reserveLandMs }); } catch { } }   // B-0248: its journal lines on disk before the answer (bounded; never a refusal)
    return r;
  }
  async function judgeCall(use, parts, { questions, memo: memoParts = null, accountNever = false, perHour = Infinity, resolved = null } = {}, call) {
    const n = Array.isArray(parts && parts.records) ? parts.records.length : 1;
    if (n > M.inputPlan(use).batch) throw new Error(`a ${use} judgment takes at most ${M.inputPlan(use).batch} record(s)`);
    const qs = n > 1 ? M.batchQuestions(questions, n) : questions;
    const key = memoParts ? M.memoKey(use, memoParts, sha) : null;
    if (key && memo.has(key)) { const a = memo.get(key); memo.delete(key); memo.set(key, a); return { ok: true, memo: true, answers: n > 1 ? M.unbatchAnswers(a, n) : a }; }
    const s = settings();
    if (settingsUnread()) return quiet(use, 'settings-unread');   // B-225b: the owner's cap is not known — never judged on its default
    { const sh = storesUnread(); if (sh) return quiet(use, sh); }   // B-f276 family: the day's spend (or the memo) unknown — no reservation, no judgment
    const cred = credential(resolved);
    if (stop && cred && stop.sig !== credSig(cred)) { stop = null; say('ok', 'a new key or model is saved: calls resume'); }
    const input = M.buildInput(use, parts);
    if (input.est > input.ceiling) return quiet(use, 'over-ceiling');            // the plan and the builder disagree — never sent
    const est = input.est + M.questionTokens(qs);
    const t = now();
    const { v, id, estUsd } = reserve(use, { s, cred, accountNever, est, perHour, t });   // budgetVerdict + the reservation, one step
    if (!v.ok) return quiet(use, v.why, v.retryAt ? { retryAt: v.retryAt } : {});
    const reserved = Math.round(estUsd * 1e8) / 1e8;
    const base = { use, call: callOf(id), memo: key, dialect: cred.provider, model: cred.model, est, reserved, truncated: input.truncated, n, keyFp: sha(cred.key).slice(0, 6) };
    // B-0248 (r2417 laws 1–3): THE RESERVATION LINE IS ON DISK BEFORE THE REQUEST IS BUILT — the slot was taken above, in the deciding
    // step; a line that does not land refuses this judgment by name, its slot given back (nothing is sent, nothing counted)
    journal({ ...base, outcome: 'reserved' });
    { const landed = await reservationLanded(id, use, t); if (!landed.ok) return { ok: false, why: landed.why, detail: landed.detail }; }
    // …and the owner's gates are judged AGAIN once it landed (its own slot not counted against itself): a switch turned off, a budget
    // lowered, a row stop or a wall that came while the line was being written is never passed by the write's wait
    { const again = verdictOf(use, { s: settings(), cred: credential(resolved), accountNever, estUsd, perHour, t: now(), mine: true });   // a key removed meanwhile: no-key
      if (!again.ok) { giveBack(id, t); journal({ ...base, outcome: 'released', why: again.why }); return quiet(use, again.why, again.retryAt ? { retryAt: again.retryAt } : {}); } }
    const sent = M.scrubQuestions(qs);   // B-d375: a rule's condition / a choice's description are the owner's words — the ONE scrub
    const body = Object.freeze(M.buildRequest(cred.provider, { model: cred.model, input: input.text, questions: sent }));
    const bytes = new TextEncoder().encode(JSON.stringify(body));   // serialized ONCE — the bytes the one-shot stream sends (never a string body: lane judge-one-shot-body)
    const url = M.urlOf(cred.provider, baseUrlFor && baseUrlFor[cred.provider]);
    let status = 0, json = null, retryAfter = null, failed = null, sending = null;
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      // DECISION_ENDPOINT — the ONE vendor call (gates above: budgetVerdict, pluginOn, resolveIntegration(ROW_ID))
      sending = fetch(url, { method: 'POST', headers: { authorization: `Bearer ${cred.key}`, 'content-type': 'application/json', 'content-length': String(bytes.length) }, body: M.oneShotBody(bytes), duplex: 'half', signal: ac.signal, redirect: 'error' });   // a 3xx is never followed (lane rule-learning-fix L2)
      const res = await sending;
      status = res.status;
      if (status === 429 && res.headers && typeof res.headers.get === 'function') retryAfter = M.retryAfterMs(res.headers.get('retry-after'), now());
      if (res.ok) json = await res.json();
    } catch (e) { failed = sending ? M.fetchFailOf(e) : 'unsent'; } finally { clearTimeout(timer); }   // a body that never parsed keeps its 2xx status (and its reservation); nothing sent / a refused redirect releases it (L3)
    const u = json ? M.usageOf(cred.provider, json) : { inputTokens: 0, outputTokens: 0, costUsd: null };
    const usd = M.settleUsd({ status, usage: json ? u : null, reservedUsd: estUsd, pricePerMtok: M.PRICE_PER_MTOK_USD[cred.provider], failed });
    call.counted = settle(id, use, u, usd, est);
    const spent = { inputTokens: u.inputTokens || undefined, usd };
    const halt = M.rowStopOf(status);   // B-2979: 401 / 403 the key, 402 the plan, 400 the shape — the ROW stops, not this record
    if (halt) {
      stop = { sig: credSig(cred), why: halt, status, at: now() };
      say(halt, halt === 'reconnect' ? `the provider refused the key (HTTP ${status}): no call until a new key is saved`
        : `${halt === 'plan' ? 'the provider says the plan does not allow' : 'the model refused the request shape of'} ${cred.model} (HTTP ${status}): no call until the key or the model changes`);
      stopNotice(halt);
      lastOutcome = { at: now(), use, outcome: halt, status };
      journal({ ...base, ...spent, outcome: halt, status });
      return { ok: false, why: halt, status };
    }
    if (failed === 'redirect') {   // lane rule-learning-fix L2: the provider's URL answered a 3xx — refused by name, never followed; paced like a wall
      backoff = M.nextBackoff(backoff, now(), 'wall');
      say('redirect', `the provider answered a redirect: not followed (never a request to another origin) — paused until ${new Date(backoff.until).toISOString()}`);
      lastOutcome = { at: now(), use, outcome: 'redirect', retryAt: backoff.until };
      journal({ ...base, ...spent, outcome: 'redirect' });
      return { ok: false, why: 'redirect', retryAt: backoff.until };
    }
    if (M.isWall(status)) {
      backoff = M.nextBackoff(backoff, now(), 'wall', { retryAfter });
      say('backoff', `the provider answered ${status ? `HTTP ${status}` : 'nothing'}: paused until ${new Date(backoff.until).toISOString()}`);
      lastOutcome = { at: now(), use, outcome: 'wall', status, retryAt: backoff.until };
      journal({ ...base, ...spent, outcome: 'wall', status });
      return { ok: false, why: 'backoff', status, retryAt: backoff.until };
    }
    if (!json) { lastOutcome = { at: now(), use, outcome: 'error', status }; journal({ ...base, ...spent, outcome: 'error', status }); return { ok: false, why: 'vendor-error', status }; }
    backoff = M.nextBackoff(backoff, now(), 'ok');
    if (stop) stop = null;
    say('ok', 'the provider answers again');
    if (u.costUsd !== null && u.inputTokens > 0) {   // the row's recorded cost per token (prices the next estimates)
      const d = today(); const rk = rateKey(cred);
      const r = (d.rate || (d.rate = {}))[rk] || (d.rate[rk] = { calls: 0, inputTokens: 0, usd: 0 });
      r.calls += 1; r.inputTokens += u.inputTokens; r.usd = Math.round((r.usd + u.costUsd) * 1e8) / 1e8;
      call.counted = saveUsage();
    }
    const answers = M.normalizeAnswers(cred.provider, json, qs);
    if (key) memoPut(key, answers);
    const hits = use === 'attention' ? M.attentionHits(n > 1 ? M.unbatchAnswers(answers, n) : [answers], s.threshold) : undefined;
    if (hits) {   // the card's 「命中 m 条」: verdicts at or above the threshold today (a memo answer is not a new judgment)
      const d = today(); const x = d.byUse[use] || (d.byUse[use] = { calls: 0, inputTokens: 0, outputTokens: 0, usd: 0 });
      x.hits = (x.hits || 0) + hits;
      call.counted = saveUsage();
    }
    lastOutcome = { at: now(), use, outcome: 'ok' };
    // lane decision-attention-facts: an attention call's needs_now rides its journal line (`p`, 2 decimals); lane
    // dm-reply-infers: so does a reply judgment's score (the ledger keeps the yes and the no alike)
    const p = use === 'attention' && n === 1 ? M.needsNowP(answers) : use === 'reply-infer' && answers[0] ? answers[0].probability : undefined;
    journal({ ...base, outcome: 'ok', status, inputTokens: u.inputTokens, outputTokens: u.outputTokens, usd, hits, p });
    return { ok: true, memo: false, answers: n > 1 ? M.unbatchAnswers(answers, n) : answers, usage: u, usd };
  }

  /** The registry row's Test (human-triggered, one fixed sentence, one predicate) — it counts like any call. */
  async function testRunner({ resolved } = {}) {
    const r = await judge('test', { body: TEST_SENTENCE }, { questions: [TEST_QUESTION], resolved });
    if (!r.ok) return { ok: false, error: r.why === 'no-key' ? 'no provider + key saved (or the provider is not openai / openrouter)' : r.why === 'reservation-unwritten' ? TEST_RESERVATION_WORDS : r.status ? `the provider answered HTTP ${r.status}` : HELD_TEST_WORDS[r.why] || r.why };   // r4121 (b): a held store's sentence, never its bare code
    const [first] = r.answers;
    const refused = !!first.refused;
    return { ok: !refused, error: refused ? 'the judge refused the question' : null, detail: { p: refused ? null : first.probability, inputTokens: r.usage.inputTokens, usd: r.usd } };
  }

  /** lane decision-spend-readout: the month so far for Settings › Spending — Σ usd of the journal's rows this local month,
   *  read from a BOUNDED tail (≤ 2 MB: the journal itself is cut at 5 000 lines / 30 days) and kept 60 s. */
  // lane lg-store-writes (主开发 2026-11-20 03:10Z — measured on the owner's hub after 2.369.412: this tail's synchronous read held
  // the loop once, 1–3 s, the main thread asleep on the storage): A READ THAT CAN WAIT ON STORAGE IS NOT MADE ON THE MAIN THREAD.
  // The status answers the month it holds (null until the first read — the readout says no figure, as for a journal not read yet)
  // and refreshes it OFF the loop (fs.promises, the threadpool), one read at a time, 60 s apart; the engine starts that read at
  // once, so the figure is there by the time a person opens Settings › Spending. The BOOT's rebuild of the day's counter keeps its
  // own read at the call (journalRead, above): once, before any call can spend (B-a85f's money law) — and a held counter's lift raises
  // from THAT read's rows, never from a second one (r4121 must 1).
  let monthMemo = { at: -Infinity, v: null }, monthP = null;
  async function journalTailOffLoop() {
    let fh = null;
    try {
      fh = await fs.promises.open(F.journal, 'r');
      const size = (await fh.stat()).size, n = Math.min(size, 2 * 1024 * 1024), buf = Buffer.alloc(n);
      await fh.read(buf, 0, n, size - n);
      return buf.toString('utf8').split('\n').slice(n < size ? 1 : 0).map((l) => { try { return JSON.parse(l); } catch { return null; } });
    } catch (e) { if (e && e.code === 'ENOENT') return []; return null; } finally { if (fh) await fh.close().catch(() => { }); }   // a journal never written is a $0 month; one that could not be READ is NO FIGURE (null), never $0
  }
  function monthSoFar() {
    if (now() - monthMemo.at >= 60000 && !monthP) {
      monthP = journalTailOffLoop()
        .then((rows) => { monthMemo = { at: now(), v: rows === null ? null : M.monthSpend(rows, today().day.slice(0, 7), tzOffset) }; })
        .catch((e) => { log?.warn?.(`[decision] the month's journal tail could not be read: ${(e && e.message) || e}`); })
        .finally(() => { monthP = null; });
    }
    return monthMemo.v;
  }
  monthSoFar();   // the read starts with the engine (off the loop): the figure is there when a person first asks

  /** r4121 (the page): while the counter or the journal is held the day's spend is NOT KNOWN — which file, why, since when (null: known) */
  function spendUnknown() {
    const h = usageHold.held();
    if (h) return { why: 'spend-unread', file: 'decision-usage.json', code: h.code, since: h.since };
    if (journalUnread) return { why: 'spend-unread', file: 'decision-journal.jsonl', code: journalUnread.code, since: journalUnread.since, ...(jWaiting ? { waiting: jWaiting } : {}) };
    return null;
  }
  function status() {
    const s = settings();
    const cred = credential();
    const d = today();
    const held = stopOf(cred);
    const unknown = spendUnknown();   // once an answer (r4201)
    return {
      configured: !!cred, provider: cred ? cred.provider : null, providerLabel: cred ? M.PROVIDER_LABEL[cred.provider] : null, model: cred ? cred.model : null, keySource: cred ? cred.source : null,
      features: s.features, dailyBudgetCents: s.dailyBudgetCents, threshold: s.threshold,
      today: { day: d.day, byUse: d.byUse, total: totalOf(d), reserved: Math.round(reservedUsd() * 1e8) / 1e8, inFlight: open.size, ...(unknown ? { unknown } : {}) },   // r4121: the spend NOT KNOWN is said where the figure stands (never «spent today: 0»)
      month: monthSoFar(),
      backoffUntil: backoff.until > now() ? backoff.until : 0, reconnect: held === 'reconnect' ? { status: stop.status, at: stop.at } : null, last: lastOutcome,
      stop: held ? { why: held, status: stop.status, at: stop.at } : null,   // lane decision-vendor-hygiene: the row stop that holds (reconnect | plan | shape)
      inbox: inboxLast,   // lane decision-inbox-rank: the For-you tray's last pass {at, judged, placed, stopped} — a stopped pass is said
    };
  }

  // ── use ④: the For-you pass (lane inbox-decision-group) ───────────────────
  let inbox = null, inboxTimer = null, inboxBusy = false, inboxOnWas = null, inboxLastPass = 0;
  let inboxBoard = null, inboxLast = null, inboxStopSaid = null;   // lane decision-inbox-rank: the board's reader; the last pass, as status() says it
  const inboxOn = () => { const s = settings(); return !!(s.pluginOn && s.features.inbox); };
  /** What the tray draws its section head from (the store puts it in its snapshot): null = the switch is off ⇒
   *  today's layout, byte for byte. `today` = the inbox use's paid calls of the instance's day. */
  function grouping() {
    if (!inboxOn()) return null;
    const x = today().byUse.inbox;
    return { on: true, today: x ? x.calls : 0, v: M.INBOX.version };
  }
  /** The switch moved ⇒ ONE broadcast of the store (the tray redraws with or without its sections). */
  function inboxSwitched() {
    const on = inboxOn();
    if (on === inboxOnWas) return;
    inboxOnWas = on;
    try { if (inbox && typeof inbox.notify === 'function') inbox.notify(); } catch { }
  }
  /** ONE pass: the facts of every open action item (free, whatever the switch), then ≤ `max` eligible band-5 TIES, one
   *  call each (refused ⇒ the pass stops, says why, and the next one retries). */
  async function inboxPass({ max = M.inputPlan('inbox').perPass } = {}) {
    if (!inbox || inboxBusy) return { ran: false, judged: 0 };
    const on = inboxOn();   // lane foryou-folds: the switch gates the JUDGE; the facts are free and the bands read them
    inboxBusy = true; inboxLastPass = now();
    let judged = 0, placed = 0, stopped = null, untied = 0;
    try {
      const t = now(), tz = tzOffset(t);
      let of = null;
      try { of = inboxBoard ? inboxBoard() : null; } catch (e) { log.warn?.(`[decision] For-you pass: the board was not read (${e.message}) — facts without it`); }
      const facts = [], eligible = [], open = inbox.openItems();
      for (const it of open) {
        if (it.kind === 'notice') continue;   // lane foryou-folds: every action row's facts (the bands read them), not only the judge's rows
        let b = null;
        try { b = of ? of(it.sessionKey) : null; } catch { b = null; }
        const f = M.inboxFacts(it, { now: t, board: b, tzOffsetMin: tz });
        facts.push([it.id, f]);
        const e = M.inboxEligible(it, t, f);
        if (e === 'placed') placed++;
        if (e === true) eligible.push([it, f]);
      }
      if (facts.length && typeof inbox.setFacts === 'function') inbox.setFacts(facts);
      if (!on) return { ran: false, judged: 0, facts: facts.length };
      // decision 3: only a band-5 TIE is the judge's — the rows read with the facts just written
      const fresh = new Map(facts);
      const tied = A.tieCandidates(open.map((it) => A.rowOf(fresh.has(it.id) ? { ...it, judged: { ...(it.judged || {}), facts: fresh.get(it.id) } } : it, t)), t);
      const due = eligible.filter(([it]) => tied.has(it.id));
      untied = eligible.length - due.length;
      for (const [it, f] of due.slice(0, max)) {
        const r = await judge('inbox', M.inboxScoreInput(it, f, t), { questions: [M.INBOX_QUESTION], memo: M.inboxMemoOf(it, sha, f) });
        if (!r.ok) { stopped = r.why || 'refused'; break; }
        const v = M.inboxVerdict(r.answers[0]);
        if (inbox.setJudged(it.id, { group: v ? v.group : null, why: v ? v.why : null, p: v ? v.p : null, at: now(), v: M.INBOX.version, facts: f, sig: M.inboxFactsSig(f) })) judged++;
      }
    } finally { inboxBusy = false; }
    inboxLast = { at: inboxLastPass, judged, placed, stopped, untied };
    if (stopped !== inboxStopSaid) { inboxStopSaid = stopped; if (stopped) log.warn?.(`[decision] For-you pass stopped after ${judged} judged: ${stopped} (the next pass retries in ${Math.round(M.INBOX.passMs / 60000)} min)`); }
    return { ran: true, judged, placed, stopped, untied };
  }
  function attachInbox(store, { tickMs = 60 * 1000, board = null } = {}) {
    forYou = store && typeof store.add === 'function' ? store : null;   // lane judged-watch-state: the paused-rules notice files here
    inbox = store && typeof store.setJudged === 'function' && typeof store.openItems === 'function' ? store : null;
    inboxBoard = typeof board === 'function' ? board : null;
    if (!inbox) return;
    if (typeof inbox.setGrouping === 'function') inbox.setGrouping(grouping);
    inboxOnWas = inboxOn();
    if (tickMs > 0 && !inboxTimer) {
      inboxTimer = setInterval(() => { inboxSwitched(); if (now() - inboxLastPass >= M.INBOX.passMs) inboxPass().catch((e) => log.warn?.(`[decision] For-you pass failed: ${e.message}`)); }, tickMs);
      if (inboxTimer.unref) inboxTimer.unref();
    }
  }

  // ── THE JUDGED ROAD (lane judged-watch-state, B-f42e) ─────────────────────────────────────────────────────────────
  /** The road's FACTS for a judged rule's use (`rule` · `routing` · `reply-infer`) — what M.judgedRoadState reads; the
   *  caller adds the rule's own hour. `estUsd` = ONE judgment at the use's input ceiling (the price the next call needs).
   *  No call, no reservation. */
  function roadFacts(use = 'rule') {
    const s = settings();
    const cred = credential();
    const feature = FEATURE_OF[use] || 'rules';
    const rate = cred ? M.rateOf((usage.rate || {})[rateKey(cred)], M.PRICE_PER_MTOK_USD[cred.provider]) : 0;
    const ceiling = s.dailyBudgetCents / 100;
    return { pluginOn: s.pluginOn, rulesOn: s.features[feature] === true, keyPresent: !!cred, route: feature === 'routing',
      budgetLeft: (Math.round(ceiling * 1e8) - Math.round((totalOf(today()).usd + reservedUsd()) * 1e8)) / 1e8, estUsd: M.inputPlan(use).ceiling * rate, budgetUsd: ceiling };
  }
  /** THE OWNER IS TOLD ONCE: the day's budget paused judged rules (the channels engine names whose) ⇒ ONE For-you item a
   *  day — the attention model's plugin row filed `low` (band 5: no badge, no toast), its door the plugin's settings (the
   *  budget row); later names the same day re-word that item while it is open, a dismissed one is never filed again that
   *  day. → the item id | null (no store wired). */
  let forYou = null, paused = { day: null, id: null, names: [] };
  function notePaused(names = []) {
    if (!forYou) return null;
    const day = today().day;
    if (paused.day !== day) paused = { day, id: null, names: [] };
    const more = [...new Set((Array.isArray(names) ? names : []).map((x) => String(x || '').slice(0, 80)).filter(Boolean))].filter((x) => !paused.names.includes(x));
    if (paused.id) {
      if (!more.length) return paused.id;
      let it = null;
      try { it = typeof forYou.get === 'function' ? forYou.get(paused.id) : null; } catch { it = null; }
      if (!it || it.status !== 'open') return paused.id;   // handled or dismissed: never repeated that day
    }
    paused.names = [...paused.names, ...more].slice(0, 12);
    const who = paused.names.join(', ');
    const text = `Today's LLM budget is spent (${day}) — judged notification rules paused`;
    const back = 'They resume with tomorrow\'s budget, or now if you raise the daily budget (Settings › Plugins › LLM). The messages they skipped are judged then.';
    try {
      const r = forYou.add(ROW_ID, { text, detail: `Paused today: ${who}. ${back}`, origin: 'plugin', plugin: ROW_ID, kind: 'action', urgency: 'low', by: 'agent', sessionName: 'LLM plugin',
        i18n: { text: { key: 'Today\'s LLM budget is spent ({day}) — judged notification rules paused', params: { day } }, detail: [{ key: 'Paused today: {names}', params: { names: who } }, { key: back }] },
        open: { kind: 'plugin-settings', plugin: ROW_ID, panel: 'budget' } });
      paused.id = (r && r.id) || paused.id;
    } catch (e) { log.warn?.(`[decision] the budget's paused-rules item was not filed: ${e.message}`); }
    return paused.id;
  }

  // ── THE LEDGER (lane rule-learning) — the budget door of the text-model client (header) ──
  const ledger = Object.freeze({
    settings,
    settingsUnread,   // B-225b: the text-model client asks it before its verdict
    storesUnread: () => storesUnread({ memo: false }),   // B-f276 family: …and this — the day's spend unknown ⇒ refused by name before any hold (the drafter keeps no memo)
    spentUsd: () => totalOf(today()).usd + reservedUsd(),
    useUsd: (use) => { const x = today().byUse[use]; return (x ? x.usd : 0) + [...open.values()].filter((r) => r.use === use).reduce((a, r) => a + r.usd, 0); },
    // B-0248 (r2417 laws 1–3): the hold is the slot (sync) AND its reservation line; `landed` answers once that line is on disk —
    // or gives the slot back and refuses by name; a line journaled with `hold` is that call's result (paired)
    hold: (use, usd, meta = {}) => { const id = ++openSeq; open.set(id, { use, usd: Number(usd) || 0 }); journal({ ...meta, use, call: callOf(id), outcome: 'reserved', reserved: Math.round((Number(usd) || 0) * 1e8) / 1e8 }); return id; },
    landed: (id, use) => reservationLanded(id, use),
    settle: (id, use, u, usd, est) => settle(id, use, u, usd, est),
    // → the line's landing (bounded by the reservation's own bound; true / false, never a throw): a completion's result is on disk
    // before its answer, as a judgment's is
    journal: (o) => { lastOutcome = { at: now(), use: o.use, outcome: o.outcome, ...(o.why ? { why: o.why } : {}) }; const { hold, ...row } = o || {}; journal(hold ? { ...row, call: callOf(hold) } : row); return W().durable(F.journal, { timeoutMs: reserveLandMs }).catch(() => false); },
  });
  const textModel = require('./text-model-client.js').create({ integrations, ledger, fetchImpl, now, log, baseUrl: baseUrlFor && baseUrlFor.openrouter ? baseUrlFor.openrouter : null });

  if (rebuiltAtBoot) saveUsage();   // B-a85f: the raised counter is written (an act, rank 0)
  return { judge, testRunner, status, attachPlugin, settings, memoSize: () => memo.size, files: F, ROW_ID, attachInbox, inboxPass, inboxSwitched, grouping, ledger, textModel, roadFacts, notePaused, readAgain, heldRow };
}

module.exports = { create, ROW_ID, FEATURE_OF, TEST_SENTENCE };
