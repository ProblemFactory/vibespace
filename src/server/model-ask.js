'use strict';
// THE MODEL FACTS — SERVER FACTS ONLY, ONE ORDER (lane fable-52-cli-321 r4–r15). What the server tells a page about a live claude
// conversation's model, for ONE purpose: the UNLOCKED model chip's label and amber (the lock, its road and its chip are master's
// code — round 14). Every number comes from ONE counter per conversation (`_modelSeq`, persisted) — never a clock:
//   the ASK     — stream-wall's ownModelOf (the lock, else the pick, else the spawn model) and its `askSeq` (ws-handler's pick moves it);
//   the SERVED  — the newest main-thread assistant record's model in the server's own order (the engine's noteServedModel) and its
//                 `servedSeq`, persisted with its number (meta factServedModel / factServedSeq);
//   the REPORT  — the model the CLI says it runs (`cliModel`): each main-thread init, and the LIVE «Set model to …» echo of a set_model
//                 this hub sent (round 14) — a report that MOVES the CLI's model takes a number (`reportSeq`).
// The chip's two models (`want`, `served`) are decided here; the bar writes them onto master's own fields. A served model is a
// fallback only when it is NEWER than the ask and the report (servedSeq > both) and is not the asked model — nothing asked for it.
// THE PERSON'S ROADS WRITE NOTHING HERE BUT THE PICK'S NUMBER (round 15): a typed `/model <x>` is the CLI's to take — the chip learns it
// from the CLI's next report (its init), as on master; no config, no pick, no arm. A REFUSAL (the API's 404 naming the ask) changes
// nothing a person set: the chip stays on the refused ask, amber as master draws it, and the pressing page says it once.
// Whether a served model is the one asked is MASTER's rule (usage-pool-engine modelsMatch; `sameModel` here is its text). Every
// change reaches every client as ONE `model-facts` meta op, the attach status carries the same facts — for a harness whose capability
// row DECLARES them (backend-caps `modelFacts`), and only there. Every set-model frame is ANSWERED to its sender (`model-answer`).
const { ownModelOf } = require('./stream-wall.js');
const { capsOf } = require('../backend-caps.js');
const { namedModel } = require('../model-providers.js');
/** MASTER's rule for «the same model» (src/server/usage-pool-engine.js modelsMatch, its text: the claude- prefix, a [1m] mark, case,
 *  a prefix of the other) — nothing on either side is no match here. */
function sameModel(a, b) {
  if (!a || !b) return false;
  const core = (m) => String(m).toLowerCase().replace(/^claude-/, '').replace(/\s*\[1m\]$/, '').trim();
  const x = core(a), y = core(b);
  return x === y || x.startsWith(y) || y.startsWith(x);
}
/** Does this conversation's harness DECLARE the model facts (its capability row's `modelFacts`)? */
const declares = (s) => !!(s && capsOf(s.backend).modelFacts);
/** The facts' broadcaster, handed in once by the engine (usage-pool-engine). */
let tellFacts = null;
function useBroadcast(fn) { tellFacts = typeof fn === 'function' ? fn : null; }
const told = (s) => { try { tellFacts?.(s); } catch { } };
const bump = (s) => (s._modelSeq = (Number(s._modelSeq) || 0) + 1);
const num = (x) => Number(x) || 0;

/** THE DOOR: model-providers namedModel (one check for a set-model, a create and a resume). */
/** A set-model frame at the door. `model` absent / null / '' names no model (a lock set or lifted: law D); anything else must be a
 *  named model, or the WHOLE frame is refused — nothing changes, the sender is answered. → { ok, model, why } */
function setModelDoor(data) {
  const m = data ? data.model : undefined;
  if (m === undefined || m === null || m === '') return { ok: true, model: null, why: null };
  const named = namedModel(m);
  return named ? { ok: true, model: named, why: null } : { ok: false, model: null, why: typeof m === 'string' ? 'not a model id' : `a ${Array.isArray(m) ? 'list' : typeof m}, not a model id` };
}

/** The facts every client is told (the attach status and the broadcast alike), saying they are declared (`modelFacts: true`). */
function modelFacts(s) {
  const own = ownModelOf(s), cli = (s && s._cliModel) || null;
  const servedM = s && num(s._servedSeq) > 0 ? (s._servedFactModel || s._servedModel || null) : null;
  // an ask nobody PICKED (the spawn's model, a lock it was spawned with) is no reading until the CLI has reported something — master's
  // moment: «model: ?» and a Lock waits until then
  const ask = own && !s._pickedModel && !(cli || servedM) ? null : own;
  // a pick the CLI has not answered yet (its echo) names itself — master's chip after a press — never an earlier reading of the same model
  const pending = !!(s && Array.isArray(s._picksSent) && s._picksSent.length);
  // the CLI's REPORT, newer than the ask, of a model the ask does not hold: the CLI moved by a road the hub did not order (a typed /model
  // it took, a model it changed itself) — what master's live init names (round 15)
  const moved = !pending && cli && num(s._reportSeq) > num(s._askSeq) && !(ask && sameModel(ask, cli));
  // what the CLI REPORTED of a held ask (its init's model, else its served one): what stands under master's «as last reported by the CLI»
  const reading = ask && !pending && [cli, servedM].find((m) => sameModel(ask, m));
  const want = moved ? cli : (reading || ask || cli || (s && s._transcriptModel) || null);
  // THE API REFUSED THE ASK (the API's 404 naming it — measured: probe/typed-model-v321-refused-stream.jsonl): nothing a person set
  // changes; the standing served model is what master's chip draws against the refused ask (amber) — no reply will ever come on it
  const refused = !!(s && s._askRefused && s._askRefused === own);
  const after = num(s && s._servedSeq) > Math.max(num(s && s._askSeq), num(s && s._reportSeq));
  return {
    modelFacts: true,
    askedModel: own || null, askSeq: num(s && s._askSeq),
    servedModel: (s && (s._servedFactModel || s._servedModel)) || null, servedSeq: num(s && s._servedSeq),
    askRefused: refused ? s._askRefused : null,
    cliModel: cli,
    want,
    served: refused || after ? ((s && (s._servedFactModel || s._servedModel)) || null) : null,
    // THE CLI'S LIVE ECHO, numbered (round 14; persisted r15): the id its «Set model to X (id)» named, each live echo once — what master's
    // page drew from the echo record as it arrived (its setModel)
    echoModel: (s && s._echoModel) || null, echoSeq: num(s && s._echoSeq),
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

/** A RESTORE (boot-restore's three sites): every persisted number, hydrated as the counter's maximum; the served fact; the report;
 *  the refusal; the live echo's count. → the session's fields. */
const whole = (x) => { const n = Number(x); return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0; };
function hydratedFacts(meta) {
  const m = meta && typeof meta === 'object' ? meta : {};
  const askSeq = whole(m.askSeq), servedSeq = whole(m.factServedSeq), reportSeq = whole(m.reportSeq);
  return {
    _askSeq: askSeq, _reportSeq: reportSeq, _modelSeq: Math.max(whole(m.modelSeq), askSeq, servedSeq, reportSeq),
    // AFTER A RESTORE the device feed's served records are held until it hands over one the parse feed already gave (round 8): before
    // that they may be copies of records judged before the restart. A buffer the DEVICE owns (R6) has no parse feed: never held
    _servedQuiet: m.bufferOwner !== 'device',
    _servedFactModel: namedModel(m.factServedModel), _servedSeq: servedSeq, _askRefused: namedModel(m.askRefused), _cliModel: namedModel(m.cliModel),
    _echoModel: namedModel(m.echoModel), _echoSeq: whole(m.echoSeq), _askReport: namedModel(m.askReport),
  };
}

/** After a set-model: the ask moved only if its VALUE moved (a lock set or lifted keeps it — law D). A conversation that asks for
 *  NOTHING is held to the model the CLI says it runs: a lock on that same model, or lifted back to nothing, takes no number. */
function askAfter(session, before, io = {}) {
  const yard = (m) => (m == null ? (session._cliModel || null) : m);
  if (yard(ownModelOf(session)) === yard(before)) return false;
  session._askSeq = bump(session);
  session._askRefused = null; session._askReport = null;   // (what the CLI runs for the new ask: its next report — round 16)
  persist(session, { pickedModel: session._pickedModel || null, pickedModelAt: session._pickedModelAt || 0, modelLocked: !!session._modelLocked, lockedModel: session._lockedModel || null, askSeq: session._askSeq, askRefused: null, askReport: null }, io);
  return true;
}

/** THE MODEL THE CLI SAYS IT RUNS: each main-thread `init` names it. It ends every pick still waiting for its echo (the CLI answers a
 *  set_model before its next turn: one never echoed died with it). → true when what the chip reads changed (the caller tells). */
function noteCliModel(session, model, io = {}) {
  const m = namedModel(String(model == null ? '' : model).replace(/\[.*$/, ''));
  if (!session || !m) return false;
  const ended = Array.isArray(session._picksSent) && session._picksSent.length > 0;
  if (ended) session._picksSent = null;
  // the first report since the ask moved is what the CLI runs FOR that ask (round 16: a refusal is the ask's only if it names THIS)
  if (!session._askReport) { session._askReport = m; persist(session, { askReport: m }, io); }
  if (session._cliModel === m) return ended;
  session._cliModel = m; session._reportSeq = bump(session);
  persist(session, { cliModel: m, reportSeq: session._reportSeq }, io);
  return true;
}

/** A PICK went to the CLI (ws-handler, after the door): its set_model is answered by the CLI's live echo, in the order sent. */
const PICKS_MAX = 8;
function notePick(session, model) {
  if (!session || !model) return;
  session._picksSent = [...(Array.isArray(session._picksSent) ? session._picksSent : []), model].slice(-PICKS_MAX);
}
/** The LIVE /model echo («… X (id)») on the parse feed (A5's own record): the CLI's REPORT of the set_model it answers — the OLDEST
 *  pick still waiting that it names (round 15: never «any pick of the same family»; one before it never echoed died), else the lock's
 *  repin or another road's. A backlog's echo (`late` — src/record-lateness.js) is no report; no drawn record ever reaches here. Its id
 *  is kept WHOLE (the [1m] mark: what A5 locks and master's chip names); a bare alias token resolves nothing. → true when it told. */
function noteEcho(session, echo, io = {}, { late = false } = {}) {
  const said = echo && namedModel(echo.id || echo.alias);
  if (!session || !said || late) return false;
  const sent = Array.isArray(session._picksSent) ? session._picksSent : [];
  const at = sent.findIndex((m) => m === echo.alias || m === echo.id || m === said);
  if (at >= 0) session._picksSent = sent.slice(at + 1);
  const id = echo.id ? namedModel(echo.id) : /\d/.test(said) ? said : null;
  // the echo of THE pick that is the ask: what the CLI runs for it (round 16 — never another road's report)
  if (at >= 0 && sent[at] === ownModelOf(session) && !session._askReport) session._askReport = id || said;
  if (id && session._cliModel !== id) { session._cliModel = id; session._reportSeq = bump(session); }
  session._echoModel = said; session._echoSeq = num(session._echoSeq) + 1;
  persist(session, { cliModel: session._cliModel || null, reportSeq: num(session._reportSeq), echoModel: said, echoSeq: session._echoSeq, askReport: session._askReport || null }, io);
  return true;
}

/** A turn's RESULT on the parse feed: the API's 404 («There's an issue with the selected model (X)» — measured) is the ask's refusal
 *  only when X is THE MODEL THE CLI RUNS FOR THE ASK — what it reported for it (its echo, else the first init since the ask moved: round
 *  16); the family prefix serves only while the CLI has reported nothing for it yet. A 404 naming a typed model, a fallback's or a
 *  cousin of the family says nothing and writes nothing, as on master. It writes nothing a person set; the pressing page says it once.
 *  → true when told. */
const bare = (m) => String(m || '').toLowerCase().replace(/\s*\[1m\]$/, '').trim();
function noteRefusal(session, rec, io = {}) {
  if (!session || !rec || rec.is_error !== true || Number(rec.api_error_status) !== 404 || !(Number(rec.num_turns) >= 1)) return false;
  const ask = ownModelOf(session);
  const named = /issue with the selected model \(([^()\s]+)\)/.exec(String(rec.result || ''));
  const runs = session._askReport ? bare(session._askReport) === bare(named && named[1]) : !!named && (named[1] === ask || sameModel(ask, named[1]));
  if (!ask || !named || !runs || session._askRefused === ask) return false;
  session._askRefused = ask; persist(session, { askRefused: ask }, io); told(session);
  return true;
}

/** ONE VERDICT PER RECORD: both feeds hand every main-thread record over; its id (`message.id`, else its uuid) is judged once. AFTER
 *  A RESTORE the device feed is held until it hands over a record the parse feed already gave (it has caught up). */
function deviceHeld(session, feed, key) {
  if (!session || !session._servedQuiet) return false;
  const after = session._quietParse || (session._quietParse = new Set());
  if (feed === 'parse') { if (key) { after.add(key); if (after.size > 400) after.delete(after.values().next().value); } return false; }
  if (key && after.has(key)) { session._servedQuiet = false; session._quietParse = null; return false; }
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
/** A main-thread record served by `model` (the engine's noteServedModel, both feeds): the served fact takes the next number when it
 *  changed (or is the first since the ask moved); a model served at all ends a refusal. → true when a fact changed. */
function noteServed(session, model, { recId = null, feed = 'parse', readSessionMeta, writeSessionMeta } = {}) {
  if (!session || !model) return false;
  if (deviceHeld(session, feed, recId)) return false;
  if (!seenOnce(session, recId)) return false;
  const io = { readSessionMeta, writeSessionMeta };
  let changed = false;
  if (session._askRefused) { session._askRefused = null; persist(session, { askRefused: null }, io); changed = true; }
  if (model !== session._servedFactModel || num(session._servedSeq) <= num(session._askSeq)) {
    session._servedFactModel = model;
    session._servedSeq = bump(session);
    persist(session, { factServedModel: model, factServedSeq: session._servedSeq }, io);
    changed = true;
  }
  return changed;
}

/** THE ANSWER to a set-model frame: to its sender only, every time — the facts as they stand (a harness that declares none: no facts,
 *  the frame was taken); a refusal is answered by the ws error frame instead. */
function answerFrame(session, id, reqId) {
  return { type: 'msg', sessionId: id, op: 'meta', subtype: 'model-answer', data: { answer: reqId == null ? null : String(reqId).slice(0, 80), ok: true, facts: declares(session) ? modelFacts(session) : null } };
}

module.exports = { declares, sameModel, useBroadcast, noteCliModel, notePick, noteEcho, noteRefusal, hydratedFacts, answerFrame, modelFacts, broadcastFacts, askAfter, namedModel, setModelDoor, noteServed };
