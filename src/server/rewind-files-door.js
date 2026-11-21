'use strict';
// ORCH: THE FILES DOOR'S SERVER HALF (row B-437e, the files tier, U2 — 主开发 r1080 / r1230 / r1232; lane lg-rewind,
// 2026-11-21). «Rewind to here»'s one confirm asks, for a conversation whose own facts say its checkpoints are on, the CLI's
// own DRY RUN of `rewind_files` (src/rewind-files.js filesRequestOf — the body's one spelling — through the harness's road
// src/harnesses/index.js rewindFilesRoad, under its own `vsf-` id), judges each file it lists (src/rewind-files.js
// changedAfterOf: the normalizer's own records for the agent's edits, the file's own time read here) and answers the page the
// confirm's facts: {choices, default, files: [{path, state, why}], plus, minus}. The PRESS asks the dry run AGAIN and judges it
// again — anything not as the confirm drew it refuses `changed-since` — then the files (`rewind_files` without dry_run), then,
// for «both», the conversation through tier one's own door (src/server/rewind-requests.js requestRewind); each result said
// on its own (outcomeOf: a files failure is «some may have been put back» unless nothing changed by construction).
//   THE ANSWER: the normalizer routes the CLI's `vsf-` answer to ONE `rewind-files-answer` meta (src/message-manager.js); this
//   door listens once per conversation (the listener rides a history rebuild) and resolves the ask by its id; an answer nobody
//   waits for — late, or not ours — is dropped and said in the journal.
//   FILE TIMES: off the loop, bounded (STAT_MS each, JUDGE_MS all), at most MAX_FILES a confirm: this machine through
//   fsp.stat; a paired machine through its agent's read-only `fs-op stat` (dm.fsStat — the M3 protocol every agent speaks,
//   no capability names it; an answer that does not come in its bound, or an agent that refuses it, = «could not be checked:
//   unreadable»). The agent's edit times are the CLI's own result times (`resultAt`), the clock of the machine its files are on.
//   WHO: the person only — the page verdict at the socket's handshake (ws-handler `_personPage`) and {kind: 'human'}.
//   DARK: the files choices are absent unless `session._fileCheckpoints === true` — the fact U1 sets when the CLI starts with the
//   switch (row B-437e U1, behind the owner's setting, off as shipped). Until then this door answers the conversation only.

const fsp = require('fs/promises');
const DOOR = require('../mount-door'); // B-afc4: the blocked-path door — asked BEFORE a user-path read (a file on a storage that is not answering: unreadable)
const F = require('../rewind-files.js');
const { REWIND_REFUSALS } = require('../rewind-door.js');
const { capsOf } = require('../backend-caps.js');
const { rewindFilesRoad } = require('../harnesses/index.js');
const { rewindStateOf, rewindOut, requestRewind } = require('./rewind-requests.js');

const DRY_MS = 15000;     // one ask of the CLI (a dry run, or a press)
const STAT_MS = 2000;     // one file's time
const JUDGE_MS = 5000;    // every file's time of one confirm
const WAITS = new WeakMap();          // conversation → Map(requestId → resolve)
const PRESSING = new WeakSet();       // conversation → a files press is running (one at a time)
const TAG = Symbol('rewind-files-answer');

/** ONE op listener per normalizer (a rebuild carries the listeners over) → whether the conversation can be heard */
function hear(session) {
  const n = session && session._normalizer;
  if (!n || typeof n.onOp !== 'function') return false;
  if (Array.isArray(n.listeners) && n.listeners.some((h) => h && h[TAG])) return true;
  const h = (op) => {
    if (!op || op.op !== 'meta' || op.subtype !== 'rewind-files-answer' || !op.data) return;
    const w = WAITS.get(session), r = w && w.get(op.data.requestId);
    if (r) { w.delete(op.data.requestId); r(op.data.answer); return; }
    try { console.warn(`[rewind-files] an answer nobody waits for (${String(op.data.requestId).slice(0, 40)}): late or not ours — dropped`); } catch { }
  };
  h[TAG] = true;
  n.onOp(h);
  return true;
}

/** ONE ask of the CLI → {sent, answer: the body as it came | null, why} — bounded (DRY_MS); a road it lacks, no listener or a
 *  write that fails is said by name and nothing is sent */
async function askCli(session, body, { timeoutMs = DRY_MS, id = null } = {}) {
  const road = rewindFilesRoad(session && session.backend);
  if (!road || !body) return { sent: false, answer: null, why: 'not-offered' };
  if (!hear(session)) return { sent: false, answer: null, why: 'stopped' };
  let out;
  try { out = road(body, { id }); } catch { return { sent: false, answer: null, why: 'no-target-id' }; }
  const w = WAITS.get(session) || new Map();
  WAITS.set(session, w);
  const answered = new Promise((resolve) => { w.set(out.requestId, resolve); });
  try { session.pty.write(out.line + '\n'); } catch { w.delete(out.requestId); return { sent: false, answer: null, why: 'stopped' }; }
  let timer = null;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve(undefined), timeoutMs); });
  const answer = await Promise.race([answered, late]);
  clearTimeout(timer);
  if (answer === undefined) { w.delete(out.requestId); return { sent: true, answer: null, why: 'no-answer', requestId: out.requestId }; }
  return { sent: true, answer, requestId: out.requestId };
}

/** each listed file's time, off the loop and bounded: {path: ms | null} (null = could not be read in its bound) */
async function timesOf(session, files, { hosts = null, statMs = STAT_MS, judgeMs = JUDGE_MS, stat = null } = {}) {
  const list = (Array.isArray(files) ? files : []).slice(0, F.MAX_FILES), out = {};
  let one = stat;
  if (!one && session && session.host) {
    let dm = null;
    try { dm = hosts && typeof hosts.deviceBounded === 'function' ? await hosts.deviceBounded(session.host, statMs) : null; } catch { dm = null; }
    if (!dm || typeof dm.fsStat !== 'function') { for (const p of list) out[p] = null; return out; }
    one = async (p) => { const r = await dm.fsStat(p); const m = r && r.stat ? Number(r.stat.mtimeMs) : NaN; return Number.isFinite(m) && m > 0 ? m : null; };
  }
  if (!one) one = async (p) => { if (DOOR.blocked(p)) return null; const st = await fsp.stat(p); return Number.isFinite(st.mtimeMs) ? st.mtimeMs : null; };
  const t0 = Date.now();
  const bounded = (p) => new Promise((resolve) => {
    const left = Math.max(0, Math.min(statMs, judgeMs - (Date.now() - t0)));
    let done = false;
    const tm = setTimeout(() => { if (!done) { done = true; resolve(null); } }, left);
    Promise.resolve().then(() => one(p)).then((m) => { if (!done) { done = true; clearTimeout(tm); resolve(typeof m === 'number' && Number.isFinite(m) ? m : null); } }, () => { if (!done) { done = true; clearTimeout(tm); resolve(null); } });
  });
  const ms = await Promise.all(list.map(bounded));
  list.forEach((p, i) => { out[p] = ms[i]; });
  return out;
}

/** the conversation's own facts, or a refusal: {session, row, messages, msg} | {ok: false, reason, cls} */
function factsOf(session, msgId, by) {
  const no = (reason) => ({ ok: false, reason, cls: F.FILES_REFUSALS[reason] || REWIND_REFUSALS[reason] || 'cannot' });
  if (!by || by.kind !== 'human') return no('not-the-person');
  if (!session) return no('stopped');
  if (session.mode !== 'chat') return no('not-offered');
  const row = capsOf(session.backend).checkpoints;
  const messages = session._normalizer && Array.isArray(session._normalizer.messages) ? session._normalizer.messages : null;
  if (!row || row.conversation !== true || !messages) return no('not-offered');
  if (session._rebuildPromise) return no('rebuilding');
  const msg = messages.find((m) => m && m.id === String(msgId || '')) || null;
  if (!msg) return no('target-not-found');
  return { row, messages, msg };
}

/** THE DRY RUN + THE JUDGE → {dry, judged} | {ok: false, reason, cls} */
async function judgeOf(session, f, { hosts = null, stat = null, dryMs = DRY_MS } = {}) {
  const ask = await askCli(session, F.filesRequestOf(f.msg.uuid, { dryRun: true }), { timeoutMs: dryMs });
  if (!ask.answer) return { ok: false, reason: ask.why === 'no-answer' ? 'no-answer' : ask.why, cls: F.FILES_REFUSALS[ask.why] || REWIND_REFUSALS[ask.why] || 'failed' };
  const dry = F.filesAnswerOf(ask.answer, { dryRun: true });
  if (!dry.ok || !dry.filesKnown || !dry.files.length) return { dry, judged: [] };
  const mtimes = await timesOf(session, dry.files, { hosts, stat });
  const judged = F.changedAfterOf(dry.files, { mtimes, edits: F.editsFromMessages(f.messages, { targetId: f.msg.id }) });
  return { dry, judged };
}

/** THE CONFIRM'S FACTS for one of the person's own messages → {ok, choices, default, files, plus, minus, said?} | a refusal.
 *  The files choices are drawn only where they can work (choicesOf); the conversation's own refusals are tier one's */
async function filesConfirmOf({ session, msgId, by, hosts = null, stat = null, dryMs = DRY_MS, now = Date.now() } = {}) {
  const f = factsOf(session, msgId, by);
  if (f.ok === false) return f;
  const plain = { ok: true, choices: ['conversation'], default: 'conversation', files: [], plus: 0, minus: 0 };
  if (session._fileCheckpoints !== true) return plain;   // DARK until U1: no files choice is ever drawn
  const v = F.filesVerdict(f.row, f.msg, { ...rewindStateOf(session), fileCheckpoints: true }, 'conversation');
  if (!v.ok) return v;
  if (rewindOut(session, now) || PRESSING.has(session)) return { ok: false, reason: 'pending', cls: REWIND_REFUSALS.pending };
  const j = await judgeOf(session, f, { hosts, stat, dryMs });
  if (j.ok === false) return { ...plain, said: j.reason };   // the dry run did not answer: the conversation only, and why
  const choices = F.choicesOf({ checkpoints: true, dry: j.dry });
  if (choices.length === 1) return { ...plain, said: j.dry.ok ? (j.dry.filesKnown ? null : 'files-unknown') : j.dry.reason };
  return { ok: true, choices, default: F.defaultChoiceOf(choices, j.judged), files: j.judged, plus: j.dry.plus, minus: j.dry.minus };
}

/** THE PRESS with a choice → {ok, steps, outcome, results} | a refusal. «both» = the files, then the conversation; the files
 *  step asks the dry run again and refuses `changed-since` when it is not what the confirm drew (`drawn`) */
async function pressFiles({ session, msgId, by, choice, drawn = null, lastSeenUuid = null, expectTaken = null, reqId = null, hosts = null, stat = null, dryMs = DRY_MS, now = Date.now() } = {}) {
  const f = factsOf(session, msgId, by);
  if (f.ok === false) return f;
  if (choice !== 'conversation' && session._fileCheckpoints !== true) return { ok: false, reason: 'files-off', cls: F.FILES_REFUSALS['files-off'] };
  if (rewindOut(session, now) || PRESSING.has(session)) return { ok: false, reason: 'pending', cls: REWIND_REFUSALS.pending };
  PRESSING.add(session);
  try {
    const j = choice === 'conversation' ? null : await judgeOf(session, f, { hosts, stat, dryMs });
    if (j && j.ok === false) return { ok: false, reason: j.reason, cls: j.cls };
    const v = F.filesVerdict(f.row, f.msg, { ...rewindStateOf(session), fileCheckpoints: true }, choice, j ? j.dry : null);
    if (!v.ok) return v;
    const results = {};
    if (v.steps.includes('files')) {
      const now2 = { files: j.dry.files, judged: j.judged, plus: j.dry.plus, minus: j.dry.minus };
      if (!F.sameDrawOf(drawn, now2)) return { ok: false, reason: 'changed-since', cls: F.FILES_REFUSALS['changed-since'], files: j.judged, plus: j.dry.plus, minus: j.dry.minus };
      const ask = await askCli(session, F.filesRequestOf(f.msg.uuid), { id: reqId, timeoutMs: dryMs });
      const a = ask.answer ? F.filesAnswerOf(ask.answer) : { ok: false, reason: ask.why, cls: 'failed', text: null };
      results.files = { ...a, sent: ask.sent };
    }
    if (v.steps.includes('conversation') && (!results.files || results.files.ok)) {
      results.conversation = requestRewind({ session, msgId, lastSeenUuid, by, expectTaken, reqId, now });
    }
    return { ok: true, steps: v.steps, results, outcome: F.outcomeOf(v.steps, results) };
  } finally { PRESSING.delete(session); }
}

module.exports = { filesConfirmOf, pressFiles, askCli, timesOf, hear, DRY_MS, STAT_MS, JUDGE_MS };
