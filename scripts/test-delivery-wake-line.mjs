#!/usr/bin/env node
// test-delivery-wake-line.mjs — the manager design's piece 7 (主开发 2026-11-17; narrowed 04:56Z / 05:02Z / 05:13Z): DELIVERIES
// RESUME THEIR ADDRESSEE, in process over the REAL parts — the ladder and its retry park (src/server/conversation-deliver.js:
// the `ended` rung), the hand-over (src/server/stash-handover.js claimForWake / handOverWake), the hub's ONE LINE
// (src/server/resume-line.js) and the start that runs on it (src/server/delivery-wake.js), the groups engine — over a stub inbox
// (a post = ONE input frame), a stub spend guard (its probe is recorded with `hold`), a stub resume road and kept records.
//   ① a RESTART-ended conversation: the guard asked as a PROBE (no hold) BEFORE the resume; ONE resume (by «VibeSpace, by
//      itself»); ONE input frame carrying the words and the design's last sentence; ONE ledger row; the line the window shows
//      — RED CONTROL: the spend ceiling exhausted ⇒ nothing resumes, nothing is posted or charged, the words keep waiting
//   ② the account at its limit ⇒ it waits and says until when; the guard is not asked, nothing resumes
//   ③ ended ON PURPOSE (a person's Terminate, an agent's end — alike): a delivery WITHOUT the grant waits — RED CONTROL: the
//      restart road applied to the same delivery resumes; WITH the grant it resumes, and the line names who allowed it (the
//      person, a manager key by name); no record at all waits even with the grant; archived never reaches the line
//   ④ THE STORM: 30 results for one conversation + 5 for five others ⇒ ONE owed wake each, at most TWO resumes at a time,
//      each conversation ONE frame
//   ⑤ A RESTART between the claim and the post delivers ONCE (the claim stamp released at boot; the park offers the wake again)
//   ⑥ the groups producer: a wake naming ONE stopped member is owed (a BARE hand-over: the group report rides the turn it
//      starts), the sender holds «owed»; a fan-out and a message without a wake only wait, said
//   (主开发 12:46Z, the cure round) ⑦ MONEY: an active goal / a timer mark / an unknown goal each WAIT — no probe, no resume, no
//      charge (RED CONTROL: the same delivery with no goal resumes) · ⑧ the kept record GOES on a resume: ended later by the
//      manager, an ungranted job waits · ⑨ ALREADY running: no hand-over, no «had been ended» into a live agent · ⑩ WHICH ACCOUNT:
//      the stated one is judged and handed to the reopen · ⑪ an unreadable limit waits · ⑫ a hand-over refused after the resume
//      leaves its line · ⑬ a wake that JOINS a key's resume looks again · ⑭ the REAL jobs engine into the park; a nested grant is
//      no grant · ⑮ the key's verb: reach first, with the owner's Task Groups
//   (place-8, 主开发 2026-11-20 03:35Z / 03:44Z) ㉑ the hand-over waits for THE RESUMED SESSION's inbox (a CLI answers once it started,
//      never at «created»), OFF the line; a miss gives the claim back and says it by name — RED CONTROLS: the wait removed (the
//      box's «no live inbox» after a reopen), the wait put back ON the line (a slow CLI holds another conversation's resume)
//      (主开发 04:07Z, NOT TAKEN → cured) ㉑ a start answering AFTER the line's bound still ends its claim (RED: the rest started only by
//      its asker); a delivery never reopens a kind that takes no message mid-session (RED: the row before); the belt after a reopen;
//      a pty exited with its socket alive is not «gone» (RED: the old rule); one registry read a tick shared by every wait
//      (主开发 04:50Z) …and the late start's own end is RECORDED — delivered, the ended row cleared (RED: the late end not written)
//   ㉒ the jobs engine's 30 s floor paces SOCKET posts: a floored delivery to an ENDED owner still owes its wake — RED CONTROL: the
//      owing line removed (the box's P and A at their second fire: «rate floor — queued for injection instead», never resumed)
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 700) : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DELIVER = require(path.join(REPO, 'src/server/conversation-deliver.js'));
const SH = require(path.join(REPO, 'src/server/stash-handover.js'));
const RL = require(path.join(REPO, 'src/server/resume-line.js'));
const DWO = require(path.join(REPO, 'src/server/delivery-wake.js'));
const D = require(path.join(REPO, 'src/delivery-wake.js'));
const GE = require(path.join(REPO, 'src/server/groups-engine.js'));
const AR = require(path.join(REPO, 'src/agent-routes.js'));
const JM_MODEL = require(path.join(REPO, 'src/job-model.js'));
const { createChannelStore } = require(path.join(REPO, 'src/channel-store.js'));
const { JobManager } = require(path.join(REPO, 'src/jobs.js'));
const ROOT = scratchDir('dwl');
process.on('exit', () => { try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch { } });
const T0 = 1_790_000_000_000;
const cidOf = (n) => `bbbbbbbb-0000-4000-8000-${String(n).padStart(12, '0')}`;
const RESTART = { stopReason: 'dead-socket-at-boot', stoppedAt: T0 - 60e3 };
// the stores chain's two roads (主开发 02:59Z): the wiring's gate both reopening roads pass, compiled from its source (its lines whole)
const WIRE_SRC = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8'), DELIVER_SRC = fs.readFileSync(path.join(REPO, 'src/server/conversation-deliver.js'), 'utf8');
const MJ_DWL = mutantCopies('dwl-readopt', REPO);
const lineOfSrc = (src, head) => { const i = src.indexOf(head); if (i < 0) throw new Error('not found: ' + head); return src.slice(i, src.indexOf('\n', i)); };
const gateOf = (wire, deliver) => new Function('deliver', `let adoptedNow = null; ${lineOfSrc(wire, 'let remoteSettled = false;')}\n${lineOfSrc(wire, 'const REMOTE_READOPT_WORDS = ')}\n${lineOfSrc(wire, 'const resumeRoad = { reopen: null, kept: null, adopted:')}\n${lineOfSrc(wire, 'const reopenRoads = ')}\nreturn { resumeRoad, reopenRoads };`)(deliver);   // eslint-disable-line no-new-func
const PERSON = { stopReason: 'ended', stoppedAt: T0 - 60e3, endedBy: { kind: 'person', by: 'person' } };
const AGENT = { stopReason: 'ended', stoppedAt: T0 - 60e3, endedBy: { kind: 'agent', by: 'agent:c0', name: 'coordinator' } };
let seq = 0;

/** the rig: the REAL ladder + park + hand-over + line + start; ONE manual clock for the park; `live` = the conversations running */
function rig(name, { hosts = null, gateWire = null, deliverMod = DELIVER, dir = null, kept = {}, grants = {}, archived = new Set(), cap = null, limit = null, reopenHold = null, facts = {}, stated = {}, limitOf = null, refuseHandOver = false, already = new Set(), jobs = null, mod = DWO, postHook = null, backendOf = {}, rows = null, held = {}, cli = {}, tick = 0, clock = null, lineBound = null } = {}) {
  const dataDir = dir || path.join(ROOT, name + '-' + (++seq));
  fs.mkdirSync(dataDir, { recursive: true });
  const c = { now: T0, timers: [] };
  const retryClock = { now: () => c.now, setTimeout: (fn, ms) => { const t = { at: c.now + Math.max(0, ms), fn }; c.timers.push(t); return t; }, clearTimeout: (t) => { const i = c.timers.indexOf(t); if (i >= 0) c.timers.splice(i, 1); } };
  const sessions = new Map(), live = new Set();
  const R = { c, dataDir, sessions, live, posts: [], notes: [], auths: [], probes: [], calls: [], reopens: [], lines: [], wakes: [], logs: [], inReopen: 0, maxInReopen: 0, kept, grants, archived, inboxAsks: [], slept: [], sleepGate: null, sockets: new Set(), registryReads: 0 };
  const log = (...a) => R.logs.push(a.join(' '));
  R.deliver = deliverMod.create({
    dataDir, activeSessions: sessions, serverSetting: () => undefined, retryClock, log, renderBatch: AR.renderMsgStash,
    peerMsg: {
      findPeer: (cid) => (live.has(cid) ? { name: cid, socketPath: '/dev/null' } : null),
      postToPeer: async (peer, text) => { R.posts.push({ cid: peer.name, text }); if (postHook) return postHook(peer.name, text); return { ok: true, phase: 'written' }; },
      postChannelEvent: async () => ({ ok: false }),
    },
    getHosts: () => null, getConvIndex: () => null, emitPeerCard: () => true,
    authorizeSpend: (q) => { R.auths.push({ reason: q.reason, cid: q.cid }); if (refuseHandOver) return { ok: false, why: 'per-identity-hour', detail: 'the hour cap reached at the hand-over' }; return { ok: true, identity: { key: 'slot-1', name: 'Personal' }, hold: { id: 'h' + R.auths.length } }; },
    noteSpend: (q) => { R.notes.push({ reason: q.reason, cid: q.cid }); }, releaseSpend: () => { },
  });
  R.deliver.onRetry?.((ev, cid, e, extra) => { if (ev === 'wake') R.wakes.push({ cid, ...extra }); });
  R.jm = typeof jobs === 'function' ? jobs(R) : null;
  R.view = SH.create({ activeSessions: sessions, getDeliver: () => R.deliver, getJobs: () => R.jm, broadcastSessions: () => { }, renderMsgStash: AR.renderMsgStash, renderNotifStash: JM_MODEL.renderNotifStash, debounceMs: 5, log: { log() { }, warn() { } }, now: () => c.now, dataDir });
  R.line = RL.createResumeLine({ start: (e) => (e.payload && typeof e.payload.run === 'function' ? e.payload.run(e) : { ok: false, why: 'no start' }), log: () => { }, ...(lineBound ? { startBoundMs: lineBound } : {}) });
  // the CLI registry's ids, ONE shared read a tick (`tick` null = the module's own tick; 0 = a read at every ask); `clock` = its time
  R.registryIds = (mod.sharedRegistryIds || DWO.sharedRegistryIds)({ read: () => { R.registryReads++; return new Set(live); }, ...(tick === null ? {} : { tickMs: tick }), clock: clock || (() => R.slept.reduce((a, b) => a + b, 0)) });
  R.reopenRoad = async (item, o) => {
    const cid = item.sessionKey.slice(item.sessionKey.indexOf(':') + 1);
    R.calls.push('reopen'); R.reopens.push({ cid, by: o && o.by, accountId: (o && o.accountId) || null });
    if (already.has(cid)) { live.add(cid); sessions.set('w-' + cid, { claudeSessionId: cid, backendSessionId: cid, name: 'running', mode: 'chat', backend: 'claude' }); return { ok: true, sessionId: 'w-' + cid, already: true }; }
    R.inReopen++; R.maxInReopen = Math.max(R.maxInReopen, R.inReopen);
    try { if (reopenHold) await reopenHold(cid); else await sleep(5); } finally { R.inReopen--; }
    if (!cli[cid]) live.add(cid);   // place-8: a CLI with a plan opens its inbox when its plan says (inboxOf below)
    sessions.set('w-' + cid, { claudeSessionId: cid, backendSessionId: cid, name: 'resumed', mode: 'chat', backend: backendOf[cid] || 'claude' });
    return { ok: true, sessionId: 'w-' + cid };
  };
  // the stores chain's two roads (主开发 02:59Z): the wiring's ONE gate both reopening roads pass, compiled from its source over this park
  if (gateWire) { R.gate = gateOf(gateWire, R.deliver); R.gate.resumeRoad.reopen = (item, o) => R.reopenRoad(item, o); }
  R.orch = mod.create({
    resumeLine: R.line, getStashHandover: () => R.view, now: () => c.now,
    seams: {
      keyOf: (cid) => ({ sessionKey: `${backendOf[cid] || 'claude'}:${cid}` }),
      // piece 4's reader's shape: the record's facts AND how it ended / who pays (the ORCH reads the kept record only through it)
      factsOf: async (key) => { const c = key.slice(key.indexOf(':') + 1); R.calls.push('kept'); const k = R.kept[c] || null; return { goal: 'none', timerMark: null, queue: 0, mode: 'chat', cwd: '/w', hostId: (hosts && hosts[c]) || null, kept: !!k, stopReason: (k && k.stopReason) || null, stoppedAt: (k && k.stoppedAt) || null, endedBy: (k && k.endedBy) || null, accountId: (k && k.accountId) || null, ...(facts[c] || {}) }; },
      heldAccountOf: (key) => held[key.slice(key.indexOf(':') + 1)] || null,
      configAccountOf: (key) => stated[key.slice(key.indexOf(':') + 1)] || null,
      // no real wake drops a kept record since 主开发's 2026-11-19 03:25Z ruling: this seam only SEES ⑧'s RED (the drop put back)
      dropKept: async (key) => { const c = key.slice(key.indexOf(':') + 1); R.calls.push('dropKept'); const had = c in R.kept; delete R.kept[c]; return had; },
      isArchived: (key) => R.archived.has(key.slice(key.indexOf(':') + 1)),
      rowOf: (backend) => (rows && Object.hasOwn(rows, backend) ? rows[backend] : { headless: true, resumeContinues: 'goal' }),
      reopen: async (item, o) => (R.gate ? R.gate.reopenRoads(item, o) : R.reopenRoad(item, o)),
      noteResumed: (sid, line) => R.lines.push({ sid, line }),
      markPosting: (cid) => R.deliver.markEndedPosting(cid),
      // place-8: THE RESUMED SESSION's inbox, through the wiring's own reader over this ladder; `cli[cid]` = when its CLI opens it
      // ({after: n} looks · {never} · {ends}: the session ends first) — none: open at «created» (the stub reopen adds it)
      inboxOf: (cid, sid) => {
        const plan = cli[cid] || null; R.inboxAsks.push(cid);
        if (plan && plan.ends) sessions.delete(sid);
        if (plan && Number.isInteger(plan.after) && R.inboxAsks.filter((x) => x === cid).length > plan.after) live.add(cid);
        // {reattach: n}: its attach pty exited while its socket still answers (the re-attach window) for n looks, then its CLI is up
        if (plan && Number.isInteger(plan.reattach) && sessions.get(sid)) {
          const ss = sessions.get(sid);
          if (R.inboxAsks.filter((x) => x === cid).length <= plan.reattach) { ss.pty = null; ss.socketPath = 'sock-' + cid; R.sockets.add(ss.socketPath); }
          else { ss.pty = {}; live.add(cid); }
        }
        return (mod.inboxOfOver || DWO.inboxOfOver)({ deliver: () => R.deliver, activeSessions: sessions, isSocket: (q) => R.sockets.has(q), registryIds: R.registryIds })(cid, sid);
      },
      noteLateWake: (cid, entry, a) => R.deliver.noteLateWake(cid, entry, a),   // the wiring's seam: a late start's own end, on the ladder's record
    },
    spendGuard: { authorize: (q) => { R.calls.push('probe'); R.probes.push({ reason: q.reason, hold: q.hold, identity: q.identity && q.identity.key }); return cap ? { ok: false, why: 'per-identity-hour', detail: cap } : { ok: true }; } },
    identityOf: () => { R.calls.push('identity'); return { key: 'slot-1', name: 'Personal' }; },
    quotaVerdictFor: (scope) => { R.calls.push('limit:' + scope); if (typeof limitOf === 'function') return limitOf(scope); return limit ? { usable: false, blockedUntil: limit } : { usable: true }; },
    usageCacheKeyFor: (payer) => (payer && payer._accountId) || 'k-1',
    jobGrantOf: (id) => R.grants[id] || { granted: false, by: null },
    sleep: (ms) => { R.slept.push(ms); return R.sleepGate || Promise.resolve(); },   // the wait's steps, counted (no wall clock); a gate holds them
    log,
  });
  R.deliver.registerEndedWake((cid, e) => R.orch.onEndedWake(cid, e));
  R.settle = async () => { for (let i = 0; i < 4; i++) { await R.deliver.settleRetries(3000); await sleep(2); } };
  R.advanceTo = async (to) => {
    for (;;) {
      c.timers.sort((x, y) => x.at - y.at);
      const t = c.timers[0];
      if (!t || t.at > to) break;
      c.timers.shift(); c.now = Math.max(c.now, t.at); t.fn(); await R.settle();
    }
    c.now = to; await R.settle();
  };
  R.at = (ms) => R.advanceTo(T0 + ms);
  /** a job result for an ended owner: the words stashed FIRST (durable), then the owed wake — the jobs producer's order */
  R.result = (cid, jobId, jobName, text) => {
    R.deliver.stashFor(cid, { source: 'agent', kind: 'notification', fromName: 'Background Work · ' + jobName, text });
    return R.deliver.parkEndedWake(cid, { producer: 'jobs', spendReason: 'job-notification', kind: 'notification', fromName: 'Background Work · ' + jobName, reason: 'done', meta: { jobId, jobName, wake: 'result' } });
  };
  R.framesTo = (cid) => R.posts.filter((p) => p.cid === cid);
  return R;
}

console.log('① a restart-ended conversation: the probe, then ONE resume, ONE frame, ONE ledger row, the seen line');
{
  const X = cidOf(1);
  const R = rig('restart', { kept: { [X]: RESTART } });
  const p = R.result(X, 'jb-n1', 'nightly report', 'nightly report finished: 3 files');
  ok(p.parked === true && R.deliver.endedEntries(X).length === 1, 'the words stashed, then the conversation is owed ONE wake (the park\'s ended rung)', p);
  await R.at(10);
  const iProbe = R.calls.indexOf('probe'), iReopen = R.calls.indexOf('reopen');
  ok(iProbe >= 0 && iReopen > iProbe && R.probes.length === 1 && R.probes[0].hold === false && R.probes[0].reason === 'job-notification',
    'the spend guard is asked as a PROBE (no hold) under the producer\'s own reason — BEFORE the resume', { calls: R.calls, probes: R.probes });
  ok(R.reopens.length === 1 && R.reopens[0].by === 'system:deliveries', 'ONE resume, by «VibeSpace, by itself» (never a person)', R.reopens);
  const fr = R.framesTo(X);
  ok(fr.length === 1 && fr[0].text.includes('nightly report finished') && fr[0].text.includes(D.FRAME_TAIL), 'ONE input frame: the words that waited, ending with the design\'s sentence', fr.map((f) => f.text.slice(-260)));
  ok(R.notes.length === 1 && R.notes[0].reason === 'job-notification', 'ONE ledger row, under the producer\'s reason (the hand-over\'s charge — the resume charges nothing)', R.notes);
  ok(R.deliver.stashCount(X) === 0 && R.deliver.endedEntries(X).length === 0 && R.wakes.some((w) => w.cid === X && w.outcome === 'delivered'), 'the stash drained, the owed wake ended, the producers told «delivered»', { stash: R.deliver.stashCount(X), wakes: R.wakes });
  const ln = R.lines[0] && R.lines[0].line;
  ok(!!ln && ln.key === 'Resumed {when} to deliver: {what}' && ln.params.what === 'nightly report' && ln.at >= T0 && ln.at <= R.c.now && ln.rule === 'restart' && !ln.by, 'rule 3: the resumed session carries the line its window shows — what resumed it and when', R.lines);

  const Y = cidOf(2);
  const C = rig('cap', { kept: { [Y]: RESTART }, cap: 'the hour\'s 30 unattended turns on Personal are spent' });
  C.result(Y, 'jb-n2', 'nightly report', 'nightly report finished');
  await C.at(10);
  ok(C.probes.length === 1 && C.reopens.length === 0 && C.posts.length === 0 && C.notes.length === 0 && C.deliver.stashCount(Y) === 1,
    '① RED CONTROL: the spend ceiling exhausted ⇒ the probe refuses — nothing resumes, nothing is posted or charged, the words keep waiting', { probes: C.probes, reopens: C.reopens, posts: C.posts.length });
  ok(C.wakes.some((w) => w.cid === Y && w.outcome === 'refused' && w.code === 'spend' && /30 unattended/.test(w.why)), '…and the producers hear «refused», the guard\'s own words', C.wakes);
  const wy = C.view.waitingAll()[Y], wx = R.view.waitingAll()[X];
  ok(!!wy && wy.n === 1 && wy.code === 'spend' && wx === undefined, 'the ENDED row\'s fact: «1 notice is waiting — not resumed: the spend ceiling» (the refusal\'s code); a delivered one has none', { wy, wx });
}

console.log('② the account at its limit waits, and says until when');
{
  const X = cidOf(3), until = T0 + 3 * 3600e3;
  const R = rig('limit', { kept: { [X]: RESTART }, limit: until });
  R.result(X, 'jb-l', 'nightly report', 'done');
  await R.at(10);
  ok(R.probes.length === 0 && R.reopens.length === 0 && R.posts.length === 0, 'the guard is not asked, nothing resumes', { calls: R.calls });
  ok(R.wakes.some((w) => w.cid === X && w.outcome === 'refused' && w.code === 'limit' && w.until === until), 'the answer says the limit and UNTIL WHEN (the row reads it)', R.wakes);
  const w = R.view.waitingAll()[X];
  ok(!!w && w.n === 1 && w.code === 'limit' && w.until === until, '…the row\'s fact carries the limit and until when (the page words it in the viewer\'s zone)', w);
}

console.log('③ ended on purpose: only a delivery carrying the grant resumes it');
{
  const P = cidOf(4);
  const R = rig('person', { kept: { [P]: PERSON } });
  R.result(P, 'jb-sched', 'morning digest', 'the morning digest is ready');
  await R.at(10);
  ok(R.reopens.length === 0 && R.posts.length === 0 && R.probes.length === 0 && R.deliver.stashCount(P) === 1, 'a schedule WITHOUT the grant at a PERSON-ended conversation: nothing starts, nothing is asked of the guard, the words wait', { calls: R.calls });
  ok(R.wakes.some((w) => w.cid === P && w.code === 'ended_on_purpose' && /on purpose by a person/.test(w.why)), '…and the journal hears it was ended on purpose, and by whom', R.wakes);
  ok((R.view.waitingAll()[P] || {}).code === 'ended_on_purpose' && R.view.waitingAll()[P].n === 1, '…and its row says «1 notice is waiting — not resumed: ended on purpose»', R.view.waitingAll()[P]);
  const Rc = rig('person-control', { kept: { [P]: RESTART } });
  Rc.result(P, 'jb-sched', 'morning digest', 'the morning digest is ready');
  await Rc.at(10);
  ok(Rc.reopens.length === 1 && Rc.framesTo(P).length === 1, '③ RED CONTROL: the restart road applied to the same delivery resumes it — how it ended is what kept it waiting', { reopens: Rc.reopens });
  const G = rig('person-granted', { kept: { [P]: PERSON }, grants: { 'jb-sched': { granted: true, by: { kind: 'person', by: 'person', at: T0 - 9e5 } } } });
  G.result(P, 'jb-sched', 'morning digest', 'the morning digest is ready');
  await G.at(10);
  const gl = G.lines[0] && G.lines[0].line;
  ok(G.reopens.length === 1 && G.framesTo(P).length === 1 && G.notes.length === 1 && !!gl && /you allowed it/.test(gl.key) && gl.by && gl.by.kind === 'person' && gl.rule === 'granted' && gl.jobs[0] === 'jb-sched', 'the same schedule WITH the person\'s grant resumes it ONCE, and the window\'s line says the person allowed it', { reopens: G.reopens, lines: G.lines });
  const A = cidOf(5);
  const Ag = rig('agent', { kept: { [A]: AGENT } });
  Ag.result(A, 'jb-build', 'build', 'build failed');
  await Ag.at(10);
  const Ak = rig('agent-key', { kept: { [A]: AGENT }, grants: { 'jb-build': { granted: true, by: { kind: 'key', by: 'automation:ak-1', name: 'dispatch' } } } });
  Ak.result(A, 'jb-build', 'build', 'build failed');
  await Ak.at(10);
  const kl = Ak.lines[0] && Ak.lines[0].line;
  ok(Ag.reopens.length === 0 && Ag.wakes.some((w) => w.code === 'ended_on_purpose' && /coordinator/.test(w.why)) && Ak.reopens.length === 1 && !!kl && kl.params.by === 'dispatch' && kl.by && kl.by.kind === 'key',
    'an AGENT-ended conversation: its job WITHOUT the grant waits (the agent named); WITH a manager key\'s grant it resumes and the line names the key', { waits: Ag.wakes, line: kl });
  const U = cidOf(6);
  const Un = rig('unknown', { grants: { 'jb-u': { granted: true, by: { kind: 'person' } } } });
  Un.result(U, 'jb-u', 'sync', 'sync done');
  await Un.at(10);
  ok(Un.reopens.length === 0 && Un.wakes.some((w) => w.code === 'ended_unknown'), 'no record of how it ended ⇒ it waits even with the grant (unknown is not a restart)', Un.wakes);
  const Z = cidOf(7);
  const Ar = rig('archived', { kept: { [Z]: RESTART }, archived: new Set([Z]) });
  Ar.result(Z, 'jb-z', 'z', 'z done');
  await Ar.at(10);
  ok(Ar.reopens.length === 0 && Ar.calls.length === 0 && Ar.wakes.some((w) => w.code === 'archived'), 'an ARCHIVED conversation never reaches the line', { calls: Ar.calls, wakes: Ar.wakes });
}

console.log('④ the storm: 30 + 5 results, at most two resumes at a time');
{
  const S = cidOf(10), five = [11, 12, 13, 14, 15].map(cidOf);
  const kept = { [S]: RESTART }; for (const f of five) kept[f] = RESTART;
  const R = rig('storm', { kept, reopenHold: () => sleep(15) });
  const parks = [];
  for (let i = 0; i < 30; i++) parks.push(R.result(S, 'jb-s' + i, 'shard ' + i, `shard ${i} finished`));
  for (const f of five) parks.push(R.result(f, 'jb-' + f.slice(-2), 'job ' + f.slice(-2), 'done'));
  ok(parks.slice(1, 30).every((p) => p.merged === true) && R.deliver.endedEntries(S).length === 1 && R.deliver.endedEntries(S)[0].deliveries === 30, 'thirty results for ONE conversation ride ONE owed wake (deliveries: 30)', R.deliver.endedEntries(S).map((e) => e.deliveries));
  await R.at(10);
  await R.at(20);
  ok(R.reopens.length === 6 && R.maxInReopen <= 2 && R.maxInReopen >= 1, `six resumes in all, at most TWO at a time (the line's own bound; seen at once: ${R.maxInReopen})`, { reopens: R.reopens.length, max: R.maxInReopen });
  ok([S, ...five].every((x) => R.framesTo(x).length === 1) && R.notes.length === 6, 'each conversation ONE frame, ONE ledger row each (six in all)', { frames: [S, ...five].map((x) => R.framesTo(x).length), notes: R.notes.length });
}

console.log('⑤ a restart between the claim and the post delivers once');
{
  const X = cidOf(20);
  const dir = path.join(ROOT, 'restart-mid');
  let hung = false;
  const R1 = rig('mid1', { dir, kept: { [X]: RESTART }, reopenHold: () => { hung = true; return new Promise(() => { }); } });
  R1.result(X, 'jb-m', 'migration', 'the migration finished');
  R1.c.now = T0 + 10; for (const t of R1.c.timers.splice(0)) t.fn();
  for (let i = 0; i < 50 && !hung; i++) await sleep(5);
  ok(hung && R1.posts.length === 0, 'the first hub claimed the words and died inside the resume — nothing was posted', { hung, posts: R1.posts.length });
  const R2 = rig('mid2', { dir, kept: { [X]: RESTART } });
  await R2.at(20);
  const all = [...R1.posts, ...R2.posts].filter((p) => p.cid === X);
  ok(all.length === 1 && all[0].text.includes('the migration finished') && R2.deliver.stashCount(X) === 0, 'the next boot offers the wake again: ONE frame across both hubs, the words in it once, the stash drained', { frames: all.length, stash: R2.deliver.stashCount(X) });
}

console.log('⑥ the groups producer');
{
  const A = cidOf(30), B = cidOf(31), C = cidOf(32), Dd = cidOf(33);
  const R = rig('groups', { kept: { [B]: RESTART, [C]: PERSON } });
  R.live.add(A);
  const NAMES = { [A]: 'alpha', [B]: 'beta', [C]: 'gamma', [Dd]: 'delta' };
  const roster = Object.entries(NAMES).map(([cid, n]) => ({ cid, name: n, groups: ['tg1'], reachability: null }));
  const store = createChannelStore({ dir: path.join(R.dataDir, 'channels'), log: { info() { }, warn() { }, log() { } } });
  const eng = GE.create({ store, deliver: R.deliver, broadcast: () => { }, now: () => R.c.now, paceClock: () => R.c.now, roster: () => roster, groupSetting: () => 'none', log: { info() { }, warn() { }, log() { } } });
  const one = await eng.sendToAgent({ from: A, to: 'beta', text: 'please pick up the review', wake: true });
  const held = (one.refused || []).find((x) => x.member === B);
  ok(one.ok && !!held && held.parked === true && held.reason === D.senderWords('owed') && R.deliver.endedEntries(B).length === 1 && R.deliver.endedEntries(B)[0].producer === 'groups',
    'a wake naming ONE stopped member is OWED (producer groups, the pace\'s own reason) — the sender holds «owed», said whole', { refused: one.refused, ended: R.deliver.endedEntries(B).map((e) => e.producer) });
  await R.at(10);
  const fb = R.framesTo(B);
  ok(R.reopens.some((r) => r.cid === B) && fb.length === 1 && /a message with a wake/.test(fb[0].text) && fb[0].text.includes(D.FRAME_TAIL) && !fb[0].text.includes('please pick up the review'),
    'restart-ended ⇒ resumed with a BARE hand-over: ONE frame that says who woke it — the message itself rides the turn\'s group report, never copied into the frame', fb.map((f) => f.text));
  const two = await eng.sendToAgent({ from: A, to: 'gamma', text: 'and you, the tests', wake: true });
  await R.at(20);
  ok(!R.reopens.some((r) => r.cid === C) && R.wakes.some((w) => w.cid === C && w.code === 'ended_on_purpose'), 'a peer\'s wake never resumes a conversation ended ON PURPOSE (no grant is a peer\'s)', { two: two.refused, wakes: R.wakes.filter((w) => w.cid === C) });
  const g = await eng.create({ by: A, name: 'crew', members: ['beta', 'gamma', 'delta'], quiet: true });
  R.live.delete(B); R.sessions.delete('w-' + B);
  const fan = await eng.post({ group: g.group.id, from: A, text: 'everyone: standup notes are in', wake: true });
  const fanned = (fan.refused || []).filter((x) => /member\(s\) are ended/.test(x.reason));
  ok(fanned.length >= 2 && fanned.every((x) => !x.parked) && R.deliver.endedEntries(Dd).length === 0, 'a FAN-OUT wake only waits: no owed wake, and the sender is told «k member(s) are ended; this rides their next turn»', fan.refused);
  const quiet = await eng.sendToAgent({ from: A, to: 'delta', text: 'no rush', wake: false });
  ok(quiet.ok && R.deliver.endedEntries(Dd).length === 0, 'a message with NO wake only waits — nothing is owed', R.deliver.endedEntries(Dd));
}

console.log('⑦ money: a delivery keeps piece 4\'s refusals — a goal runs many turns, a wake authorises one');
{
  const cases = [['goal_active', { goal: 'active' }], ['timer_marked', { timerMark: true }], ['goal_unknown', { goal: 'unknown' }]];
  for (const [code, f] of cases) {
    const X = cidOf(40 + cases.findIndex((c) => c[0] === code));
    const R = rig('money-' + code, { kept: { [X]: RESTART }, facts: { [X]: f } });
    R.result(X, 'jb-g', 'nightly report', 'nightly report finished');
    await R.at(10);
    ok(R.probes.length === 0 && R.reopens.length === 0 && R.posts.length === 0 && R.notes.length === 0 && R.wakes.some((w) => w.cid === X && w.code === code) && (R.view.waitingAll()[X] || {}).code === code,
      `${code}: the words WAIT — no probe, no resume, 0 frames, 0 charges; the ended row says why`, { calls: R.calls, notes: R.notes.length, wakes: R.wakes });
  }
  const X = cidOf(43);
  const C = rig('money-control', { kept: { [X]: RESTART }, facts: { [X]: { goal: 'none' } } });
  C.result(X, 'jb-g', 'nightly report', 'nightly report finished');
  await C.at(10);
  ok(C.reopens.length === 1 && C.notes.length === 1, '⑦ RED CONTROL: the same delivery with NO goal resumes it — one resume, ONE charge (the goal is what kept it waiting)', { reopens: C.reopens.length, notes: C.notes.length });
}

console.log('⑧ the kept record is NOT dropped at the reopen (主开发 2026-11-19 03:25Z) — a later end on purpose is still never «a restart ended it»');
{
  const X = cidOf(50);
  const R = rig('kept-stays', { kept: { [X]: RESTART } });
  R.result(X, 'jb-hourly', 'hourly digest', 'digest one');
  await R.at(10);
  ok(R.reopens.length === 1 && !R.calls.includes('dropKept') && R.kept[X] === RESTART, 'resumed by a delivery ⇒ its kept restart record is NOT dropped at the reopen (a reopen that answered is registration: a hand-over turn that fails keeps its copy)', { calls: R.calls, kept: Object.keys(R.kept) });
  delete R.kept[X];   // the hand-over turn RAN: boot-restore consumeKeptOf takes the copy at its end (server.js noteTurnEnd; test-dead-socket-keeps-chat-meta holds it)
  R.live.delete(X); R.sessions.delete('w-' + X);   // the manager ends it — first with no record…
  R.result(X, 'jb-hourly', 'hourly digest', 'digest two');
  await R.at(20);
  R.kept[X] = AGENT;   // …and with its end record (piece 3's keepEnded)
  R.result(X, 'jb-hourly', 'hourly digest', 'digest three');
  await R.at(30);
  ok(R.reopens.length === 1 && R.wakes.filter((w) => w.cid === X && (w.code === 'ended_unknown' || w.code === 'ended_on_purpose')).length === 2,
    'ended by the manager, the UNGRANTED hourly job waits — with no record (unknown) and with its «ended» record alike', R.wakes.filter((w) => w.cid === X));
  // ended on purpose BEFORE the hand-over turn ended (the copy still kept): its own record outranks the restart's copy (boot-restore
  // endRank; test-end-obeys-verdict holds it) — the ungranted job waits, «a restart ended it» is never read
  const Z = cidOf(58);
  const E = rig('ended-before-turn-end', { kept: { [Z]: RESTART } });
  E.result(Z, 'jb-hourly', 'hourly digest', 'digest one');
  await E.at(10);
  E.live.delete(Z); E.sessions.delete('w-' + Z); E.kept[Z] = AGENT;
  E.result(Z, 'jb-hourly', 'hourly digest', 'digest two');
  await E.at(20);
  ok(E.reopens.length === 1 && E.wakes.some((w) => w.cid === Z && w.code === 'ended_on_purpose'), 'an end on purpose before the hand-over turn ended: its record stands over the restart copy — the UNGRANTED job WAITS (never resumed again as «a restart ended it»)', E.wakes.filter((w) => w.cid === Z));
  // ⑧ RED: the drop PUT BACK at the reopen (piece 7's MUST 2 as it was), on the line where the start ends at the reopen (line
  // numbers kept; place-8 moved the posting mark off the line, into handOverResumed, where the conversation key is not in scope)
  const DWSRC = fs.readFileSync(path.join(REPO, 'src/server/delivery-wake.js'), 'utf8');
  const AT = "    // THE LINE'S PLACE ENDS AT THE REOPEN (place-8";
  if (DWSRC.split(AT).length !== 2) throw new Error('anchor missing: the start\'s end at the reopen');
  const MUTW = mutantCopies('wake-drop-put-back', REPO).load('src/server/delivery-wake.js', anchored(DWSRC, AT, "    try { if (typeof seams.dropKept === 'function') await seams.dropKept(key); } catch { } " + AT.trim(), 'drop-at-reopen'), 'drop-at-reopen');
  const Y = cidOf(57);
  const C = rig('drop-put-back', { kept: { [Y]: RESTART }, mod: MUTW });
  C.result(Y, 'jb-hourly', 'hourly digest', 'digest one');
  await C.at(10);
  ok(C.reopens.length === 1 && C.calls.includes('dropKept') && !(Y in C.kept), '⑧ RED CONTROL: the drop put back at the reopen — it ran (the plant took) and the kept copy is GONE at registration, before any turn ran', { calls: C.calls, kept: Object.keys(C.kept) });
}

console.log('⑨ a wake into a conversation that already runs');
{
  const X = cidOf(51);
  const R = rig('already', { kept: { [X]: RESTART }, already: new Set([X]) });
  R.result(X, 'jb-a', 'nightly report', 'nightly report finished');
  await R.at(10);
  ok(R.reopens.length === 1 && R.posts.length === 0 && R.notes.length === 0 && R.lines.length === 0 && !(R.view.waitingAll()[X] || {}).code && R.deliver.stashCount(X) === 1 && R.wakes.some((w) => w.cid === X && w.outcome === 'running'),
    'the reopen answers «already» ⇒ the claim goes back, NO hand-over («had been ended» never reaches a live agent), no charge, no resumed mark and no refusal note — the words ride its next turn', { posts: R.posts.length, lines: R.lines, stash: R.deliver.stashCount(X), wakes: R.wakes });
}

console.log('⑩ which account bills: the stated one is judged, and handed to the reopen');
{
  const X = cidOf(52), Y = cidOf(53);
  const R = rig('account', { kept: { [X]: { ...RESTART, accountId: 'acct-A' }, [Y]: { ...RESTART, accountId: 'acct-A' } }, stated: { [X]: 'acct-B', [Y]: 'acct-B' }, limitOf: (scope) => (scope === 'acct-B' && R.blockB ? { usable: false, blockedUntil: T0 + 7200e3 } : { usable: true }) });
  R.blockB = true;
  R.result(X, 'jb-x', 'x', 'x done');
  await R.at(10);
  ok(R.calls.includes('limit:acct-B') && !R.calls.includes('limit:acct-A') && R.reopens.length === 0 && R.wakes.some((w) => w.cid === X && w.code === 'limit'),
    'the conversation\'s STATED account (acct-B) is the one judged — at its limit it WAITS; the kept record\'s (acct-A) is never tried instead', { calls: R.calls, wakes: R.wakes });
  R.blockB = false;
  R.result(Y, 'jb-y', 'y', 'y done');
  await R.at(20);
  ok(R.reopens.length === 1 && R.reopens[0].accountId === 'acct-B', '…usable ⇒ the reopen is handed acct-B — the turn bills the account the gate judged, never another by this road', R.reopens);
}

console.log('⑪ an unreadable limit waits, said');
{
  const X = cidOf(54);
  const R = rig('unread', { kept: { [X]: RESTART }, limitOf: () => { throw new Error('the reading store threw'); } });
  R.result(X, 'jb-u', 'u', 'u done');
  await R.at(10);
  ok(R.probes.length === 0 && R.reopens.length === 0 && R.wakes.some((w) => w.cid === X && w.code === 'limit_unread' && /could not be read/.test(w.why)), 'the limit could not be READ ⇒ no probe, no resume — it waits with its own words', R.wakes);
}

console.log('⑫ a hand-over refused AFTER the resume leaves its line');
{
  const X = cidOf(55);
  const R = rig('ho-refused', { kept: { [X]: RESTART }, refuseHandOver: true });
  R.result(X, 'jb-h', 'nightly report', 'done');
  await R.at(10);
  const ln = R.lines[0] && R.lines[0].line;
  ok(R.reopens.length === 1 && R.posts.length === 0 && !!ln && ln.refused && ln.refused.code === 'spend' && R.deliver.stashCount(X) === 1 && R.wakes.some((w) => w.cid === X && w.outcome === 'refused'),
    'the ceiling refuses the hand-over after the resume ⇒ the now-live window says why (code spend), the words wait for its next turn', { lines: R.lines, stash: R.deliver.stashCount(X) });
}

console.log('⑬ a wake that joins a key\'s resume looks again');
{
  const X = cidOf(56);
  const R = rig('join', { kept: { [X]: RESTART } });
  let release; const hold = new Promise((r) => { release = r; });
  const key = R.line.submit({ target: `claude:${X}`, by: 'ak-1', payload: { run: async () => { await hold; R.live.add(X); R.sessions.set('w-' + X, { claudeSessionId: X, backendSessionId: X, name: 'by key', mode: 'chat', backend: 'claude' }); return { ok: true, sessionId: 'w-' + X }; } } });
  R.result(X, 'jb-j', 'nightly report', 'nightly report finished');
  const at = R.at(10);
  await sleep(30); release();
  await at; await key.result;
  await R.at(20);
  ok(R.reopens.length === 0 && R.posts.length === 0 && R.wakes.some((w) => w.cid === X && w.outcome === 'running') && R.deliver.stashCount(X) === 1,
    'the wake JOINED the key\'s resume: it waited for that answer, looked again, found it running — no second resume, no hand-over; the words ride its next turn', { wakes: R.wakes, reopens: R.reopens.length });
}

console.log('⑭ the REAL jobs engine into the park; a nested grant is no grant');
{
  const X = cidOf(60);
  const OWNX = { conversation: { id: X }, sessionId: 's-x', sessionCreatedAt: 1, groupsSnapshot: [] };
  const CALLER = { conversationId: X, sessionId: 's-x', sessionCreatedAt: 1, groups: new Set() };
  const R = rig('real-jobs', { kept: { [X]: RESTART }, jobs: (Rg) => {
    const jdir = path.join(Rg.dataDir, 'jobs'); fs.mkdirSync(jdir, { recursive: true });
    const jm = new JobManager({ dataDir: jdir, broadcast() { }, log() { }, notifyUser: () => ({ ok: true }), groupNotifyFor: () => null, notifyGlobal: () => true, peerReachable: (cid) => Rg.live.has(cid),
      deliverToConversation: (cid, text, opts) => Rg.deliver.deliverToConversation(cid, text, opts), onRetry: (fn) => Rg.deliver.onRetry(fn), parkEndedWake: (cid, o) => Rg.deliver.parkEndedWake(cid, o) });
    jm.init(); for (const t of jm._timers || []) clearInterval(t);
    return jm;
  } });
  const cr = R.jm.create({ kind: 'cron', name: 'standup-reminder', schedule: { everyMs: 3600e3 }, action: { type: 'notify', text: 'post the standup notes' }, owner: OWNX, access: { view: 'group', control: 'session' } }, CALLER);
  ok(!!cr.job, 'an agent registers a notify cron (the real engine)', cr.error);
  R.jm._fireCron(R.jm.jobs.get(cr.job.id), 'cron');
  for (let i = 0; i < 20 && !R.deliver.endedEntries(X).length; i++) await sleep(5);
  const owed = R.deliver.endedEntries(X)[0];
  ok(!!owed && owed.producer === 'jobs' && owed.metas[0].jobId === cr.job.id && R.jm.notifCount(X) === 1, 'its reminder for the ENDED owner: stashed in the engine\'s own store FIRST, then ONE owed wake on the park (producer jobs, the job named)', owed);
  await R.at(10);
  const fr = R.framesTo(X);
  ok(R.reopens.length === 1 && fr.length === 1 && fr[0].text.includes('post the standup notes') && R.jm.notifCount(X) === 0, 'restart-ended ⇒ resumed: ONE frame carrying the reminder, the engine\'s stash drained', fr.map((f) => f.text.slice(0, 200)));
  const nested = R.jm.create({ kind: 'cron', name: 'nightly-build', schedule: { everyMs: 3600e3 }, action: { type: 'spawn-task', task: { cmd: { argv: ['sh', '-c', 'true'] }, wakesEndedOwner: true, wakeGrantBy: { by: 'agent', kind: 'person' } } }, owner: OWNX, access: { view: 'group', control: 'session' } }, CALLER);
  const stored = nested.job && R.jm.jobs.get(nested.job.id);
  const run = stored && { ...stored.action.task, id: 'jb-run-planted', kind: 'task', name: 'nightly-build run', owner: OWNX, cronParent: stored.id, wakesEndedOwner: true };
  if (run) R.jm.jobs.set(run.id, run);
  ok(!!stored && !('wakesEndedOwner' in stored.action.task) && !('wakeGrantBy' in stored.action.task) && R.jm.wakeGrantOf(stored.id).granted === false && R.jm.wakeGrantOf('jb-run-planted').granted === false,
    'a grant NESTED in a schedule\'s task registers as not granted: the stored task drops both fields, and a run that carries one is read through its schedule only', stored && stored.action);
}

console.log('⑮ the key\'s verb: reach first, with the owner conversation\'s Task Groups');
{
  const dir = path.join(ROOT, 'verb-jobs'); fs.mkdirSync(dir, { recursive: true });
  const jm = new JobManager({ dataDir: dir, broadcast() { }, log() { }, notifyUser: () => ({ ok: true }), groupNotifyFor: () => null, notifyGlobal: () => true, peerReachable: () => false, deliverToConversation: async () => ({ ok: false }) });
  jm.init(); for (const t of jm._timers || []) clearInterval(t);
  const O = cidOf(70);
  const own = { conversation: { id: O }, sessionId: 's-o', sessionCreatedAt: 1, groupsSnapshot: [] };
  const cron = jm.create({ kind: 'cron', name: 'weekly', schedule: { everyMs: 3600e3 * 24 }, action: { type: 'notify', text: 'w' }, owner: own, access: { view: 'group', control: 'session' } }, { conversationId: O, sessionId: 's-o', sessionCreatedAt: 1, groups: new Set() }).job;
  jm.jobs.set('jb-run-of-weekly', { id: 'jb-run-of-weekly', kind: 'task', name: 'weekly run', owner: own, cronParent: cron.id, state: 'done', runs: [] });
  const asked = [];
  const V = DWO.automationVerbs({ jobs: () => jm, groupsOf: (cid) => (cid === O ? ['T-ops'] : []), keyNameOf: () => 'dispatch' })['jobs.wakeGrant'];
  const no = (v) => ({ ok: false, code: 'not_granted', why: 'out of reach' });
  const a1 = V({ job: cron.id, grant: true }, { caller: {}, keyId: 'ak-1', identity: 'automation:ak-1', reach: (q) => { asked.push(q); return no(q); } });
  const a2 = V({ job: 'jb-run-of-weekly', grant: true }, { caller: {}, keyId: 'ak-1', identity: 'automation:ak-1', reach: no });
  ok(!a1.ok && a1.why === 'the key does not reach that job' && !a2.ok && a2.why === a1.why && !/schedule|person/.test(a2.why) && asked[0].conversationId === O && asked[0].groups.join() === 'T-ops' && jm.jobs.get(cron.id).wakesEndedOwner !== true,
    'out of reach ⇒ refused by name — the SAME words for a schedule and for a run (no more than an existence), the reach asked of the owner WITH its Task Groups, nothing written', { a1, a2, asked });
  const a3 = V({ job: cron.id, grant: true }, { caller: {}, keyId: 'ak-1', identity: 'automation:ak-1', reach: () => ({ ok: true, by: 'grant' }) });
  ok(a3.ok && a3.grant === true && a3.by.kind === 'key' && a3.by.name === 'dispatch' && jm.wakeGrantOf(cron.id).granted === true, 'in reach ⇒ the key sets the grant; the row records the key by name', a3);
  // THE STORE HELD UNREAD (the hold's law, 主开发 2026-11-19 05:42Z): a key reaching «everything EXCEPT T-ops», the owner IS in T-ops,
  // the store held (its groups read []) — the reach hands the hold's fact, refused BY NAME, nothing written; RED: the fact dropped ⇒ set
  const GH = require(path.join(REPO, 'src/server/groups-hold.js')), AK = require(path.join(REPO, 'src/automation-keys.js'));
  const EXC = [{ door: 'automation-key-reach', resource: 'K-1', to: [{ kind: 'everyone' }], except: [{ kind: 'group', id: 'T-ops' }] }];
  const reachExc = (t) => AK.reachVerdict({ keyId: 'K-1', caller: cidOf(71), target: t, reach: 'instance', reachRows: EXC });
  const cron2 = jm.create({ kind: 'cron', name: 'daily', schedule: { everyMs: 3600e3 * 24 }, action: { type: 'notify', text: 'd' }, owner: own, access: { view: 'group', control: 'session' } }, { conversationId: O, sessionId: 's-o', sessionCreatedAt: 1, groups: new Set() }).job;
  const verbOf = (M) => M.automationVerbs({ jobs: () => jm, groupsOf: () => [], keyNameOf: () => 'dispatch' })['jobs.wakeGrant'];   // held: the owner's groups read []
  const DW_SRC = fs.readFileSync(path.join(REPO, 'src/server/delivery-wake.js'), 'utf8');
  const AT_FACT = "reach({ conversationId: owner, webuiId: null, groups, ...require('./groups-hold.js').fact() })";
  const DWD = mutantCopies('wake-grant-held', REPO).load('src/server/delivery-wake.js', anchored(DW_SRC, AT_FACT, "reach({ conversationId: owner, webuiId: null, groups })", 'wake-grant-fact-dropped'), 'wake-grant-fact-dropped');
  const CTX = { caller: {}, keyId: 'K-1', identity: 'automation:K-1', reach: reachExc };
  GH.setHeld(() => true);
  let h1, h1Wrote, hRed;
  try { h1 = verbOf(DWO)({ job: cron2.id, grant: true }, CTX); h1Wrote = jm.wakeGrantOf(cron2.id).granted === true; hRed = verbOf(DWD)({ job: cron2.id, grant: true }, CTX); } finally { GH.setHeld(() => false); }   // the grant READ BACK before the red control writes the same store
  ok(!h1.ok && h1.code === 'groups_unreadable' && /Task Groups could not be read just now/.test(h1.why || '') && h1Wrote === false, 'the store HELD: a key reaching «everything except T-ops» is refused BY NAME for T-ops\' job (groups_unreadable, its words) — never judged «in no group» — and NOTHING written (the grant read back: still not granted)', { h1, h1Wrote });
  ok(hRed.ok === true && jm.wakeGrantOf(cron2.id).granted === true, 'RED CONTROL: the fact dropped — the key «except T-ops» SETS the wake grant of T-ops\' job while the store is held (the harm the law exists for)', hRed);
}

console.log('⑯ an unknown goal: a harness whose resume continues nothing goes; an undeclared row waits');
{
  const A = cidOf(80), B = cidOf(81);
  const R = rig('unknown-rows', { kept: { [A]: RESTART, [B]: RESTART }, facts: { [A]: { goal: 'unknown' }, [B]: { goal: 'unknown' } }, backendOf: { [A]: 'claude', [B]: 'newcli' }, rows: { claude: { headless: true, resumeContinues: 'nothing' }, newcli: { headless: true } } });
  R.result(A, 'jb-a', 'a', 'a done'); R.result(B, 'jb-b', 'b', 'b done');
  await R.at(10);
  ok(R.reopens.some((r) => r.cid === A) && !R.reopens.some((r) => r.cid === B) && R.wakes.some((w) => w.cid === B && (w.code === 'harness_unread' || w.code === 'goal_unknown')),
    'an unknown goal on a harness whose resume continues NOTHING resumes; on a row that declares nothing it WAITS (piece 4\'s own code, harness_unread)', { reopens: R.reopens, wakes: R.wakes.filter((w) => w.cid === B) });
}

console.log('⑰ no account stated or kept: the account the create would pick is the one judged');
{
  const X = cidOf(82), Y = cidOf(83);
  const R = rig('held-account', { kept: { [X]: RESTART, [Y]: RESTART }, held: { [X]: { accountId: 'acct-H' }, [Y]: { refuse: 'no transcript of this conversation is kept by an account root here' } }, limitOf: (scope) => (scope === 'acct-H' ? { usable: false, blockedUntil: T0 + 3600e3 } : { usable: true }) });
  R.result(X, 'jb-x', 'x', 'x done'); R.result(Y, 'jb-y', 'y', 'y done');
  await R.at(10);
  ok(R.calls.includes('limit:acct-H') && R.reopens.length === 0 && R.wakes.some((w) => w.cid === X && w.code === 'limit') && R.wakes.some((w) => w.cid === Y && w.code === 'account_unknown'),
    'the record names no account and none is stated: the account whose index lists it (the create\'s own lookup) is judged — at its limit it WAITS, said; a harness that cannot name one refuses by name', { calls: R.calls, wakes: R.wakes });
}

console.log('⑱ a hard kill between the frame\'s post and the entry\'s end delivers once');
{
  const X = cidOf(84);
  const dir = path.join(ROOT, 'kill-mid-post');
  let posted = false;
  const R1 = rig('kill1', { dir, kept: { [X]: RESTART }, postHook: () => { posted = true; return new Promise(() => { }); } });
  R1.result(X, 'jb-k', 'nightly report', 'the nightly report is ready');
  R1.c.now = T0 + 10; for (const t of R1.c.timers.splice(0)) t.fn();
  for (let i = 0; i < 100 && !posted; i++) await sleep(5);
  const file = JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((f) => /retry/.test(f) && f.endsWith('.json')) || 'x'), 'utf8'));
  const marked = Object.values(file).flat().find((e) => e && e.held && e.held.why === 'ended');
  ok(posted && R1.posts.length === 1 && !!marked && Number(marked.posting) > 0, 'the frame was posted and the hub died before the entry ended — the entry carries its POSTING mark on disk', { posted, marked });
  const R2 = rig('kill2', { dir, kept: { [X]: RESTART } });
  await R2.at(20);
  ok(R2.reopens.length === 0 && R2.posts.length === 0 && R2.deliver.endedEntries(X).length === 0 && R2.logs.some((l) => /POSTING its hand-over when the previous server stopped/.test(l)),
    'the next boot SAYS «maybe delivered» and never offers it again — no second resume, no second frame (one billed turn for one delivery)', { reopens: R2.reopens.length, posts: R2.posts.length, logs: R2.logs.filter((l) => /POSTING/.test(l)) });
}

console.log('⑲ a graceful stop waits for a wake hand-over in flight');
{
  const X = cidOf(85);
  let release; const gate = new Promise((r) => { release = r; });
  const R = rig('graceful', { kept: { [X]: RESTART }, postHook: async () => { await gate; return { ok: true, phase: 'written' }; } });
  R.result(X, 'jb-g', 'nightly report', 'done');
  R.c.now = T0 + 10; for (const t of R.c.timers.splice(0)) t.fn();
  for (let i = 0; i < 100 && !R.posts.length; i++) await sleep(5);
  let settled = null;
  const st = R.view.settle(5000).then((n) => { settled = n; });
  await sleep(40);
  const before = settled;
  release();
  await st;
  ok(R.posts.length === 1 && before === null && settled === 1, 'the stash hand-over\'s settle (a graceful stop) waits for the wake\'s hand-over in flight — it answers only once that post ended', { before, settled });
}

console.log('⑳ a wake for a conversation on a paired machine, due before the re-adoption settled, STAYS OWED and runs once at the settle (the stores chain\'s two roads, 主开发 02:59Z)');
{
  // through the delivery wake's OWN seam: the park, the line, the wake's start and its reopen THROUGH the wiring's one gate (compiled
  // from its source), the boot held (the remote road shut). Refused only because the re-adoption has not settled: the wake is neither
  // ended nor retried on a timer — its row says it goes by itself — and it runs ONCE when the wiring says the re-adoption settled
  const KEEP = "        if (r && r.outcome === 'waits') { e.waitsReadopt = true;";
  ok(DELIVER_SRC.split(KEEP).length === 2 && WIRE_SRC.includes("reopen: (item, o) => (typeof resumeRoad.reopen === 'function' ? reopenRoads(item, o) :"),
    'control setup: the park\'s keep of a waiting wake is found once; the delivery wake\'s seam reopens THROUGH the two roads\' gate (a pin: the seam back to resumeRoad.reopen is red here)');
  const scene = async (deliverMod) => {
    const X = cidOf(90);
    const R = rig('readopt-wait', { kept: { [X]: RESTART }, hosts: { [X]: 'h-0001' }, gateWire: WIRE_SRC, deliverMod });
    R.result(X, 'jb-r', 'nightly report', 'done');
    await R.at(10);
    const out = { refusedReopens: R.reopens.length, owedAtRefusal: R.deliver.endedEntries(X).length, ended: R.wakes.filter((w) => w.cid === X).map((w) => w.outcome).join() };
    const a = R.deliver.endedAnswerOf(X); out.row = a && a.outcome === 'waits' ? a.code : (a && a.outcome) || null;
    await R.at(60 * 60e3);   // an hour later: nothing retries it on a timer
    out.reopensAfterHour = R.reopens.length; out.owedAfterHour = R.deliver.endedEntries(X).length;
    R.gate.resumeRoad.adoptedRemote();   // the boot's re-adoption of the machines' left-running conversations settled
    await R.at(60 * 60e3 + 50);
    out.reopensAtSettle = R.reopens.length; out.framesAtSettle = R.framesTo(X).length; out.owedAtSettle = R.deliver.endedEntries(X).length;
    return out;
  };
  const w = await scene(DELIVER);
  ok(w.refusedReopens === 0 && w.owedAtRefusal === 1 && w.ended === '' && w.row === 'readopt-pending' && w.reopensAfterHour === 0 && w.owedAfterHour === 1 && w.reopensAtSettle === 1 && w.framesAtSettle === 1 && w.owedAtSettle === 0,
    'a remote wake due while the re-adoption has not settled: refused at the gate (no reopen), STILL OWED (not ended; its row: «they go by themselves once …»), not retried on a timer for an hour — and at the settle it runs ONCE: one resume, one frame, the wake ended', w);
  const wx = await scene(MJ_DWL.load('src/server/conversation-deliver.js', anchored(DELIVER_SRC, KEEP, "        if (false) { e.waitsReadopt = true;", 'readopt-keep-cut'), 'readopt-keep-cut'));
  ok(wx.owedAtRefusal === 0 && wx.reopensAtSettle === 0, 'CONTROL (the park\'s keep cut, in a copy): the waiting wake is ENDED at the refusal — the settle wakes nobody, the addressee waits for some other delivery — RED', wx);
}

console.log('㉑ the hand-over waits for THE RESUMED SESSION\'s inbox, off the line (place-8)');
{
  const until = async (fn) => { for (let i = 0; i < 200; i++) { if (fn()) return true; await sleep(5); } return false; };
  const fire = (R, to) => { R.c.now = T0 + to; for (const t of R.c.timers.splice(0)) t.fn(); };
  // a CLI that opens its inbox only at the start's fourth look — its registry record is written once it STARTED, never at «created»
  const X = cidOf(90);
  const R = rig('inbox-late', { kept: { [X]: RESTART }, cli: { [X]: { after: 3 } } });
  R.result(X, 'jb-i1', 'nightly report', 'nightly report finished: the inbox opened late');
  await R.at(10);
  const fr = R.framesTo(X);
  ok(R.reopens.length === 1 && R.inboxAsks.length === 4 && R.slept.length === 3 && fr.length === 1 && fr[0].text.includes('the inbox opened late') && fr[0].text.includes(D.FRAME_TAIL) && R.notes.length === 1 && R.wakes.some((w) => w.cid === X && w.outcome === 'delivered'),
    'a CLI that opens its inbox a moment after «created»: the hand-over WAITS for it — then ONE frame, ONE ledger row, «delivered»', { asks: R.inboxAsks.length, slept: R.slept, frames: fr.length, wakes: R.wakes });
  // RED: the wait removed — the hand-over posts in the tick the reopen answered (the box's run at 921c0de17, hub log lines 185–188)
  const DWSRC = fs.readFileSync(path.join(REPO, 'src/server/delivery-wake.js'), 'utf8');
  const NOWAIT = mutantCopies('wake-no-inbox-wait', REPO).load('src/server/delivery-wake.js', anchored(DWSRC, 'const inbox = await inboxOpened(cid, r.sessionId);', 'const inbox = { ok: true };', 'no-inbox-wait'), 'no-inbox-wait');
  const Y = cidOf(91);
  const C = rig('inbox-nowait', { kept: { [Y]: RESTART }, cli: { [Y]: { after: 3 } }, mod: NOWAIT });
  C.result(Y, 'jb-i2', 'nightly report', 'nightly report finished');
  await C.at(10);
  ok(C.reopens.length === 1 && C.posts.length === 0 && C.notes.length === 0 && C.wakes.some((w) => w.cid === Y && w.outcome === 'failed' && /no live inbox/.test(w.why)),
    '㉑ RED CONTROL: the wait removed — a reopen that SUCCEEDED is followed by «no live inbox» as the end, nothing delivered (the box\'s red, in process)', C.wakes);
  // the bound: the CLI never opens its inbox — the claim goes back, the words keep waiting, the end says it by name
  const Z = cidOf(92);
  const B = rig('inbox-never', { kept: { [Z]: RESTART }, cli: { [Z]: { never: true } } });
  B.result(Z, 'jb-i3', 'nightly report', 'nightly report finished: never opened');
  await B.at(10);
  const waited = B.slept.reduce((a, b) => a + b, 0), wz = B.wakes.find((w) => w.cid === Z) || {}, lz = (B.lines[B.lines.length - 1] || {}).line || {};
  ok(B.reopens.length === 1 && B.posts.length === 0 && B.notes.length === 0 && waited >= DWO.INBOX_WAIT_MS && waited < DWO.INBOX_WAIT_MS + 1000 && Math.max(...B.slept) === 1000,
    'a CLI that never opens its inbox: the start waits its bound (60 s of steps, each at most 1 s) — nothing posted, nothing charged', { waited, steps: B.slept.length });
  ok(wz.outcome === 'failed' && wz.code === 'inbox_not_open' && /resumed as w-/.test(wz.why) && /did not open its inbox within 60 s/.test(wz.why) && /sending anything starts it, or end and resume it/.test(wz.why) && !/no live inbox/.test(wz.why),
    '…the end says it BY NAME — resumed (which session), no inbox within the bound, the message waits for its next turn — never «no live inbox»', wz);
  ok(B.deliver.stashCount(Z) === 1 && B.deliver.claimedCount(Z) === 0 && lz.refused && lz.refused.code === 'inbox_not_open' && lz.params.seconds === 60 && lz.params.what === 'nightly report',
    '…the claim went back: the words wait in the stash, owed to its next turn; the window\'s line carries the code and the bound', { stash: B.deliver.stashCount(Z), claimed: B.deliver.claimedCount(Z), line: lz });
  // the resumed session ends before its inbox opens
  const W = cidOf(93);
  const G = rig('inbox-gone', { kept: { [W]: RESTART }, cli: { [W]: { ends: true } } });
  G.result(W, 'jb-i4', 'nightly report', 'nightly report finished: it ended');
  await G.at(10);
  const wg = G.wakes.find((w) => w.cid === W) || {};
  ok(G.posts.length === 0 && wg.code === 'inbox_gone' && /ended before its agent opened its inbox/.test(wg.why) && G.slept.length === 0 && G.deliver.stashCount(W) === 1 && G.deliver.claimedCount(W) === 0,
    'the resumed session ENDS before its inbox opens: said at once by name (no wait), the words keep waiting', { wg, slept: G.slept.length });
  // OFF THE LINE (主开发 03:44Z condition 1): three conversations wait for inboxes that do not open; a fourth still resumes and lands
  const run = async (mod, tag) => {
    const S = [cidOf(94), cidOf(95), cidOf(96)], F = cidOf(97);
    const H = rig('inbox-offline-' + tag, { kept: Object.fromEntries([...S, F].map((c) => [c, RESTART])), cli: Object.fromEntries(S.map((c) => [c, { never: true }])), mod });
    let open; H.sleepGate = new Promise((r) => { open = r; });
    for (const c of S) H.result(c, 'jb-s' + c.slice(-2), 'slow report', 'slow');
    fire(H, 10);
    // the starts reached their inbox waits: all three (off the line), or two holding both places of the line (the RED) — never mid-reopen
    const asked = () => S.filter((c) => H.inboxAsks.includes(c)).length;
    await until(() => asked() === 3 || (asked() === 2 && H.line.state().running === 2 && H.line.state().waiting === 1));
    H.result(F, 'jb-f', 'fast report', 'fast report finished');
    fire(H, 20);
    // settled either way, with no wait for what never comes: F's frame landed, or the line holds two running and two waiting
    await until(() => H.framesTo(F).length === 1 || (H.line.state().running === 2 && H.line.state().waiting >= 2));
    const landed = H.framesTo(F).length === 1;
    const seen = { reopens: H.reopens.map((x) => x.cid.slice(-2)), waiting: S.filter((c) => H.inboxAsks.includes(c)).length, landed, line: H.line.state() };
    H.sleepGate = null; open();
    return seen;
  };
  const off = await run(DWO, 'off');
  ok(off.waiting === 3 && off.landed && off.reopens.length === 4, 'three resumed conversations wait for their inboxes OFF the line — a fourth is resumed and its frame lands meanwhile (the line serves the next)', off);
  const ONLINE = mutantCopies('wake-wait-on-line', REPO).load('src/server/delivery-wake.js', anchored(DWSRC, "    return { ok: true, outcome: 'resumed', sessionId: r.sessionId, rest };", '    return await rest;', 'wait-on-line'), 'wait-on-line');
  const on = await run(ONLINE, 'on');
  ok(on.waiting === 2 && !on.landed && on.reopens.length === 2 && on.line.running === 2 && on.line.waiting === 2, '㉑ RED CONTROL: the wait put back ON the line — two waiting CLIs hold both places; the third and the fourth wait in line, not even resumed', on);
}

console.log('㉑b a claim taken is ALWAYS ended; a delivery reopens only a kind it can hand its words to (主开发 2026-11-20 04:07Z)');
{
  const DWSRC = fs.readFileSync(path.join(REPO, 'src/server/delivery-wake.js'), 'utf8');
  const until = async (fn) => { for (let i = 0; i < 200; i++) { if (fn()) return true; await sleep(5); } return false; };
  // THE MUST: the reopen is held past a small line bound — the line answers «did not answer», the start answers late with its rest
  const late = async (mod, tag) => {
    const X = cidOf(tag === 'cured' ? 100 : 101);
    const R = rig('late-' + tag, { kept: { [X]: RESTART }, lineBound: 30, reopenHold: () => sleep(120), mod });
    R.result(X, 'jb-late', 'nightly report', 'nightly report finished: the start answered late');
    await R.at(10);
    // the late reopen ends, then its rest (cured) lands within a few turns — a red's never-coming frame is not waited for
    await until(() => R.reopens.length === 1 && R.inReopen === 0);
    for (let i = 0; i < 10 && R.framesTo(X).length === 0; i++) await sleep(5);
    const again = R.view.claimForWake(X);
    if (again.ok) R.view.releaseWake(X, again);
    const ws = R.wakes.filter((w) => w.cid === X);
    return { wake: (ws[0] || {}).why || null, first: (ws[0] || {}).code || null, last: ws.length > 1 ? { outcome: ws[ws.length - 1].outcome, late: ws[ws.length - 1].late === true } : null, answer: R.deliver.endedAnswerOf(X), frames: R.framesTo(X).length, claimed: R.deliver.claimedCount(X), stash: R.deliver.stashCount(X), again: again.code || (again.ok ? 'claimed' : null) };
  };
  const cured = await late(DWO, 'cured');
  ok(/did not answer in/.test(cured.wake || '') && cured.first === 'start_bound' && cured.frames === 1 && cured.claimed === 0 && cured.stash === 0 && cured.again !== 'in_flight',
    'a start that answers AFTER the line\'s bound (its answer dropped there, told by the line\'s CODE start_bound): its rest still runs — the words handed over, no claim left, no hand-over «in flight» for good', cured);
  ok(!!cured.last && cured.last.outcome === 'delivered' && cured.last.late === true && cured.answer === null,
    '…and THE RECORD SAYS WHAT HAPPENED: the late rest writes its own end — the producers\' last «wake» (the jobs journal\'s line) says delivered; no «failed» answer is left on the row (主开发 04:50Z)', cured);
  const NOREC = mutantCopies('wake-late-unrecorded', REPO).load('src/server/delivery-wake.js', anchored(DWSRC, '      if (late.has(entry)) { late.delete(entry);', '      if (false) { late.delete(entry);', 'late-unrecorded'), 'late-unrecorded');
  const norec = await late(NOREC, 'norec');
  ok(norec.frames === 1 && norec.last === null && norec.first === 'start_bound',
    '㉑b RED CONTROL: the late end not written — the words landed, yet the producers\' only «wake» still says «failed: the start did not answer» (the jobs journal\'s last line is wrong; the row clears itself when the words land)', norec);
  const LAZY = mutantCopies('wake-rest-lazy', REPO).load('src/server/delivery-wake.js', anchored(DWSRC, '    const rest = handOverResumed(cid, entry,', '    const rest = () => handOverResumed(cid, entry,', 'rest-lazy'), 'rest-lazy');
  const red = await late(LAZY, 'red');
  ok(red.frames === 0 && red.claimed === 1 && red.again === 'in_flight',
    '㉑b RED CONTROL: the rest started only by its asker (88fc70195\'s shape) — the late answer is dropped with its claim: the words stay CLAIMED, hidden from every drain, every later claim «in flight»', red);
  // REFUSE BEFORE THE RESUME: opencode's own row takes no message mid-session — a delivery never reopens it
  const RLP = require(path.join(REPO, 'src/resume-line.js')), CAPS = require(path.join(REPO, 'src/backend-caps.js'));
  const O = cidOf(102);
  const N = rig('no-mid-session', { kept: { [O]: RESTART }, backendOf: { [O]: 'opencode' }, rows: { opencode: RLP.harnessRowOf(CAPS.capsOf('opencode')) } });
  N.result(O, 'jb-o', 'nightly report', 'nightly report finished: opencode');
  await N.at(10);
  const wo = N.wakes.find((w) => w.cid === O) || {}, row = N.view.waitingAll()[O];
  ok(N.reopens.length === 0 && N.probes.length === 0 && N.posts.length === 0 && wo.outcome === 'refused' && wo.code === 'no_mid_session' && N.deliver.stashCount(O) === 1 && N.deliver.claimedCount(O) === 0 && !!row && row.code === 'no_mid_session',
    'a kind whose own row takes no message mid-session (opencode) is NEVER reopened by a delivery: nothing probed, resumed or posted; the words stay stashed, the ended row says why', { wo, row });
  const O2 = cidOf(103);
  const N2 = rig('no-mid-session-red', { kept: { [O2]: RESTART }, backendOf: { [O2]: 'opencode' }, rows: { opencode: { resumeContinues: 'nothing', headless: true } } });
  N2.result(O2, 'jb-o2', 'nightly report', 'nightly report finished');
  await N2.at(10);
  ok(N2.reopens.length === 1, '㉑b RED CONTROL: the row before this cure (no mid-session field) — the same delivery REOPENS it', N2.reopens);
  // …the belt, after a reopen (a row that did not say): its agent takes no message mid-session — said at once, no wait, claim back
  const O3 = cidOf(104);
  const N3 = rig('no-mid-session-belt', { kept: { [O3]: RESTART }, backendOf: { [O3]: 'opencode' }, rows: { opencode: { resumeContinues: 'nothing', headless: true } }, cli: { [O3]: { never: true } } });
  N3.result(O3, 'jb-o3', 'nightly report', 'nightly report finished: the belt');
  await N3.at(10);
  const w3 = N3.wakes.find((w) => w.cid === O3) || {}, l3 = (N3.lines[N3.lines.length - 1] || {}).line || {};
  ok(N3.reopens.length === 1 && N3.posts.length === 0 && N3.slept.length === 0 && w3.code === 'no_mid_session' && /takes no message mid-session/.test(w3.why) && N3.deliver.claimedCount(O3) === 0 && N3.deliver.stashCount(O3) === 1 && l3.refused && l3.refused.code === 'no_mid_session',
    'the belt after a reopen: its agent takes no message mid-session — said at once by name (no wait), the claim back, the window\'s line carries the code', { w3, slept: N3.slept.length });
  // A PTY EXITED WITH ITS SOCKET ALIVE (the re-attach window) is a CLI still starting — never «it ended again»
  const Q = cidOf(105);
  const A = rig('reattach', { kept: { [Q]: RESTART }, cli: { [Q]: { reattach: 2 } } });
  A.result(Q, 'jb-q', 'nightly report', 'nightly report finished: after the re-attach');
  await A.at(10);
  ok(A.framesTo(Q).length === 1 && A.wakes.some((w) => w.cid === Q && w.outcome === 'delivered') && A.slept.length === 2,
    'its attach pty exited while its socket still answers: NOT gone — waited, then its inbox opened and the words were handed over', { wakes: A.wakes, slept: A.slept });
  const OLDGONE = mutantCopies('wake-pty-gone', REPO).load('src/server/delivery-wake.js', anchored(DWSRC, 'const gone = !s || (s.pty === null && !isSocket(s.socketPath));', 'const gone = !s || s.pty === null;', 'pty-gone'), 'pty-gone');
  const Q2 = cidOf(106);
  const A2 = rig('reattach-red', { kept: { [Q2]: RESTART }, cli: { [Q2]: { reattach: 2 } }, mod: OLDGONE });
  A2.result(Q2, 'jb-q2', 'nightly report', 'nightly report finished');
  await A2.at(10);
  ok(A2.framesTo(Q2).length === 0 && A2.wakes.some((w) => w.cid === Q2 && w.code === 'inbox_gone'), '㉑b RED CONTROL: a pty that exited read as gone — «it ended again» said of a CLI still starting', A2.wakes);
  // ONE REGISTRY READ A TICK, shared: three waits inside one tick of the module's own read share it
  const run3 = async (tick) => {
    const S = [cidOf(107), cidOf(108), cidOf(109)];
    const H = rig('shared-read-' + tick, { kept: Object.fromEntries(S.map((c) => [c, RESTART])), cli: Object.fromEntries(S.map((c) => [c, { never: true }])), tick, clock: () => 0 });
    for (const c of S) H.result(c, 'jb-r' + c.slice(-2), 'slow report', 'slow');
    await H.at(10);
    return { asks: H.inboxAsks.length, reads: H.registryReads, ends: H.wakes.filter((w) => w.code === 'inbox_not_open').length };
  };
  const shared = await run3(null), each = await run3(0);
  ok(shared.ends === 3 && shared.asks > 150 && shared.reads === 1, 'three conversations waiting in one tick: ONE registry read for all their looks (the module\'s own tick)', shared);
  ok(each.ends === 3 && each.reads === each.asks, '…CONTROL: with no tick every look reads the registry (the count the shared read saves)', each);
}

console.log('㉒ a floored delivery to an ENDED owner still owes its wake (place-8: the box\'s P and A at their second fire)');
{
  const JSRC = fs.readFileSync(path.join(REPO, 'src/jobs.js'), 'utf8');
  const OWE = '      if (!(this.d.peerReachable && this.d.peerReachable(cid))) this._oweWake(cid, job, ev, { subscriber });\n';
  const floorRig = (name, X, JM) => rig(name, { kept: { [X]: PERSON }, jobs: (Rg) => {
    const jdir = path.join(Rg.dataDir, 'jobs'); fs.mkdirSync(jdir, { recursive: true });
    const jm = new JM({ dataDir: jdir, broadcast() { }, log() { }, notifyUser: () => ({ ok: true }), groupNotifyFor: () => null, notifyGlobal: () => true, peerReachable: (cid) => Rg.live.has(cid),
      deliverToConversation: (cid, text, opts) => Rg.deliver.deliverToConversation(cid, text, opts), onRetry: (fn) => Rg.deliver.onRetry(fn), parkEndedWake: (cid, o) => Rg.deliver.parkEndedWake(cid, o) });
    jm.init(); for (const t of jm._timers || []) clearInterval(t);
    return jm;
  } });
  const twoFires = async (R, X) => {
    const OWNX = { conversation: { id: X }, sessionId: 's-x', sessionCreatedAt: 1, groupsSnapshot: [] };
    const CALLER = { conversationId: X, sessionId: 's-x', sessionCreatedAt: 1, groups: new Set() };
    const plain = R.jm.create({ kind: 'cron', name: 'plain-digest', schedule: { everyMs: 3600e3 }, action: { type: 'notify', text: 'the plain digest' }, owner: OWNX, access: { view: 'group', control: 'session' } }, CALLER).job;
    const granted = R.jm.create({ kind: 'cron', name: 'granted-digest', schedule: { everyMs: 3600e3 }, action: { type: 'notify', text: 'the granted digest' }, owner: OWNX, access: { view: 'group', control: 'session' } }, CALLER).job;
    R.grants[granted.id] = { granted: true, by: { kind: 'person', at: T0 } };   // the person's grant on the second one only
    R.jm._fireCron(R.jm.jobs.get(plain.id), 'cron');   // its attempt reaches nothing — and stamps the 30 s floor
    for (let i = 0; i < 20 && R.jm.notifCount(X) < 1; i++) await sleep(5);   // its words stashed (the attempt answered)
    await R.at(10);
    const first = R.wakes.filter((w) => w.cid === X).map((w) => w.code);
    R.jm._fireCron(R.jm.jobs.get(granted.id), 'cron');   // within the floor: stashed «rate floor — queued for injection instead»
    for (let i = 0; i < 20 && R.jm.notifCount(X) < 2; i++) await sleep(5);   // the floored stash is written (cured or not)
    const owed = R.deliver.endedEntries(X).length;
    await R.at(20);
    return { first, owed, reopens: R.reopens.length, frames: R.framesTo(X).map((f) => f.text) };
  };
  const X = cidOf(98);
  const cured = await twoFires(floorRig('floor-owes', X, JobManager), X);
  ok(cured.first.includes('ended_on_purpose') && cured.owed === 1 && cured.reopens === 1 && cured.frames.length === 1 && /the granted digest/.test(cured.frames[0]) && /the plain digest/.test(cured.frames[0]),
    'two fires within 30 s at a PERSON-ended owner: the ungranted one waits; the GRANTED one, floored, still owes the wake — ONE resume, ONE frame carrying both', cured);
  const { JobManager: JM0 } = mutantCopies('floor-owes-nothing', REPO).load('src/jobs.js', anchored(JSRC, OWE, '', 'floor-owes-nothing'), 'floor-owes-nothing');
  const Y = cidOf(99);
  const red = await twoFires(floorRig('floor-red', Y, JM0), Y);
  ok(red.first.includes('ended_on_purpose') && red.owed === 0 && red.reopens === 0 && red.frames.length === 0,
    '㉒ RED CONTROL: the owing line removed — the granted fire is floored into a stash nothing will ever carry: no wake owed, never resumed', red);
  // a LIVE conversation whose inbox does not answer (running here, its CLI not registered) inside the floor owes NOTHING: it runs
  const Lv = cidOf(110);
  const LR = floorRig('floor-live', Lv, JobManager);
  LR.sessions.set('w-' + Lv, { claudeSessionId: Lv, backendSessionId: Lv, name: 'running', mode: 'chat', backend: 'claude' });
  const lv = await twoFires(LR, Lv);
  ok(lv.owed === 0 && lv.reopens === 0 && lv.frames.length === 0 && LR.jm.notifCount(Lv) === 2 && LR.deliver.endedEntries(Lv).length === 0,
    'a LIVE conversation that does not answer, two fires inside the floor: NO wake owed (it runs — its next turn carries both), nothing resumed', { lv, notifs: LR.jm.notifCount(Lv) });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
