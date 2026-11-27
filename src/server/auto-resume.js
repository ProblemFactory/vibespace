'use strict';
// AUTO-CONTINUE AFTER A USAGE LIMIT RESETS (2.368.0, owner request after the
// CLI shipped its own version).
//
// The CLI has this feature, but it lives in the interactive REPL: `/rate-limit-
// options` is not in a stream-json session's command list (verified against a
// real init record) and the timer is a TUI `useInterval`. So a VibeSpace chat
// session hits the limit and just sits there. This module is our own, with the
// same shape — armed → fires at the reset — and one thing the CLI's cannot do:
// it SURVIVES A RESTART (the CLI's own text says "Automatic continue cancelled
// · Claude Code relaunched during the wait"). Ours is persisted and re-armed at
// boot, because a wait measured in HOURS that a deploy silently cancels is
// worse than no feature at all.
//
// ORDER OF PREFERENCE, deliberately: when the account pool has somewhere else
// to go it SWITCHES (usage-pool-engine, unchanged) — that resumes in seconds
// instead of hours. This module is the single-account fallback, so it arms on
// exhaustion and quietly disarms the moment the session produces work again
// (a switch, the user's own prompt, anything): the fire path must never be the
// reason a session starts spending.
//
// SPENDING IS THE RISK, so the gate is explicit at three levels: the global
// default (`claude.autoResumeOnLimit`, default OFF), a per-session value taken
// at spawn, and a live per-session toggle. Firing announces itself in the
// conversation — an unexplained turn that costs money is not acceptable.
//
// GENERIC SINCE 2026-09-08 (owner ruling: "auto resume 应该是通用的, 只要支持
// hook/注入的 harness 都支持, 形式可以不一样 — 有些是发消息, 有些是 start turn
// 之类的固有指令"). Everything in this file is HARNESS-NEUTRAL: the timer, the
// loop breaker, the notices, the tri-state gate, restart survival. Exactly TWO
// facts are harness-specific and BOTH live on the descriptor:
//   the LIMIT SIGNAL  descriptor.quota.signalFromStream — the engine arms from
//                     the classified signal, never from a consumer-local regex
//   the RESUME VERB   descriptor.resume {form, deliver} — 'message' (claude, a
//                     user message on the CLI's chat stdin), 'turn-start'
//                     (codex, the wrapper's app-server RPC lane), 'prompt'
//                     (ACP session/prompt), or null (shell: no agent)
// `capsOf(backend).autoResume` is DERIVED from those two (src/backend-caps.js
// deriveAutoResume, written by the registry at load), and every surface that
// OFFERS or ACTS on auto-resume reads that row — never a backend id.
const fs = require('fs');
const { GENERIC_LEGACY_KEYS } = require('../harness-settings'); // PURE: the legacy spelling of the generic auto-resume default
const path = require('path');
const SR = require('../store-read.js');
const HOLD = require('../store-read-hold.js');   // r3004 (lane bl-loop-b): data/auto-resume.json under the store-read law
const AR_OBJ = (o) => o === undefined || (!!o && typeof o === 'object' && !Array.isArray(o));
const AR_SHAPE = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && AR_OBJ(v.armed) && AR_OBJ(v.fires);
const { windowOpened } = require('../auto-resume-signal.js'); // PURE: does this reading say the wall is gone?
const harnesses = require('../harnesses');                    // the descriptor registry: THE resume verb lives there
const { toAgentText } = require('../peer-text.js');          // PURE: the one belt on a name an agent reads (the account label)
const { isPress } = require('../write-origin.js');           // the bulk press is ATTENDED only on a press its door minted (the owner's ruling 2026-11-18)
/** THE BULK RESUME's ONE SPELLING OF ITS REASON (the owner's ruling 2026-11-18): a press its door minted ⇒ the attended 'bulk-resume',
 *  else the gated twin. B-9a24 U1: the press's one test asks under the same spelling (the attended reason is spelled at ONE site). */
function reasonOf(pressed) {
    const paid = isPress(pressed) ? { spendReason: 'bulk-resume' } : { spendReason: 'auto-resume' };
  return paid;
}
const { familyOfModel, projectCacheForFamily } = require('../model-family.js');   // PURE: does a request's model draw a model cap (capDrawnBy — the ONE family door)

// THE CONTINUE AN AGENT READS (lane resume-words, the owner 2026-10-29: «agent 都会优先理解那个 claude 自己的 reset
// time 作为"用量重置时间"，但实际上 vibespace 通知的时候才是重置的时候»). The Screeps conversation hit a WEEKLY wall
// («resets Oct 30, 9am»); the pool moved it to another account at once and sent the continue — but the agent had
// already read the CLI's line as THE reset, parked its work "until the reset" 33 hours out and told the owner so. The
// continue used to be the CLI's own sentence alone, which says nothing about that time. Now it SAYS what the time was
// and was not. ONE constant, agent-facing English (never t()), assembled by continuePromptFor:
//   switched / lifted  WHAT unblocked us, by continueNoticeFor's class: the pool now serves the conversation from
//                      `{account}` (the label through the peer-text belt — the owner's words, like every name an agent
//                      reads), or the wall lifted on the same account;
//   facts              the limit message's reset was ONE account's and is not the continue; THIS message is; un-park;
//   cli                the CLI's own continue prompt, verbatim (2.1.239) — still the last sentence.
// The product's card («账号池已切换到 X，已自动继续这个任务») keeps its own words (continueNoticeFor).
const CONTINUE_PROMPT = Object.freeze({
  switched: 'VibeSpace auto-resume: the account pool now serves this conversation from {account}.',
  lifted: 'VibeSpace auto-resume: the usage limit on this conversation\'s account has lifted.',
  facts: 'The usage-limit message the CLI printed ("resets at …", weekly or 5-hour) named ONE account\'s reset time — that time is NOT when you may continue, and nothing is to be scheduled for it: THIS message is the continue. If you parked or deferred work "until the reset", un-park it now.',
  cli: 'You can continue now. Continue the task you were working on when the usage limit was reached; do not repeat work that is already complete.',
  // B-3437 (the owner's ruling 2026-11-18, the words approved as written): a Workflow run the limit cut short — just before `cli`
  run: 'That limit also cut short the Workflow run {run} ({n} of its agents unfinished). Resume THAT run — call the Workflow tool with resumeFromRunId "{run}" — instead of launching it again from the start.',
});
const CONTINUE_ACCOUNT_MAX = 80;   // an account label is ONE inline piece, bounded
const { RUN_ID_RE: RUN_ID_FORM } = require('../workflow-disk.js');   // PURE: the run id's own form (one definition)
const WF_REREAD_MS = 2 * 60 * 1000;     // B-3437: the run a usage wall cut short is asked about every two minutes…
const WF_FRESH_MS = 5 * 60 * 1000;      // …and only an answer this fresh is named by the continue
const WF_LEAD_MS = 6 * 60 * 1000;       // …asked only in the six minutes before a TIMED fire (U3 cure: never for an arm's whole life)
const WF_INFLIGHT_MAX = 4;              // …READS STILL OUT, counted until each returns — whatever became of its arm (a stalled mount holds at most this many of the hub's pool threads)
const WF_RESET_SLACK_MS = 5 * 60 * 1000; // …named only when the continue really goes no earlier than the run's limit reset (− this)
/** PURE (B-3437): the sentence for a Workflow run the limit cut short, or '' — only a run id of its own form that the peer-text
 *  belt leaves unchanged, and a count of 1..9999; anything else (a hostile record) says nothing. */
function workflowRunLine(run) {
  if (!run || typeof run !== 'object') return '';
  const id = typeof run.runId === 'string' ? run.runId : '';
  const n = Number(run.unfinished);
  if (!RUN_ID_FORM.test(id) || toAgentText(id, { kind: 'line', max: 80 }).trim() !== id || !Number.isInteger(n) || n < 1 || n > 9999) return '';
  return CONTINUE_PROMPT.run.replace(/\{run\}/g, () => id).replace('{n}', () => String(n));
}
/** PURE: the continue this fire delivers — `note` = continueNoticeFor's verdict ({cls}), `account` = the label of the
 *  identity the continue lands on (null when unknown), `run` = the Workflow run the limit cut short (B-3437; null = none —
 *  the words are today's, exactly). */
function continuePromptFor(note, account, run = null) {
  const name = account == null ? '' : toAgentText(account, { kind: 'line', max: CONTINUE_ACCOUNT_MAX }).trim();
  const head = note && note.cls === 'switched'
    ? CONTINUE_PROMPT.switched.replace('{account}', () => (name ? `the account "${name}"` : 'another account'))
    : CONTINUE_PROMPT.lifted;
  const runLine = workflowRunLine(run);
  return `${head} ${CONTINUE_PROMPT.facts}${runLine ? ' ' + runLine : ''} ${CONTINUE_PROMPT.cli}`;
}
// …and its twin for a turn the harness ended because the MODEL WAS OVERLOADED (lane auto-resume-bulk): the same ask in
// the same shape, without claiming a usage limit the conversation never hit.
const CONTINUE_PROMPT_OVERLOAD = 'You can continue now. Your last turn ended because the model was overloaded; continue the task you were working on, and do not repeat work that is already complete.';
const BULK_PACE_MS = 2500;  // the bulk resume's spacing between two continues — never a storm (lane auto-resume-bulk)
// …and how long ONE pre-fire gate may take inside the batch. The gate probes quota (a CLI spawn on the claude rung); a
// probe that never answers must not hold the batch — and its N spend holds — open: that session is SKIPPED by name
// ('no-answer'), its hold given back, and the batch goes on. Fail closed: no answer is never a go.
const BULK_GATE_HOLD_MS = 5 * 60 * 1000;   // a gate the bulk resume stopped waiting for keeps its conversation «in flight» until it settles — at most this long
const BULK_GATE_WAIT_MS = 90 * 1000;
const { planBatch, normalizeStoppedBy } = require('../stopped-by.js'); // PURE: the batch's plan (who, in which order, who is skipped and why)
/** PURE: the continue the BULK resume delivers (lane auto-resume-bulk). An overload stop takes its twin above (no usage
 *  limit is claimed); a quota stop takes continuePromptFor — `switchedTo` = the label of the account the pre-fire gate
 *  landed it on when that is not the one the wall stopped (null = the wall on its own account lifted). */
function bulkPromptFor(kind, switchedTo = null) {
  if (kind === 'overload') return CONTINUE_PROMPT_OVERLOAD;
  return continuePromptFor({ cls: switchedTo ? 'switched' : 'lifted' }, switchedTo || null);
}
const TICK_MS = 30000;      // the CLI polls at 30s; match it
const GRACE_MS = 15000;     // let the reset actually land before asking
const MAX_WAIT_MS = 26 * 60 * 60 * 1000; // a weekly bucket can be far out; refuse to sit forever

// ── THE LOOP BREAKER (2026-09-07, the 130-fire incident) ───────────────────
// A fire that the session answers with ANOTHER limit rejection is a FAILED
// fire. Nothing in this module used to remember that: the engine's walled-turn
// path re-armed ("switched to a usable account"), the hot pool switch called
// fireNow(), the CLI rejected again in half a second, and the cycle repeated
// — 130 continues on one conversation and 32 on another between 23:32 and
// 04:03, ~150 junk cards in the transcript, every cycle indistinguishable
// from the first to every component involved.
// The memory is per session and PERSISTED next to the armed waits: a restart
// must not hand the loop a fresh budget (the same reasoning that makes the
// armed wait itself survive a restart).
const FIRE_WINDOW_MS = 60 * 60 * 1000;        // the window the cap + the notice ledger count in
const FIRE_BACKOFF_MS = [0, 60000, 300000];   // 1st immediate fire is free, 2nd ≥60s later, 3rd ≥5min
const FIRE_MAX_IMMEDIATE = 3;                 // per session per window; the TIMED reset path stays open
const FIRE_QUARANTINE_MS = 10 * 60 * 1000;    // an identity that just rejected this session is off the table
const FIRE_PENDING_MS = 10 * 60 * 1000;       // a fire we never heard back about stops blocking after this
const REFUSE_LOG_MS = 5 * 60 * 1000;          // one journal line per (reason, identity) — never one per cycle
// A gate VETO parks the fresh-window edge for this wall (r3). The producer's
// traffic sets the re-ask rate otherwise: the incident thread's own buffer
// carries 454 `rate_limits_updated` pushes in under two hours (one per ~16 s),
// so a standing veto ran the gate ~225×/h — probe floor and pool re-evaluation
// each time — for the days a watch can stand. On this clock it is 6×/h, and a
// recovery that has already waited 32 h is not harmed by ≤10 min of pacing.
const EDGE_HOLD_MS = 10 * 60 * 1000;
const NO_TARGET_FRESH_MS = 10 * 60 * 1000;    // how long the pool's "nowhere to go" verdict may be quoted for

// ── WHAT THE CONVERSATION IS TOLD, AND WHEN (round 2 of the same incident) ──
// Round 1 gave the breaker ONE in-chat line for every refusal, and it told the
// SAME story whatever the reason: "the pool switched to X, X was rejected too,
// there is no usable member left, retrying has stopped". For `backoff`,
// `hourly-cap` and `fire-pending` every clause of that is false — X is often a
// member we never fired at (so it rejected nothing), the other members are
// healthy, and the session is STILL ARMED and does continue seconds later. It
// also spent the once-per-window budget, so the genuine "nothing can serve you"
// line was suppressed for the rest of the hour.
// The rule now: a refusal may only claim what its OWN reason knows.
//   same-identity  the identity a continue would land on just rejected THIS
//                  conversation — the only reason that may say "it refused us
//                  too". The extra clause "and there is nowhere else to go"
//                  needs a SECOND fact, the pool's own no-target verdict
//                  (noteNoPoolTarget), never an assumption.
//   hourly-cap     N immediate continues this window and the session still is
//                  not working — say exactly that, nothing more.
//   backoff /      a sub-minute pacing limit on a session whose promise is
//   fire-pending   INTACT (still armed, continues by itself). Journal-only:
//                  no-silent-failures is about a BROKEN promise, not about the
//                  pacing of one we are still keeping — and a card that says
//                  "stopped retrying" seconds before retrying is a lie the
//                  user then has to un-learn.
// Each class carries its own once-per-window budget, so the cap line can never
// eat the exhaustion line's.
/** PURE. The in-chat line a refused continue deserves — null = journal-only. */
function refusalNoticeFor({ reason, label, armedResetsAt = 0, noTargetAt = 0, now = Date.now(), maxImmediate = FIRE_MAX_IMMEDIATE }) {
  const who = label || '当前账号';
  const resets = Number(armedResetsAt) || 0;
  // "we will continue at T" is only sayable when the arm is anchored on a real
  // reset; the +45s near-arm is a retry pacer, not a promise about a time
  const farReset = resets > now + 5 * 60000 ? `将在 ${new Date(resets).toLocaleString()} 重置后自动继续。` : '';
  const noTarget = !!noTargetAt && now - noTargetAt < NO_TARGET_FRESH_MS;
  if (reason === 'same-identity') {
    return {
      cls: 'exhausted',
      text: noTarget
        ? `账号 ${who} 刚刚拒绝了这个会话的自动续跑，账号池里暂时没有其它可用成员，已暂停立即重试 — 可以添加成员、把这个会话切到别的账号，或等待配额重置。`
        : `账号 ${who} 刚刚拒绝了这个会话的自动续跑，已暂停立即重试。` + (farReset || '账号池恢复可用时会自动继续。'),
    };
  }
  if (reason === 'hourly-cap') {
    // what we KNOW is the count and that no recovery signal ever arrived —
    // "it did not work" would be a claim about the CLI we cannot make
    return { cls: 'cap', text: `自动续跑在一小时内已连续尝试 ${maxImmediate} 次仍未见这个会话恢复，暂停立即重试。` + (farReset || '配额恢复后会自动继续。') };
  }
  return null;
}
/** PURE. The line that FOLLOWS a delivered continue. The wording comes from
 *  what actually unblocked us, and there are three ways to know:
 *   · kind 'now'   — the immediate path only ever runs from a pool switch
 *   · the ARM      — the +45s near-arm the pool switch creates. Since the wall
 *                    signals re-point the link BEFORE the session is armed
 *                    (measured: the real producers never reach fireNow), this
 *                    is now the COMMON pool-switch recovery, and it is
 *                    delivered by the timed path — where round 1 said
 *                    "用量上限已重置", i.e. told the user the quota had reset
 *                    when the pool had swapped accounts.
 *   · `moved`      — the pre-fire gate re-pointed the link under us (the
 *                    identity the continue lands on is not the one we
 *                    resolved before the gate): a switch by any other name.
 *   · `cause`      — the caller NAMES it. 'member-usable' is the 2026-09-08
 *                    new-member wake: a member's first reading arrived (a
 *                    login finished, or a human refreshed) and this session
 *                    was ALREADY parked on it, so NOTHING SWITCHED. Saying
 *                    "the pool switched to X" there would be the r2 defect
 *                    again — a card explaining a billed turn must name the
 *                    thing that caused it — and `kind:'now'` can no longer
 *                    stand in for "a pool switch" now that the immediate path
 *                    has a second caller.
 *  Only with none of them is "the limit reset" the reason we continued.
 *
 *  ORDER IS LOAD-BEARING, AND `cause` MAY ONLY REFINE IT (r2). `moved` still
 *  outranks `cause`: if the pre-fire gate re-pointed the link under us, the
 *  continue is landing on a member the wake never spoke about, so "the pool
 *  switched to X" is the true sentence — a `cause`-first order would have
 *  named the gate's target as the account that "recovered". Below `cause`,
 *  master's own precedence is restored verbatim: round 1 hoisted the
 *  `/^account usable again/` arm ABOVE `kind === 'now'` and so silently changed
 *  a PRE-EXISTING pair — the engine's near-arm (:1491 "account usable again")
 *  followed by a real pool switch firing with kind:'now' (:2417/:2498) — from
 *  "账号池已切换到 X" to "账号 X 已恢复可用", describing a switch as a recovery.
 *  With `cause` null every one of the eight reachable caller shapes is
 *  byte-identical to master, and test-auto-resume-loop §3 pins the pair. */
function continueNoticeFor({ kind, armReason, label, moved = false, cause = null }) {
  const who = label || '可用账号';
  const r = String(armReason || '');
  if (moved || /^switched to a usable account/.test(r)) return { cls: 'switched', text: `账号池已切换到 ${who}，已自动继续这个任务。` };
  if (cause === 'member-usable') return { cls: 'switched', text: `账号 ${who} 已恢复可用，已自动继续这个任务。` };
  if (kind === 'now') return { cls: 'switched', text: `账号池已切换到 ${who}，已自动继续这个任务。` };
  if (/^account usable again/.test(r)) return { cls: 'switched', text: `账号 ${who} 已恢复可用，已自动继续这个任务。` };
  return { cls: 'reset', text: '用量上限已重置，已自动继续这个任务。' };
}
/** PURE (lane account-reset-door r4): the card of a continue that rests on a person's reset claim — it says so, and that the
 *  claim is unconfirmed. Laid over continueNoticeFor's verdict by attemptFire (fireNowOnClaim's road), so every shape of
 *  continueNoticeFor stays master's. */
function claimContinueNotice({ label, cause = null }) {
  const who = label || '可用账号';
  return { cls: 'switched', text: cause === 'member-usable' ? `账号 ${who} 按你的重置声明可用（未确认），已自动继续这个任务。` : `账号池已切换到 ${who}（按你的重置声明，未确认），已自动继续这个任务。` };
}

/** THE MODEL'S CAP STILL STANDS (主开发's law 2026-11-18): the wall that stopped the conversation was a MODEL's cap (the stop
 *  fact's bucket 'scoped' with its name) whose OWN stated reset has not landed yet, and the continue would land where it met
 *  it (the same member, a model the cap still draws) — a plan's window that reset, a member read «usable», a reset claim are
 *  then not the way out: the request would meet the cap again. PURE: `{ name, until, fireAt }` (hold; continue at `fireAt` =
 *  the cap's reset once it has LANDED) or null (fire as before). `key` = the identity the continue lands on NOW (after the
 *  pre-fire gate); a fact with no member is a conversation no pool can move (the same account); a known member with an
 *  unknown identity now cannot be told — fire as before (the gate and the wall still judge). `drawsCap` = capDrawnBy. A cap
 *  with no stated reset has nothing to wait for — fire as before. A stated reset LANDS a minute late (`landMs` — the
 *  vendor's own lag, quota-model RESET_GRACE_SEC, the owner's «wait a minute» of 2026-09-18). */
const CAP_LAND_MS = 60 * 1000;
function modelCapHold({ fact, now = Date.now(), key = null, drawsCap = true, landMs = CAP_LAND_MS } = {}) {
  if (!fact || fact.kind !== 'quota' || fact.bucket !== 'scoped' || !fact.scopedName) return null;
  const until = Number(fact.resetsAt) || 0;
  if (!(until > 0) || until + landMs <= now) return null;
  if (fact.memberId && fact.memberId !== key) return null;
  if (!drawsCap) return null;
  return { name: String(fact.scopedName), until, fireAt: until + landMs };
}
/** PURE: does a request for `model` draw the model cap named `capName`? Asked of model-family's ONE projection (a reading of
 *  that one cap, projected to the model's family): a cap of another known family is set aside; a family nobody knows, a cap
 *  of no known family, or a family known only from the CLI's catalog with no bucket of its own name all KEEP it (fail closed —
 *  a vendor may meter a new family under an existing cap, as it meters Mythos under Fable). */
function capDrawnBy(model, capName) {
  const p = projectCacheForFamily({ scopedWeekly: [{ name: String(capName || '') }] }, familyOfModel(model));
  return !!(p && Array.isArray(p.scopedWeekly) && p.scopedWeekly.length);
}

/** The delayed ARM announcement, worded by the arm's CAUSE (2.369.104, owner:
 *  "明明没到也没被中断你却提示到达上限了"): a hot pool switch arms a +45 s
 *  near-nudge, and one sentence — "用量已达上限。已安排在 <T> 重置后自动继续" —
 *  used to call that instant a RESET (03:24:53 about a window that resets at
 *  07:50). A switch says WHICH member and that the continue follows in
 *  seconds; only an arm anchored on a real reset states the reset instant.
 *  PURE: (armReason, resetsAtMs, nowMs) → sentence. */
// LAW G4 (lane cli-self-measure): a cause's `checking` facet counts only while THAT run is still checking (the ORCH's live answer)
function liveCause(c) {
  if (!c || typeof c !== 'object' || !c.checking) return c || null;
  let now = null; try { now = typeof global.__vsCliCheckingNow === 'function' ? global.__vsCliCheckingNow() : null; } catch { now = null; }
  if (now && now.cli === c.checking.cli && now.startedAt === c.checking.startedAt) return c;
  const { checking, ...rest } = c; return rest;
}
function armNoticeFor(armReason, resetsAtMs, nowMs, cause) {
  const m = /^switched to a usable account \((.+)\)/.exec(String(armReason || ''));
  if (m) {
    const secs = Math.max(1, Math.round((Number(resetsAtMs) - Number(nowMs)) / 1000));
    return `账号池已切换到 ${m[1]}，约 ${secs} 秒后自动继续这个任务（状态栏可取消）。`;
  }
  // B-73fe (2026-09-17, owner "明明当前hit limit的账号7am就会reset 5h，但你却提示12pm"):
  // the instant this sentence names is the SOONEST MEMBER's reset, which is
  // not the rejecting member's own — so the sentence says whose reset it is,
  // and why the rejector's earlier one does not count (its OTHER dead bucket,
  // under the floor, keeps it dead past that). Structure comes from the
  // engine's armCauseFor; a cause-less arm keeps the old sentence verbatim.
  const c = cause && typeof cause === 'object' ? liveCause(cause) : null;
  const fmt = (ms) => new Date(ms).toLocaleString();
  // the hub's own check of a new Claude Code holds members of this pool: the check and its minutes, never a date days away
  if (c && c.checking) return `Claude Code ${c.checking.cli} 是本机的新版本，VibeSpace 正在确认它（约 ${c.checking.typicalMin} 分钟，最多 ${c.checking.boundMin} 分钟）；确认通过后它占着的 ${c.checking.n} 个账号回到账号池，能接手时这个对话会自己继续（状态栏可取消）。`;
  // THE OWNER'S 全B (2026-09-28): the wall is a member taken OUT of the pool with nobody to take over — the card
  // names that cause, never "usage limit reached"
  if (c && c.kind === 'removed-member') {
    const who = (c.member && c.member.name) || '该账号';
    const park = c.holdTo && c.holdTo.name ? `（暂停在 ${c.holdTo.name}，${fmt(resetsAtMs)} 重置）` : '';
    return `${who} 已被移出账号池，没有其他成员能接手：这个对话已在本回合结束后停下${park}，有成员可用时自动继续（状态栏可取消）。`;
  }
  if (c && c.scope === 'pool' && c.soonest && c.soonest.name) {
    const s = c.soonest, r = c.rejector;
    const sb = s.bucket && s.bucket.label ? s.bucket : null;
    if (r && r.name && r.id && r.id === s.id) {
      // the STATED reset is named; the continue itself follows about a minute
      // later (RESET_GRACE_SEC in the pool verdict — the vendor lands a stated
      // reset late, owner 2026-09-18: "稍微等一分钟再发自动恢复")
      const stated = sb && sb.resetsAt ? Number(sb.resetsAt) : resetsAtMs;   // the cause carries ms
      // a member with no 5-hour limit hit a limit whose window the banner did not name (lane no-5h-window r4): the
      // sentence says the window is unknown — never a window it cannot know, never a raw token
      if (r.ownWall && r.ownWall.unknownWindow) return `${r.name} 的限额窗口未知（它没有 5 小时限额），将按它最早的重置时间 ${fmt(stated)} 等待，重置约 1 分钟后自动继续这个任务（状态栏可取消）。`;
      const lab = (r.ownWall && r.ownWall.label) || (sb && sb.label) || '';
      return `${r.name} 的${lab ? ' ' + lab + ' ' : ''}将在 ${fmt(stated)} 重置，重置约 1 分钟后自动继续这个任务（状态栏可取消）。`;
    }
    let head = '用量已达上限。';
    if (r && r.name && r.ownWall && r.ownWall.label && r.ownWall.resetsAt) {
      head = `${r.name} 的 ${r.ownWall.label} 将在 ${fmt(r.ownWall.resetsAt)} 重置`;
      const f = Array.isArray(r.floor) && r.floor.length ? r.floor[0] : null;
      if (f && f.label) head += `，但它的 ${f.label} 仅剩 ${Math.round(Number(f.remaining) || 0)}%（低于 ${f.line}% 门槛，视为用尽${f.resetsAt ? `，${fmt(f.resetsAt)} 重置` : ''}）`;
      head += '。';
    }
    const target = sb ? `${s.name}（${sb.label} ${fmt(sb.resetsAt || resetsAtMs)} 重置）` : `${s.name}（${fmt(resetsAtMs)} 重置）`;
    return `${head}最早可用的成员是 ${target}，已安排在重置约 1 分钟后自动继续；任一成员提前可用会立即继续（状态栏可取消）。`;
  }
  if (c && c.scope === 'account' && c.until && c.until.label) {
    const stated = c.until.resetsAt ? Number(c.until.resetsAt) : resetsAtMs;   // the cause carries ms
    return `用量已达上限（${c.until.label}）。已安排在 ${fmt(stated)} 重置约 1 分钟后自动继续（状态栏可取消）。`;
  }
  return `用量已达上限。已安排在 ${fmt(resetsAtMs)} 重置后自动继续（状态栏可取消）。`;
}

/** Pick what to WAIT FOR when a session hits the wall (PURE). Two field
 *  corrections shaped this contract:
 *  · c1206711 #1: the rejection may name a FAR bucket while a POOL SIBLING
 *    frees much sooner — so candidates span identities (self + members).
 *  · c1206711 #2 (owner: "重置的是7d但没和5h对齐, 5h还在cd就发了恢复消息"):
 *    within ONE identity the session unblocks only when ALL its dead buckets
 *    have reset — the wait is the MAX over that identity's dead resets, never
 *    the min over every known reset (a healthy bucket's nearer reset is not
 *    a candidate at all; an earlier dead bucket's reset still leaves the
 *    later one blocking).
 *  identities: [{ label, eventMs?, buckets: {name: {resetsAt(sec), utilization?,
 *  status?, usedPercent?}} }] — identity[0] is the session's own; eventMs (ms)
 *  is the rejection's resetsAt, folded in as one of ITS dead resets.
 *  Returns { ms, label } (min over identities of max-over-dead), tooFar when
 *  nothing lands inside maxWaitMs, null when no dead reset is known at all
 *  (callers must SAY so, not just journal it). */

/**
 * @param deps.activeSessions Map<id, session>
 * @param deps.sendToSession  (id, session, text, {note}) => boolean — puts a USER message (`note` = the cause the card shows, 2.369.97)
 *        into the live session exactly as a typed one would (so it lands in the
 *        transcript and the UI); returns false when the session cannot take it.
 * @param deps.serverSetting  (key) => value  — the global default
 * @param deps.broadcast      (sessionId, msg) => void — per-session UI state
 * @param deps.notify         (sessionId, session, text, extra?) => void — a visible line in the chat;
 *        `extra.resetCredit` = `{available, mode}` rides the ARM card (design-reset-credits §5)
 * @param deps.resetCreditOffer (sessionId, session) => {available, mode} | null — the stored reset
 *        credits the arm card offers (the engine's resetCreditOffer: only where the
 *        session's harness can spend one AND the identity holds one). Absent = none.
 */
/**
 * @param deps.authorizeSpend (id, session, identity, {hold}) => {ok, why, detail, retryAfter, hold?}
 *        THE SPEND CEILING (design-account-hardening §4.4c / P9). The loop
 *        breaker below bounds this producer's PACING; the authorizer bounds the
 *        MONEY, per credential slot, across every producer and across restarts.
 *        They COMPOSE — the breaker runs first (it is free and its refusals are
 *        the ones with a story to tell), and neither may be bypassed. Absent
 *        (harness without the guard wired) = allow; scripts/test-spend-paths.mjs
 *        pins the real wiring in server.js so "absent" can only mean a test.
 * @param deps.noteSpend (id, session, identity, hold) => void — charged only
 *        when a continue was actually delivered. `hold` is the reservation the
 *        verdict opened (r5): the authorizer holds the slot it authorized, and
 *        the charge converts that hold instead of adding to it.
 * @param deps.releaseSpend (id, session, hold) => void — the OTHER half of the
 *        same pair, for the one path here that authorizes and then does not
 *        spend: the send fails and the session STAYS ARMED. The promise still
 *        stands, so the money has to go back — otherwise a pty that refuses one
 *        frame keeps that slot's budget booked until the hold times out.
 */
/**
 * THE BULK ACTS (lane auto-resume-bulk, .349) — deps:
 * @param deps.authorizeSpendBatch (items:[{id, session, identity}], reason) => {ok, why, detail, holds:[{sessionId, identity, hold}]}
 *        THE BATCH GATE: one press that opens N billed continues is ONE authorization (spend-guard authorizeBatch) under
 *        the reason the press selected — 'bulk-resume', ATTENDED (the owner's ruling 2026-11-18: none counted, no hold;
 *        paid overage still refused by name), or, with no press, its gated twin 'auto-resume'. Absent = the batch is
 *        REFUSED (fail closed — there is no "absent means a test" here: a batch with no gate is a money road nobody wired).
 * @param deps.previewSpendBatch (items:[{id, session, identity}]) => {refusedSlots:[{identity, why, detail, n}]} — the guard's QUIET
 *        look (nothing held, said or granted) at the press's authorization: the plan leaves a refused account's conversations
 *        stopped, by name, BEFORE the press (主开发 2026-11-18 16:20Z — form two).
 * @param deps.notePress (batchId, n, reason) => void — THE RECORD OF A PRESS: one row in the attended tally (the cure).
 * @param deps.notePressEnd (batchId, delivered) => void — …and its end: how many it delivered (主开发 21:04Z).
 * @param deps.workflowRunAtWall (id, session, {fireAt}) => Promise<{runId, unfinished}|null> — B-3437: the Workflow run this
 *        conversation's usage wall cut short (src/server/auto-resume-workflow.js: off the main loop, bounded), asked every two
 *        minutes while the wall's arm stands; the continue names only a fresh answer.
 * @param deps.renewSpend (holds:[holdId]) => void — the holds the batch has not reached yet are renewed on every pass (a
 *        batch can outlive one hold's lifetime; an expired hold would let another producer into the budget it charges).
 * @param deps.noteBatchSpend (id, session, identity, hold, reason) => void — a DELIVERED batch continue is noted under the
 *        batch's reason: attended ⇒ the attended tally (no stamp, no hold); its gated twin ⇒ the hold converted into the stamp.
 * @param deps.wallVerdict (id, session) => {usable, blockedUntil}|null — the pool's LIVE answer for this conversation
 *        (the engine's quotaVerdictFor): a quota-stopped session whose wall has not reset is SKIPPED, never retried.
 * @param deps.clearStopped (id, session, why) => void — the stop fact is cleared when a continue starts the turn.
 * @param deps.persistFlag (id, session) => void — the per-session `autoResume` is written to the session's meta so a
 *        deploy restart does not silently turn the bulk ON back off (boot-restore reads it back). It READS NOTHING on the
 *        caller's road (U2 cure, law 2: server.js hands the store's patchSessionMeta — a pending copy patched in memory,
 *        else the file read off the loop; the version it read is the owner check's): a flip over N conversations costs
 *        the loop a constant.
 * @param deps.onListChange () => void — ONE list broadcast per bulk act (never one per session).
 */
function create({ dataDir, activeSessions, sendToSession, serverSetting, broadcast = () => { }, notify = null, beforeFire = null, fireIdentity = null, resumeVerb = null, authorizeSpend = null, noteSpend = null, releaseSpend = null, resetCreditOffer = null, notifyDelayMs = 90000, log = () => { },
  modelOf = null, beforeClaim = null, previewSpendBatch = null, notePress = null, notePressEnd = null, workflowRunAtWall = null, restoreSettled = () => true, authorizeSpendBatch = null, noteBatchSpend = null, renewSpend = null, wallVerdict = null, clearStopped = null, persistFlag = null, onListChange = null, bulkPaceMs = BULK_PACE_MS, bulkGateWaitMs = BULK_GATE_WAIT_MS, bulkGateHoldMs = BULK_GATE_HOLD_MS, storeWriter = null }) {   // clearStopped: the engine's clear of the stop fact (at a continue's delivery — U1 restack cure; the bulk resume's too)
  const file = path.join(dataDir, 'auto-resume.json');
  // r3004 (lane bl-loop-b): THE STORE-READ LAW (src/store-read-hold.js). The release read ANY failure of this file as «nothing armed,
  // nothing refused» and the next save wrote it over: a promised continue AND the loop-breaker's memory (its quarantines, the edges
  // spent) gone, said to nobody. HELD: the loop-breaker's memory unread means «assume it was broken» — NO automatic continue fires
  // (a timed one, a pool move's, a claim's, a reading's, a batch no door pressed): each waits; nothing is written over the file;
  // a new wall still arms in memory and its conversation is told once (the card in the chat) that it does not continue by itself
  // until the records read; statusFor carries `held`. LIFTED: the file's waits and memory come back beside what was armed meanwhile;
  // an arm dropped while held (a recovery, the toggle, a gone session) stays dropped — a stale promise would be a billed continue
  // nobody needed. Torn bytes are kept aside once, then it starts empty. A restart while held reads the same file again. Nothing
  // removes by this store's silence (its readers only show a status or ask before a fire)
  let hold = null;
  const goneHeld = new Set(), heldSaid = new Set();
  // r3104 (lane bl-loop-b): TORN BYTES TOLD IN PLACE. At a torn lift the record starts empty, so a continue a stopped conversation was
  // promised may be lost: `damaged` (the copy's base name, when) is kept in the record itself (a restart still says it) for the
  // waiting bound; a conversation stopped by a usage limit, with auto-continue on and no wait, carries `lost` in its status — its
  // chip and its card say the record was damaged, where the damaged bytes are kept, and what the person can do (continue it; or
  // mend its file by hand and restart) — never «restore» them
  let damaged = null;
  const damagedNow = (now = Date.now()) => (damaged && now - (Number(damaged.at) || 0) < MAX_WAIT_MS ? damaged : null);
  class ArmMap extends Map { delete(k) { if (hold && hold.held()) goneHeld.add(k); return super.delete(k); } }
  let armed = new ArmMap(); // webuiId -> { at, resetsAt, reason, cid, fired }
  let fires = new Map(); // webuiId -> loop-breaker record (see FIRE_* above)
  const wfOf = new Map(); // B-3437: webuiId -> {rec, run, at, ask} — the Workflow run the wall cut short, kept OFF the arm record (never persisted)
  // named only FRESH and only when the continue really goes after the run's proven limit lifted: a fire BEFORE its arm's own
  // reset (a pool move, a claim, the fresh-window edge) gets NO slack — the run's reset must already be behind it, else
  // today's words (the read's MUST 1: an early fire minutes before the reset named a run whose limit still stood); the
  // banner's rounding slack is the TIMED fire's only
  const freshRun = (id, a) => {
    const w = wfOf.get(id);
    if (!(w && w.rec === a && w.run && Date.now() - (w.at || 0) <= WF_FRESH_MS)) return null;
    const own = Number(a && a.resetsAt) || 0, early = !(own > 0) || Date.now() < own;
    const r = Number(w.run.resetAt) || 0;
    return r > 0 && r <= Date.now() + (early ? 0 : WF_RESET_SLACK_MS) ? w.run : null;
  };
  // THE CONTINUE'S OWN RECORD (B-3d90 item 2): every continue this core delivers — the single one and the batch's — is noted
  // through this ONE writer, so a rebuild still says VibeSpace sent it (test-message-origin: one writer per send door). Each send
  // site keeps its own `sendToSession(` call: the spend census judges a continue site where it stands, beside its gate
  const sentNoted = (s2, text, sent) => { if (sent) require('./sent-record.js').noteFor(s2, { text, kind: 'auto-resume' }); return sent; };
  const gateHeld = new Map();   // id → the token of the bulk resume's hold on an abandoned gate (only THAT hold frees _arFiring — U2 cure's should)
  const wfPending = new Map();   // id → when ITS ARM's read started (the arm's own bookkeeping: never two reads for one live arm; said once)
  const wfOut = new Set();       // every read still OUT — the cap's count (U3 cure 3: a read that has not returned stays counted until it returns, its arm gone or not)
  const wfNotReadSaid = new Set();   // arms held «not read: the folder's storage does not answer» (said once)
  const WF_HUNG_MS = 5 * 60 * 1000, wfHungSaid = new Set();
  const loadInto = (raw) => {
    for (const [k, v] of Object.entries(raw && raw.armed ? raw.armed : {})) armed.set(k, v);
    for (const [k, v] of Object.entries(raw && raw.fires ? raw.fires : {})) if (v && typeof v === 'object') fires.set(k, v);
    const d = raw && raw.damaged;   // r3104: a torn lift's fact, kept for the waiting bound
    if (d && typeof d === 'object' && typeof d.copy === 'string' && Number.isFinite(Number(d.at))) damaged = { copy: d.copy.slice(0, 200), at: Number(d.at) };
  };
  hold = HOLD.create({ file, valid: AR_SHAPE, code: 'auto_resume_unread', aside: (mark) => file + '.corrupt-' + mark,
    words: (h) => `the record of waiting continues could not be read (${h.code}) — no conversation continues by itself until it reads (its waits and its loop-breaker's memory are unread); VibeSpace reads it again every few minutes and writes nothing over it`,   // r3104: the list by its plain name, never a path
    log: (m) => log('[auto-resume] ' + m), onLift: (v, f) => lifted(v, f) });
  { let read; try { read = { text: fs.readFileSync(file, 'utf-8') }; } catch (error) { read = { error }; } const a0 = SR.storeAnswer(read, { valid: AR_SHAPE }); if (hold.start(a0) === 'data') loadInto(a0.value); }
  /** r3004: THE HOLD LIFTED — the file's waits and loop-breaker memory come back beside what was armed meanwhile (the newer arm of a
   *  conversation stands; a failure noted meanwhile joins its record); an arm dropped while held stays dropped; written once, said again.
   *  r3104: torn bytes (`f.setAside`, the copy's base name) — `damaged` recorded, so each stopped conversation that may have lost its
   *  promise says it in place (statusFor `lost`); the copy's name in the journal too */
  function lifted(v, f) {
    if (f && f.setAside) { damaged = { copy: String(f.setAside).slice(0, 200), at: Date.now() }; log(`[auto-resume] the record of waiting continues did not parse — its damaged bytes are kept beside it as ${f.setAside}; it starts empty (a stopped conversation that may have lost its continue says so on its chip and its card)`); }
    const mem = new Map(armed), memFires = new Map(fires);
    armed.clear(); fires.clear();
    if (v) loadInto(v);
    for (const k of goneHeld) armed.delete(k);
    for (const [k, r] of mem) { const f = armed.get(k); if (!f || (Number(r && r.at) || 0) >= (Number(f && f.at) || 0)) armed.set(k, r); }
    for (const [k, r] of memFires) { const f = fires.get(k); fires.set(k, f ? mergeFire(f, r) : r); }   // r3196 (3): forward, never a count lowered
    goneHeld.clear(); heldSaid.clear();
    save();
    // r3196 (4): EVERY status that carried the held words is said again (an enabled conversation with no arm kept them on its chip),
    // and the list's own change is told ONCE (the sidebar's card drew `held`)
    const said = new Set(armed.keys());
    for (const [k, s2] of activeSessions) if (s2 && !s2.isTmuxView && enabledFor(s2)) said.add(k);
    for (const k of said) { try { emit(k); } catch { } }
    if (onListChange) { try { onListChange(); } catch { } }
  }
  /** r3196 (3): THE LOOP BREAKER's TWO RECORDS OF ONE CONVERSATION at the lift (the file's, and the one made meanwhile — a pressed bulk
   *  resume while held writes it): merged FORWARD. A count is never lowered (the two sets of fires are apart: summed, in the newer
   *  window), a quarantine never shortened (each identity's newest failure), and the pending fire, the reading's spent edge and its
   *  hold are kept by the newer stamp */
  function mergeFire(f, r) {
    if (!r || typeof r !== 'object') return f;
    if (!f || typeof f !== 'object') return r;
    const newest = new Map();
    for (const x of [...(Array.isArray(f.fails) ? f.fails : []), ...(Array.isArray(r.fails) ? r.fails : [])]) { if (!x) continue; const o = newest.get(x.key || null); if (!o || (Number(x.at) || 0) > (Number(o.at) || 0)) newest.set(x.key || null, x); }
    const later = (x, y, at) => (!x ? y : !y ? x : (Number(at(y)) || 0) > (Number(at(x)) || 0) ? y : x);
    const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
    const maxed = (x, y) => { const o = { ...obj(x) }; for (const [k, v] of Object.entries(obj(y))) o[k] = typeof v === 'number' && typeof o[k] === 'number' ? Math.max(o[k], v) : (o[k] === undefined ? v : o[k]); return o; };
    return {
      ...f, ...r,
      n: (Number(f.n) || 0) + (Number(r.n) || 0),
      windowStart: Math.max(Number(f.windowStart) || 0, Number(r.windowStart) || 0),
      fails: [...newest.values()],
      last: later(f.last, r.last, (x) => x.at),
      lastFireAt: Math.max(Number(f.lastFireAt) || 0, Number(r.lastFireAt) || 0),
      edgeHeld: later(f.edgeHeld, r.edgeHeld, (x) => x.until),
      edgeSpent: r.edgeSpent || f.edgeSpent,
      notified: maxed(f.notified, r.notified), notices: maxed(f.notices, r.notices),
      refuse: r.refuse || f.refuse || null,
      noTargetAt: Math.max(Number(f.noTargetAt) || 0, Number(r.noTargetAt) || 0),
    };
  }
  let timer = null;

  // THE HARNESS'S RESUME VERB (owner ruling 2026-09-08) — `{form, deliver}` or
  // null, from the descriptor registry BY DEFAULT (no wiring to forget, and
  // no second table: the same object src/harnesses validated at load). It
  // gates BOTH ends: `armIfEnabled` refuses to promise a continue it has no
  // way to deliver, and `deliver()` below runs the descriptor's own function
  // rather than assuming a chat-input frame. The `resumeVerb` dep exists so a
  // test can stand in a stub channel for a harness it is not running.
  function verbFor(session) {
    try {
      const v = resumeVerb ? resumeVerb(session) : harnesses.resumeVerb(session && session.backend);
      return v || null;
    } catch { return null; }
  }

  /** THE ONE CONTINUE DELIVERY: the descriptor's own verb, handed the ORCH channel. Every continue this module sends —
   *  the single one (attemptFire's deliver) and the bulk resume's (resumeBatch) — goes through THIS line (test-harness-
   *  contract counts the verb's deliver call: exactly one), and each CALLER keeps its `sendToSession(` under its OWN gate (the spend-
   *  paths census reads the site there: the single continue's spendOk, the batch's authorizeSpendBatch). */
  function deliverContinue(session, verb, prompt, sendChatInput) { return !!verb.deliver(session, prompt, { sendChatInput }); }

  let saveHeld = 0, saveOwed = false;   // U2 cure (law 2): a bulk flip holds every save and writes the arms' store ONCE after its loop
  const writer = () => storeWriter || require('../store-writer.js').storeWriter();
  /** a fire's record: its save made urgent (the writer's pace set aside: on disk as soon as its thread writes it) */
  const landFire = () => { try { writer().durable(file).catch(() => { }); } catch { } };
  /** R9 (row B-9a24's half — 主开发 r3487 / r4350; B-574d): A CONTINUE's RECORD IS ON DISK BEFORE ITS DELIVERY. The arm is taken off and
   *  the fire noted (the loop breaker's memory), then the file is landed by the store writer's SYNCHRONOUS road (its thread writes,
   *  syncs and renames while the loop waits, bounded), so a kill inside the delivery never continues the conversation twice after the
   *  start. ONE door for both continue sites (the single fire and the bulk resume's). → a function that puts the arm and the fire's
   *  record back (a delivery that did not happen), or null: the record could not land — the caller delivers NOTHING (it gives its
   *  hold back; the arm and the breaker stand as they were, the tick tries again). A kill after the landing and before the delivery
   *  leaves the conversation not continued (never twice). */
  // F1 (主开发 r4551; said as it is by r5209): ONE REFUSED WAIT A TICK (a landing the storage answers waits its own write) — once a landing of this tick is refused (its bound spent, or its write failed),
  // every further landing refuses at once until the next tick starts (tick() clears it): the other due arms stay as they were. fireNow
  // and the bulk resume, outside a tick, share it until then. `refusedWhy` is the last refusal's code, for the journal
  let landingRefused = false, refusedWhy = null, refusedAtOnce = false;   // refusedAtOnce (r5209): this refusal waited on nothing — the tick's journal says a stall once
  function landRecord(why) {
    refusedAtOnce = true;
    if (hold.held()) { refusedWhy = 'held'; return false; }   // held: nothing is written over its file (no record, so no continue — r3004 already refuses there)
    if (landingRefused) return false;
    const W = writer();
    if (typeof W.laneHeld === 'function' && W.laneHeld(file)) { landingRefused = true; refusedWhy = 'lane-held'; return false; }   // F1: the writer already reports that lane held — refused at once, without the wait
    refusedAtOnce = false;   // from here the landing waits (bounded) or fails on its own write
    const was = saveHeld; saveHeld = 0;   // a bulk flip's batching never holds back the record a delivery waits on
    try { save(); } finally { saveHeld = was; }
    let r = null;
    try { r = W.flushSync([file], { waitedBy: `auto-resume.json: ${why}` }); } catch (e) { r = { left: [{ file, why: (e && e.message) || 'the writer threw' }] }; }
    // r4812 REQUIRED 2: LANDED means this store is among the files the flush WROTE — a flush that wrote nothing and left nothing (the
    // save's hand-over threw, the producer gave nothing) is no landing; r5209: AND NOT AMONG THOSE IT LEFT — the flush can write an OLDER
    // job of this file made earlier (parked behind a busy lane) and then leave the CURRENT version at the bound
    const landed = !!r && !r.deferred && Array.isArray(r.written) && r.written.includes('auto-resume.write') && !(r.left || []).some((x) => x && x.file === file);
    if (!landed) { landingRefused = true; refusedWhy = r && r.deferred ? 'stopping' : 'not-durable'; }
    if (landed) putBacksOwed = 0;   // r5209 (a should): a landing writes the whole file — every put-back owed before is on disk with it
    return landed;
  }
  // r4812 M2: WHILE THE STORE IS HELD NOTHING TOUCHES THE ARMS OR THE FIRE RECORDS — recordBeforeDelivery refuses before either is
  // touched (an arm taken off there would be remembered as «gone» by the held bookkeeping and deleted from the file at the lift)
  function recordBeforeDelivery(id, key, kind, origin = null) {
    if (hold.held()) { refusedWhy = 'held'; return null; }
    const arm = armed.has(id) ? armed.get(id) : undefined;
    const fire = fires.has(id) ? JSON.parse(JSON.stringify(fires.get(id))) : undefined;
    const back = () => { if (arm !== undefined) armed.set(id, arm); else armed.delete(id); if (fire !== undefined) fires.set(id, fire); else fires.delete(id); };
    armed.delete(id);
    noteFired(id, key, kind, Date.now(), origin);
    if (!landRecord(`the continue of ${id}`)) { back(); save(); return null; }
    // F2 (主开发 r4551): THE PUT-BACK IS ON DISK, OR SAID — a delivery that failed after a good landing lands the arm and the breaker back
    // by the same bounded road (under F1); when it cannot, the put-back stays queued (the writer writes it again) and ONE journal line
    // says it, a count and a code, no account: a restart before it is written leaves that conversation stopped at its wall (its mark kept)
    return () => {
      back();
      if (landRecord(`the wait of ${id} put back`)) return;
      save(); putBacksOwed++;
      log(`[auto-resume] ${putBacksOwed} continue${putBacksOwed === 1 ? '' : 's'} not delivered had the wait put back in memory only (${refusedWhy || 'not-durable'}) — written when the storage answers; a restart before it leaves that conversation stopped at its wall`);
    };
  }
  let putBacksOwed = 0;
  function save() {   // (a declaration: test-architecture §72 finds the store's site by its name)
    if (!hold.writable('an auto-continue change')) return;   // r3004: held — nothing is written over the file
    if (saveHeld) { saveOwed = true; return; }
    try {
      // prune breaker records that can no longer refuse anything (their
      // window rolled over and nothing is pending) so the file stays bounded
      const now = Date.now();
      for (const [k, r] of fires) {
        const live = (r.fails || []).some((f) => now - (f.at || 0) < FIRE_QUARANTINE_MS)
          || (r.last && now - (r.last.at || 0) < FIRE_PENDING_MS)
          || now - (r.windowStart || 0) < FIRE_WINDOW_MS
          // A REFUTED READING OUTLIVES THE HOUR (r2). `edgeSpent` is not a
          // budget that rolls over — it is the memory that a reading-driven
          // continue onto this wall was answered with another rejection, and
          // the wait it belongs to can stand for DAYS. Pruning it with the
          // window handed the loop a fresh reading-fire every hour, which is
          // most of what round 1 measured. Bounded by the armed set: once the
          // wait is gone (fired / disarmed / watch expired) so is the memory.
          || (!!r.edgeSpent && armed.has(k))
          // …AND SO DOES A GATE HOLD (r3). Same rule, second instance: this
          // predicate decides what may still REFUSE, so every field that can
          // refuse owes it a clause — a fact the reader consults but the
          // pruner does not know about is deleted on the next save, and
          // `save()` runs on every arm, every fire and every refusal.
          // MEASURED before this clause existed: the 10-minute hold vanished
          // at each FIRE_WINDOW_MS boundary, so a standing veto asked the
          // gate 27 times over four simulated hours instead of 25 — small
          // here only because the hold is short; the rule is what matters.
          // Bounded twice, like edgeSpent: by its OWN expiry and by the wait.
          || (!!(r.edgeHeld && r.edgeHeld.until > now) && armed.has(k));
        if (!live) fires.delete(k);
      }
      // B-574d unit 1 (主开发 r3450 / r3455): the record goes through THE STORE WRITER — its thread writes the temp, SYNCS it and
      // renames it (a power loss never leaves it empty or torn), the hub's loop never waits on the data folder, and a wall's burst
      // of arms in one turn is ONE landing: the bytes are made AT the write from the maps as they are then. A write queued before
      // a hold never lands (the producer refuses, EHELD). A fire's record is urgent (`landFire`, after its delivery, as before)
      writer().dirty(file, { name: 'auto-resume.write', rank: 0 /* the exit writes it first: a lost fire record could fire again after the start */, produce: () => {
        if (hold.held()) throw Object.assign(new Error('auto-resume.json is held (it could not be read) — nothing is written over it until it reads'), { code: 'EHELD' });
        return JSON.stringify({ armed: Object.fromEntries(armed), fires: Object.fromEntries(fires), ...(damagedNow() ? { damaged } : {}) }, null, 2);   // r3104: + a torn lift's fact for the waiting bound
      } });
    }
    catch (e) { log('[auto-resume] persist failed: ' + e.message); }
  };
  // the GENERIC instance default under its legacy persisted spelling (src/harness-settings.js GENERIC_LEGACY_KEYS — not a harness row)
  const globalDefault = () => { try { return serverSetting(GENERIC_LEGACY_KEYS.autoResumeOnLimit) === true; } catch { return false; } };

  /** Per-session preference: what the session was spawned with, else the global
   *  default. `session._autoResume` is set at create and by the live toggle. */
  function enabledFor(session) {
    if (!session) return false;
    if (session._autoResume === true) return true;
    if (session._autoResume === false) return false;
    return globalDefault();
  }

  function statusFor(id) {
    const session = activeSessions.get(id);
    const a = armed.get(id) || null;
    const verb = session ? verbFor(session) : null;
    return {
      ...(hold.held() ? { held: hold.words() } : {}),   // r3004: its records unread — nothing continues by itself
      // B-5279: the wall ladder stopped with no known reset because the door refused (readsOffStop): this stopped conversation continues
      // when a person resumes it — `readsOff` is the door's code (refresh-off, refresh-held), the client says the TRUE reason
      ...(!a && session && session._readsOffWall && (normalizeStoppedBy(session._stoppedBy) || {}).kind === 'quota' ? { readsOff: session._readsOffWall.code || 'refresh-off' } : {}),
      ...(!a && damagedNow() && session && enabledFor(session) && (normalizeStoppedBy(session._stoppedBy) || {}).kind === 'quota' ? { lost: damagedNow().copy } : {}),   // r3104: stopped by a limit, no wait, the record damaged since — its continue may be lost
      enabled: enabledFor(session),
      explicit: session && session._autoResume !== undefined ? !!session._autoResume : null,
      globalDefault: globalDefault(),
      armed: !!a && !a.fired,
      resetsAt: a ? a.resetsAt : null,
      reason: a ? a.reason : null,
      // THE HARNESS FACTS the client chip gates on, so no surface has to know
      // a backend id: `resume` is the verb's form (null = this harness cannot
      // continue a turn at all), `watch` = armed with no timed fire (the reset
      // is past the ceiling; only a fresh-window reading can continue it),
      // `lane` = which limit lane the wait is about (null = the harness has one).
      resume: verb ? verb.form : null,
      maxWaitMs: MAX_WAIT_MS,   // the timed wait's bound — the card's optimistic paint reads it here, never a copied number (U1 cure 2)
      watch: !!(a && !a.fired && a.watch),
      lane: a ? (a.lane || null) : null,
      bucket: a ? (a.bucket || null) : null,
      // B-73fe: the STRUCTURE behind the wait (who resets when, and why the
      // rejector's own reset is not it) — the client says the words
      cause: a ? liveCause(a.cause || null) : null,
    };
  }
  const _refuseNotified = new Map(); // id → last far-refusal notice ts (1/h floor)
  const _armNotifyTimers = new Map(); // id → pending delayed-announcement timer
  const _cancelArmNotify = (id) => { const t = _armNotifyTimers.get(id); if (t) { clearTimeout(t); _armNotifyTimers.delete(id); } };
  const emit = (id) => { try { broadcast(id, { type: 'auto-resume', sessionId: id, status: statusFor(id) }); } catch { } };

  /** The live toggle (ws). Turning it OFF also cancels a pending wait. */
  function setEnabled(id, on, { quiet = false } = {}) {
    const session = activeSessions.get(id);
    if (session) session._autoResume = !!on;
    if (session && persistFlag) { try { persistFlag(id, session); } catch (e) { log('[auto-resume] persisting the flag failed: ' + e.message); } }
    if (!on && hold.held()) goneHeld.add(id);   // r3004: an unread promise of this conversation goes with the switch too
    if (!on && armed.has(id)) { armed.delete(id); save(); }
    // TURNED ON AFTER THE WALL (lane auto-resume-bulk, U1 cure): a session a usage wall already STOPPED is armed on that
    // wall's own stated reset — the card's switch promises «continues by itself when its limit resets», and before this
    // only a wall seen WITH auto-continue on armed anything. A reset that has passed (or none stated) arms nothing: no
    // billed turn ever starts from the switch itself — the card says so (stopped-by.js liveFactOf `waiting`).
    if (on && session && !armed.has(id)) {
      const f = session._stoppedBy;
      if (f && f.kind === 'quota' && Number(f.resetsAt) > Date.now() && session._stopContinuedAt !== f.at) {   // never twice for ONE stop: one it already continued is not armed again
        try { armIfEnabled(id, session, Number(f.resetsAt), 'usage limit (auto-continue turned on after the wall)', { lane: f.lane || null, bucket: f.bucket || null, scopedName: f.scopedName || null }); } catch (e) { log(`[auto-resume] ${id}: arming at the stop's reset failed: ${e.message}`); }
      }
    }
    emit(id);
    // a STOPPED session's card shows its auto-resume state beside the mark (lane auto-resume-bulk) — every list hears it
    if (!quiet && session && session._stoppedBy && onListChange) { try { onListChange(); } catch { } }
    return statusFor(id);
  }

  /** WHO A BULK FLIP WOULD TOUCH: every live session whose harness can continue a turn (a harness with no resume verb
   *  has no auto-resume to turn on — its chip is not drawn either). `on` = how many already have it effectively on. */
  function bulkCounts() {
    let total = 0, on = 0;
    for (const [, s] of activeSessions) {
      if (!s || s.isTmuxView || s._metaUnread || !verbFor(s)) continue;   // (r3749: nor is it counted)
      total++;
      if (enabledFor(s)) on++;
    }
    return { total, on, off: total - on, globalDefault: globalDefault() };
  }
  /** «对所有会话开启自动继续» / «全部关闭»: the SAME setEnabled road for every live session, then ONE list broadcast.
   *  The instance DEFAULT for new sessions (GENERIC_LEGACY_KEYS.autoResumeOnLimit) is never touched here. */
  function setEnabledAll(on) {
    const before = bulkCounts();
    let changed = 0, written = 0;
    // «TURN IT OFF FOR ALL» ALSO STOPS A RUNNING BULK RESUME (U2 cure, law 3): a person who presses it expects nothing more
    // to continue by itself — the batch stops before its next conversation (its holds go back, the rest are «stopped»)
    const stoppedBatch = !on && batchRunning ? (stopBatch(batchRunning, 'auto-continue turned off for every session'), batchRunning) : null;
    // THE FLIP COSTS THE LOOP A CONSTANT (U2 cure, law 2): every setEnabled below arms or disarms in memory; the arms' store is
    // written ONCE after the loop (saveHeld), and each conversation's flag goes through persistFlag, which reads nothing here
    saveHeld++;
    try {
      for (const [id, s] of activeSessions) {
        if (!s || s.isTmuxView || s._metaUnread || !verbFor(s)) continue;   // (r3749: a listed conversation whose record could not be read takes no choice it cannot save)
        if (s._autoResume === !!on) continue;            // already its explicit choice
        const flips = enabledFor(s) !== !!on;            // a session that only FOLLOWED the default gets the explicit choice too,
        setEnabled(id, !!on, { quiet: true });           // but is not counted as turned on/off when nothing it does changes
        written++; if (flips) changed++;
      }
    } finally { saveHeld--; if (!saveHeld && saveOwed) { saveOwed = false; save(); } }
    const after = bulkCounts();
    log(`[auto-resume] bulk: turned ${on ? 'ON' : 'OFF'} for ${changed} session(s) (${before.on}/${before.total} → ${after.on}/${after.total} on${written !== changed ? `; ${written - changed} more now hold it explicitly` : ''})`);
    if (written && onListChange) { try { onListChange(); } catch { } }
    return { on: !!on, changed, written, before, after, stoppedBatch };
  }

  // ── THE BULK RESUME (lane auto-resume-bulk) ─────────────────────────────
  // «恢复所有因用量/过载停止的会话»: ONE owner click, N billed continues. The click is the per-occurrence owner action
  // for the WHOLE batch, so the batch is ONE authorization (authorizeSpendBatch — every slot's budget must hold all of
  // its share, or NOTHING is resumed), and then the continues go out PACED, one at a time, each exactly like a single
  // auto-resume: the loop breaker's quarantine is honoured, the pre-fire gate (beforeFire: a fresh probe, the pool's
  // member pick, the verdict) decides at THAT moment, and the harness's own verb delivers. A wall that has not reset is
  // SKIPPED and said («仍在限额内，至 14:00») — never retried blindly; a hold whose continue was not delivered goes back.
  const batches = new Map();   // batchId → the batch's record (newest 8 kept; the dialog polls it)
  let batchSeq = 0;
  let batchRunning = null;
  const stopWakers = new Map();   // batchId → wakes the loop's wait on a gate when a stop is asked (U2 cure, law 3)
  /** THE STOP DOOR (U2 cure, law 3): a running batch stops before its next conversation and after the gate it waits on —
   *  what it has not reached is neither continued nor charged and its hold goes back (`stopped` on the record). → the record */
  function stopBatch(batchId, by = 'the person') {
    const b = batches.get(String(batchId));
    if (!b) return null;
    if (!b.done && !b.stopAsked) {
      b.stopAsked = { at: Date.now(), by: String(by).slice(0, 80) };
      log(`[auto-resume] bulk resume ${b.batchId}: stop asked (${b.stopAsked.by}) — nothing more is started`);
      const w = stopWakers.get(b.batchId); if (w) { try { w(); } catch { } }
    }
    return batchStatus(b.batchId);
  }
  /** The loop breaker's quarantine, READ ONLY (canFire would mint a breaker record for a plan). */
  function quarantinedUntil(id, key, now) { const h = fireHoldOf(id, key, now); return h ? h.until : 0; }
  /** …and WHY: a continue onto this slot was just rejected ('quarantined'), or one is on its way ('pending'). */
  function fireHoldOf(id, key, now) {
    const r = fires.get(id);
    if (!r) return null;
    const hit = key ? (r.fails || []).find((f) => f && f.key === key && now - (f.at || 0) < FIRE_QUARANTINE_MS) : null;
    if (hit) return { why: 'quarantined', until: hit.at + FIRE_QUARANTINE_MS };
    if (r.last && now - (r.last.at || 0) < FIRE_PENDING_MS) return { why: 'pending', until: (r.last.at || now) + FIRE_PENDING_MS };
    return null;
  }
  function stoppedRows(now = Date.now()) {
    const rows = [];
    for (const [id, s] of activeSessions) {
      if (!s || s.isTmuxView || !normalizeStoppedBy(s._stoppedBy)) continue;
      const ident = identityFor(id, s);
      let verdict = null;
      try { verdict = wallVerdict ? wallVerdict(id, s) : null; } catch { verdict = null; }
      rows.push({ id, name: s.name || null, stoppedBy: s._stoppedBy, live: true, streaming: !!s._isStreaming, canResume: !!verbFor(s), quarantined: quarantinedUntil(id, ident ? ident.key : null, now), verdict, identity: ident });
    }
    return rows;
  }
  /** The plan as the Settings row / the dialog shows it BEFORE anything runs. */
  /** The refusals that are about an ACCOUNT (form two): its conversations are left stopped, the account named. */
  const ACCOUNT_REFUSALS = new Set(['overage-in-use', 'identity-cannot-serve', 'spend-control-reached']);
  /** A conversation left stopped because the press is refused on ITS account — the row names the account and the rule. */
  const accountSkip = (e, r) => ({ id: e.id, name: e.name, kind: e.kind, at: e.at, why: 'account-refused', until: null, reason: String((r && r.why) || 'refused').slice(0, 60), member: String((r && r.identity && (r.identity.name || r.identity.key)) || '').slice(0, 80) || null });
  function stoppedPlan(now = Date.now()) {
    const rows = stoppedRows(now);
    const plan = planBatch(rows, { now });
    const byId = new Map(rows.map((r) => [r.id, r]));
    plan.eligible = plan.eligible.map((e) => ({ ...e, identity: byId.get(e.id) ? byId.get(e.id).identity : null }));
    // THE ACCOUNT, NOT THE PRESS — SAID BEFORE IT (主开发 2026-11-18 16:20Z): an account the press would be refused on (paid
    // overage, a credential that cannot serve, the spend control) — its conversations leave the eligible set for the skipped
    // one, BY NAME, so the dialog's N, its cost and its list are what the press will do; the press asks the guard again
    // a conversation with no billing slot is said BEFORE the press too (the cure's should): skipped by name, never the press
    if (plan.eligible.some((e) => !(e.identity && e.identity.key))) {
      plan.skipped.push(...plan.eligible.filter((e) => !(e.identity && e.identity.key)).map((e) => ({ id: e.id, name: e.name, kind: e.kind, at: e.at, why: 'no-slot', until: null })));
      plan.eligible = plan.eligible.filter((e) => e.identity && e.identity.key);
    }
    plan.overage = null;
    if (previewSpendBatch && plan.eligible.length) {
      let pv = null;
      try { pv = previewSpendBatch(plan.eligible.map((e) => ({ id: e.id, session: activeSessions.get(e.id) || null, identity: e.identity || null }))); } catch (e) { pv = null; log('[auto-resume] the bulk plan\'s spend preview threw: ' + e.message); }
      const off = new Map(((pv && pv.refusedSlots) || []).filter((r) => r && r.identity && r.identity.key).map((r) => [String(r.identity.key), r]));
      if (off.size) {
        const keep = [];
        for (const e of plan.eligible) { const r = e.identity && off.get(String(e.identity.key)); if (r) plan.skipped.push(accountSkip(e, r)); else keep.push(e); }
        plan.eligible = keep;
      }
      // THE OVERAGE SENTENCE IS TRUE ON EVERY INSTANCE (the cure): whether this instance lets a press bill paid overage, and
      // which accounts it would bill so — the dialog's lead and cost box say it
      plan.overage = pv ? { allowed: !!pv.overageAllowed, billed: (Array.isArray(pv.overageBilled) ? pv.overageBilled : []).map((b) => ({ name: (b.identity && (b.identity.name || b.identity.key)) || null, n: Number(b.n) || 0 })) } : null;
    }
    return { ...plan, total: rows.length, running: batchRunning };
  }
  function batchStatus(batchId) { const b = batches.get(batchId); return b ? JSON.parse(JSON.stringify(b)) : null; }
  const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, Math.max(0, ms)); if (t.unref) t.unref(); });

  /** THE BATCH. `limit` = at most this many, earliest stops first (the dialog sends none); `ids` narrows to the rows the
   *  dialog showed; `pressed` = the press its door minted (write-origin pressOf). Returns the batch record at once (refused /
   *  nothing to do ⇒ already `done`); the paced continues run after it and fill it in. */
  function resumeBatch({ limit = null, ids = null, pressed = null } = {}) {
    if (batchRunning) return { ok: false, why: 'in-flight', batchId: batchRunning };
    // THE PERSON'S OWN ACT (the owner's ruling 2026-11-18, B): the press starts all N, ATTENDED — none counted against the
    // unattended caps, no stamp; every slot still asked before each continue (paid overage refused by name). A batch no door
    // pressed is N automatic continues: its gated twin, each counted like any auto-resume
    if (hold.held()) return { ok: false, why: 'held', code: 'auto_resume_unread', error: hold.words() };   // r3004: N automatic continues on a guess — they wait; r4812 REQUIRED 1: a person's press too — refused up front by name, the hold's own words (no row can land its record while the file is unread)
    const paid = reasonOf(pressed);
    const now = Date.now();
    const plan = stoppedPlan(now);
    let take = plan.eligible;
    if (Array.isArray(ids)) { const want = new Set(ids.map(String)); take = take.filter((e) => want.has(e.id)); }
    const k = limit === null || limit === undefined || limit === '' ? take.length : Math.max(0, Math.floor(Number(limit)) || 0);
    const chosen = take.slice(0, k);
    const batchId = `rb-${(++batchSeq).toString(36)}-${now.toString(36)}`;
    const rec = { ok: true, batchId, at: now, planned: chosen.length, left: take.length - chosen.length, resumed: [], skipped: plan.skipped.slice(), planSkipped: plan.skipped.length, failed: [], stopped: [], stopAsked: null, refused: null, done: false };
    batches.set(batchId, rec);
    while (batches.size > 8) batches.delete(batches.keys().next().value);
    if (!chosen.length) { rec.done = true; return batchStatus(batchId); }
    // ONE AUTHORIZATION FOR THE WHOLE BATCH — each continue bills the slot the engine says it would (fireIdentityFor,
    // the SAME identity every auto-resume charges); a refusal names its bucket and resumes NONE. FAIL CLOSED: no gate
    // wired, a gate that throws, an answer without holds — all refuse.
    let v = null;
    try {
      v = authorizeSpendBatch
        ? authorizeSpendBatch(chosen.map((e) => ({ id: e.id, session: activeSessions.get(e.id) || null, identity: e.identity || null })), paid.spendReason)
        : { ok: false, why: 'no-gate', detail: 'the batch spend gate is not wired' };
    } catch (e) { v = { ok: false, why: 'gate-error', detail: (e && e.message) || String(e) }; try { global.__vsEvent?.('spend-gate-error', 'bulk-resume:threw'); } catch { } }
    // FORM TWO at the press (an account turned to overage since the plan): the guard hands back its items as SKIPPED — by name
    const preSkip = v && v.ok !== false && Array.isArray(v.skipped) ? v.skipped : [];
    if (v && v.ok !== false && Array.isArray(v.holds) && v.holds.length + preSkip.length === chosen.length && preSkip.length) {
      for (const x of preSkip) {
        const ix = chosen.findIndex((e) => e.id === String(x.sessionId));
        if (ix < 0) continue;
        const [e] = chosen.splice(ix, 1);
        rec.skipped.push(x.why === 'identity-unknown' ? { id: e.id, name: e.name, kind: e.kind, at: e.at, why: 'no-slot', until: null } : accountSkip(e, { why: x.why, identity: x.identity }));
      }
      rec.planned = chosen.length;
      rec.planSkipped += preSkip.length;   // skipped before the run, like the plan's: the not-reached count subtracts them ONCE (the cure's should)
      log(`[auto-resume] bulk resume ${batchId}: ${preSkip.length} left stopped — their account is refused (${[...new Set(preSkip.map((x) => (x.identity && (x.identity.name || x.identity.key)) || '?'))].join(', ')})`);
    }
    if (!v || v.ok === false || !Array.isArray(v.holds) || v.holds.length !== chosen.length) {
      if (v && v.ok !== false && Array.isArray(v.holds) && releaseSpend) for (const h of v.holds) { try { releaseSpend(h.sessionId, null, h.hold); } catch { } }
      rec.refused = { why: (v && v.why) || 'refused', detail: (v && v.detail) || null, identity: (v && v.identity) || null, retryAfter: (v && v.retryAfter) || 0, n: chosen.length, need: v && Number.isFinite(v.need) ? v.need : null, left: v && Number.isFinite(v.left) ? v.left : null, slots: v && Array.isArray(v.refusedSlots) ? v.refusedSlots.map((r) => ({ name: (r.identity && (r.identity.name || r.identity.key)) || null, why: r.why })) : null };
      rec.done = true;
      log(`[auto-resume] bulk resume of ${chosen.length} refused by the spend gate — ${rec.refused.why}: ${rec.refused.detail || ''} (none resumed)`);
      return batchStatus(batchId);
    }
    // THE RECORD OF A PRESS (the cure, 主开发 20:16Z): one row in the attended tally — when, how many, the batch id
    if (v.attended && notePress) { try { notePress(batchId, chosen.length, paid.spendReason); } catch (err) { log('[auto-resume] recording the press failed: ' + err.message); } }
    const holdOf = new Map(v.holds.map((h) => [String(h.sessionId), h]));
    const open = new Map(holdOf);   // the holds not yet charged or given back — renewed on every pass
    const renew = () => { if (renewSpend && open.size) { try { renewSpend([...open.values()].map((x) => x.hold)); } catch (err) { log('[auto-resume] renewing the batch holds failed: ' + err.message); } } };
    batchRunning = batchId;
    log(`[auto-resume] bulk resume ${batchId}: ${chosen.length} authorized as one batch, ${plan.skipped.length} skipped — continuing paced (${bulkPaceMs} ms apart)`);
    // STOPPED (U2 cure, law 3): every conversation from `from` on is neither continued nor charged — its hold goes back now
    const stopRest = (from) => {
      for (let j = from; j < chosen.length; j++) {
        const x = chosen[j], hx = holdOf.get(x.id);
        if (hx && releaseSpend) { try { releaseSpend(x.id, null, hx.hold); } catch (err) { log('[auto-resume] releasing a batch hold failed: ' + err.message); } }
        holdOf.delete(x.id); open.delete(x.id);
        rec.stopped.push({ id: x.id, name: x.name, kind: x.kind, at: x.at });
      }
      log(`[auto-resume] bulk resume ${batchId}: stopped — ${chosen.length - from} not started, their holds given back`);
    };
    let wakeStop = null;
    const stopped = new Promise((r) => { wakeStop = r; });
    stopWakers.set(batchId, () => wakeStop('stopped'));
    (async () => {
      // F1 + 主开发 r4555 (2): A PERSON's PRESS IS ANSWERED AT ONCE when the storage refuses — once a continue's record could not land,
      // every row after it is answered at once (no pace, no landing tried: never a second wait), each said by its row (storage-busy)
      let busy = false;
      for (let i = 0; i < chosen.length; i++) {
        if (i > 0 && !busy) await Promise.race([sleep(bulkPaceMs), stopped]);
        if (rec.stopAsked) { stopRest(i); break; }   // looked at before EVERY conversation
        const e = chosen[i];
        let h = holdOf.get(e.id) || null;
        renew();   // every hold not reached yet lives on while this one waits its turn (U2 cure: a batch outlives one hold's TTL)
        const giveBack = () => { open.delete(e.id); holdOf.delete(e.id); if (h && releaseSpend) { try { releaseSpend(e.id, null, h.hold); } catch (err) { log('[auto-resume] releasing a batch hold failed: ' + err.message); } } h = null; };
        const skip = (why, until = null, reason = null, member = null) => { giveBack(); rec.skipped.push({ id: e.id, name: e.name, kind: e.kind, at: e.at, why, until, ...(reason ? { reason: String(reason).slice(0, 60) } : {}), ...(member ? { member: String(member).slice(0, 80) } : {}) }); };
        if (busy) { giveBack(); rec.failed.push({ id: e.id, name: e.name, why: 'storage-busy' }); continue; }   // F1: answered at once, said by its row
        const session = activeSessions.get(e.id);
        if (!session) { skip('gone'); continue; }
        if (session._isStreaming || session._arFiring) { skip('running'); continue; }   // working, or its own continue is in flight
        // STILL THE STOP THE PLAN SAW (U2 cure): a session that ran since (the person typed into it, the pool's own fire
        // continued it) is not continued a second time — its new turn may be the person's own instruction
        const stillSame = () => { const sb = normalizeStoppedBy(session._stoppedBy); return !!sb && sb.at === e.at; };
        if (!stillSame()) { skip('resumed'); continue; }
        const ident = identityFor(e.id, session);
        const fh = fireHoldOf(e.id, ident ? ident.key : null, Date.now());
        if (fh) { skip(fh.why, fh.until); continue; }
        // THE PRE-FIRE GATE, as every continue: a fresh probe + the pool's member pick + the verdict, NOW. `false` = the
        // wall still stands (the engine re-armed an enabled session to the new reset) — skipped and said, not retried.
        // The in-flight flag is raised BEFORE the gate, exactly as attemptFire raises it: the gate runs the pool's switch,
        // which calls fireNow for an ARMED session — and that continue plus this one would be two turns for one stop.
        let gate = true, gateP = null;
        session._arFiring = true;
        try {
          if (beforeFire) {
            let timer = null;
            const late = new Promise((r) => { timer = setTimeout(() => r('no-answer'), bulkGateWaitMs); if (timer.unref) timer.unref(); });
            try { gateP = Promise.resolve(beforeFire(e.id, session)); gate = await Promise.race([gateP, late, stopped]); }
            catch (err) { log(`[auto-resume] ${e.id}: pre-fire gate threw in the bulk resume — skipping (fail closed): ${(err && err.message) || err}`); gate = false; }
            finally { clearTimeout(timer); }
          }
        } finally {
          // A GATE THE LOOP STOPPED WAITING FOR (a Stop, the wait bound) STILL RUNS (U2 cure, the read's should): its pool switch
          // calls fireNow on an armed session, and the single continue would continue a conversation the batch just said it
          // stopped or skipped — the in-flight flag stays up until THE GATE ITSELF settles (bounded: BULK_GATE_HOLD_MS)
          // …and frees only ITS hold (U2 cure's should): the bound's timer may free the flag first, a single continue raise it again
          // for its own gate — the old gate settling later must not take that one down
          if (gateP && (gate === 'stopped' || gate === 'no-answer')) { let t2 = null; const tok = {}; gateHeld.set(e.id, tok); const free = () => { clearTimeout(t2); if (gateHeld.get(e.id) === tok) { gateHeld.delete(e.id); session._arFiring = false; } }; t2 = setTimeout(free, bulkGateHoldMs); if (t2.unref) t2.unref(); gateP.then(free, free); }
          else session._arFiring = false;
        }
        if (rec.stopAsked) { stopRest(i); break; }   // …and after EVERY gate (a stop during the gate's wait ends the wait)
        if (gate === 'no-answer') { log(`[auto-resume] ${e.id}: the pre-fire gate gave no answer in ${Math.round(bulkGateWaitMs / 1000)} s — skipped (fail closed)`); skip('no-answer'); continue; }
        if (gate === false) {
          let w = null;
          try { w = wallVerdict ? wallVerdict(e.id, session) : null; } catch { w = null; }
          skip('walled', w && w.blockedUntil > Date.now() ? w.blockedUntil : null);
          continue;
        }
        renew();
        if (session._isStreaming) { skip('running'); continue; }
        if (!stillSame()) { skip('resumed'); continue; }   // the gate's own pool switch may have continued it (fireNow on an armed session)
        const verb = verbFor(session);
        if (!verb) { skip('no-verb'); continue; }
        const ident2 = identityFor(e.id, session) || ident;
        // EVERY CONTINUE OF A BATCH IS ASKED LIKE A SINGLE CONTINUE (U2 cure 2, 主开发's law 1). The press's ONE authorization
        // (attended — the owner's ruling 2026-11-18: it counts nothing; the twin's reserved the count) does not answer for what
        // the account BECAME while the batch ran — paid overage in use, a
        // credential that cannot serve, the spend control reached. So before EACH deliver the authorizer is asked AGAIN, on the
        // slot that will bill — the gate may have MOVED the conversation (the pool's switch), or not — exactly as attemptFire
        // asks spendOk after its gate. Synchronously, with nothing between: this item's hold goes back and the SAME authorizer
        // is asked for a batch of one (same reason, same rules), so no other producer slips in. A refusal skips it BY NAME with
        // the authorizer's own reason, charges nothing (its hold is already back), and the dialog counts it.
        const moved = !!(ident2 && ident2.key && !(h && h.identity && h.identity.key === ident2.key));
        // the breaker on the slot that will bill, AFTER the gate, moved or not (the read's should: moved is judged against the
        // press's slot, and a session the pool moved away and the gate moved back would skip its slot's quarantine) — read-only
        { const fh2 = ident2 && ident2.key ? fireHoldOf(e.id, ident2.key, Date.now()) : null; if (fh2) { skip(fh2.why, fh2.until); continue; } }
        const bill = ident2 || (h && h.identity) || null;
        if (h && releaseSpend) { try { releaseSpend(e.id, null, h.hold); } catch (err) { log('[auto-resume] releasing a batch hold failed: ' + err.message); } }
        holdOf.delete(e.id); open.delete(e.id); h = null;
        let v2 = null;
        try { v2 = authorizeSpendBatch ? authorizeSpendBatch([{ id: e.id, session, identity: bill }], paid.spendReason) : null; } catch (err) { v2 = null; log(`[auto-resume] ${e.id}: re-asking the spend gate on ${(bill && (bill.name || bill.key)) || '?'} threw: ${err.message}`); try { global.__vsEvent?.('spend-gate-error', 'bulk-resume:re-ask threw'); } catch { } }
        if (!v2 || v2.ok === false || !Array.isArray(v2.holds) || v2.holds.length !== 1) {
          if (v2 && v2.ok !== false && Array.isArray(v2.holds) && releaseSpend) for (const hx of v2.holds) { try { releaseSpend(e.id, null, hx && hx.hold); } catch { } }   // a malformed answer's holds go back too
          const why = (v2 && v2.why) || 'refused';
          log(`[auto-resume] ${e.id}: the spend gate refused this continue of the bulk resume ${batchId} on ${(bill && (bill.name || bill.key)) || '?'} — ${why} (skipped, nothing charged)`);
          // FORM TWO AFTER THE PRESS (the cure, 主开发 20:16Z): a refusal on an ACCOUNT names it (the one it moved to, if moved) with its door
          if (ACCOUNT_REFUSALS.has(why)) { skip('account-refused', null, why, (bill && (bill.name || bill.key)) || null); continue; }
          skip(moved ? 'moved-refused' : 'refused', null, why); continue;
        }
        h = v2.holds[0]; holdOf.set(e.id, h); open.set(e.id, h);
        if (moved) log(`[auto-resume] ${e.id}: the gate moved it onto ${ident2.name || ident2.key} — re-authorized there for the bulk resume`);
        // the words say what unblocked it (the release's continue, lane resume-words): the gate moved it onto another
        // account ⇒ «the pool now serves this conversation from X», else the wall on its account lifted; an overload, its twin
        const switchedTo = ident2 && ident && ident2.key !== ident.key ? (ident2.name || null) : null;
        const prompt = bulkPromptFor(e.kind, switchedTo);
        const carried = { note: e.kind === 'overload' ? '模型过载后的批量恢复' : '因用量停止后的批量恢复' };
        let ok = false;
        const wasArmed = armed.has(e.id), putBack = recordBeforeDelivery(e.id, ident2 ? ident2.key : null, 'timed');   // R9: the record on disk BEFORE the delivery
        if (!putBack) { log(`[auto-resume] ${e.id}: the record of this continue could not be written to auto-resume.json — nothing was sent (the bulk resume ${batchId})`); giveBack(); busy = true; rec.failed.push({ id: e.id, name: e.name, why: 'storage-busy' }); continue; }   // (a hold begun mid-batch too: answered at once, its row said)
        try { ok = deliverContinue(session, verb, prompt, (s2, text) => sentNoted(s2, text, sendToSession(e.id, s2, text, carried))); }   // B-3d90: the batch's continue has its own record too
        catch (err) { log(`[auto-resume] ${e.id}: the '${verb.form}' resume verb threw in the bulk resume: ${err.message}`); ok = false; }
        if (!ok) { putBack(); giveBack(); rec.failed.push({ id: e.id, name: e.name, why: 'not-delivered' }); continue; }
        open.delete(e.id);   // delivered: its hold becomes the charge below
        // DELIVERED: the hold becomes the charge (on the slot the BATCH authorized for it), the breaker learns a continue
        // went out (a walled answer quarantines that slot like any fire), a wait it superseded is dropped, the fact clears
        if (noteBatchSpend) { try { noteBatchSpend(e.id, session, (h && h.identity) || ident2 || null, h ? h.hold : null, paid.spendReason, batchId); } catch (err) { log('[auto-resume] spend accounting failed: ' + err.message); } }
        if (wasArmed) _cancelArmNotify(e.id);   // (the arm off and the fire noted before the delivery: recordBeforeDelivery — R9)
        save(); landFire();
        if (clearStopped) { try { clearStopped(e.id, session, 'bulk resume delivered'); } catch { } }
        rec.resumed.push({ id: e.id, name: e.name, kind: e.kind });
        log(`[auto-resume] ${e.id}: continued by the bulk resume ${batchId} (${e.kind}${ident2 ? `, on ${ident2.name}` : ''})`);
        emit(e.id);
      }
    })()
      .catch((err) => { log(`[auto-resume] bulk resume ${batchId} broke: ${(err && err.message) || err}`); })
      .finally(() => {
        // every hold that never became a turn goes back — including the ones a crash in the loop left behind
        const settled = new Set([...rec.resumed.map((r) => r.id)]);
        for (const [sid, h] of holdOf) if (!settled.has(sid) && releaseSpend) { try { releaseSpend(sid, null, h.hold); } catch { } }
        rec.done = true; batchRunning = null; stopWakers.delete(batchId);
        if (v.attended && notePressEnd) { try { notePressEnd(batchId, rec.resumed.length); } catch (err) { log('[auto-resume] recording the press\'s end failed: ' + err.message); } }   // (b): how many it delivered
        log(`[auto-resume] bulk resume ${batchId} done: resumed ${rec.resumed.length} · skipped ${rec.skipped.length} · not delivered ${rec.failed.length}${rec.stopped.length ? ` · stopped ${rec.stopped.length}` : ''}`);
        if (onListChange) { try { onListChange(); } catch { } }
      });
    return batchStatus(batchId);
  }

  /** Exhaustion seen for this session (rate_limit_event status=rejected, or a
   *  limit banner). resetsAtMs may be null — without a reset time there is
   *  nothing to wait FOR, so we do not pretend. */
  function armIfEnabled(id, session, resetsAtMs, reason, opts = {}) {
    if (!id || !session) return null;
    if (!enabledFor(session)) return null;
    // THE HARNESS MUST BE ABLE TO CONTINUE THIS CONVERSATION. A promise we
    // cannot keep is worse than none: the chip would say "waiting", the wait
    // would survive restarts, and the fire would find no verb. shell lands
    // here; so does any future harness that declares resume:null.
    if (!verbFor(session)) { log(`[auto-resume] ${id}: harness '${session.backend || '?'}' declares no resume verb — not arming`); return null; }
    const at = Date.now();
    const resets = Number(resetsAtMs) || 0;
    // WHICH WALL this wait is about — the harness's own limit LANE and BUCKET
    // (and, for a model-scoped weekly, which cap). Without them the
    // fresh-window edge cannot fire (see windowOpened): a reading about a
    // different lane, or about a different bucket of the same lane, is not
    // evidence that THIS wall lifted.
    //
    // A RE-ARM INHERITS THEM (2026-09-08). Several callers re-arm the SAME
    // session from a re-verdict that has no signals in hand — the wall-probe
    // ladder's `account usable again` near-arm and the pre-fire gate's
    // `re-armed at fire: …` — and before this they silently replaced a
    // wall-aware wait with a lane-blind one, after which no reading could ever
    // open it again (`unknown-bucket` forever). That is the very failure this
    // release exists to remove, re-introduced one function later. A caller that
    // KNOWS it is a different wall says so and overrides; saying nothing means
    // "the same wall, re-verdicted".
    const held = armed.get(id);
    const inherit = held && !held.fired ? held : null;
    const lane = opts.lane != null ? String(opts.lane) : (inherit ? inherit.lane || null : null);
    const bucket = opts.bucket != null ? String(opts.bucket) : (inherit ? inherit.bucket || null : null);
    const scopedName = opts.scopedName != null ? String(opts.scopedName) : (inherit ? inherit.scopedName || null : null);
    // THE CAUSE rides the arm the same way (B-73fe): a re-verdict that names a
    // target replaces it, a caller that says nothing keeps the one in hand.
    const cause = opts.cause != null ? opts.cause : (inherit ? inherit.cause || null : null);
    if (!resets || resets <= at) return null;                 // already past / unknown
    // A RESET BEYOND THE CEILING IS STILL A WALL. Before 2026-09-08 this
    // returned null and the conversation was on its own — which is exactly
    // what happened to the incident's codex thread: its reset was SIX DAYS
    // out, so the (correct) refusal to squat on a timer meant nothing was
    // watching when the window reopened 32 h later. A WATCH is the honest
    // middle: no timed fire is ever scheduled (`due()` skips it, so the
    // "refuse to sit forever" rule is intact and costs nothing), but the
    // fresh-window edge can still continue the session the moment a reading
    // says the wall is gone. It retires by itself once the far reset passes.
    const watch = resets - at > MAX_WAIT_MS;
    if (watch) {
      const hrs = Math.round((resets - at) / 3600000);
      log(`[auto-resume] ${id}: reset is ${hrs}h away — watching (no timed continue) instead of arming`);
      const lastN = _refuseNotified.get(id) || 0;
      if (notify && at - lastN > 3600000 && !hold.held()) {   // r3196 (2): while held the watch's «continues when the quota returns» is not true either
        _refuseNotified.set(id, at);
        const ck = liveCause(cause) && liveCause(cause).checking;
        if (ck) { try { notify(id, session, armNoticeFor(reason, resets, at, cause)); } catch { } } else
        // the hourly notice says what is TRUE (lg-recovery U1 cure, as the card): a watch with its bucket can be opened by a
        // reading that says the limit cleared early; one without cannot continue by itself at all
        try { notify(id, session, bucket ? `用量已达上限，最近的重置在 ${new Date(resets).toLocaleString()}（约${hrs}小时后），超过自动等待上限（${Math.round(MAX_WAIT_MS / 3600000)}h），不会按时间自动续跑；但配额一旦提前恢复会自动继续。也可切换账号或手动继续。` : `用量已达上限，最近的重置在 ${new Date(resets).toLocaleString()}（约${hrs}小时后），超过自动等待上限（${Math.round(MAX_WAIT_MS / 3600000)}h），这次不会自动继续（看不出是哪个额度）。可切换账号或手动继续。`); } catch { }
      }
    }
    if (inherit && inherit.resetsAt === resets) return inherit; // idempotent
    const rec = { at, resetsAt: resets, reason: reason || 'usage limit', cid: session.claudeSessionId || null, fired: false, lane, bucket, scopedName, watch, cause };
    armed.set(id, rec);
    save();
    if (hold.held() && !heldSaid.has('arm:' + id)) { heldSaid.add('arm:' + id); try { if (notify) notify(id, session, '自动继续暂时读不到它的记录，在读到之前不会自动继续这个任务；VibeSpace 每隔几分钟会重新读取，也不会覆盖它。'); } catch { } }   // r3004: said once where the person meets it
    const via = cause && cause.soonest && cause.soonest.name ? `, via ${cause.soonest.name}/${cause.soonest.bucket && cause.soonest.bucket.label ? cause.soonest.bucket.label : '?'}` : '';
    log(`[auto-resume] ${id}: ${watch ? 'watching' : 'armed'} for ${new Date(resets).toISOString()} (${reason}${lane ? `, lane ${lane}` : ''}${bucket ? `, bucket ${bucket}` : ''}${via})`);
    // DELAYED announcement (2.368.34): a dead event often races the pool
    // switch that fixes it — the armed STATE is instant (chip), but the loud
    // in-chat line waits; a disarm inside the window means it never speaks.
    // A WATCH gets none of it: it promises no TIME, so a line saying "will
    // continue at T" would be false — the watch already said its own sentence
    // above (once an hour), and cancelling any pending timer is still required
    // or a previous arm's announcement would speak for a wait that is gone.
    _cancelArmNotify(id);
    if (watch) { emit(id); return rec; }
    if (notify) {
      const t = setTimeout(() => {
        _armNotifyTimers.delete(id);
        if (hold.held()) return;   // r3196 (2): the record unread — the held card already said it does not continue by itself; never «scheduled at T» after it
        const a = armed.get(id);
        if (!a || a.fired || a.resetsAt !== resets) return;
        const s2 = activeSessions.get(id);
        // The sentence follows the ARM'S CAUSE (2.369.104, owner: "明明没到也没被中断你却
        // 提示到达上限了"): a hot pool switch arms a 45 s near-nudge, and this line
        // used to call THAT instant a "reset" — "已安排在 03:24:53 重置后自动继续"
        // about a window that resets at 07:50. armNoticeFor is PURE and pinned.
        // A STORED RESET CREDIT is the one way out that does not wait (design-
        // reset-credits §5): the card carries the offer so the client can put the
        // button on it — only where the harness can spend one and credits exist.
        if (s2) {
          let offer = null;
          try { offer = resetCreditOffer ? resetCreditOffer(id, s2) : null; } catch { offer = null; }
          try { notify(id, s2, armNoticeFor(reason, resets, Date.now(), a.cause), offer ? { resetCredit: offer } : undefined); } catch { }
        }
      }, Math.max(0, notifyDelayMs));
      if (t.unref) t.unref();
      _armNotifyTimers.set(id, t);
    }
    emit(id);
    return rec;
  }

  /** Anything that proves the session is NOT waiting on a wall any more
   *  disarms the wait: a pool switch that took over, the user's own prompt, a
   *  fresh non-rejected reading. A fire that lands on an already-recovered
   *  session is a wasted (billed) turn, so the DISARM is generous — every
   *  caller gets it.
   *
   *  THE BREAKER IS NOT (round 4, the verifier's finding). Round 1 cleared the
   *  loop-breaker record here unconditionally, which handed the quarantine,
   *  the 3-per-hour immediate counter and BOTH once-per-window notice budgets
   *  to any caller — and the callers are not equal. A `rate_limit_event` with
   *  status "allowed" is a PASSIVE reading the CLI emits whenever quota info
   *  changes (this instance sees it ~20× per rejection); it says something
   *  about a bucket's numbers and NOTHING about whether this conversation
   *  produced a single token. With the record deleted on every one of them,
   *  the next immediate fire onto the identity that just rejected us was
   *  allowed again and the hour's budget was never enforced in production —
   *  the loop the breaker exists to break, one reading later.
   *  So: `worked` is the caller's CLASSIFICATION of its own evidence, and only
   *  proof of WORK (a turn that completed, the user's own prompt) may clear
   *  the memory of a failed fire. Every call site is enumerated with its
   *  classification in the kb essay, and scripts/test-auto-resume-loop.mjs
   *  pins that table against the real call sites — a new caller that does not
   *  say which kind it is fails the suite rather than silently re-opening the
   *  loop. */
  function noteRecovered(id, why, { worked = true } = {}) {
    // On proof of work the breaker clears FIRST and unconditionally: after a
    // fire there is no armed record left, so anything gated behind it (the
    // early return below) would never see the proof that the fire worked.
    if (worked) noteFireOutcome(id, true, why);
    const a = armed.get(id);
    if (hold.held()) goneHeld.add(id);   // r3004: its promise may be one the unread file holds — gone at the lift too (never a stale continue)
    if (!a || a.fired) return;
    // A REMOVED-MEMBER HOLD (the owner's 全B, 2026-09-28) is armed AT the turn end it follows — the turn that
    // completed normally is the one it let finish, never evidence that the wall lifted (the member it ran on left
    // the pool). Only the user's own prompt, a delivered continue, the toggle or a pool move disarm it.
    if (a.cause && a.cause.kind === 'removed-member' && why === 'turn completed normally') return;
    armed.delete(id); save();
    _cancelArmNotify(id);
    log(`[auto-resume] ${id}: disarmed (${why})`);
    emit(id);
  }

  function forget(id) { const had = fires.delete(id); if (armed.delete(id) || had) { save(); } }

  // ── THE LOOP BREAKER ──────────────────────────────────────────────────────
  /** The identity a fire would land on: the credential SLOT the session's CLI
   *  reads (the engine's `fireIdentityFor` — a pooled session's token-slot-
   *  validated link member, else its own usage key). Deliberately the SAME
   *  fact the engine's wall machine demotes, so "the fire onto X failed" and
   *  "X rejected this session" name the same X. `{key, name}`; null when the
   *  wiring can't say (the breaker then counts fires session-wide). */
  function identityFor(id, session) {
    try {
      const r = fireIdentity ? fireIdentity(id, session) : null;
      if (!r) return null;
      if (typeof r === 'string') return { key: r, name: r };
      return r.key ? { key: String(r.key), name: String(r.name || r.key) } : null;
    } catch { return null; }
  }
  /** WHICH WALL a wait is about, as one comparable key. Deliberately WITHOUT
   *  the reset instant — the two measurements are in noteQuotaReading. */
  const wallKeyOf = (a) => `${(a && a.lane) || ''}|${(a && a.bucket) || ''}|${(a && a.scopedName) || ''}`;
  const fireRec = (id, now) => {
    let r = fires.get(id);
    if (!r) { r = { n: 0, windowStart: now, fails: [], last: null, lastFireAt: 0, notified: {}, notices: {}, refuse: null, noTargetAt: 0 }; fires.set(id, r); }
    if (now - (r.windowStart || 0) > FIRE_WINDOW_MS) { r.n = 0; r.windowStart = now; r.notified = {}; r.notices = {}; }
    r.fails = (r.fails || []).filter((f) => f && now - (f.at || 0) < FIRE_QUARANTINE_MS);
    if (!r.notified || typeof r.notified !== 'object') r.notified = {}; // a truncated/older record must never throw inside deliver()
    if (!r.notices || typeof r.notices !== 'object') r.notices = {};    // per-NOTICE-CLASS budget (an older record has none)
    if (r.last && now - (r.last.at || 0) > FIRE_PENDING_MS) r.last = null; // never heard back — stop blocking on it
    return r;
  };
  /** May this session fire onto `key` right now? Every refusal is NAMED (the
   *  caller journals it once and tells the session once). */
  function canFire(id, key, kind, now) {
    const r = fireRec(id, now);
    if (r.last) return { ok: false, reason: 'fire-pending', key, retryAt: (r.last.at || now) + FIRE_PENDING_MS };
    const hit = key ? r.fails.find((f) => f.key === key) : null;
    if (hit) return { ok: false, reason: 'same-identity', key, retryAt: hit.at + FIRE_QUARANTINE_MS };
    if (kind === 'now') {
      if (r.n >= FIRE_MAX_IMMEDIATE) return { ok: false, reason: 'hourly-cap', key, retryAt: (r.windowStart || now) + FIRE_WINDOW_MS };
      const back = FIRE_BACKOFF_MS[Math.min(r.n, FIRE_BACKOFF_MS.length - 1)];
      if (r.n > 0 && now - (r.lastFireAt || 0) < back) return { ok: false, reason: 'backoff', key, retryAt: (r.lastFireAt || now) + back };
    }
    return { ok: true, reason: null, key };
  }
  function noteFired(id, key, kind, now, origin = null) {
    const r = fireRec(id, now);
    // THE READING'S ONE SHOT IS SPENT AT DELIVERY, NOT AT THE REJECTION (r2).
    // A billed continue has already happened here; whether anyone ever tells
    // us how it went is a fact about the CALLER. Stamping this in
    // noteFireOutcome(id,false) — the draft of this fix — made the money bound
    // depend on the engine classifying the answer as a wall AND re-arming
    // through the one path that reports it first, and this feature's own
    // history is a classifier that silently matched nothing for eight months
    // (the incident's break (1)). Measured through the module's public seam
    // (arm → reading → fire → NO outcome reported → re-arm): stamping at the
    // rejection gives [3,3,3,3] = 12 billed continues over four hours — round
    // 1's loop, intact — and stamping here gives 1.
    //   Today's engine does report it (onWalledTurn calls noteFireOutcome
    // FIRST, and it is the only arm site that carries a wall), so this changes
    // no production count as wired on 2026-09-08. It is here so the bound is a
    // property of THIS module, provable without reading five call sites — the
    // arm seam is now generic and the next harness's arm site cannot know it
    // owes us an outcome report.
    if (origin && origin.via === 'reading' && origin.wall) r.edgeSpent = origin.wall;
    r.last = { key: key || null, at: now, kind };
    r.lastFireAt = now;
    if (kind === 'now') r.n = (r.n || 0) + 1;
    r.refuse = null; // a new attempt: the next refusal is news again
  }
  /** The outcome of the fire we are waiting to hear about. ok=false is the
   *  engine's walled-turn classification (the continue was answered by another
   *  limit rejection); ok=true is any proof of real work. */
  function noteFireOutcome(id, ok, why) {
    const now = Date.now();
    const r = fires.get(id);
    if (!r) return false;
    if (ok) {
      if (!r.last && !(r.fails || []).length && !r.n) return false;
      fires.delete(id); save();
      return true;
    }
    if (!r.last) return false;         // the rejection did not answer a fire of ours
    const key = r.last.key || null;
    // (the reading's one shot was already spent at DELIVERY — noteFired; the
    // rejection adds the identity quarantine, which is a different memory)
    r.fails = (r.fails || []).filter((f) => f.key !== key);
    r.fails.push({ key, at: now });
    r.last = null;
    save();
    log(`[auto-resume] ${id}: the continue onto ${key || 'this account'} was rejected again (${why || 'usage limit'}) — not re-firing there`);
    return true;
  }
  /** Identities that rejected THIS session's continue inside the quarantine
   *  window — the engine excludes them when it picks a per-session target. */
  function recentFireFailures(id, now = Date.now()) {
    const r = fires.get(id);
    if (!r) return [];
    return (r.fails || []).filter((f) => f && now - (f.at || 0) < FIRE_QUARANTINE_MS).map((f) => f.key).filter(Boolean);
  }
  /** The engine's per-session pass found NO target for this conversation (its
   *  own `all-rejected` / `no-members` / `stuck` verdict). The ONLY source for
   *  the "there is nowhere else to go" clause — the breaker itself cannot know
   *  it, and round 1 asserted it from a refusal reason that does not imply it.
   *  Recorded only for a session the breaker already tracks (armed or fired):
   *  nothing else ever reads it, so a stuck pool must not mint records. */
  function noteNoPoolTarget(id, n = 0, why = null) {
    if (!id || (!armed.has(id) && !fires.has(id))) return false;
    const now = Date.now();
    const r = fireRec(id, now);
    const prev = r.noTargetAt || 0;
    r.noTargetAt = now; r.noTargetN = Number(n) || 0; r.noTargetWhy = why || null;
    if (now - prev > 60000) save();   // the pool re-evaluates every 10s; the FACT is fresh, the disk write is not
    return true;
  }
  function logRefusal(id, session, key, label, chk, kind) {
    const now = Date.now();
    const r = fireRec(id, now);
    const sig = chk.reason + '|' + (key || '?');
    if (!r.refuse || r.refuse.sig !== sig || now - (r.refuse.at || 0) > REFUSE_LOG_MS) {
      r.refuse = { sig, at: now };
      const until = chk.retryAt ? `, not before ${new Date(chk.retryAt).toISOString()}` : '';
      log(`[auto-resume] ${id}: refused ${kind === 'now' ? 'an immediate' : 'a timed'} continue onto ${label || key || 'this account'} (${chk.reason}${until})`);
      save();
    }
    breakerNotice(id, session, label || key, kind, chk);
  }
  /** The in-chat line a refused continue deserves — the TEXT is chosen by the
   *  refusal's reason (refusalNoticeFor, PURE), each class once per session per
   *  window. Reasons that do not break the promise say nothing here; the
   *  journal above has every one of them. */
  function breakerNotice(id, session, label, kind, chk) {
    if (!notify || !session || kind !== 'now') return;
    const now = Date.now();
    const r = fireRec(id, now);
    const a = armed.get(id);
    const n = refusalNoticeFor({
      reason: chk && chk.reason, label,
      armedResetsAt: a && !a.fired ? a.resetsAt : 0,
      noTargetAt: r.noTargetAt || 0, now,
    });
    if (!n) return;                                                    // journal-only: never speaks, never spends a budget
    if (r.notices[n.cls] && now - r.notices[n.cls] < FIRE_WINDOW_MS) return;
    r.notices[n.cls] = now; save();
    try { notify(id, session, n.text); } catch { }
  }

  function due(now) {
    const out = [];
    for (const [id, a] of armed) {
      if (a.fired) continue;
      // A WATCH NEVER FIRES ON THE TIMER (see armIfEnabled): its reset is
      // beyond MAX_WAIT_MS, so squatting on it is the thing this module has
      // always refused to do. It retires itself once that reset passes — by
      // then either a reading continued the session or nothing ever will.
      if (a.watch) { if (now >= a.resetsAt + GRACE_MS) { armed.delete(id); save(); log(`[auto-resume] ${id}: watch expired (its reset has passed with no reading)`); emit(id); const s9 = activeSessions.get(id); if (s9 && s9._stoppedBy && onListChange) { try { onListChange(); } catch { } } } continue; }   // a stopped card's «waiting» moved
      if (now >= a.resetsAt + GRACE_MS) out.push([id, a]);
    }
    return out;
  }

  /** THE FRESH-WINDOW EDGE (the 2026-09-08 incident's own recovery path).
   *  A quota READING arrived for this session. If it says the lane the session
   *  is waiting on is OPEN, the wait is over and the promise is kept NOW —
   *  through the same `attemptFire` every other continue uses, so the loop
   *  breaker, the hourly cap, the same-identity quarantine and the pre-fire
   *  gate all still apply. Anything else leaves the arm exactly where it is.
   *  Harness-neutral by construction: the caller hands over the harness's OWN
   *  normalized snapshot and PURE `windowOpened` reads it.
   *  Returns the verdict's `why` so the caller can journal it. */
  function noteQuotaReading(id, snapshot, why = 'quota reading') {
    const a = armed.get(id);
    if (!a || a.fired) return { open: false, why: 'not-armed', fired: false };
    const v = windowOpened({ snapshot, armedLane: a.lane || null, armedBucket: a.bucket || null, armedScopedName: a.scopedName || null });
    if (!v.open) return { ...v, fired: false };
    // THE EDGE IS SINGLE-SHOT PER WALL (r2, and the reason is measured). A
    // READING IS A CLAIM, AND THE CLI'S ANSWER OUTRANKS IT: the producer that
    // made this one keeps making it — the incident thread is pushed
    // `rate_limits_updated` every few seconds — so round 1 re-entered fireNow
    // on every one of them and the only ceilings left were the breaker's,
    // which are per-HOUR and reset every hour. Measured against the real
    // modules through this module's own seam: [3,3,3,3] = 12 billed continues
    // over four simulated hours, ~72/day, for the LIFE of a watch (six days in
    // the incident), against 1 with this rule. The engine's own comment even
    // claimed this bound already ("fires once, the CLI rejects, and the loop
    // breaker quarantines the identity") — the quarantine is 10 MINUTES, so
    // the claim was false; this is what makes it true, and that comment is
    // corrected. Only PROOF OF WORK re-opens the edge (noteFireOutcome(id,true)
    // drops the whole breaker record), because a turn that produced something
    // is the only evidence that our continue mattered.
    //   The key is the WALL (lane|bucket|scopedName) and deliberately NOT its
    // reset instant. Two reasons, both checked today:
    //   · A RESET INSTANT IS NOT A STABLE NAME for a window. On this instance's
    //     codex anchor stream (data/usage-anchors/anchors-codex___global__.
    //     ndjson, 1799 readings / 30 days) the sevenDay reset carries 316
    //     distinct values and CHANGES between consecutive readings 414 times —
    //     one identity key written by two interleaved lanes — and even a single
    //     wall is spelled two ways: the incident's own 1789356983 appears 417
    //     times beside 1789356984 (×3), exactly the ±wobble that made
    //     reading-lag.js compare weekly PHASE instead of the absolute value.
    //   · It would not cover this finding's own premise anyway. The reachable
    //     false-open here is a MIS-ATTRIBUTED lane (the exhaustion record
    //     carries `rateLimits:null`, so the engine synthesises `limitId:'codex'`
    //     while the true wall is the model lane): the sibling reading then
    //     carries a DIFFERENT reset by construction, so "the reset rolled"
    //     is satisfied and the turn is spent regardless.
    // A DIFFERENT wall is a different question and is armed fresh (the belt
    // there is the hourly cap, driven in test-auto-resume 12(d″)). The TIMED
    // path is untouched: it is paced by real reset times, and it is what still
    // delivers when the window genuinely rolls.
    const wall = wallKeyOf(a);
    const r0 = fires.get(id);
    if (r0 && r0.edgeSpent && r0.edgeSpent === wall) return { ...v, open: false, why: 'already-refuted', wallOpen: true, fired: false };
    // …AND A GATE VETO HOLDS THIS WALL FOR A BOUNDED TIME (r3). The shot is
    // spent at the DELIVERY, so a veto spends nothing — which in round 2 left
    // NOTHING at all: the guard above was un-stamped, so the next push re-
    // entered, and the production gate is `async` (server.js → the `async`
    // beforeAutoResumeFire), i.e. ALWAYS a Promise. Measured through this
    // module's public seam with the production gate shape (`beforeFire: async
    // () => false`), one armed watch, 100 healthy readings: 100 gate runs, 0
    // continues — one full `probeQuotaForKey` + `maybePoolAutoSwitch` per
    // push, for the LIFE of a watch (six days in the incident), and the veto
    // branch that takes `scheduleWallProbe` changes no state, so the loop is
    // stable. A polled path may not carry an unbounded side effect (the
    // new-member-wake r2 rule); the gate is an AUTHORITY we asked and it said
    // no, so we ask it again on a clock instead of on their traffic.
    // HELD, never SPENT: the gate's "still blocked" is about NOW, and the
    // whole point of this edge is a window that opens EARLY — burning the
    // wall on a veto would turn one transient disagreement into a permanent
    // refusal for a wait that has nowhere else to go. The hold is bounded and
    // per WALL, so a different window is still a different question, and
    // proof of work drops the whole record anyway.
    if (r0 && r0.edgeHeld && r0.edgeHeld.wall === wall && Date.now() < r0.edgeHeld.until) {
      return { ...v, open: false, why: 'gate-held', wallOpen: true, fired: false };
    }
    // THE LINE THAT ANNOUNCES A CONTINUE IS WRITTEN BY THE CODE THAT DELIVERS
    // ONE (r3). Round 2 moved it after the attempt and read `attemptFire`'s
    // return value — but that value is `true` for a gate that is merely IN
    // FLIGHT (the async branch returns before `deliver()` has run), so on the
    // production wiring every vetoed reading still journalled a continue that
    // never happened: 100 lines for 0 continues in the measurement above,
    // re-creating round 1's 41:1 flood in the one channel this incident was
    // diagnosed from ("ZERO [auto-resume] lines for that session"). Making the
    // caller's else-branch reachable was not the fix — the caller CANNOT know:
    // the outcome is decided one microtask later. So the reading edge hands
    // its own head to `fireNow` as the fire's `why` and says nothing itself;
    // `deliver()` prints it, once, immediately after `noteFired` stamps the
    // shot. One continue, one line, and they are the same event.
    const head = `${a.watch ? 'watched' : 'armed'} window reopened (${why})`;
    const fired = fireNow(id, head, { via: 'reading', wall });
    // `fired` is `attemptFire`'s contract — delivered OR a gate in flight — and
    // nothing may journal a spend from it; it is returned for the caller's
    // control flow only.
    return { ...v, fired };
  }

  /** THE SPEND CEILING, asked. Returns true when the turn may be paid for.
   *  A refusal is JOURNAL-ONLY here and deliberately so: the guard itself
   *  already told the user (one "For you" item per identity per reason per 6h,
   *  plus telemetry), and the loop-breaker's in-chat budget belongs to the
   *  refusals that describe THIS conversation's own pacing. Saying it twice,
   *  once per session, is how the round-2 "it also refused me" cards happened.
   *  The arm is NOT dropped: the promise still stands, it is the money that is
   *  out — a later hour, or a raised budget, continues the session. */
  function spendOk(id, session, ident, kind, out = null, { hold = true } = {}) {
    if (!authorizeSpend) return true;
    let v = null;
    // `hold` says which of the two calls this is (r5). The DEFAULT is to hold,
    // because that is the money-safe direction and a caller that says nothing
    // must get it; the PROBE — "would this be allowed?", asked before the
    // pre-fire gate — says so explicitly, and must not reserve a slot or the
    // charging call below it refuses its own request (measured at cap 1/hour:
    // zero continues ever fired).
    try { v = authorizeSpend(id, session, ident || null, { hold }); } catch (e) { log('[auto-resume] spend authorizer threw: ' + e.message); return false; } // FAIL CLOSED (P8)
    // CHARGE WHAT YOU AUTHORIZED (r4): hand the caller the slot this verdict
    // RESOLVED, so the charge below names it instead of asking a second time.
    // It matters only when `ident` is null — the gate could not name a fire
    // target, the guard resolved one from the session, and without this the
    // charge would resolve it AGAIN, off state the send is free to have moved.
    if (out && v && v.identity && v.identity.key) out.identity = v.identity;
    // …and the HOLD it opened (r5), so the charge converts it and a failed send
    // gives it back
    if (out && v && v.hold) out.hold = v.hold;
    if (!v || v.ok !== false) return true;
    log(`[auto-resume] ${id}: refused ${kind === 'now' ? 'an immediate' : 'a timed'} continue onto ${(ident && ident.name) || 'this account'} (spend budget: ${v.why})`);
    return false;
  }

  /** The pre-fire gate broke. It probes fresh quota, re-runs the pool decision
   *  and re-reads the verdict, so an exception means NONE of that happened —
   *  the refusal is the only honest answer, and it must be SAID (a money gate
   *  that fails silently reads exactly like one that passed). Journal +
   *  telemetry only: the guard's own inbox item covers the user-facing half,
   *  and the loop breaker's in-chat budget belongs to the refusals that
   *  describe this conversation's pacing. */
  function gateFailedClosed(id, how, e) {
    log(`[auto-resume] ${id}: pre-fire gate ${how} — refusing the continue (fail closed): ${(e && e.message) || e}`);
    try { global.__vsEvent?.('spend-gate-error', 'auto-resume:' + how); } catch { }
  }

  /** ONE fire path for BOTH callers — the timed tick and the immediate
   *  (pool-switch) fireNow. Two things used to differ between them and both
   *  differences were bugs: the immediate path skipped the pre-fire gate
   *  entirely, and neither remembered that the previous continue onto this
   *  same identity had just been rejected.
   *    breaker → the SAME beforeFire gate → deliver → remember what we fired at
   *  Returns true when a continue was delivered or a gate is in flight. */
  /** A continue whose wall was a model's cap that still stands (modelCapHold) is NOT delivered — whichever door asked it (the
   *  timed fire at the plan's reset, a member that read «usable», a reset claim, a switch back onto that member); only the
   *  fresh-window edge, which opens on a reading of the ARMED lane itself, is not asked. Re-armed at the cap's reset once it
   *  has landed — a WATCH when that is beyond the waiting bound (no timed continue; a reading of the cap's own lane can still
   *  open it, and it retires at that reset like every far wall) — the list told, the journal once per arm record. Asked AFTER
   *  the pre-fire gate, of the identity the continue would land on: a gate that moved it onto another member continues it. */
  const capSaid = new WeakSet();
  function capHeld(id, session, key2) {
    const fact = session && session._stoppedBy;
    if (!fact || fact.bucket !== 'scoped') return false;
    let model = null; try { model = modelOf ? modelOf(id, session) : null; } catch { model = null; }
    const h = modelCapHold({ fact, now: Date.now(), key: key2, drawsCap: capDrawnBy(model, fact.scopedName) });
    if (!h) return false;
    const re = armIfEnabled(id, session, h.fireAt, `usage limit (the ${h.name} cap)`, { bucket: 'scoped', scopedName: h.name, ...(fact.lane ? { lane: fact.lane } : {}), cause: { scope: 'account', until: { label: h.name, resetsAt: h.until } } });
    if (!re || !capSaid.has(re)) {
      if (re) capSaid.add(re);
      log(`[auto-resume] ${id}: the wall was the ${h.name} cap, which resets at ${new Date(h.until).toISOString()} — not continued (it would meet the cap again); ${!re ? 'it cannot wait' : re.watch ? 'watching that cap (beyond the waiting bound: no timed continue)' : 'waiting for the cap\'s own reset'}`);
    }
    if (!re) { armed.delete(id); save(); emit(id); }   // it could not wait (switched off, no verb): no due arm is left to re-enter the gate every tick
    if (session._stoppedBy && onListChange) { try { onListChange(); } catch { } }   // the card's «waiting» follows (timed → a watch)
    return true;
  }

  /** r3196 (1) (lane bl-loop-b): A PROMISE THE CONVERSATION OUTLIVED IS STALE. A usage wall's arm answers the stop fact the wall
   *  wrote just before it (usage-pool-engine onWalledTurn: noteStoppedBy, then armIfEnabled). A turn that RAN since — its first
   *  output, its start, a normal end — clears that fact, in the session's meta too (so a restart still knows it), and an overload
   *  replaces it. Either way the conversation went on, and the promise is dropped, never fired. This cures a restart while held,
   *  which forgets a recovery noted only in memory (goneHeld), and it serves a plain restart as well. A stop fact never written
   *  (undefined: a session the engine never judged) is not judged here; a removed member's hold arms at a cut turn's END with no
   *  stop fact and keeps its own rule (the Workflow read's «a wall's arm only» is the same test) */
  const outlived = (session, a) => {
    if (!session || (a && a.cause && a.cause.kind === 'removed-member')) return false;
    const sb = session._stoppedBy;
    if (sb === undefined) return false;
    const f = sb ? normalizeStoppedBy(sb) : null;
    return !f || f.kind !== 'quota';
  };
  /** B-9a24 U1 (主开发 r4778 (a), r5330 (4)): THE PRESS's ONE TEST IS A PERSON's ACT — asked by the bulk resume's own door under its
   *  attended reason ('bulk-resume': none counted, no hold; an unknown identity, a sign-in that cannot serve, the spend control and paid
   *  overage in use still refused), and ONLY while the press that asked it still holds (isPress: that request's own chain). A test the
   *  press no longer holds is NOT SENT — never sent as an unattended turn in a press's name. → true | false (`out` says why not) */
  function pressSpend(id, session, ident, ask, out) {
    if (!ask) { if (out) out.why = 'not-pressed'; log(`[auto-resume] ${id}: the press's test is not sent — it is not inside the press that asked it`); return false; }
    let v = null;
    try { v = authorizeSpendBatch ? authorizeSpendBatch([{ id, session, identity: ident || null }], ask.spendReason) : { ok: false, why: 'no-gate' }; } catch (e) { v = { ok: false, why: 'gate-error' }; }
    const skipped = v && v.ok !== false && Array.isArray(v.skipped) && v.skipped.length ? v.skipped[0] : null;
    if (!v || v.ok === false || skipped || v.attended !== true) {
      if (v && Array.isArray(v.holds) && releaseSpend) for (const h of v.holds) { try { releaseSpend(h.sessionId, null, h.hold); } catch { } }
      const why = (skipped && skipped.why) || (v && v.why) || 'refused';
      if (out) { out.why = 'spend'; out.spendWhy = why; }
      log(`[auto-resume] ${id}: the press's test is not sent — the attended door refused it (${why})`);
      return false;
    }
    return true;
  }
  function attemptFire(id, session, a, kind, why, cause = null, origin = null, { claim = false, pressed = null, on = null, out = null } = {}) {
    const now = Date.now();
    // B-9a24 U1: the press's test notes ONE press row (its ask, its charge, its end) — never the single road's counted stamp
    const pressId = pressed ? `rc-${pressed.reqId || 0}-${now.toString(36)}` : null;
    const pressPaid = pressed && isPress(pressed) ? reasonOf(pressed) : null;   // the attended reason, selected on the press that asked (its ask, its re-ask, its charge, its press row)
    let pressNoted = false, pressEnded = false;
    const pressEnd = (n) => { if (pressNoted && !pressEnded && notePressEnd) { pressEnded = true; try { notePressEnd(pressId, n); } catch (e) { log('[auto-resume] recording the press end failed: ' + e.message); } } };
    // r3004: the loop-breaker's memory unread = «assume it was broken» — no automatic continue on a guess: it waits (the arm stays)
    if (hold.held()) { if (!heldSaid.has('fire:' + id)) { heldSaid.add('fire:' + id); log(`[auto-resume] ${id}: not continued — ${hold.words()}`); } return false; }
    if (outlived(session, a)) { noteRecovered(id, 'its stop is over: a turn ran after the promise', { worked: false }); return false; }   // r3196 (1): never a continue into a conversation that went on
    if (session._arFiring) return false;   // a gate is already running for this session (also breaks fireNow ⇄ beforeFire re-entry)
    // THE FOLDER'S STORAGE DOES NOT ANSWER (U3 cure 3 — 主开发's law): every read the cap allows is out and none returned, and THIS
    // arm of a usage wall has no answer of its own — it is NOT fired (not continuing is the safe mistake; the arm stays and fires
    // when a read answers again); said once
    if (workflowRunAtWall && wfOut.size >= WF_INFLIGHT_MAX && session._stoppedBy && session._stoppedBy.kind === 'quota') {
      const w = wfOf.get(id);
      if (!(w && w.rec === a && w.at && now - w.at <= WF_FRESH_MS)) {
        if (!wfNotReadSaid.has(id)) { wfNotReadSaid.add(id); log(`[auto-resume] ${id}: not read: the folder's storage does not answer (${wfOut.size} reads still out) — not continued now; it continues when a read answers`); }
        return false;
      }
    }
    wfNotReadSaid.delete(id);
    const ident = identityFor(id, session);
    const key = ident ? ident.key : null;
    const label = ident ? ident.name : null;
    const chk = canFire(id, key, kind, now);
    if (!chk.ok) { logRefusal(id, session, key, label, chk, kind); return false; }
    // THE CEILING, asked BEFORE the gate as well as after it (same shape as
    // canFire/chk2): the pre-fire gate probes quota and can re-point the link,
    // so a budget that is already spent must stop us before we pay for that
    // work, and the identity the continue actually LANDS on must be checked
    // again once the gate has had its say.
    if (pressed && !pressSpend(id, session, ident, pressPaid, out)) return false;   // B-9a24 U1: the press's test asks the attended door
    if (!pressed) { if (!spendOk(id, session, ident, kind, null, { hold: false })) return false; }
    if (pressPaid && notePress) { try { notePress(pressId, 1, pressPaid.spendReason); pressNoted = true; } catch (e) { log('[auto-resume] recording the press failed: ' + e.message); } }
    const deliver = () => {
      const a2 = armed.get(id);
      if (!a2 || a2.fired || a2.resetsAt !== a.resetsAt) return false;   // re-armed/disarmed while gating
      if (session._isStreaming) return false;                            // it started working while we gated
      // THE IDENTITY IS RE-RESOLVED HERE, after the gate (round 2). The gate
      // is `beforeAutoResumeFire`, which runs maybePoolAutoSwitch and can
      // RE-POINT this session's credential link — so the identity resolved
      // before it is the account we were ABOUT to fire at, not the one the
      // continue lands on. Round 1 keyed noteFired/announce to the stale one,
      // which broke the invariant stated above identityFor() in exactly the
      // case the comment warns about: a rejection would quarantine the
      // account we had already left, leave the real rejector fireable, and
      // journal the wrong name. Re-check the breaker too — a gate that moves
      // us onto an identity we already burned this window must not spend.
      const now2 = Date.now();
      const ident2 = identityFor(id, session) || ident;
      const key2 = ident2 ? ident2.key : null;
      const label2 = ident2 ? ident2.name : null;
      // MOVED requires BOTH identities to be known: null → X is the wiring
      // finding its voice, not the pool switching accounts, and it must not
      // be reported as one
      const moved = !!key && !!key2 && key2 !== key;
      const chk2 = canFire(id, key2, kind, now2);
      if (!chk2.ok) {
        if (moved) log(`[auto-resume] ${id}: the gate moved this session onto ${label2 || key2} — re-checking before spending`);
        logRefusal(id, session, key2, label2, chk2, kind);
        return false;
      }
      // WHAT UNBLOCKED US decides both the journal line and the card, from the
      // ARMED RECORD (one source, one wording) — see continueNoticeFor
      const note = continueNoticeFor({ kind, armReason: a2.reason, label: label2, moved, cause });
      if (claim) Object.assign(note, claimContinueNotice({ label: label2, cause }));   // a continue on a reset claim says so (fireNowOnClaim)
      if (!(origin && origin.via === 'reading') && capHeld(id, session, key2)) return false;   // THE MODEL'S CAP STILL STANDS (modelCapHold): every door but the armed lane's own reading edge — nothing reserved yet
      // THE CEILING, on the identity the continue actually lands on. The gate
      // can have moved us onto a member whose budget is spent — charging the
      // one we resolved before it is the round-2 defect in a second currency.
      // It sits BELOW the (pure, side-effect-free) card computation and ABOVE
      // the send: nothing between them spends, and test-auto-resume-loop's
      // round-2 pin measures the distance from `moved` to `continueNoticeFor`.
      const charge = {};
      if (pressPaid ? !pressSpend(id, session, ident2, pressPaid, out) : !spendOk(id, session, ident2, kind, charge, { hold: true })) return false;
      // AUTHORIZED, NOT SPENT (r5): from here on, EVERY exit that does not
      // deliver gives the reservation back. The arm survives each of them, so
      // this session is going to ask again — a hold left booked would keep
      // that slot's budget out of circulation until it times out.
      const giveBack = () => { if (charge.hold && releaseSpend) { try { releaseSpend(id, session, charge.hold); } catch (e) { log('[auto-resume] releasing the spend hold failed: ' + e.message); } } };
      // THE HARNESS'S OWN VERB delivers (owner ruling 2026-09-08). This is the
      // ONE fire choke point for every harness and every path — the timed tick,
      // the immediate pool-switch fire and the fresh-window edge all arrive at
      // THIS line, which is what keeps the loop breaker AND the spend ceiling
      // in front of every unattended turn. `sendChatInput` is the ORCH channel
      // the verb may use; the descriptor decides what a continue MEANS on its
      // harness.
      //   THE SPEND AUTHORIZER IS THE LINES DIRECTLY ABOVE (the integration of
      // design-account-hardening §4.4(c)): the seam this comment used to
      // RESERVE is now taken, and it is taken ONCE — making the verb generic
      // did not add a second fire path, so one gate still covers every
      // harness. The order is deliberate: authorize (which HOLDS the slot),
      // then ask the harness for its verb, then send. Every return between the
      // hold and a delivered turn calls `giveBack()`.
      const verb = verbFor(session);
      if (!verb) { log(`[auto-resume] ${id}: harness '${session.backend || '?'}' declares no resume verb — cannot continue`); giveBack(); armed.delete(id); save(); emit(id); return false; }
      let ok = false;
      // ONE CARD PER CONTINUE (2.369.97, owner: "为啥每次续跑会同时发两个续跑通知"):
      // the delivered prompt is ALREADY a labelled card in the conversation
      // (originKind 'auto-resume'), so the cause rides ON it (`note`) and the
      // separate "来自 VibeSpace 的消息" notice is not sent for a delivered
      // continue — two cards for one event read as two notifications. The
      // notice survives only where no prompt reached the conversation (the
      // refusal / far-reset sentences, which have no card of their own).
      const carried = { note: note && note.text ? note.text : null };
      const putBack = recordBeforeDelivery(id, key2, kind, origin);   // R9: the record on disk BEFORE the delivery
      if (!putBack) { if (!refusedAtOnce) log(`[auto-resume] ${id}: the record of this continue could not be written to auto-resume.json — nothing was sent (tried again later)`); giveBack(); return false; }
      try { ok = deliverContinue(session, verb, continuePromptFor(note, label2, freshRun(id, a2)), (s2, text) => sentNoted(s2, text, sendToSession(id, s2, text, carried))); } // B-3d90 item 2: the continue's own record — a rebuild still says VibeSpace sent it
      catch (e) { log(`[auto-resume] ${id}: the '${verb.form}' resume verb threw: ${e.message}`); ok = false; }
      if (!ok) { putBack(); log(`[auto-resume] ${id}: could not deliver the continue prompt (will retry)`); giveBack(); return false; }
      if (session._stoppedBy && session._stoppedBy.at) session._stopContinuedAt = session._stoppedBy.at;   // this stop has had its continue (the switch never arms it again)
      // …and the STOP IS OVER at its continue's delivery (U1 cure 2 — 主开发's small one): the fact is cleared and that is
      // persisted, so a restart before the next turn's own start restores no stop a second press could arm again
      if (clearStopped && session._stoppedBy) { try { clearStopped(id, session, 'its continue was delivered'); } catch (e) { log(`[auto-resume] ${id}: clearing the stop fact failed: ${e.message}`); } }
      // (the arm is off and the fire noted: recordBeforeDelivery, on disk before the delivery — R9)
      // CHARGED ONLY WHEN THE TURN HAPPENED (two-phase): everything above can
      // refuse, and an authorization that never became a turn must not eat an
      // identity's hourly budget. `charge.hold` is the reservation opened by
      // the call above — `note()` CONVERTS it rather than adding to it.
      if (pressPaid) { if (noteBatchSpend) { try { noteBatchSpend(id, session, ident2 || null, null, pressPaid.spendReason, pressId); } catch (e) { log('[auto-resume] spend accounting failed: ' + e.message); } } pressEnd(1); }   // B-9a24 U1: the attended tally, no stamp; the press row ends delivered
      else if (noteSpend) { try { noteSpend(id, session, charge.identity || ident2 || null, charge.hold || null); } catch (e) { log('[auto-resume] spend accounting failed: ' + e.message); } }
      save(); landFire();
      _cancelArmNotify(id);
      log(kind === 'now'
        ? `[auto-resume] ${id}: ${why}${moved ? ' (landed on another account)' : ''} — continued immediately`   // r4778/r4784: no journal line names an account
        : `[auto-resume] ${id}: ${note.cls === 'switched' ? 'pool switched to another account' : 'usage limit reset'} — continued automatically`);
      announce(id, session, key2, kind, note, { carried: !!carried.note });
      emit(id);
      return true;
    };
    // PRE-FIRE GATE (2.369.0, owner-designed): the engine probes fresh quota
    // + re-checks the account system's verdict. false = still blocked (the
    // engine re-armed to the new blockedUntil) — do not spend. Sync
    // false/true and Promise<boolean> both supported.
    // The in-flight flag is raised BEFORE the gate runs, not inside the async
    // branch: the real gate calls maybePoolAutoSwitch, which calls fireNow for
    // armed sessions, and everything the gate does BEFORE its first await is
    // synchronous re-entry (measured: 1992 levels deep with the flag raised
    // one line too late).
    //
    // FAIL CLOSED (P8), THE THIRD LAYER. Both halves used to answer a broken
    // gate with a billed turn — `catch { gate = true; }` and `.catch(() =>
    // deliver())` — and design §1.4 only named the other two layers (the
    // engine's own `catch { return true; }` and the server.js wiring lambda).
    // Fixing those two MASKS this one in production, which is precisely why it
    // has to be fixed here as well: the mask lives in two different files from
    // the bug, and making the wiring lambda `async` (the natural refactor —
    // the callee already is) removes both halves of it at once. Measured on
    // the real module: a throwing beforeFire delivered 1 continue, a rejecting
    // one delivered 1; with the gate answering `false`, 0.
    // The ARM IS NOT DROPPED, exactly as for a `false` verdict: the promise
    // still stands, it is the gate that is unavailable, and the next tick
    // (30 s) asks again.
    session._arFiring = true;
    let gate = true;
    try { gate = on ? (beforeClaim ? beforeClaim(id, session, { claimOn: on }) : false) : beforeFire ? beforeFire(id, session) : true; }   // B-9a24 U1: the press's test is judged by ITS OWN gate (none wired ⇒ not sent)
    catch (e) { gateFailedClosed(id, 'threw', e); gate = false; }
    if (gate && typeof gate.then === 'function') {
      // TWO-ARG `then`, deliberately: the rejection handler must see ONLY the
      // gate's own failure. A trailing `.catch` would also catch a throw from
      // `deliver()` (save() on a full disk, an emit handler) and report it as
      // "the gate rejected" — and the shape this replaced answered that case by
      // calling `deliver()` a SECOND time. A reason string is an assertion about
      // the system; the delivery's own failure gets its own line and no retry.
      //   A VETO IS RECORDED HERE, in the resolve arm, because here is the only
      // place that knows (auto-resume r3): `attemptFire` returns true for a gate
      // merely in flight, so the reading edge cannot journal or hold from its
      // return value.
      gate.then(
        (g2) => { if (g2 === false) noteGateRefusal(id, kind, origin); else deliver(); },
        (e) => { gateFailedClosed(id, 'rejected', e); },   // never deliver() from here
      )
        .catch((e) => { log(`[auto-resume] ${id}: delivering the continue threw after the gate allowed it: ${(e && e.message) || e}`); })
        .finally(() => { session._arFiring = false; });
      if (pressed) Promise.resolve(gate).then(() => { }, () => { }).then(() => pressEnd(0));   // B-9a24 U1: after the gate's own reactions — a delivery ended the press row with 1 first
      return true;
    }
    if (gate === false) noteGateRefusal(id, kind, origin);
    const done = gate === false ? false : deliver();
    pressEnd(0);   // B-9a24 U1: a press's test not delivered ends its press row with 0 (a delivery ended it with 1 already)
    session._arFiring = false;
    return done;
  }

  /** THE PRE-FIRE GATE SAID NO — recorded HERE because here is the only place
   *  that knows (r3). `attemptFire` reports `true` for a gate that is merely in
   *  flight, and the production gate is always a Promise, so every caller that
   *  read the return value as an outcome was reporting one it did not have.
   *  Two things happen, both at the point of knowledge:
   *   · the JOURNAL gets one line per REFUSE_LOG_MS. The gate veto used to be
   *     the one refusal nothing said anything about — logRefusal covers the
   *     breaker's reasons, and this rung is not the breaker.
   *   · a READING-driven attempt HOLDS its wall (see noteQuotaReading). Not
   *     spends: the reading may well be right and the gate merely early. */
  function noteGateRefusal(id, kind, origin) {
    const now = Date.now();
    const r = fireRec(id, now);
    let changed = false;
    if (origin && origin.via === 'reading' && origin.wall) { r.edgeHeld = { wall: origin.wall, until: now + EDGE_HOLD_MS }; changed = true; }
    if (!r.gateSaidAt || now - r.gateSaidAt > REFUSE_LOG_MS) {
      r.gateSaidAt = now; changed = true;
      log(`[auto-resume] ${id}: the pre-fire gate refused ${kind === 'now' ? 'an immediate' : 'a timed'} continue — quota still reads blocked`);
    }
    // …AND THE DISK WRITE IS PART OF THE SIDE EFFECT THIS FIX IS ABOUT. The
    // paths with no hold (the timed tick, the pool-switch/wake fireNow) reach
    // here on every attempt, so an unconditional save() would be the same
    // unbounded-effect-on-a-polled-path shape one layer down — logRefusal
    // already saves only inside its throttle, for the same reason.
    if (changed) save();
  }

  /** The in-chat line that follows a delivered continue (`note` = the PURE
   *  continueNoticeFor verdict, computed from the arm that produced this fire
   *  and the identity it actually landed on).
   *  The POOL-SWITCH class goes out at most ONCE per distinct target per
   *  session per window — the incident wrote ~150 identical "已切换到 X，已自动
   *  继续" cards into one transcript; a repeat is journal-only. The RESET class
   *  is never deduped: a continue after a real reset happens once per reset,
   *  and silence there would be an unexplained billed turn.
   *  Round 2: the dedup applies to BOTH fire paths, because the near-arm the
   *  pool switch creates is now delivered by the TIMED path (the link moves
   *  before the session is armed — measured), so the incident's card class can
   *  arrive through either one. */
  function announce(id, session, key, kind, note, { carried = false } = {}) {
    if (!notify || !note) return;
    // The cause already travelled on the continue card itself (deliver()
    // hands it to sendToSession as `note`); a second card would be the
    // "two notifications" the owner saw. The per-window bookkeeping is kept
    // so a LATER refusal notice about the same target still budgets itself.
    if (carried) { const r = fireRec(id, Date.now()); r.notified[key || '*'] = Date.now(); save(); return; }
    const now = Date.now();
    if (note.cls === 'switched') {
      const r = fireRec(id, now);
      const k = key || '*';
      const seen = r.notified[k] || 0;
      if (seen && now - seen < FIRE_WINDOW_MS) return;   // same target, same window: the journal already has it
      r.notified[k] = now; save();
    }
    try { notify(id, session, note.text); } catch { }
  }

  /** One tick: fire everything due whose session is alive and idle. */
  function tick(now = Date.now()) {
    landingRefused = false;   // F1: each tick may wait once on a landing
    let fired = 0;
    // B-3437: the Workflow run a usage wall cut short is judged NEAR THE FIRE, never once at the arm (the run goes on after
    // the walled turn — its agents' retries, a hot switch); asked every two minutes in the six minutes before a wall's TIMED
    // fire (a watch is never fired by the clock — never asked), one read in flight per arm and WF_INFLIGHT_MAX for all; the
    // answer kept beside the arm (wfOf, never persisted) and named by the fire only while it is fresh
    if (workflowRunAtWall) {
      for (const k of [...wfOf.keys()]) if (!armed.has(k)) wfOf.delete(k);
      for (const k of [...wfPending.keys()]) if (!armed.has(k)) { wfPending.delete(k); wfHungSaid.delete(k); }   // a hung read of a GONE arm holds no place in the cap (U3 cure 2 — four of them stopped the naming for everyone)
      for (const [k, t0] of wfPending) if (now - t0 > WF_HUNG_MS && !wfHungSaid.has(k)) { wfHungSaid.add(k); log(`[auto-resume] ${k}: its Workflow-run read has not answered in ${Math.round((now - t0) / 60000)} min — its continue says today's words`); }
      // FAIR ORDER (the read's should): the arm asked longest ago (never ⇒ first) goes first, so the cap never starves the rest
      const due0 = [...armed].filter(([, a]) => a && !a.fired && !a.watch && Number(a.resetsAt) > 0).sort((x, y) => ((wfOf.get(x[0]) || {}).ask || 0) - ((wfOf.get(y[0]) || {}).ask || 0));
      for (const [id, a] of due0) {
        const fireAt = Number(a.resetsAt) + GRACE_MS;
        if (now < fireAt - WF_LEAD_MS || wfPending.has(id)) continue;
        const w0 = wfOf.get(id);
        if (w0 && w0.rec === a && now - (w0.ask || 0) < WF_REREAD_MS) continue;
        if (wfOut.size >= WF_INFLIGHT_MAX) break;   // the reads still OUT (the hung ones of gone arms too) — never more threads than this
        const s1 = activeSessions.get(id);
        if (!s1 || !s1._stoppedBy || s1._stoppedBy.kind !== 'quota') continue;   // a wall's arm only (never a hold's)
        const w = { rec: a, run: w0 && w0.rec === a ? w0.run : null, at: w0 && w0.rec === a ? w0.at : 0, ask: now };
        wfOf.set(id, w); wfPending.set(id, now);
        const t0 = now, out = {}; wfOut.add(out);
        const settle = () => { wfOut.delete(out); if (wfPending.get(id) === t0) { wfPending.delete(id); wfHungSaid.delete(id); } };   // the read's unit returns when IT returns (exactly one); only ITS arm entry
        try { Promise.resolve(workflowRunAtWall(id, s1, { fireAt })).then((r) => { settle(); if (wfOf.get(id) !== w || armed.get(id) !== a) return; const had = !!w.run; w.run = r ? { runId: r.runId, unfinished: r.unfinished, resetAt: Number(r.resetAt) || 0 } : null; w.at = Date.now(); if (r && !had) log(`[auto-resume] ${id}: the limit cut a Workflow run short (${r.unfinished} agent(s) unfinished) — its continue names it`); }, settle); } catch { settle(); }
      }
    }
    for (const [id, a] of due(now)) {
      const session = activeSessions.get(id);
      // B-9a24 (主开发 r3434 (8)): «not live» is «gone» only once the boot's restore has SETTLED — a conversation restored LATE (a
      // remote orphan re-adopted after hosts.json read, a pipe re-opened) whose reset passed while the hub was down is due at the
      // first tick, before it is back: its arm is KEPT (not continuing yet is the safe mistake) and fires once it is live again
      if (!session) { let settled = true; try { settled = restoreSettled() !== false; } catch { } if (!settled) continue; armed.delete(id); save(); continue; }   // gone: nothing to continue
      // the feature was turned off under a live arm: drop the wait, KEEP the
      // breaker (worked:false) — nothing was produced, and a toggle off/on
      // must not hand the loop a fresh budget any more than a deploy may
      if (!enabledFor(session)) { noteRecovered(id, 'disabled', { worked: false }); continue; }
      if (session._isStreaming) { continue; }                        // it is already working — try next tick
      if (attemptFire(id, session, a, 'timed', null)) fired++;
    }
    return fired;
  }

  /** A pool switch just landed this session on a HEALTHY account while it sat
   *  limit-blocked and ARMED. A hot re-point does not move an idle session by
   *  itself (the c1206711 incident: the pool switched back at 07:09 and the
   *  un-armed session stayed dead) — deliver the continue NOW instead of
   *  waiting out a reset that no longer matters. Armed-only: an unarmed
   *  session was never promised a continue.
   *  Since 2026-09-07 this runs the breaker AND the same pre-fire gate as the
   *  tick: the incident's 130 continues all came down this path, each one
   *  bypassing the gate that would have re-verdicted the target. */
  function fireNow(id, why, { cause = null, via = null, wall = null } = {}) {
    try {
      const a = armed.get(id);
      if (!a || a.fired) return false;
      const session = activeSessions.get(id);
      if (!session || !enabledFor(session) || session._isStreaming) return false;
      return attemptFire(id, session, a, 'now', why, cause, via ? { via, wall } : null);
    } catch (e) { log('[auto-resume] fireNow failed: ' + e.message); return false; }
  }

  /** lane account-reset-door r4: a continue the pool asks ON A PERSON'S RESET CLAIM — fireNow's road exactly (the
   *  breaker, the gate, the spend authorizer), its card saying it rests on an unconfirmed claim. A separate door so
   *  fireNow stays master's, byte for byte. */
  /** B-9a24 U1 (主开发 r4778, r5330 (3)): THE PRESS's ONE TEST — its ONE caller is the engine's claimPressTest, inside the press's request.
   *  `pressed` = the claim route's press (write-origin pressOf); `on` = the marked account (its own gate judges it). → { sent } |
   *  { sent: false, why: 'not-pressed' | 'spend' (spendWhy: the attended door's code) | 'not-armed' | 'not-idle' | 'refused' } */
  function fireNowOnClaim(id, why, { cause = null, pressed = null, on = null } = {}) {
    try {
      if (!isPress(pressed)) return { sent: false, why: 'not-pressed' };
      const a = armed.get(id);
      if (!a || a.fired) return { sent: false, why: 'not-armed' };
      const session = activeSessions.get(id);
      if (!session || !enabledFor(session) || session._isStreaming) return { sent: false, why: 'not-idle' };
      const out = {};
      const sent = attemptFire(id, session, a, 'now', why, cause, null, { claim: true, pressed, on, out });
      return sent ? { sent: true } : { sent: false, why: out.why || 'refused', spendWhy: out.spendWhy || null };
    } catch (e) { log('[auto-resume] fireNowOnClaim failed: ' + e.message); return { sent: false, why: 'refused' }; }
  }
  /** B-9a24 U1: the continues onto `key` recorded and not answered yet (a fire's `last` inside FIRE_PENDING_MS) → [{ id, at }] */
  function firesOutOn(key, now = Date.now()) {
    const outs = [];
    for (const [id, r] of fires) { const l = r && r.last; if (l && key && l.key === key && now - (Number(l.at) || 0) < FIRE_PENDING_MS) outs.push({ id, at: Number(l.at) || 0 }); }
    return outs;
  }

  /** WHO IS WAITING. The new-member wake (2026-09-08) has to re-examine the
   *  conversations that are ARMED — they are exactly the ones that produce
   *  neither of the two events the pool re-evaluates on (a turn end, a streamed
   *  usage record), which is how eight of them sat out a reset eight hours
   *  away. A tiny public accessor rather than the engine reaching into
   *  `_armed`: "who is waiting" is a question this module should answer, and a
   *  caller holding the map would also be able to mutate it. */
  function armedIds() { return [...armed.keys()]; }

  function start() {
    if (timer) return;
    timer = setInterval(() => { try { tick(); } catch (e) { log('[auto-resume] tick failed: ' + e.message); } }, TICK_MS);
    if (timer.unref) timer.unref();
  }
  const stop = () => { if (timer) { clearInterval(timer); timer = null; } hold.stop(); };

  return {
    armIfEnabled, noteRecovered, forget, setEnabled, statusFor, enabledFor, firesOutOn, fireNow, fireNowOnClaim, armedIds, tick, start, stop, CONTINUE_PROMPT, continuePromptFor,
    refreshStatus: (id) => emit(id), // lane cli-self-measure: a check that ended re-says every armed conversation's status (its chip drops «checking»)
    bulkCounts, setEnabledAll, stoppedPlan, resumeBatch, batchStatus, stopBatch, // lane auto-resume-bulk: the two bulk acts + the plan the dialog shows first
    noteQuotaReading, // the fresh-window edge: a reading that says the wall is gone continues the session NOW
    noteFireOutcome, recentFireFailures, canFire, noteNoPoolTarget, // the loop breaker's seams (engine: walled turn ⇒ ok:false; per-session switch ⇒ exclude + its own no-target verdict)
    _armed: armed, _fires: fires, _wfOf: wfOf, _wfPending: wfPending, _wfOut: wfOut, _hold: hold,
  };
}

module.exports = {
  create, CONTINUE_PROMPT, continuePromptFor, workflowRunLine, WF_REREAD_MS, WF_FRESH_MS, WF_LEAD_MS, WF_INFLIGHT_MAX, BULK_GATE_HOLD_MS, CONTINUE_PROMPT_OVERLOAD, bulkPromptFor, BULK_PACE_MS, BULK_GATE_WAIT_MS, TICK_MS, GRACE_MS, MAX_WAIT_MS,
  FIRE_WINDOW_MS, FIRE_BACKOFF_MS, FIRE_MAX_IMMEDIATE, FIRE_QUARANTINE_MS, NO_TARGET_FRESH_MS, EDGE_HOLD_MS,
  refusalNoticeFor, continueNoticeFor, claimContinueNotice, armNoticeFor, // PURE: what the conversation is told, and when
  modelCapHold, capDrawnBy, CAP_LAND_MS,   // PURE: a model's cap that still stands holds the continue
};
