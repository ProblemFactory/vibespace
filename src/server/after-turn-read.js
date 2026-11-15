'use strict';
// ONE USAGE READ AFTER A STRETCH OF WORK (lane usage-predict, 2026-11-15). The owner was asked (2026-11-14):
//   «Antigravity 每轮结束时不报额度，要做到「每次变动都跟踪」只能在一段工作结束后读一次面板。允许吗？»
// and chose A: «一个 agy 账号上的对话结束一轮、且该账号 5 分钟内没有新一轮时，读一次 agy 的 /usage；每账号每 30 分钟最多一次；
// 轮次进行中不读；闲置账号不读» — the answer: «A同时加入预测系统 把预测系统做成通用的adapter接在不同的账号来源上».
// So: a turn of a conversation on a NAMED account whose harness declares `quota.onDemand.afterTurn` ends (the wrapper's
// `prompt_end`, src/server/stdout/acp-events.js) ⇒ a quiet wait of QUIET_MS for that account; any turn START of the account
// cancels it; when it runs out with no turn of the account running, ONE `door.read(key, { afterTurn: true })` — the door
// third caller (src/server/cli-usage-door.js: its 60 s pace, `accounts.onDemandQuotaRefresh = off`, the judge's STOP).
//   · THE CEILING: none within PACE_MS of the account's last read by ANY caller, as kept on disk (src/door-reads.js
//     lastReadAt) — a hub restart adds no read. It is a ceiling, never a cadence: nothing is read because time passed.
//   · AN IDLE ACCOUNT is never read: no turn ended since its last read ⇒ nothing (the read must follow work).
//   · NOTHING IS CAUGHT UP: the wait lives in memory; a turn end stamped before this hub started (a replayed record) arms
//     nothing.
//   · The judge's 'turn-started' — to this read, a wall's or a press — stops every automatic read of that account until the
//     hub restarts: the DOOR keeps the stop (law A), the road asks it.
//   · NEVER MID-TURN is read from the account's conversations THEMSELVES at the moment of the read (`conversationsOf`: every
//     conversation of the account the hub holds, restored ones too — a turn running across a restart is seen), never from
//     a map of what the road saw (law A1). A wait whose conversation was killed or archived is cleared.
//   · A paired machine's conversation (`session.host`) arms nothing: the road's own fence, beside the spawn's.
//   · THE CEILING holds on the STEADY clock within one life of the hub too (the door's `sinceLastRunMs`): a wall-clock step
//     forward releases nothing (law A2). Across a restart the disk's wall time is what there is — the said limit.
// The ONE timer here is the quiet wait, and it is set in onTurnEnd alone (test-vendor-whitelist 5c: a timer elsewhere, a
// session start, an idle tick or a restart catch-up that arms it is RED).
const doorReads = require('../door-reads.js');

const QUIET_MS = 5 * 60 * 1000;   // «该账号 5 分钟内没有新一轮»: the stretch is over when 5 minutes pass with no new turn
const PACE_MS = 30 * 60 * 1000;   // «每账号每 30 分钟最多一次»: a CEILING per account (48 a day at most), counted from its last read

function createAfterTurnRead({ harnessOf, door, cacheDir, usageWrite = require('../usage-cache-write.js'), now = Date.now, bootAt = null, conversationsOf = null,
  setTimer = (fn, ms) => { const t = setTimeout(fn, ms); if (t && typeof t.unref === 'function') t.unref(); return t; }, clearTimer = (t) => clearTimeout(t),
  log = (l) => console.log(l), quietMs = QUIET_MS, paceMs = PACE_MS } = {}) {
  const born = Number.isFinite(bootAt) ? bootAt : now();
  const waits = new Map();     // account → { timer, endAt, session } (the one quiet wait, and the conversation that armed it)
  const said = new Set();
  const once = (k, line) => { if (!said.has(k)) { said.add(k); log(line); } };
  /** the session's named account, when its harness declares the after-turn read; else null */
  const keyOf = (session) => {
    if (!session || !session._accountId) return null;
    if (session.host) return null;   // a paired machine's conversation: its login is that machine's (the road's own fence)
    let od = null; try { od = harnessOf(session.backend)?.quota?.onDemand || null; } catch { od = null; }
    return od && od.afterTurn === true ? String(session._accountId) : null;
  };
  const stampOf = (rec) => { const t = Date.parse(rec && rec.ts); return Number.isFinite(t) ? t : NaN; };
  const cancel = (key) => { const w = waits.get(key); if (w) { try { clearTimer(w.timer); } catch { } waits.delete(key); } };
  /** every conversation of the account the hub holds NOW (restored ones too) — null when the hub handed no way to ask */
  const convs = (key) => { if (typeof conversationsOf !== 'function') return null; try { const l = conversationsOf(key); return Array.isArray(l) ? l : [...(l || [])]; } catch { return null; } };
  /** A TURN OF THE ACCOUNT RUNS — from the conversations' own state at this moment; unknown (no list) counts as running */
  const busy = (key) => { const l = convs(key); return l === null ? true : l.some((s) => s && s._isStreaming === true); };

  /** A TURN STARTED (prompt_start): the account's turn runs — its quiet wait, if any, is over. */
  function onTurnStart(session, rec) {
    const key = keyOf(session);
    if (!key) return null;
    cancel(key);
    return { key };
  }

  /** THE READ ITSELF — the quiet wait ran out. */
  function fire(key, endAt) {
    const w = waits.get(key);
    if (!w || w.endAt !== endAt) return null;
    waits.delete(key);
    const l = convs(key);
    if (l === null) { once('no-list', `[after-turn-read] the hub handed no conversation list — no turn can be proven over, nothing is read`); return null; }
    if (!l.includes(w.session)) return null;   // the conversation that armed it was killed or archived: the wait is cleared
    if (busy(key)) return null;
    const stop = door && typeof door.stoppedWhy === 'function' ? door.stoppedWhy(key) : null;
    if (stop) { once('stopped|' + key, `[after-turn-read] ${key}: the automatic reads stopped (${stop}) — no read after this stretch`); return null; }
    const last = doorReads.lastReadAt(cacheDir, key, usageWrite);
    if (last >= endAt) return null;   // read since the stretch ended (a press, a wall): nothing new to read
    if (now() - last < paceMs) { log(`[after-turn-read] ${key}: read ${Math.round((now() - last) / 60000)} min ago — under the ${Math.round(paceMs / 60000)}-minute ceiling, not read now`); return null; }
    const steady = door && typeof door.sinceLastRunMs === 'function' ? door.sinceLastRunMs(key) : Infinity;
    if (steady < paceMs) { log(`[after-turn-read] ${key}: read ${Math.round(steady / 60000)} min ago by the steady clock — under the ${Math.round(paceMs / 60000)}-minute ceiling, not read now`); return null; }
    return Promise.resolve().then(() => door.read(key, { afterTurn: true })).then((r) => {
      if (r && r.ok) log(`[after-turn-read] ${key}: read ${r.limits} limit(s) after a stretch of work`);
      else if (r && r.code === 'turn-started') log(`[after-turn-read] ${key}: STOP — no automatic read of this account until the hub restarts: ${r.error}`);
      else log(`[after-turn-read] ${key}: read nothing (${(r && r.code) || '?'}: ${(r && r.error) || ''}) — no retry; the next stretch may try`);
      return r;
    }).catch((e) => { log(`[after-turn-read] ${key}: failed: ${e.message}`); return null; });
  }

  /** A TURN ENDED (prompt_end): the account's quiet wait starts — unless another turn of it runs, or the record is older
   *  than this hub (a replay: nothing is caught up). → { armed, key, endAt } or null. */
  function onTurnEnd(session, rec) {
    const key = keyOf(session);
    if (!key) return null;
    const endAt = stampOf(rec);
    if (!(endAt >= born)) return null;
    if (busy(key)) return null;
    cancel(key);
    const timer = setTimer(() => fire(key, endAt), quietMs);
    waits.set(key, { timer, endAt, session });
    return { armed: true, key, endAt };
  }

  return { onTurnStart, onTurnEnd, QUIET_MS: quietMs, PACE_MS: paceMs, waiting: () => [...waits.keys()] };
}

let road = null;
/** The hub's road — made once, where the door is made (src/server/account-usage-routes.js). */
function configure(deps) { road = createAfterTurnRead(deps); return road; }
/** The ACP consumer's two entries (src/server/stdout/acp-events.js: prompt_start, prompt_end). */
function onTurnStart(session, rec) { return road ? road.onTurnStart(session, rec) : null; }
function onTurnEnd(session, rec) { return road ? road.onTurnEnd(session, rec) : null; }

module.exports = { createAfterTurnRead, configure, onTurnStart, onTurnEnd, QUIET_MS, PACE_MS };
