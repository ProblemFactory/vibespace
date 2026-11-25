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
//   «BOTH» ASKS THE CONVERSATION FIRST (the reader's MAJOR 2): tier one's own DRY RUN (its whole verdict: page-behind, a rewind
//   out, the count the confirm said) runs BEFORE anything is written — a conversation step that would be refused is refused
//   with nothing put back. The conversation step's «done» is its request SENT (`asked`): the CLI's own answer comes as tier
//   one's `rewind-answer` (the cut is drawn when it answers; the page words it as tier one does).
//   ONE REWIND AT A TIME: a files press is a rewind out (rewind-requests.js setFilesOut) from its first check to its answer —
//   tier one's press, the confirm and the person's send fence wait on it as on a conversation rewind. A press the CLI does
//   not answer in PRESS_MS is said «some may have been put back», and the mark HOLDS until its late answer (journalled) or
//   PRESS_HOLD_MS. The files' request id is minted HERE (never the page's: a retry can never be answered by an older press); the
//   conversation step keeps tier one's rule (the page's own id, bound before it sends).
//   THE RECORDS: whole only where they reach back to the conversation's start (rewind-files.js `whole`, r1247): a conversation
//   born in this hub (src/ws-create.js) or a history rebuilt from a transcript read from its first byte (the store's span —
//   a transcript past the tail bound loads its tail only: every file «could not be checked»). The CLI's version is its init's
//   (the tool table and the «No files were restored» words are read only for the program they were read for — r1307).
//   THE ANSWER: the normalizer routes the CLI's `vsf-` answer to ONE `rewind-files-answer` meta (src/message-manager.js); this
//   door listens once per conversation (the listener rides a history rebuild) and resolves the ask by its id; an answer nobody
//   waits for — late, or not ours — is dropped and said in the journal.
//   FILE TIMES: off the loop, bounded (STAT_MS each, JUDGE_MS all), at most MAX_FILES a confirm: this machine through a
//   ONE-WORKER file pool of this door's own (src/safe-fs.js: a stat on a storage that hangs ends its worker at the deadline —
//   never a thread of the hub's shared pool), behind the mount door; a paired machine through its agent's read-only `fs-op
//   stat` (dm.fsStat — the M3 protocol every agent speaks, no capability names it; an answer that does not come in its bound,
//   or an agent that refuses it, = «could not be checked: unreadable») — its bound is the machine's connect (STAT_MS) and
//   then JUDGE_MS for the stats. The agent's edit times are the CLI's own result times (`resultAt`), the clock of the machine its files are on.
//   WHO: the person only — the page verdict at the socket's handshake (ws-handler `_personPage`) and {kind: 'human'}.
//   THE KEPT COPY (r1247 (2), r1304, r1327 — src/server/rewind-kept-door.js): the confirm says each file that cannot be kept
//   (and then draws «the conversation only»); the press KEEPS every listed file before the CLI's rewind_files and goes only when
//   every copy is kept and read back — a keep that fails refuses `not-kept` with nothing sent. The result names the copies.
//   DARK: the files choices are absent unless `session._fileCheckpoints === true` — the fact U1 sets when the CLI starts with the
//   switch (row B-437e U1, behind the owner's setting, off as shipped). Until then this door answers the conversation only.

const DOOR = require('../mount-door');
const { SafeFs } = require('../safe-fs'); // B-afc4: the blocked-path door — asked BEFORE a user-path read (a file on a storage that is not answering: unreadable)
const F = require('../rewind-files.js');
const { REWIND_REFUSALS } = require('../rewind-door.js');
const { capsOf } = require('../backend-caps.js');
const { rewindFilesRoad } = require('../harnesses/index.js');
const { cliVersionOf } = require('../cli-caps.js');
const { rewindStateOf, rewindOut, conversationOut, setFilesOut, filesOutOf, requestRewind } = require('./rewind-requests.js');
const KD = require('./rewind-kept-door.js');

const DRY_MS = 15000;          // one dry run of the CLI
const PRESS_MS = 60000;        // the press's answer (the CLI copies every file back before it answers)
const PRESS_HOLD_MS = 600000;  // a press not answered in PRESS_MS: the mark holds until its late answer, at most this
const STAT_MS = 2000;          // one file's time (and a paired machine's connect)
const JUDGE_MS = 5000;         // every file's time of one confirm
const WAITS = new WeakMap();          // conversation → Map(requestId → resolve)
const TAG = Symbol('rewind-files-answer');
let _statPool = null;          // this door's own one-worker file pool (lazy: built at the first local time it reads)
const statPool = () => _statPool || (_statPool = new SafeFs({ name: 'rewind-stat', poolSize: 1, timeouts: { default: STAT_MS } }));

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
async function askCli(session, body, { timeoutMs = DRY_MS, id = null, onLate = null } = {}) {
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
  if (answer === undefined) {   // no answer in its bound: a late one is dropped — or handed to `onLate` (a press still out)
    if (typeof onLate === 'function') w.set(out.requestId, onLate); else w.delete(out.requestId);
    return { sent: true, answered: false, answer: null, why: 'no-answer', requestId: out.requestId };
  }
  // ANSWERED — a body or none (the normalizer reads a success with no body as null: answered all the same, never a held mark)
  return { sent: true, answered: true, answer, why: answer == null ? 'no-answer' : null, requestId: out.requestId };
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
  if (!one) one = async (p) => { if (DOOR.blocked(p)) return null; const safeFs = statPool(); const st = await safeFs.call('stat', { path: p }, { timeoutMs: statMs }); return st && Number.isFinite(st.mtimeMs) ? st.mtimeMs : null; };
  // ONE AFTER ANOTHER under ONE bound (its reader: all at once on a one-worker pool spent each file's own bound in the queue):
  // each file at most STAT_MS, all of them at most JUDGE_MS — a file the bound did not reach is «could not be checked»
  const t0 = Date.now();
  const bounded = (p, left) => new Promise((resolve) => {
    let done = false;
    const tm = setTimeout(() => { if (!done) { done = true; resolve(null); } }, left);
    Promise.resolve().then(() => one(p)).then((m) => { if (!done) { done = true; clearTimeout(tm); resolve(typeof m === 'number' && Number.isFinite(m) ? m : null); } }, () => { if (!done) { done = true; clearTimeout(tm); resolve(null); } });
  });
  for (const p of list) {
    const left = Math.min(statMs, judgeMs - (Date.now() - t0));
    out[p] = left > 0 ? await bounded(p, left) : null;
  }
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

/** THE RECORDS REACH BACK TO THE CONVERSATION'S START (r1247): its history is loaded and its normalizer says its records began
 *  at the start — born in this hub (src/ws-create.js), or rebuilt from a transcript read from its first byte (normalizers.js
 *  rebuildHistory `fromStart`, the session store's span) */
const wholeOf = (session) => !!session && session._historyLoaded === true && !!session._normalizer && session._normalizer.recordsFromStart === true;
/** the conversation's CLI version as its init said it (cli-caps' spelling) — null when none was said */
const cliOf = (session) => { const n = session && session._normalizer; try { return cliVersionOf(n && typeof n._harnessVersion === 'function' ? n._harnessVersion() : null); } catch { return null; } };
/** the conversation's OWN init's skills (r1332 (6): a name there is a helper whatever the table says) — as the init said them
 *  (the judge fails closed on a shape it cannot read); null when none was said */
const skillsOf = (session) => { const n = session && session._normalizer, fr = n && n._initFrame; return fr && fr.skills != null ? fr.skills : null; };
/** what the confirm drew, in the shape the press compares (a page's malformed frame is no draw: changed-since, never a throw) */
const drawnOk = (d) => !!d && Array.isArray(d.files) && d.files.every((x) => typeof x === 'string') && Array.isArray(d.judged) && d.judged.every((x) => !!x && typeof x.path === 'string' && typeof x.state === 'string');

/** THE DRY RUN + THE JUDGE → {dry, judged} | {ok: false, reason, cls} */
async function judgeOf(session, f, { hosts = null, stat = null, dryMs = DRY_MS } = {}) {
  const ask = await askCli(session, F.filesRequestOf(f.msg.uuid, { dryRun: true }), { timeoutMs: dryMs });
  if (!ask.answer) { const why = ask.why || 'no-answer'; return { ok: false, reason: why, cls: F.FILES_REFUSALS[why] || REWIND_REFUSALS[why] || 'failed' }; }
  const dry = F.filesAnswerOf(ask.answer, { dryRun: true });
  if (!dry.ok || !dry.filesKnown || !dry.files.length) return { dry, judged: [] };
  const mtimes = await timesOf(session, dry.files, { hosts, stat });
  const judged = F.changedAfterOf(dry.files, { mtimes, edits: F.editsFromMessages(f.messages, { targetId: f.msg.id, whole: wholeOf(session), cli: cliOf(session), skills: skillsOf(session) }) });   // r1307: the table read only for its program; r1332 (6): its own skills
  return { dry, judged };
}

/** THE CONFIRM'S FACTS for one of the person's own messages → {ok, choices, default, files, plus, minus, said?} | a refusal.
 *  The files choices are drawn only where they can work (choicesOf); the conversation's own refusals are tier one's */
async function filesConfirmOf({ session, msgId, by, hosts = null, stat = null, dryMs = DRY_MS, now = Date.now(), conv = null, keepOpts = {} } = {}) {
  const f = factsOf(session, msgId, by);
  if (f.ok === false) return f;
  const plain = { ok: true, choices: ['conversation'], default: 'conversation', files: [], plus: 0, minus: 0 };
  if (session._fileCheckpoints !== true) return plain;   // DARK until U1: no files choice is ever drawn
  const v = F.filesVerdict(f.row, f.msg, { ...rewindStateOf(session), fileCheckpoints: session._fileCheckpoints === true }, 'conversation');
  if (!v.ok) return v;
  if (rewindOut(session, now)) return { ok: false, reason: 'pending', cls: REWIND_REFUSALS.pending };   // a rewind of either kind out
  const j = await judgeOf(session, f, { hosts, stat, dryMs });
  if (j.ok === false) return { ...plain, said: j.reason };   // the dry run did not answer: the conversation only, and why
  const choices = F.choicesOf({ checkpoints: true, dry: j.dry });
  if (choices.length === 1) return { ...plain, said: j.dry.ok ? (j.dry.filesKnown ? null : 'files-unknown') : j.dry.reason };
  const keep = await KD.keepableOf({ session, conv, files: j.dry.files, hosts, by, ...keepOpts });   // can every file be kept?
  const machine = keep.machine ? KD.machineNameOf(hosts, keep.machine) : null;   // r2245 (6): «kept on <that machine>», named
  return { ok: true, choices, default: keep.ok ? F.defaultChoiceOf(choices, j.judged) : 'conversation', files: j.judged, plus: j.dry.plus, minus: j.dry.minus, keep, machine };
}

/** THE PRESS with a choice → {ok, steps, outcome, results} | a refusal. «both» = tier one's dry run first (nothing written when
 *  the conversation step would be refused), the files, then the conversation; the files step asks the dry run again and refuses
 *  `changed-since` when it is not what the confirm drew (`drawn`) */
async function pressFiles({ session, msgId, by, choice, drawn = null, lastSeenUuid = null, expectTaken = null, reqId = null, conv = null, keepOpts = {}, hosts = null, stat = null, dryMs = DRY_MS, pressMs = PRESS_MS, holdMs = PRESS_HOLD_MS } = {}) {
  const f = factsOf(session, msgId, by);
  if (f.ok === false) return f;
  if (typeof choice !== 'string' || !Object.prototype.hasOwnProperty.call(F.STEPS, choice)) return { ok: false, reason: 'not-a-choice', cls: F.FILES_REFUSALS['not-a-choice'] };
  if (choice === 'conversation') {   // the conversation only: tier one's own door, as it is
    const r = requestRewind({ session, msgId, lastSeenUuid, by, expectTaken, reqId, now: Date.now() });
    return r.ok ? { ok: true, steps: F.STEPS.conversation, results: { conversation: { ...r, asked: true } }, outcome: F.outcomeOf(F.STEPS.conversation, { conversation: r }) } : { ...r, step: 'conversation' };   // r2245 (10): tier one's refusal, said in its words
  }
  if (session._fileCheckpoints !== true) return { ok: false, reason: 'files-off', cls: F.FILES_REFUSALS['files-off'] };   // DARK until U1
  if (conv == null) return { ok: false, reason: 'not-started', cls: 'cannot' };   // r4423: no addressable id yet (a pending fork) — nothing kept, nothing put back
  if (rewindOut(session, Date.now())) return { ok: false, reason: 'pending', cls: REWIND_REFUSALS.pending };
  if (F.STEPS[choice].includes('conversation')) {   // «both»: the conversation's whole verdict BEFORE anything is written
    const c = requestRewind({ session, msgId, lastSeenUuid, by, dryRun: true, now: Date.now() });
    if (!c.ok) return { ...c, step: 'conversation' };   // r2245 (10): the CONVERSATION's refusal — the page says it in tier one's words
    if (Number.isFinite(expectTaken) && expectTaken !== c.taken) return { ok: false, reason: 'changed-since', cls: REWIND_REFUSALS['changed-since'] || F.FILES_REFUSALS['changed-since'], step: 'conversation' };
  }
  const mark = { id: null, at: Date.now(), files: true, pty: session.pty || null };   // tied to the CLI process it waits on
  setFilesOut(session, mark);   // ONE REWIND AT A TIME: from here to the press's answer, every other rewind and the person's send wait
  let held = false;
  const release = () => { if (filesOutOf(session) === mark) setFilesOut(session, null); };
  try {
    const j = await judgeOf(session, f, { hosts, stat, dryMs });
    if (j.ok === false) return { ok: false, reason: j.reason, cls: j.cls };
    const v = F.filesVerdict(f.row, f.msg, { ...rewindStateOf(session), fileCheckpoints: session._fileCheckpoints === true }, choice, j.dry);
    if (!v.ok) return v;
    if (conversationOut(session, Date.now())) return { ok: false, reason: 'pending', cls: REWIND_REFUSALS.pending };   // one out while the dry run ran
    const now2 = { files: j.dry.files, judged: j.judged, plus: j.dry.plus, minus: j.dry.minus };
    if (!drawnOk(drawn) || !F.sameDrawOf(drawn, now2)) return { ok: false, reason: 'changed-since', cls: F.FILES_REFUSALS['changed-since'], files: j.judged, plus: j.dry.plus, minus: j.dry.minus };
    if (F.STEPS[choice].includes('conversation')) {   // its reader: the conversation asked AGAIN right before the files — what moved during the judge (an agent's own message) refuses here, nothing put back
      setFilesOut(session, null);   // this press's own mark aside for ONE synchronous dry run (no await between: nothing slips in)
      const c2 = requestRewind({ session, msgId, lastSeenUuid, by, dryRun: true, now: Date.now() });
      setFilesOut(session, mark);
      if (!c2.ok) return { ...c2, step: 'conversation' };
      if (Number.isFinite(expectTaken) && expectTaken !== c2.taken) return { ok: false, reason: 'changed-since', cls: REWIND_REFUSALS['changed-since'] || F.FILES_REFUSALS['changed-since'], step: 'conversation' };
    }
    mark.at = Date.now();   // the person's fence counts from the press itself (the dry run and the stats came before it)
    const results = {};
    // THE LAW (r1247 (2)): every listed file KEPT and read back before anything is put back — else nothing is sent
    const kept = await KD.keepFor({ session, conv, files: j.dry.files, hosts, by, ...keepOpts });
    if (!kept.ok) return { ok: false, reason: 'not-kept', cls: 'cannot', keep: kept.refusals };
    results.kept = { press: kept.press, where: kept.where, machine: kept.machine, check: kept.check, files: j.dry.files.length, msgAt: Number(f.msg.ts) || null };   // U3: its line counts them and says WHICH rewind (the message's time)
    try {   // r2245 (7): a throw AFTER the keep — the copy stands: the answer says what is known, and its line (afterFilesPress) is written
      const onLate = (answer) => {   // the press's answer after its bound: journalled, and the mark is released
        clearTimeout(hold);
        try { console.warn(`[rewind-files] the press's late answer (${String(mark.id).slice(0, 40)}): ${JSON.stringify(answer).slice(0, 200)}`); } catch { }
        release();
      };
      let hold = null;
      const ask = await askCli(session, F.filesRequestOf(f.msg.uuid), { timeoutMs: pressMs, onLate });
      mark.id = ask.requestId || null;
      if (ask.sent && !ask.answered) {   // not answered in its bound: the CLI may still be writing — the mark HOLDS (bounded)
        held = true;
        hold = setTimeout(() => { const w = WAITS.get(session); if (w && mark.id) w.delete(mark.id); release(); }, holdMs);
        if (hold && typeof hold.unref === 'function') hold.unref();
      }
      const a = ask.answer ? F.filesAnswerOf(ask.answer) : { ok: false, reason: ask.why, cls: 'failed', text: null };
      results.files = { ...a, sent: ask.sent };
      if (v.steps.includes('conversation') && results.files.ok) {
        release();   // the files are back: the conversation step is tier one's own press (its own mark, its own checks)
        const r = requestRewind({ session, msgId, lastSeenUuid, by, expectTaken, reqId, now: Date.now() });   // the page's own id (tier one's: bound before it sends)
        results.conversation = r.ok ? { ...r, asked: true } : r;
      }
      return { ok: true, steps: v.steps, results, outcome: F.outcomeOf(v.steps, results, { cli: cliOf(session) }) };
    } catch (e) {
      try { console.warn(`[rewind-files] the press failed after its keep (${String((e && (e.code || e.message)) || e).slice(0, 120)}) — the copy stands`); } catch { }
      return { ok: false, reason: 'door-failed', cls: 'failed', results, outcome: F.outcomeOf(v.steps, results, { cli: cliOf(session) }) };
    }
  } finally { if (!held) release(); }
}

module.exports = { filesConfirmOf, pressFiles, askCli, timesOf, hear, wholeOf, DRY_MS, PRESS_MS, PRESS_HOLD_MS, STAT_MS, JUDGE_MS };
