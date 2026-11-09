'use strict';
// THE MODEL FACTS — SERVER FACTS ONLY, ONE ORDER (lane fable-52-cli-321 r4, r5). The chat's model chip holds the model SERVING the
// conversation to the model the conversation ASKED FOR; it shows nothing a client derives from a record it draws. Three facts, each
// stamped from ONE counter per conversation (`_modelSeq`, persisted) — never a clock:
//   the ASK     — stream-wall's ownModelOf (the lock, else the pick, else the spawn model) and its `askSeq`;
//   the LOCK    — `modelLocked` / `lockedModel`: its TARGET is the server's own ask as it stands (a lock frame names no model; a
//                 conversation that asks nothing — the CLI's default — locks the served fact, what its chip names), and locking
//                 never changes the ask (law D);
//   the SERVED  — the newest main-thread assistant record's model in the server's own order (the engine's noteServedModel, at both
//                 feeds) and its `servedSeq`, persisted with its number (meta factServedModel / factServedSeq — apart from the
//                 fields the pool's placement reads) so a standing fallback is still a fallback after a restart.
// A served model is a FALLBACK only when it is NEWER than the ask (servedSeq > askSeq) and is not the ask — nothing asked for it.
// The ask moves on every road the person changes it by, each known by its ORIGIN, never by a record's text:
//   (a) a pick — ws-handler `set-model` from a client of the conversation, through ONE door (setModelDoor: a string, trimmed,
//       bounded, id-shaped; anything else is refused whole and changes nothing);
//   (b) a typed `/model <x>` — the person's own chat-input (ws-handler arms it). It is judged ONLY by what is served AFTER the
//       command reached the CLI: typed while a turn runs, the wrapper holds it until the turn ends (its `queued_input` record), and
//       the running turn's own records say nothing about it; it reached the CLI when the wrapper's `queue_changed` no longer lists
//       it. Then the first served record that IS that model confirms it (the lock follows), one that is not drops it (the CLI kept
//       its model). A record whose TEXT reads like the CLI's «Set model to …» echo moves nothing: 2.1.321 stamps its echo exactly as
//       it stamps other replayed user records (isReplay:true, parent_tool_use_id:null, string content — read off its bundle: LOi /
//       injectModelSwitchBreadcrumbs beside B9r's prompt replay and Rg's remote-bash input), so no field can say who wrote it.
// Every change reaches every client of the conversation as ONE `model-facts` meta op; the attach status carries the same facts —
// for a harness whose capability row DECLARES them (backend-caps `modelFacts`), and only there. EVERY set-model frame is ANSWERED
// to its sender (r6: `model-answer` — the facts as they stand, or the refusal): a client never invents a fact or a number, it
// shows a PENDING mark over the server's facts until the answer comes. ONE rule says whether a served model is the one asked
// (model-providers modelHeld: a full id exactly, an alias family-wide) — here, in the repin and on the chip. The typed arm and
// every number are persisted and hydrated as their maximum (hydratedFacts). This file reads no clock: a time it stores (the
// pick's) is handed in by its caller.
const { ownModelOf } = require('./stream-wall.js');
const { capsOf } = require('../backend-caps.js');
const { modelHeld, namedModel, MODEL_NAME_MAX } = require('../model-providers.js');
const { setModelTaken } = require('../model-echo.js');   // the ONE spelling of the CLI's answer to a typed /model (round 8)
/** Does this conversation's harness DECLARE the model facts (its capability row's `modelFacts`)? */
const declares = (s) => !!(s && capsOf(s.backend).modelFacts);
/** The facts' broadcaster, handed in once by the engine (usage-pool-engine) — so a verdict this file reaches on either feed (the
 *  device stream's pre-gate has no socket of its own) is told to every client at once. */
let tellFacts = null;
function useBroadcast(fn) { tellFacts = typeof fn === 'function' ? fn : null; }
/** …and a line the person reads in the conversation (round 9: a typed /model the hub cannot judge is said, never dropped silently). */
let sayNotice = null;
function useNotice(fn) { sayNotice = typeof fn === 'function' ? fn : null; }
const say = (s, text) => { try { sayNotice?.(s, text); } catch { } };
const told = (s) => { try { tellFacts?.(s); } catch { } };
/** AN ARM ALWAYS ENDS (round 8): a feed's results counted past this bound with no mark (the frame not held in that feed's queue),
 *  or with a mark and no acknowledgment, void the arm — the repin is never held by an arm that cannot be reached. */
const ARM_BOUND = 3;

/** WHAT A RESUME READS lives where master keeps it (round 9 law 2): the conversation's saved config — user-state `sessionConfigs`
 *  (src/routes/persistence.js), written by the bar at a press exactly as on master — with ONE more writer: a typed /model the CLI
 *  ACKNOWLEDGED is written there by the server (confirmTyped → the writer handed in here), whether or not a client is attached. */
let writeConfig = null;
function useConfigWriter(fn) { writeConfig = typeof fn === 'function' ? fn : null; }

const bump = (s) => (s._modelSeq = (Number(s._modelSeq) || 0) + 1);

/** THE DOOR: model-providers namedModel (one check for a set-model, a create and a resume). */
const MODEL_ID_MAX = MODEL_NAME_MAX;
/** A set-model frame at the door. `model` absent / null / '' names no model (a lock set or lifted: law D); anything else must be a
 *  named model, or the WHOLE frame is refused — nothing changes, the sender is answered. → { ok, model, why } */
function setModelDoor(data) {
  const m = data ? data.model : undefined;
  if (m === undefined || m === null || m === '') return { ok: true, model: null, why: null };
  const named = namedModel(m);
  return named ? { ok: true, model: named, why: null } : { ok: false, model: null, why: typeof m === 'string' ? 'not a model id' : `a ${Array.isArray(m) ? 'list' : typeof m}, not a model id` };
}

/** The lock's target: the server's own ask as it stands; a conversation asking nothing (the CLI's default) locks the model the CLI
 *  says it runs (round 9: what master locks there — never a fallback that happened to serve last), else its served fact — and with
 *  NO ask, no init and nothing served yet (a conversation RESUMED and never picked), the model it would continue with: the
 *  transcript's, the one its attach status already names (round 9 defect fix — master locks exactly that). */
function lockTarget(s) { return ownModelOf(s) || (s && (s._cliModel || s._servedFactModel || s._servedModel || s._transcriptModel)) || null; }

/** The facts every client is told (the attach status and the broadcast alike) — told only for a harness whose capability row
 *  declares them, and saying so (`modelFacts: true`): a client never infers it from a key being present. */
function modelFacts(s) {
  return {
    modelFacts: true,
    askedModel: ownModelOf(s), askSeq: Number(s && s._askSeq) || 0,
    modelLocked: !!(s && s._modelLocked), lockedModel: (s && s._lockedModel) || null,
    servedModel: (s && (s._servedFactModel || s._servedModel)) || null, servedSeq: Number(s && s._servedSeq) || 0,
    // THE API REFUSED THE ASK (round 8 — 主开发's scene, measured: probe/typed-model-v321-refused-stream.jsonl): the model the
    // conversation asks for answered by the API's 404 «There's an issue with the selected model (X)» before anything was served under
    // it — its requests all fail; the chip names the value and where to change it
    askRefused: (s && s._askRefused && s._askRefused === ownModelOf(s)) ? s._askRefused : null,
    // THE MODEL THE CLI SAYS IT RUNS (round 9 — the oracle table): what a conversation that ASKS for nothing is held to (noteCliModel)
    cliModel: (s && s._cliModel) || null,
    askPicked: !!(s && s._pickedModel),   // the ask is a model the person NAMED (a pick) — the Lock row's «a model was named» (round 9)
  };
}

function broadcastFacts(session, id, broadcastToSession) {
  try { if (declares(session) && id && typeof broadcastToSession === 'function') broadcastToSession(session, id, { type: 'msg', sessionId: id, op: 'meta', subtype: 'model-facts', data: modelFacts(session) }); } catch { }
}

function persist(session, fields, { readSessionMeta, writeSessionMeta } = {}) {
  try {
    if (session.sockName && readSessionMeta && writeSessionMeta) writeSessionMeta(session.sockName, { ...(readSessionMeta(session.sockName) || {}), ...fields, modelSeq: session._modelSeq });
  } catch { }
}
const TYPED_KEYS = { typedModel: '_typedModel', typedMsgId: '_typedMsgId', typedHeld: '_typedHeld', typedQueued: '_typedQueued' };
const feedFlags = (o) => (o && typeof o === 'object' ? { parse: !!o.parse, device: !!o.device } : null);
const feedCounts = (o) => (o && typeof o === 'object' ? { parse: Math.max(0, Math.floor(Number(o.parse) || 0)), device: Math.max(0, Math.floor(Number(o.device) || 0)) } : null);
const typedFields = (s) => ({ typedModel: s._typedModel || null, typedMsgId: s._typedMsgId || null, typedHeld: !!s._typedHeld, typedQueued: !!s._typedQueued, typedPrev: Array.isArray(s._typedPrev) && s._typedPrev.length ? s._typedPrev.map(armOf).filter(Boolean).map((a) => ({ model: a.model, msgId: a.msgId || null, reached: feedFlags(a.reached), count: feedCounts(a.count), held: feedFlags(a.held), seen: feedFlags(a.seen) })) : null,
  typedCount: s._typedModel ? feedCounts(s._typedCount) : null, typedHeldBy: s._typedModel ? feedFlags(s._typedHeldBy) : null, typedSeenBy: s._typedModel ? feedFlags(s._typedSeenBy) : null,
  picksPending: s._typedModel && Array.isArray(s._picksPending) ? s._picksPending.map((p) => ({ id: p.id, seen: feedFlags(p.seen) })) : null,
  acksSeen: Array.isArray(s._acksSeen) && s._acksSeen.length ? s._acksSeen.slice(-16) : null,
  typedGate: s._typedModel ? feedFlags(s._typedGate) : null, typedQueuedBy: s._typedModel ? feedFlags(s._typedQueuedBy) : null, typedSawServed: s._typedModel ? feedFlags(s._typedSawServed) : null,
  typedReached: s._typedModel ? feedFlags(s._typedReached) : null, wrapperMarks: !!s._wrapperMarks });
const clearTyped = (s) => { s._picksPending = null; s._typedModel = null; s._typedMsgId = null; s._typedHeld = false; s._typedQueued = false; s._typedPrev = null; s._typedSawServed = null; s._typedQueuedBy = null; s._typedGate = null; s._typedReached = null; s._typedCount = null; s._typedHeldBy = null; s._typedSeenBy = null; };
/** THE TYPED /models STILL IN PLAY, as ARMS — oldest first, each with its frame id and its per-feed mark (r7 — the seeded walk:
 *  «/model sonnet» then «/model nope-model»; or sonnet already in the CLI while fable[1m] waits in the wrapper's queue). The newest
 *  arm is `_typedModel` / `_typedMsgId` / `_typedReached`; the earlier ones ride `_typedPrev`. */
const TYPED_PREV_MAX = 4;
const armOf = (a) => (typeof a === 'string' ? { model: a, msgId: null, reached: null } : a && typeof a === 'object' && a.model ? a : null);
const armsOf = (s) => [...(Array.isArray(s._typedPrev) ? s._typedPrev.map(armOf).filter(Boolean) : []), ...(s._typedModel ? [{ model: s._typedModel, msgId: s._typedMsgId || null, reached: s._typedReached || null, count: s._typedCount || null, held: s._typedHeldBy || null, seen: s._typedSeenBy || null }] : [])];
const typedCandidates = (s) => armsOf(s).reverse().map((a) => a.model);   // newest first (the legacy road judges them all at once)
/** Keep these arms (oldest first): the newest becomes the head; an empty list clears every arm. */
function setArms(s, arms) {
  const list = arms.filter(Boolean);
  if (!list.length) { clearTyped(s); return; }
  const head = list[list.length - 1];
  if (head.msgId !== s._typedMsgId) { s._typedHeld = false; s._typedQueued = false; s._typedQueuedBy = null; s._typedSawServed = null; s._typedGate = {}; }
  s._typedModel = head.model; s._typedMsgId = head.msgId || null; s._typedReached = head.reached || null; s._typedCount = head.count || null; s._typedHeldBy = head.held || null; s._typedSeenBy = head.seen || null;
  s._typedPrev = list.slice(0, -1).map((a) => ({ model: a.model, msgId: a.msgId || null, reached: a.reached || null, count: a.count || null, held: a.held || null, seen: a.seen || null }));
}
/** A restart gives back what was written (r6): every number as a whole number ≥ 0 (garbage = 0), the counter as the MAXIMUM of
 *  every persisted number (an ask number without the counter, a served number above it), the served fact, the typed arm. →
 *  the session's fields — boot-restore's three sites take them. */
const whole = (x) => { const n = Number(x); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
function hydratedFacts(meta) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const askSeq = whole(m.askSeq), servedSeq = whole(m.factServedSeq);
  const typed = namedModel(m.typedModel);
  return {
    _askSeq: askSeq, _modelSeq: Math.max(whole(m.modelSeq), askSeq, servedSeq),
    // ONE VERDICT PER RECORD ACROSS A RESTART (round 8 — the walk): the set of records already judged is not kept, so after a restore
    // the device feed's served records are not judged until that feed hands over a record the PARSE feed already gave after the
    // restore — before that they may be copies of records judged before the restart (a lagging feed), or run ahead of records the
    // parse has not given yet, and either would bring an older served model back. The parse feed carries only what the CLI writes
    // after the restore, in order, so nothing is lost: a record the device skipped is judged when the parse gives it.
    _servedQuiet: true,
    _servedFactModel: namedModel(m.factServedModel), _servedSeq: servedSeq, _askRefused: namedModel(m.askRefused), _cliModel: namedModel(m.cliModel),
    _typedModel: typed, _typedMsgId: typed && typeof m.typedMsgId === 'string' && m.typedMsgId ? m.typedMsgId : null,
    _typedHeld: !!(typed && m.typedHeld === true), _typedQueued: !!(typed && m.typedQueued === true),
    // the per-feed order marks come back exactly as written (r7 — the seeded walk): an open gate says what follows on that feed was
    // written after the command; a closed one waits for that feed's next result — records in flight across the restart included
    _typedQueuedBy: typed ? feedFlags(m.typedQueuedBy) : null, _typedGate: typed ? (feedFlags(m.typedGate) || {}) : null, _typedSawServed: typed ? feedFlags(m.typedSawServed) : null,
    _typedReached: typed ? feedFlags(m.typedReached) : null, _wrapperMarks: m.wrapperMarks === true,
    _typedCount: typed ? feedCounts(m.typedCount) : null, _typedHeldBy: typed ? feedFlags(m.typedHeldBy) : null, _typedSeenBy: typed ? feedFlags(m.typedSeenBy) : null,
    _acksSeen: Array.isArray(m.acksSeen) ? m.acksSeen.filter((x) => typeof x === 'string' && x).slice(-16) : null,
    _picksPending: typed && Array.isArray(m.picksPending) ? m.picksPending.filter((p) => p && typeof p.id === 'string' && p.id).map((p) => ({ id: p.id, seen: feedFlags(p.seen) || {} })).slice(-8) : null,
    _typedPrev: typed && Array.isArray(m.typedPrev) ? m.typedPrev.map(armOf).filter((a) => a && namedModel(a.model)).map((a) => ({ model: namedModel(a.model), msgId: typeof a.msgId === 'string' ? a.msgId : null, reached: feedFlags(a.reached), count: feedCounts(a.count), held: feedFlags(a.held), seen: feedFlags(a.seen) })).slice(-TYPED_PREV_MAX) : null,
  };
}

/** The ask moved (a pick, a confirmed typed /model): the next number, persisted with the ask and the lock. */
function askMoved(session, io = {}, { keepArms } = {}) {
  session._askSeq = bump(session);
  session._askRefused = null;
  // the arms still in play stay (round 8): a pick does not end a /model the wrapper still holds — the CLI's order judges it at its
  // acknowledgment; a confirmed /model hands in the arms that remain (keepArms), an empty list ends them all
  if (Array.isArray(keepArms)) setArms(session, keepArms);
  persist(session, { pickedModel: session._pickedModel || null, pickedModelAt: session._pickedModelAt || 0, modelLocked: !!session._modelLocked, lockedModel: session._lockedModel || null, askSeq: session._askSeq, ...typedFields(session) }, io);
}
/** After a set-model: the ask moved only if its VALUE moved (a lock set or lifted keeps it — law D); the lock is persisted either way. */
function askAfter(session, before, io = {}, { picked = false } = {}) {
  // …a conversation that asks for NOTHING is held to the model the CLI says it runs (round 9): a lock set on that same model, or lifted
  // back to nothing, moves no yardstick — it takes no number, and a fallback standing before it is still one
  const yard = (m) => (m == null ? (session._cliModel || null) : m);
  if (yard(ownModelOf(session)) !== yard(before)) { askMoved(session, io); return true; }
  // a PICK and a typed /model are ordered by the CLI, not by the hub (round 8 — the walk: a /model the wrapper still HELD reaches
  // the CLI after the pick's set_model and wins there): the arms stand, and each one's acknowledgment is judged against the picks
  // the CLI has not answered yet (notePickSent / noteControlResponse / noteFeedResult)
  persist(session, { modelLocked: !!session._modelLocked, lockedModel: session._lockedModel || null, ...typedFields(session) }, io);
  return false;
}

/** (b) the person typed `/model <x>` into the conversation (its origin: their own chat-input) — ARMED, not yet the ask. `inTurn`:
 *  the conversation was in a turn when it was sent, so the wrapper holds it until the turn ends. */
const TYPED_MODEL = /^\/model\s+(\S+)\s*$/;
function noteTypedModel(session, text, { msgId = null, inTurn = false, ...io } = {}) {
  const m = TYPED_MODEL.exec(String(text == null ? '' : text).trim());
  if (!declares(session) || !m || m[1].toLowerCase() === 'default') return false;
  const named = namedModel(m[1]);
  if (!named) return false;
  // an EARLIER /model still in play stays an ARM of its own (the CLI runs them in order and may refuse the newer one)
  if (session._typedModel) session._typedPrev = armsOf(session).slice(-TYPED_PREV_MAX);
  session._typedModel = named;
  session._typedMsgId = (typeof msgId === 'string' && msgId) || null;
  // typed while a remote conversation's pipe is down (law 3): whenever its mark comes, it was written into a replay — void and said
  if (session._remoteGap && session._typedMsgId) { const g = session._gapArms || (session._gapArms = []); g.push(session._typedMsgId); if (g.length > 8) g.shift(); }
  session._typedReached = null;
  session._typedCount = null; session._typedHeldBy = null;
  // AN OLDER WRAPPER WRITES NO MARK (round 9 — every conversation alive at the upgrade runs one): a frame sent while it is idle goes
  // straight to the CLI's stdin, so both feeds have SEEN it — the bound counts from here and an unanswered arm ends there too
  session._typedSeenBy = !inTurn && !session._wrapperMarks ? { parse: true, device: true } : null;
  session._typedHeld = !!inTurn;
  session._typedQueued = false;
  session._typedSawServed = {};                              // per feed: has it handed over a served record since the arm?
  session._typedGate = {};                                    // per feed: has it handed over a result SINCE the arm? (r7)
  persist(session, typedFields(session), io);                 // the arm survives a hub restart (r6)
  return true;
}
/** The hub forwarded an EDIT of a held frame (ws-handler queue-op): its text, until the wrapper's result for it (round 9). */
function noteQueueEdit(session, id, text) {
  if (!session || id == null || typeof text !== 'string' || !session._typedModel) return;
  const keep = Object.entries(session._editsPending || {}).slice(-7);
  session._editsPending = Object.fromEntries([...keep, [String(id), text]]);
}
/** A REMOTE conversation's pipe (round 9, law 3 — the verifier's OFFSET scene): after a reconnect the wrapper replays what the remote
 *  CLI wrote BEFORE a frame it flushed at the reconnect — no record says which came first, so the acknowledgment cannot be told from
 *  older records and the bound would end the arm on them. A typed /model that stood when the pipe dropped, or whose mark falls in the gap
 *  (queued while the pipe was down, flushed at the reconnect), is never judged by records older than itself: it is VOID, and said. */
function noteRemoteState(session, state, io = {}) {
  if (!session || typeof state !== 'string') return;
  if (state === 'connected') { session._remoteGap = false; return; }
  session._remoteGap = true;
  if (!session._typedModel) return;
  const models = armsOf(session).map((a) => a.model);
  clearTyped(session); persist(session, typedFields(session), io);
  say(session, models);   // a wrapper that records none (older): the clients say it, in their language (a current one's record already voided these)
}
/** The wrapper's own record (round 9 defect fix — law 3's line): `model_across_reconnect {msg_id, model}` — that command's arm is void;
 *  the line is in the conversation (the normalizer's notice), so nothing more is said from here. */
function noteAcrossReconnect(session, rec, io = {}) {
  if (!session || !rec || !rec.msg_id || !session._typedModel) return;
  const arms = armsOf(session), keep = arms.filter((a) => a.msgId !== rec.msg_id);
  if (keep.length === arms.length) return;
  setArms(session, keep); persist(session, typedFields(session), io);
}

/** The wrapper's own queue records (the stream, both feeds): WHEN the armed command reached the CLI. `queued_input` naming its
 *  message = held; a `queue_changed` that no longer lists it = it left the queue for the CLI (or was dropped: the next served
 *  model judges it either way). */
function noteQueueRecord(session, rec, io = {}, feed = 'parse') {
  if (!session || !session._typedModel || !rec) return;
  const was = JSON.stringify(typedFields(session));
  // AN ARM ALWAYS ENDS (round 8): a frame the wrapper took OUT of its queue without forwarding it never reached the CLI — ✕ on a held
  // row, an edit (the frame the person typed is gone), and Stop, which writes a remove for EACH frame it drops before anything else
  // (data/bin/chat-wrapper.js dropHeldForStop) — so its arm is void
  const gone = new Set();
  // AN EDIT FOLLOWS ITS TEXT (round 9): an edited held /model is the EDITED command — re-armed with its model (the text the hub
  // forwarded, noteQueueEdit); an edit into anything else, or one whose text the hub never saw, voids it
  if (rec.type === 'queue_op_result' && rec.ok !== false && rec.op === 'edit' && rec.msg_id) {
    // ONE VERDICT PER RECORD (round 9 defect fix): both feeds hand this record over — the copy of an edit already applied is the same
    // record, never a second edit (it found no pending text and voided the re-armed arm)
    const ek = `${rec.id}|${rec.msg_id}`, done = session._editsDone || (session._editsDone = []);
    if (done.includes(ek)) return;
    done.push(ek); if (done.length > 16) done.shift();
    const text = session._editsPending && rec.id != null ? session._editsPending[String(rec.id)] : undefined;
    if (session._editsPending && rec.id != null) delete session._editsPending[String(rec.id)];
    const m = typeof text === 'string' ? TYPED_MODEL.exec(text.trim()) : null, named = m && m[1].toLowerCase() !== 'default' ? namedModel(m[1]) : null;
    if (named && armsOf(session).some((a) => a.msgId === String(rec.msg_id))) {
      setArms(session, armsOf(session).map((a) => (a.msgId === String(rec.msg_id) ? { ...a, model: named } : a)));
      persist(session, typedFields(session), io);
      return;
    }
  }
  if (rec.type === 'queue_op_result' && rec.ok !== false && (rec.op === 'remove' || rec.op === 'edit') && rec.msg_id) gone.add(String(rec.msg_id));
  if (gone.size) {
    const arms = armsOf(session), keep = arms.filter((a) => !(a.msgId && gone.has(a.msgId)));
    if (keep.length !== arms.length) setArms(session, keep);
    if (!session._typedModel) { persist(session, typedFields(session), io); return; }
  }
  const id = session._typedMsgId;
  // WHICH ARMS THIS FEED'S QUEUE HOLDS (round 8): a held frame waits for its turn — its results do not count toward the bound
  if (rec.type === 'queued_input' && rec.msg_id || rec.type === 'queue_changed') {
    const listed = rec.type === 'queued_input' ? null : new Set((Array.isArray(rec.items) ? rec.items : []).map((x) => x && x.msgId).filter(Boolean));
    const arms = armsOf(session).map((a) => {
      if (!a.msgId) return a;
      const h = { ...(a.held || {}) };
      if (rec.type === 'queued_input') { if (rec.msg_id === a.msgId) h[feed] = true; } else h[feed] = listed.has(a.msgId);
      const sn = { ...(a.seen || {}) }; if (h[feed]) sn[feed] = true;
      return { ...a, held: h, seen: sn };
    });
    setArms(session, arms);
  }
  const by = session._typedQueuedBy || (session._typedQueuedBy = {});
  // EACH FEED KEEPS THE CLI'S ORDER (r7 — the seeded walk): a queued_input for an arm already queued is a copy (the wrapper never
  // queues one frame twice) — it only marks that THIS feed has now handed it over; and a queue_changed releases the arm only when it
  // comes from a feed that has already handed over the arm's own queued_input (a lagging feed's snapshot from BEFORE the hold, which
  // does not list the frame either, releases nothing)
  if (rec.type === 'queued_input') { if (id && rec.msg_id === id) { by[feed] = true; if (!session._typedQueued) { session._typedHeld = true; session._typedQueued = true; } } }
  else if (rec.type === 'queue_changed' && session._typedHeld && session._typedQueued && by[feed]) {
    const items = Array.isArray(rec.items) ? rec.items : [];
    if (!items.some((it) => it && it.msgId === id)) session._typedHeld = false;
  }
  if (JSON.stringify(typedFields(session)) !== was) persist(session, typedFields(session), io);
}

/** A feed handed over a `result` (r7 — the seeded walk): every record that feed carries AFTER it was written after the command —
 *  the CLI writes in order, and each feed keeps that order. Until then a served record from that feed is not a verdict on the arm
 *  (a turn that ended before the command reached the CLI may still be in flight). */
/** THE WRAPPER'S MARK (r7): `input_forwarded {msg_id}` — written by the wrapper the moment it hands a person's frame to the CLI
 *  (at once, or drained from its queue), BEFORE the frame, so on each feed everything after it was done after the frame reached
 *  the CLI. A wrapper that writes it (every one since this lane) is judged by it ALONE: a served record judges the arm only on a
 *  feed that has handed over the arm's own mark — causal, whatever the lag of either feed. An older wrapper (no mark ever seen)
 *  keeps the queue records and the per-feed result gate. */
function noteForwarded(session, rec, feed = 'parse', io = {}) {
  if (!session || !rec) return;
  if ((session._remoteGap || (Array.isArray(session._gapArms) && session._gapArms.includes(rec.msg_id))) && rec.msg_id && session._typedModel) {   // round 9, law 3: flushed at the reconnect, or typed in the gap and written into the replay
    const arms = armsOf(session), hit = arms.find((a) => a.msgId === rec.msg_id);
    if (hit) { setArms(session, arms.filter((a) => a !== hit)); persist(session, typedFields(session), io); say(session, [hit.model]); return; }
  }
  let dirty = false;
  if (!session._wrapperMarks) { session._wrapperMarks = true; dirty = true; }
  if (session._typedModel && rec.msg_id) {
    if (rec.msg_id === session._typedMsgId) {
      const r = session._typedReached || (session._typedReached = {});
      if (!r[feed]) { r[feed] = true; session._typedHeld = false; dirty = true; }
      const sb = session._typedSeenBy || (session._typedSeenBy = {}); sb[feed] = true;
    } else if (Array.isArray(session._typedPrev)) {
      for (const a of session._typedPrev) if (a && typeof a === 'object' && a.msgId === rec.msg_id) { const r = a.reached || (a.reached = {}); if (!r[feed]) { r[feed] = true; dirty = true; } const sn = a.seen || (a.seen = {}); sn[feed] = true; }
    }
  }
  if (dirty) persist(session, typedFields(session), io);
}
function noteFeedResult(session, feed = 'parse', io = {}, rec = null) {
  if (!session) return false;
  // THE CLI'S ACKNOWLEDGMENT (round 8 — measured on the real 2.1.321, probe/typed-model-v321.jsonl): a typed «/model X» is answered
  // by an init (still the old model), an assistant record of model «<synthetic>» «Set model to `X` for this session only», and a
  // result with num_turns 0 — for ANY id (an unknown one is taken too, and the next requests carry it). Only a local command ends
  // with num_turns 0, and the CLI runs what it is handed in order: the FIRST num_turns-0 result on a feed after the arm REACHED the
  // CLI on that feed is the CLI taking that arm's model — the ask moves there. Reached = the wrapper's mark on this feed (every
  // wrapper since r7); an older wrapper writes none, so there it is «no longer held in this feed's queue». Every served record
  // before it — the turn the CLI was running when the frame reached it (the verifier's d7), a reconnect's replay — says nothing.
  // ONE VERDICT PER RESULT (round 8 — the walk): the CLI stamps every result with its own uuid, and both feeds hand it over — a copy
  // the other feed already gave is not judged or counted again (an older wrapper writes no marks, so only this keeps a lagging feed's
  // copy of one command's acknowledgment from being read as the next one's)
  const rid = rec && typeof rec.uuid === 'string' && rec.uuid ? rec.uuid : null;
  if (deviceHeld(session, feed, rid ? 'result:' + rid : null)) return false;
  if (rid) {
    const acks = Array.isArray(session._acksSeen) ? session._acksSeen : [];
    const seen = session._resultsSeen || (session._resultsSeen = new Set());
    if (seen.has(rid) || acks.includes(rid)) return false;
    seen.add(rid); if (seen.size > 400) seen.delete(seen.values().next().value);
    if (Number(rec.num_turns) === 0) session._acksSeen = [...acks, rid].slice(-16);   // kept with the arms: a restart does not forget them
  }
  // THE API REFUSED THE ASK (round 8): a turn whose result is the API's 404 while nothing was served since the ask moved — the CLI
  // took the model at /model (its check passed) and every request now fails
  if (rec && rec.is_error === true && Number(rec.api_error_status) === 404 && Number(rec.num_turns) >= 1) {   // (an arm in flight changes nothing: if it is taken, the ask moves and the refusal clears)
    const ask = ownModelOf(session);
    if (ask && (Number(session._servedSeq) || 0) <= (Number(session._askSeq) || 0) && session._askRefused !== ask) {
      session._askRefused = ask; persist(session, { askRefused: ask }, io); told(session); return true;
    }
  }
  if (!session._typedModel) return false;
  const arms = armsOf(session);
  // the acknowledgment is the /model command's OWN result: 2.1.321 stamps it `local_command: 'model'` (measured) — another local
  // command's result is never read as it (round 9); a result carrying no such field (an older CLI) is read as before
  if (rec && Number(rec.num_turns) === 0 && (rec.local_command == null || rec.local_command === 'model')) {
    const hit = arms.find((a) => (session._wrapperMarks ? !!(a.reached && a.reached[feed]) : !(a.held && a.held[feed])));
    if (hit) {
      const rest = arms.filter((a) => a !== hit);
      // THE CLI'S ANSWER (round 8, measured both ways on 2.1.321): «Set model to `X` for this session only» — it took X (an id it does
      // not know included: «doesn't recognize»); «Model 'X' not found» — the API refused X when the CLI checked it, the CLI KEPT its
      // model: the arm is void. A result naming neither (an older CLI's bare answer) is taken as before
      const answer = typeof rec.result === 'string' ? rec.result : '';
      if (answer && !setModelTaken(answer)) { setArms(session, rest); persist(session, typedFields(session), io); return false; }
      // a pick the CLI has not answered on this feed came AFTER this command in the CLI's order: the pick is the CLI's model
      if (Array.isArray(session._picksPending) && session._picksPending.some((p) => !p.seen[feed])) { setArms(session, rest); persist(session, typedFields(session), io); return false; }
      confirmTyped(session, hit.model, { ...io, keepArms: rest }); told(session); return true;
    }
  }
  return countArms(session, arms, feed, io);
}
/** THE MODEL THE CLI SAYS IT RUNS (round 9 — the oracle table, master as the oracle): each main-thread `init` names it. A conversation
 *  that ASKS for nothing (a resume that commanded no model, a spawn on the CLI's default) is held to it — master's yardstick, the model
 *  last reported — so after a reload a turn is never judged against the last SERVED model (a fallback's) and read as a fallback itself.
 *  → true when the facts of a conversation that asks nothing changed (the caller tells every client). */
function noteCliModel(session, model, io = {}) {
  const m = namedModel(String(model == null ? '' : model).replace(/\[.*$/, ''));
  if (!session || !m || session._cliModel === m) return false;
  session._cliModel = m;
  persist(session, { cliModel: m }, io);
  return !ownModelOf(session);
}

/** THE PICKS THE CLI HAS NOT ANSWERED (round 8): each pick's set_model goes to the CLI at once, a typed /model when the wrapper hands
 *  it over — so the CLI's own order says which came last. Each pick's request id waits here until its control_response is seen on a
 *  feed; an arm acknowledged on a feed where a pick is still unanswered ran BEFORE that pick in the CLI: the pick wins, the arm is void. */
const PICKS_MAX = 8;
function notePickSent(session, requestId) {
  if (!session || !requestId || !session._typedModel) return;   // nothing typed in play: nothing to order
  const list = Array.isArray(session._picksPending) ? session._picksPending : [];
  session._picksPending = [...list, { id: String(requestId), seen: {} }].slice(-PICKS_MAX);
}
function noteControlResponse(session, rec, feed = 'parse', io = {}) {
  const id = rec && rec.response && rec.response.request_id;
  if (!session || !id || !Array.isArray(session._picksPending)) return;
  for (const p of session._picksPending) if (p.id === id) p.seen[feed] = true;
  session._picksPending = session._picksPending.filter((p) => !(p.seen.parse && p.seen.device));
  if (!session._picksPending.length) session._picksPending = null;
  persist(session, typedFields(session), io);
}

/** One of this feed's results counted against every arm the feed's queue does not hold; an arm past ARM_BOUND is void. */
function countArms(session, arms, feed, io) {
  const keep = [];
  for (const a of arms) {
    // a feed that has not handed over the arm's own record yet (its queued_input or its mark) may still be delivering results written
    // BEFORE the frame — they say nothing about it; a held frame waits for its turn
    if (!(a.seen && a.seen[feed]) || (a.held && a.held[feed])) { keep.push(a); continue; }
    const c = { ...(a.count || {}) }; c[feed] = (c[feed] || 0) + 1;
    if (c[feed] > ARM_BOUND) continue;   // no mark, or no acknowledgment, within the bound: the frame never reached the CLI as a /model
    keep.push({ ...a, count: c });
  }
  setArms(session, keep);
  persist(session, typedFields(session), io);
  return false;
}
/** THE CONVERSATION'S PROCESS ENDED (round 8 — the wrapper gone, or replaced by a respawn): every frame it held, and every command
 *  the CLI had not acknowledged, died with it — every arm is void, and the next wrapper says for itself whether it marks. */
function noteProcessGone(session, io = {}) {
  if (!session) return;
  if (!session._typedModel && !session._wrapperMarks) return;
  clearTyped(session); session._wrapperMarks = false;
  persist(session, typedFields(session), io);
}

function confirmTyped(session, typed, { now = 0, keepArms = null, ...io } = {}) {
  session._pickedModel = typed;
  if (now) session._pickedModelAt = now;
  session._modelOrigin = 'chosen';
  if (session._modelLocked && session._lockedModel && !modelHeld(session._lockedModel, typed)) session._lockedModel = typed;
  askMoved(session, io, { keepArms });
  // …and what a resume reads (round 9 law 2): the conversation's saved config, as the bar's pick writes it on master
  const key = session.backendSessionId ? `${session.backend || 'claude'}:${session.backendSessionId}` : null;
  if (key && writeConfig) { try { writeConfig(key, { model: typed, ...(session._modelLocked && session._lockedModel ? { lockModel: session._lockedModel } : {}) }); } catch { } }
}

/** A turn ended (its `result`). An arm thought held that the wrapper never queued went straight to the CLI (the turn was ending
 *  as it was sent): it is judged from here, and a served fact that already IS it confirms it. → true when the ask moved. */
function noteTurnEnd(session) {
  // round 8: a typed /model is judged by the CLI's own acknowledgment (noteFeedResult) — a turn's end confirms nothing
  return false;
}

/** A main-thread record served by `model` (the engine's noteServedModel, both feeds). A typed /model that already reached the CLI
 *  is judged first (it becomes the ask, or is dropped); then the served fact takes the next number when it changed (or is the first
 *  served since the ask moved) — and only then is it written down. → true when a fact changed (the caller broadcasts). */
/** ONE VERDICT PER RECORD (r7): both feeds hand every main-thread record over (the device stream may run AHEAD of the parse); the
 *  record's own id (`message.id`, else its uuid) is judged once — a copy the other feed hands over later is not judged again, so a
 *  served record that came BEFORE a release in the CLI's order can never drop an arm the release freed. */
/** AFTER A RESTORE (round 8 — the walk): the device feed is held — its served records AND its results — until it hands over a record
 *  the parse feed already gave since the restore (the device has caught up); before that its records may be copies of ones judged
 *  before the restart, or run ahead of the parse (an acknowledgment that moved the ask before the parse gave an older served record).
 *  The parse feed is complete and in order, so nothing is lost: what the device skipped is judged when the parse gives it. */
function deviceHeld(session, feed, key) {
  if (!session || !session._servedQuiet) return false;
  const after = session._quietParse || (session._quietParse = new Set());
  if (feed === 'parse') { if (key) { after.add(key); if (after.size > 400) after.delete(after.values().next().value); } return false; }
  if (key && after.has(key)) { session._servedQuiet = false; session._quietParse = null; return false; }   // the device feed caught up
  return true;
}
const SEEN_MAX = 4000;
function seenOnce(session, recId) {
  if (!recId) return true;
  const seen = session._servedRecIds || (session._servedRecIds = new Set());
  if (seen.has(recId)) return false;
  seen.add(recId);
  if (seen.size > SEEN_MAX) { const it = seen.values(); for (let i = 0; i < 500; i++) seen.delete(it.next().value); }
  return true;
}
function noteServed(session, model, { modelsMatch: _unused, now = 0, recId = null, feed = 'parse', readSessionMeta, writeSessionMeta } = {}) {
  if (!session || !model) return false;
  if (deviceHeld(session, feed, recId)) return false;
  if (!seenOnce(session, recId)) return false;
  let changed = false;
  // a served record judges NO arm (round 8): the CLI's own acknowledgment does (noteFeedResult)
  if (session._askRefused) { session._askRefused = null; persist(session, { askRefused: null }, { readSessionMeta, writeSessionMeta }); changed = true; }
  if (model !== session._servedFactModel || (Number(session._servedSeq) || 0) <= (Number(session._askSeq) || 0)) {
    session._servedFactModel = model;
    session._servedSeq = bump(session);
    persist(session, { factServedModel: model, factServedSeq: session._servedSeq }, { readSessionMeta, writeSessionMeta });
    changed = true;
  }
  return changed;
}

/** THE ANSWER to a set-model frame (r6): to its sender only, every time — the facts as they stand (a harness that declares none: no
 *  facts, the frame was taken) — so a client's pending mark always ends; a refusal is answered by the ws error frame instead. */
function answerFrame(session, id, reqId) {
  return { type: 'msg', sessionId: id, op: 'meta', subtype: 'model-answer', data: { answer: reqId == null ? null : String(reqId).slice(0, 80), ok: true, facts: declares(session) ? modelFacts(session) : null } };
}

module.exports = { declares, useBroadcast, useNotice, noteQueueEdit, noteRemoteState, noteAcrossReconnect, noteCliModel, noteProcessGone, notePickSent, noteControlResponse, ARM_BOUND, useConfigWriter, hydratedFacts, noteFeedResult, noteForwarded, answerFrame, modelHeld, modelFacts, broadcastFacts, askMoved, askAfter, lockTarget, namedModel, setModelDoor, noteTypedModel, noteQueueRecord, noteTurnEnd, noteServed, TYPED_MODEL, MODEL_ID_MAX };
