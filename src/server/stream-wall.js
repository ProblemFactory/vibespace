'use strict';
// A WALL THE STREAM NAMES IS A READING — the road (lane agy-wall-signal; the owner 2026-11-02: «antigravity会话撞墙了但是
// 用量一直没刷新出来，一直显示0%，我刚才手动刷新才刷出来»). Every quota contract has two halves: the on-demand read is the
// PERSON's (a Re-check), the signal is the STREAM's. A harness whose `quota.signalFromStream` answers a typed wall
// ({source:'stream', kind:'exhausted', limitId, window, usedPct, resetsAt, measuredAt}) has it written HERE, for the
// conversation's own ACCOUNT (`_accountId` — its login; the machine's own login has no account row to write), through
// THE ONE write path (src/usage-cache-write.js writeCacheObject: per limit, per window, the newest measurement wins — a
// measured reading taken after the wall replaces its 100 %, and a wall never overwrites a newer one).
// THE ONE-SHOT (the owner's ruling «A», 2026-11-02): where the descriptor declares `onDemand.onWallSignal`, the wall fires
// ONE on-demand read of that account (src/server/cli-usage-door.js: the judge, the minute's pace and the setting exactly
// as for a press) — once per account per wall (account, limit, reset), only for a LIVE wall record, never retried; the
// judge's 'turn-started' disarms it for that account until the hub restarts. No timer anywhere: the event is the wall.
// The consumer is told the room sentence's facts (`wallRoom`: another limit of the account whose WEEKLY window is read —
// the display verdict 'read', never a reset since, never a guess — under 90 %); the wall notice carries them to the chat.
const fs = require('fs');
const path = require('path');
const quotaModel = require('../quota-model.js');

const LIVE_MS = 5 * 60 * 1000;   // a wall stamped longer ago is history (a replayed record): written, never a trigger
const SAME_RESET_S = 60;         // one wall said again (a retry on it, a re-attach) states its reset to within a second or two
const ROOM_MAX_PCT = 90;         // another group «has room» under this
const SIDECAR_CAP = 256 * 1024;  // a wrapper sidecar is a few KB; anything bigger is not read (r4: the read is sync)

/** THE SESSION'S OWN MODEL FACT (r2: the consumer's engine accessor may be absent — a road tested only against a stubbed
 *  engine key is not wired): the lock, the newest pick, the spawn model — the pool engine's own ladder minus the served
 *  model (no ACP consumer notes one). */
function ownModelOf(s) { return (s && s._modelLocked && s._lockedModel) || (s && s._pickedModel) || (s && s._spawnModel) || null; }
/** THE WRAPPER'S OWN SIDECAR (r3's rung, bounded in r4): `<dir>/<webui id>.json` — local-only (the id is the hub's own; a
 *  path that resolves outside `dir` is refused), at most SIDECAR_CAP bytes (a bigger file is skipped by name), read only
 *  for a WALL record. → the parsed object, or null. */
function readWrapperSidecar(dir, session, { log = (l) => console.log(l), cap = SIDECAR_CAP } = {}) {
  const id = session && typeof session._webuiId === 'string' ? session._webuiId : '';
  if (!id || !dir) return null;
  const root = path.resolve(dir), f = path.resolve(root, id + '.json');
  if (path.dirname(f) !== root) { log(`[stream-wall] the wrapper sidecar of ${JSON.stringify(id)} resolves outside ${root} — not read`); return null; }
  let st = null; try { st = fs.statSync(f); } catch { return null; }
  if (!st.isFile()) return null;
  if (st.size > cap) { log(`[stream-wall] the wrapper sidecar ${f} is ${st.size} bytes — over the ${cap}-byte cap, not read`); return null; }
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; }
}
/** ONE wall said twice (the notice + its prompt_end, 2 ms apart): the same limit and window, and the same prompt or
 *  within 2 s of each other. */
function sameWall(a, b) {
  if (!a || !b || a.limitId !== b.limitId || a.window !== b.window) return false;
  if (a.promptId && b.promptId && a.promptId === b.promptId) return true;
  return Math.abs(Number(a.measuredAt) - Number(b.measuredAt)) <= 2000;
}
/** The room sentence's facts: the limit (not the walled one) whose weekly window the display verdict READS (quota-model
 *  windowDisplay — the ring's own words) with the least used, if under 90 %; else null. PURE. */
function roomOf(limits, walledId, nowMs) {
  let best = null;
  for (const l of Array.isArray(limits) ? limits : []) {
    if (!l || l.limitId === walledId) continue;
    const w = quotaModel.windowOfKind(l, '7d');
    const v = w ? quotaModel.windowDisplay(w, nowMs) : null;
    if (!v || v.state !== 'read' || typeof v.usedPct !== 'number' || !Number.isFinite(v.usedPct) || v.usedPct >= ROOM_MAX_PCT) continue;
    if (!best || v.usedPct < best.usedPct) best = { name: String(l.name || l.limitId), usedPct: Math.round(v.usedPct) };
  }
  return best;
}
/** The room as its own chat line (when it is known only after the one-shot's reading): the English the record keeps;
 *  the client says it in the UI's language from `wallRoom`. */
function roomNotice(room) {
  return { type: 'acp', kind: 'notice', level: 'info', noticeKind: 'usage-wall-room', ts: new Date().toISOString(), wallRoom: room,
    text: `${room.name}: weekly limit ${room.usedPct} % used — switch this conversation's model to continue` };
}

function createStreamWallRoad({ harnessOf, cacheDir, usageWrite = require('../usage-cache-write.js'), door = null, wrapperMetaOf = null, now = Date.now, log = (l) => console.log(l) } = {}) {
  const lastWall = new WeakMap();   // session → the wall it last wrote (the notice and its prompt_end are ONE wall)
  const lastModel = new WeakMap();  // session → the model the stream last named (agy's `usage` record)
  const fired = [];                 // the one-shot's ledger for the hub's life: { key, limitId, resetsAt }
  const disarmed = new Map();       // account → why (the judge saw a turn: no more one-shots until the hub restarts)
  const said = new Set();
  const once = (k, line) => { if (!said.has(k)) { said.add(k); log(line); } };
  const quotaOf = (be) => { try { return harnessOf(be)?.quota || null; } catch { return null; } };

  /** THE ONE-SHOT: one on-demand read of account `key` for this wall (the door's own gates apply). */
  function readOnce(key, sig, say) {
    if (disarmed.has(key)) { once('disarmed|' + key, `[stream-wall] ${key}: the wall re-check stays disarmed (${disarmed.get(key)}) — the stream's wall stands`); return null; }
    if (fired.some((f) => f.key === key && f.limitId === sig.limitId && Math.abs(f.resetsAt - sig.resetsAt) <= SAME_RESET_S)) return null;
    fired.push({ key, limitId: sig.limitId, resetsAt: sig.resetsAt });
    if (fired.length > 512) fired.shift();
    return Promise.resolve().then(() => door.read(key, { wall: true })).then((r) => {
      if (r && r.ok) {
        log(`[stream-wall] ${key}: the wall's re-check read ${r.limits} limit(s) — measured numbers replace the stream's 100 %`);
        const room = say ? roomOf((usageWrite.readCacheObject(cacheDir, key) || {}).limits, sig.limitId, now()) : null;
        if (room) { try { say(roomNotice(room)); } catch { } }
      } else if (r && r.code === 'turn-started') {
        disarmed.set(key, 'the judge saw a turn');
        log(`[stream-wall] ${key}: STOP — the wall re-check is DISARMED until the hub restarts: ${r.error}`);
      } else log(`[stream-wall] ${key}: the wall re-check read nothing (${(r && r.code) || '?'}: ${(r && r.error) || ''}) — no retry; a later wall may try again`);
      return r;
    }).catch((e) => { log(`[stream-wall] ${key}: the wall re-check failed: ${e.message}`); return null; });
  }

  /** THE WALL'S MODEL — the model the TURN ran on, by witness (r3): ① the wall record's own `servedModel` (the wrapper's
   *  agy `init.model` for this process — in stream order, moved only when a set-model restart's new process inits, so a
   *  pick during the turn never moves it); ② the wrapper's own sidecar (`agy.model`, the same fact — an older wrapper that
   *  stamps no field, and it survives a hub restart); ③ the session record (the engine's ladder, else lock › pick ›
   *  spawn); ④ agy's `usage` record (it arrives AFTER the wall: a session that names nothing else). */
  function modelOfWall(session, rec, modelOf) {
    if (typeof rec.servedModel === 'string' && rec.servedModel) return rec.servedModel;
    try { const m = wrapperMetaOf && wrapperMetaOf(session); if (m && m.agy && typeof m.agy.model === 'string' && m.agy.model) return m.agy.model; } catch { }
    let model = null; try { model = (modelOf && modelOf()) || null; } catch { model = null; }
    return model || ownModelOf(session) || lastModel.get(session) || null;
  }

  /** One wrapper record of `session` (`modelOf` = the session's model; `say(rec)` = a line into its chat).
   *  → { wallRoom, oneShot } when a wall was written, else null. */
  function onRecord(session, rec, { modelOf = null, say = null } = {}) {
    if (!session || !rec || typeof rec !== 'object') return null;
    if (rec.kind === 'usage' && typeof rec.model === 'string' && rec.model) { lastModel.set(session, rec.model); return null; }
    if (rec.kind !== 'notice' && rec.kind !== 'prompt_end') return null;
    const quota = quotaOf(session.backend);
    if (!quota || typeof quota.signalFromStream !== 'function') return null;
    // a record is first asked WITHOUT a model: only a wall the harness reads (`unread` for want of a model) is worth one —
    // so the model's witnesses (the sidecar read among them) are asked for a WALL record only, once per wall (r4)
    const probe = quota.signalFromStream(rec, { model: null });
    if (!probe || probe.source !== 'stream') return null;
    let sig = probe;
    if (probe.kind === 'unread' && probe.why === 'model') {
      const prevWall = lastWall.get(session);
      const at = Date.parse(rec.ts);
      const sameTurn = prevWall && prevWall.model && ((prevWall.promptId && rec.promptId && prevWall.promptId === rec.promptId) || (Number.isFinite(at) && Math.abs(at - prevWall.measuredAt) <= 2000));
      const model = (typeof rec.servedModel === 'string' && rec.servedModel) || (sameTurn ? prevWall.model : modelOfWall(session, rec, modelOf));
      sig = quota.signalFromStream(rec, { model });
      if (sig && sig.kind === 'exhausted') sig = { ...sig, model };
    }
    if (!sig || sig.source !== 'stream') return null;
    if (sig.kind === 'unread') { once(`unread|${session.backend}|${sig.why}`, `[stream-wall] ${session.backend}: a usage wall the stream named was not read (${sig.why}) — nothing written, never a guess`); return null; }
    if (sig.kind !== 'exhausted') return null;
    if (sameWall(lastWall.get(session), sig)) return null;
    lastWall.set(session, sig);
    const key = session._accountId || null;
    if (!key) { once(`machine|${session.backend}`, `[stream-wall] ${session.backend}: a usage wall on the machine's own login — no account row reads it, nothing written`); return null; }
    const t = now();
    if (sig.resetsAt * 1000 <= t) return null; // its reset already passed: the wall says nothing about now
    const prev = usageWrite.readCacheObject(cacheDir, key) || {};
    // the file's own non-reading fields ride along (agy's window names, …); the write path re-derives every bucket view
    // from the merged limits and recomputes its own markers. THE AGE RULE (r2): the file's `fetchedAt` — the row's age
    // label — moves only on a MEASURED reading; a wall stamps `measuredAt` on ITS window only, so the windows it does not
    // touch keep the age of the reading that measured them
    const { limits: _limits, source: _source, ...carried } = prev;
    const obj = { ...carried, backend: session.backend, source: 'stream' };
    const set = quotaModel.makeLimitSet({ identity: key, fetchedAt: null, source: 'stream', limits: [quotaModel.makeLimit({
      limitId: sig.limitId, name: sig.limitId, scope: 'model', source: 'stream', fetchedAt: sig.measuredAt,
      windows: [{ kind: sig.window, usedPct: sig.usedPct, resetsAt: sig.resetsAt, measuredAt: sig.measuredAt }] })] });
    const w = usageWrite.writeCacheObject({ cacheDir, key, obj, set, measuredAt: sig.measuredAt, source: 'stream', backend: session.backend });
    if (!w || !w.ok) { log(`[stream-wall] ${key}: the wall was not written — ${(w && w.why) || 'refused'}`); return null; }
    const won = quotaModel.windowOfKind((w.limits || []).find((l) => l && l.limitId === sig.limitId), sig.window);
    if (!won || won.measuredAt !== sig.measuredAt) { log(`[stream-wall] ${key}: a newer reading of ${sig.limitId} ${sig.window} stands — the wall changes nothing`); return null; }
    log(`[stream-wall] ${key}: ${sig.limitId} ${sig.window} spent until ${new Date(sig.resetsAt * 1000).toISOString()} (the stream's wall)`);
    const room = roomOf(w.limits, sig.limitId, t);
    const od = quota.onDemand;
    const oneShot = door && od && od.onWallSignal === true && Math.abs(t - sig.measuredAt) <= LIVE_MS ? readOnce(key, sig, room ? null : say) : null;
    return { wallRoom: room, oneShot };
  }
  return { onRecord };
}

let road = null;
/** The hub's road — made once, where the door is made (src/server/account-usage-routes.js). */
function configure(deps) { road = createStreamWallRoad(deps); return road; }
/** The ACP consumer's entry (src/server/stdout/acp-events.js). */
function onRecord(session, rec, opts) { return road ? road.onRecord(session, rec, opts) : null; }

module.exports = { createStreamWallRoad, configure, onRecord, sameWall, roomOf, roomNotice, ownModelOf, readWrapperSidecar, LIVE_MS, SAME_RESET_S, ROOM_MAX_PCT, SIDECAR_CAP };
