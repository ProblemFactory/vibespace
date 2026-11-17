'use strict';
/**
 * conversations.list's ONE BUILDER — ORCH (lane conversation-facts, majordomo piece 2; the design's «conversations.list»).
 * Free of the reach rule: the list verb (src/server/conversation-ops.js automationVerbs) filters these rows through the key's
 * reach; the person's cookie route (piece 5) will read the same rows whole. One builder, two doors — an unknown is «unknown»
 * at both, with its reason (src/conversation-facts.js shapeRow).
 *
 * THE HUB LOOP: every fact below is an in-memory read per session (no child started) — but for the memory pass: treeUsage walks
 * the process table with synchronous /proc reads (readdirSync / readFileSync per pid; accepted while one list's longest
 * synchronous stretch stays under 50 ms at 84 × 15 — test-conversation-facts-wrapper; the day-report unit's async walker replaces it),
 * the walk yields every `yieldEvery` rows, and the two facts that WAIT — the memory of a conversation's process tree and the
 * output file's own time (the idle age where no wrapper kept one) — go through ONE bounded pass: one at a time, ended at its
 * time-out, and every row it did not reach prints unknown «the facts pass ran out of time — ask again» (question marks,
 * never last time's values). Single-flight: callers that arrive while a pass runs share it.
 *
 * Every source is a dependency (the wiring in src/server/mounts-plugins-wiring.js passes the real ones; the suite passes
 * fakes). A source that throws, or answers nothing, leaves its fact unknown with WHY.notCollected — never a guess.
 */
const CF = require('../conversation-facts.js');
const { WHY } = CF;
// the output files' own times: lane hub-loop-stalls' age pass (src/server/loop-day-report.js outputTimes) — called, never copied
const LDR = require('./loop-day-report.js');

const LINK_CONVERSATION = 'vibespace://conversation/';   // the design's grammar (piece 1): the row's key, exactly as listed
const LINK_DESKTOP = 'vibespace://desktop/';

const isCount = (n) => Number.isInteger(n) && n >= 0;
const call = (fn, ...a) => { if (typeof fn !== 'function') return undefined; try { return fn(...a); } catch { return undefined; } };
/** A waited fact within the pass's remaining time: its answer, or {timedOut:true}. Never longer than `ms`. */
function within(promiseLike, ms) {
  if (!(ms > 0)) return Promise.resolve({ timedOut: true });
  let t = null;
  return Promise.race([
    Promise.resolve(promiseLike).then((v) => ({ value: v }), () => ({ value: undefined })),
    new Promise((res) => { t = setTimeout(() => res({ timedOut: true }), ms); }),
  ]).finally(() => clearTimeout(t));
}

function create({
  activeSessions,
  capsOf = () => ({}),          // backend → its caps row (src/backend-caps.js capsOf): `sidecarFacts` decides, never a harness id
  levelDeclared = () => null,   // piece 2b: a stated CLI build → does its own binary declare the background signal? true | false | null
  keyOf = () => null,           // session → `<backend>:<conversation id>` | null (the id not reported yet)
  turnOf = () => null, turnKnown = () => false,   // src/server/turn-facts.js
  groupsOf = () => [],          // (session, webuiId) → Task Group ids
  heldOf = () => undefined,     // session → n held in the wrapper's queue | undefined (no wrapper fact)
  asksOf = () => undefined,     // key → the open For-you asks it asked | undefined
  goalOf = () => undefined,     // session → 'active' | 'none'
  continueOf = () => undefined, // session → {armed, resetsAt}
  jobsOf = () => undefined,     // key → {running, schedules, nextFireAt, items} · {why} (unknown, said) · undefined
  waitingOf = () => undefined,  // session → {notices, notResumedWhy}
  handoverOf = () => undefined, // session → true | false (a hand-over to it in flight)
  browserOf = () => null,       // session → null | {id, kind, name, running, drivenBy, viewers, personBrowsing, …} | {known:false, why}
  browsers = () => [],          // → every running browser the keeper knows (rows; holders = keys)
  desktopOf = () => undefined,  // key → {desktop:{id,name}|null, window:bool}
  desktops = () => undefined,   // → [{id, name}]
  endedRows = () => [],         // → ended conversations that still have a window or a kept record: [{key, name, cwd, backend, ended:{at,by}|null, desktop…}]
  machineMem = () => undefined, // → Promise<{memTotal, memAvailable}>
  memOf = null,                 // (session, webuiId) → Promise<number bytes | {why}>   (one process tree at a time — the pass)
  agesOf = null,                // ([[webuiId, session]…], signal) → Promise<Map webuiId → mtime ms | null> — the output files' own
                                // times (lane hub-loop-stalls' outputTimes: one stat per file; it answers null once signal.cancelled)
  prepare = null,               // → Promise: what must be in memory before the rows are read (the stored layout, read ONCE off the loop)
  passMs = 3000,
  yieldEvery = 50,
  now = Date.now,
} = {}) {
  /** The live row's in-memory facts (the waited ones are filled by the pass). */
  function liveRow(id, s) {
    const backend = s.backend || 'claude';
    const key = call(keyOf, s) || null;
    const chat = !!call(turnKnown, s);
    const turn = chat ? (call(turnOf, s) || null) : null;
    const caps = call(capsOf, backend) || {};
    // restack 416 (lane lg-group-parents, 主开发 r311 (a)): a reader that THROWS (the strict read: the membership still being read) is
    // marked on the row — the list's and the proposal card's reach refuse it by name, never «in no group»
    const gRead = (() => { if (typeof groupsOf !== 'function') return []; try { const g = groupsOf(s, id); return Array.isArray(g) ? g : []; } catch { return null; } })();
    const r = {
      key, ...(key ? {} : { keyWhy: 'the conversation has not reported its id yet' }),
      id, name: s.name || null, cwd: s.cwd || null, host: s.host || null, backend, mode: s.mode || 'terminal',
      groups: gRead || [], ...(gRead === null ? { groupsUnreadable: true } : {}),
      state: 'running',
      turn, ...(chat ? (turn ? {} : { turnWhy: WHY.notCollected }) : { turnWhy: WHY.terminal }),
    };
    if (chat) Object.assign(r, CF.trackedFacts(s._convFacts || null, { keeps: caps.sidecarFacts, turn, levelDeclared: (v) => levelDeclared(v, s.host || null) }));   // B-24e2: the machine it runs on
    else Object.assign(r, { background: null, backgroundWhy: WHY.terminalNone, timers: null, timersWhy: WHY.terminalNone, idleSince: null, idleSinceWhy: WHY.terminalNone });
    const held = call(heldOf, s, id);
    if (isCount(held)) r.heldPrompts = held; else { r.heldPrompts = null; r.heldPromptsWhy = WHY.noWrapper; }
    const asks = key ? call(asksOf, key) : undefined;
    if (Array.isArray(asks)) r.asks = asks.length; else { r.asks = null; r.asksWhy = key ? WHY.notCollected : 'the conversation has not reported its id yet'; }
    const goal = call(goalOf, s, id); if (goal === 'active' || goal === 'none') r.goal = goal;
    const cont = call(continueOf, s, id); if (cont && typeof cont === 'object' && typeof cont.armed === 'boolean') r.continue = { armed: cont.armed, resetsAt: cont.resetsAt || null };
    const jobs = key ? call(jobsOf, key) : undefined;
    if (jobs && isCount(jobs.running) && isCount(jobs.schedules)) r.jobs = { running: jobs.running, schedules: jobs.schedules, nextFireAt: jobs.nextFireAt || null, items: Array.isArray(jobs.items) ? jobs.items : null };
    else if (jobs && typeof jobs.why === 'string' && jobs.why) { r.jobs = null; r.jobsWhy = jobs.why; }
    const waiting = call(waitingOf, s, id); if (waiting && typeof waiting === 'object') r.waiting = waiting;
    const ho = call(handoverOf, s, id); if (ho === true || ho === false) r.handover = ho;
    const b = call(browserOf, s, id); r.browser = b === undefined ? { known: false, why: WHY.notCollected } : b;
    const d = key ? call(desktopOf, key) : undefined;
    if (d && typeof d === 'object' && !d.why) { r.desktop = d.desktop ? { id: d.desktop.id, name: d.desktop.name || null, link: LINK_DESKTOP + d.desktop.id } : null; r.window = !!d.window; }
    else { r.desktop = null; r.window = null; r.windowWhy = (d && typeof d.why === 'string' && d.why) || WHY.notCollected; }
    r.link = key ? LINK_CONVERSATION + key : null; if (!key) r.linkWhy = 'the conversation has not reported its id yet';
    return r;
  }
  function endedRow(e) {
    const key = e && e.key ? String(e.key) : null;
    const r = { key, name: (e && e.name) || null, cwd: (e && e.cwd) || null, backend: (e && e.backend) || (key ? key.slice(0, key.indexOf(':')) : null), mode: (e && e.mode) || null,
      state: 'ended', ended: e && e.ended && typeof e.ended === 'object' ? e.ended : null, memBytes: 0, browser: null };
    if (!r.ended) r.endedWhy = WHY.noRecord;
    const d = key ? call(desktopOf, key) : undefined;
    if (d && typeof d === 'object' && !d.why) { r.desktop = d.desktop ? { id: d.desktop.id, name: d.desktop.name || null, link: LINK_DESKTOP + d.desktop.id } : null; r.window = !!d.window; }
    else { r.desktop = null; r.window = null; r.windowWhy = (d && typeof d.why === 'string' && d.why) || WHY.notCollected; }
    const waiting = e && e.waiting; if (waiting && typeof waiting === 'object') r.waiting = waiting;
    const jobs = key ? call(jobsOf, key) : undefined;
    if (jobs && isCount(jobs.running) && isCount(jobs.schedules)) r.jobs = { running: jobs.running, schedules: jobs.schedules, nextFireAt: jobs.nextFireAt || null, items: Array.isArray(jobs.items) ? jobs.items : null };
    else if (jobs && typeof jobs.why === 'string' && jobs.why) { r.jobs = null; r.jobsWhy = jobs.why; }
    r.link = key ? LINK_CONVERSATION + key : null;
    return r;
  }
  async function build() {
    const at = now();
    const deadline = at + passMs;
    if (typeof prepare === 'function') await within(call(prepare), Math.max(1, deadline - now()));   // bounded: a read that ran out leaves its facts unknown
    const live = [];
    let n = 0;
    for (const [id, s] of activeSessions || []) {
      if (!s || s.isTmuxView) continue;
      live.push({ s, row: liveRow(id, s) });
      if (++n % yieldEvery === 0) await new Promise((r) => setImmediate(r));
    }
    const endedAnswer = await within(call(endedRows), Math.max(1, deadline - now()));
    const ended = (Array.isArray(endedAnswer.value) ? endedAnswer.value : []).map(endedRow);
    // THE BOUNDED PASS. First the output files' own times, for the idle rows whose wrapper kept no record time (ONE batch, one
    // stat per file), then memory per process tree, one at a time. Both are ended at the pass's time-out.
    let ranOut = false, reached = 0;
    const needAge = live.filter(({ row }) => row.idleSince === null && row.idleSinceWhy === WHY.noTurnSeen && row.turn === 'idle');
    if (needAge.length && typeof agesOf === 'function') {
      const signal = { cancelled: false, read: 0 };
      const a = await within(call(agesOf, needAge.map(({ row, s }) => [row.id, s]), signal), deadline - now());
      if (a.timedOut) { signal.cancelled = true; ranOut = true; for (const { row } of needAge) row.idleSinceWhy = WHY.timedOut; }
      else if (a.value instanceof Map) for (const { row } of needAge) { const t = a.value.get(row.id); if (Number.isFinite(t)) { row.idleSince = t; row.idleSinceSource = 'output file'; } }
    }
    for (const { s, row } of live) {
      if (ranOut || now() >= deadline) { ranOut = true; break; }
      if (typeof memOf === 'function' && !row.host) {
        const m = await within(call(memOf, s, row.id), deadline - now());
        if (m.timedOut) { ranOut = true; row.memBytes = null; row.memBytesWhy = WHY.timedOut; break; }
        if (Number.isFinite(m.value) && m.value > 0) row.memBytes = m.value;
        else { row.memBytes = null; row.memBytesWhy = (m.value && typeof m.value.why === 'string' && m.value.why) || WHY.noProcess; }
      } else if (row.host) { row.memBytes = null; row.memBytesWhy = WHY.otherMachine; }
      reached++;
    }
    if (ranOut) {   // question marks for every row the pass did not finish — never last time's values
      for (const { row } of live.slice(reached)) {
        if (row.memBytes === undefined || row.memBytesWhy === WHY.timedOut) { row.memBytes = null; row.memBytesWhy = WHY.timedOut; }
      }
    }
    for (const { row } of live) if (row.memBytes === undefined) { row.memBytes = null; row.memBytesWhy = typeof memOf === 'function' ? WHY.measuring : WHY.notCollected; }
    const mem = await within(call(machineMem), Math.max(1, deadline - now()));
    const machine = mem.value && Number.isFinite(mem.value.memTotal) ? { memTotal: mem.value.memTotal, memAvailable: Number.isFinite(mem.value.memAvailable) ? mem.value.memAvailable : null }
      : { memTotal: null, memAvailable: null, why: mem.timedOut ? WHY.timedOut : (mem.value && typeof mem.value.why === 'string' && mem.value.why) || WHY.notCollected };
    const ds = call(desktops);
    return {
      at,
      machine,
      desktops: Array.isArray(ds) ? ds.map((d) => ({ id: d.id, name: d.name || null, link: LINK_DESKTOP + d.id })) : null,
      ...(Array.isArray(ds) ? {} : { desktopsWhy: (ds && typeof ds.why === 'string' && ds.why) || WHY.notCollected }),
      conversations: [...live.map((x) => CF.shapeRow(x.row)), ...ended.map((r) => CF.shapeRow(r))],
      ...(() => { const b = call(browsers); return Array.isArray(b) ? { browsers: b } : { browsers: null, browsersWhy: (b && typeof b.why === 'string' && b.why) || WHY.notCollected }; })(),
      pass: { ranOut, reached, of: live.length, ms: now() - at },
    };
  }
  let inflight = null;
  /** ONE snapshot; a caller that arrives while a pass runs shares it (single-flight). */
  function list() {
    if (!inflight) inflight = build().finally(() => { inflight = null; });
    return inflight;
  }
  /** ONE conversation's row from memory (no pass: the verdict reads no memory and no idle age) — the end verb's input
   *  (lane end-obeys-verdict). null = no live conversation by that webui id. */
  function rowOf(id) {
    const s = activeSessions && typeof activeSessions.get === 'function' ? activeSessions.get(id) : null;
    return s && !s.isTmuxView ? CF.shapeRow(liveRow(id, s)) : null;
  }
  return { list, build, rowOf, capsOf: (b) => call(capsOf, b) };   // capsOf: the end gate reads the SAME caps source the rows are built from
}

/**
 * The hub's own instances → the builder's sources, each an IN-MEMORY read (the map of 2026-11-17 named the readers that write
 * or read a file and they are NOT called here: the stash summary (its gate may write), the keeper's published browser fact
 * and its ephemerals() rows (a stat per kept store), the first layouts read, the machine memory reader).
 */
function sourcesFrom({ hosts = null, getJobs = () => null, userTodos = null, persistenceRouter = null, keeper = () => null, browserStream = () => null, activeSessions = null,
  autoResume = () => null, stashView = () => null, deliver = () => null, sysinfo = null, stoppedSessions = null, treeUsage = null, buffersDir = null,
  // the person's grant «may wake its conversation» on one job or schedule (the owner's rule, 2026-11-17 — piece 7 owns the field):
  // true | false | null (unknown). Until piece 7 names it, every grant reads unknown — the safe side (unknown refuses).
  wakeGrantOf = () => null } = {}) {
  const idOf = (s) => (s && (s.backendSessionId || s.claudeSessionId)) || null;
  const memo = (ms, build) => { let at = 0, v = null; return () => { const t = Date.now(); if (!v || t - at > ms) { v = build(); at = t; } return v; }; };
  // jobs by the OWNER conversation (its bare id). OWNED = every job whose next run can happen without a person (主开发's must 4,
  // narrowed in round 2): a run left UNVERIFIED after a restart (owned, its grant unknown); one sitting DOWN while it is WANTED
  // UP (a crashed service its restart policy starts again, a cron between fires); one in any state that is not terminal. A job
  // a person stopped (down, not wanted up) and a FAILED one (parked at its crash cap or for memory — wanted up or not) cannot run
  // again without a person: never owned. schedules = the crons among them; running = the rest. While an OWNER-LESS run from a
  // store recovery exists, nobody's job count is known (it may be anyone's).
  const TERMINAL_STATES = new Set(['done', 'failed', 'interrupted', 'missed']);
  // round three: the recovery's own mark (src/jobs.js writes it on a skeleton; job-logs-sweep's isSkeleton reads the same) — a job a
  // person made in the panel that reads unverified after a restart is not one
  const isSkeleton = (j) => { let note = null; try { note = require('../job-logs-sweep.js').RECOVERED_NOTE; } catch { note = null; } return !!j && j.state === 'unverified' && !!note && j.note === note; };
  const ownedJob = (j) => j.state === 'unverified' || (j.state === 'down' ? j.desiredUp === true : !TERMINAL_STATES.has(j.state));
  const jobsIndex = memo(1000, () => {
    const jm = getJobs(); if (!jm || !jm.ready || !(jm.jobs instanceof Map)) return null;
    const by = new Map();
    by.ownerless = 0;
    for (const j of jm.jobs.values()) {
      const cid = j && j.owner && j.owner.conversation && j.owner.conversation.id;
      if (!cid) { if (isSkeleton(j)) by.ownerless++; continue; }   // only the store recovery's OWN skeletons (a person's unverified job is nobody's conversation's)
      const unverified = j.state === 'unverified';
      if (!ownedJob(j)) continue;
      const e = by.get(cid) || { running: 0, schedules: 0, nextFireAt: null, items: [] };
      const kind = j.kind === 'cron' ? 'schedule' : 'job';
      let g = null;
      if (!unverified) { try { const v = wakeGrantOf(j); g = v === true || v === false ? v : null; } catch { g = null; } }
      e.items.push({ id: String(j.id || ''), kind, state: String(j.state || ''), ...(kind === 'schedule' && Number.isFinite(j.nextFireAt) ? { nextFireAt: j.nextFireAt } : {}), wakeGrant: g,
        ...(g === null ? { wakeGrantWhy: unverified ? 'it was left unverified after a restart — whether it runs again is unknown' : WHY.noWakeGrant } : {}) });
      if (kind === 'schedule') { e.schedules++; if (Number.isFinite(j.nextFireAt) && (e.nextFireAt === null || j.nextFireAt < e.nextFireAt)) e.nextFireAt = j.nextFireAt; }
      else e.running++;
      by.set(cid, e);
    }
    return by;
  });
  // the stored layout (in memory only): the desktops, and which desktop shows which conversation's window
  const layoutIndex = memo(1000, () => {
    const lay = persistenceRouter && typeof persistenceRouter.layoutsCached === 'function' ? persistenceRouter.layoutsCached() : null;
    if (!lay || typeof lay !== 'object') return null;
    const meta = Array.isArray(lay.desktopMeta) ? lay.desktopMeta.filter((d) => d && d.id && d.id !== '__stage__') : [];
    const names = new Map(meta.map((d) => [String(d.id), d.name || null]));
    const win = new Map();
    for (const [dk, d] of Object.entries(lay.desktops || {})) {
      if (dk === '__stage__') continue;
      for (const w of ((d && d.autoSave && d.autoSave.windows) || [])) { const sid = w && w.openSpec && (w.openSpec.backendSessionId || w.openSpec.serverId); if (sid && !win.has(String(sid))) win.set(String(sid), { id: dk, name: names.get(dk) || null }); }
    }
    return { desktops: meta.map((d) => ({ id: String(d.id), name: d.name || null })), win };
  });
  // the layout not in memory: still being read — or a read that FAILED, said with its error's code (never «ask again» for ever)
  const noLayout = () => { const c = persistenceRouter && typeof persistenceRouter.layoutsError === 'function' ? persistenceRouter.layoutsError() : null; return c ? `the stored layout could not be read (${c})` : 'the stored layout is still being read — ask again'; };
  const cidOfKey = (key) => (key ? String(key).slice(String(key).indexOf(':') + 1) : null);
  return {
    capsOf: (b) => require('../backend-caps.js').capsOf(b),
    levelDeclared: (v, host = null) => {   // piece 2b: in memory (the catalog's ledger); B-24e2: a PAIRED machine reads its own binary
      const d = require('./cli-model-catalog.js').levelSignalOf(v);
      if (d === true || d === false || !host || !hosts) return d;
      const R = require('./cli-level-reported.js');
      const nameOf = (h) => { try { const x = hosts.get(h); return (x && x.name) || null; } catch { return null; } };   // B-24e2: the machine's name for the words
      // THE DOOR IS JUDGED FIRST (round wiqep65pr, the must): a machine whose link is DOWN is said «not connected» from the first read and
      // nothing is asked; an agent without the capability is said «older» from the first read — never «being read» for either
      const machine = nameOf(host) || host, link = R.linkOf(hosts, host);
      if (link !== 'ok') { R.sayDoor(v, host, link, machine); return { pending: link, machine }; }
      R.want(v, host, (h, ver) => hosts.cliLevelOf(h, ver), { nameOf });   // the facts read IS the trigger (the manager's list reads it first); the CONVERSATION's build
      const e = R.asking(v, host) ? { kind: 'reading' } : R.endOf(v, host);
      return e && e.kind !== 'read' && e.kind !== 'failed' ? { pending: e.kind, machine, retryAt: e.retryAt || null } : d;   // (5) the refused end names its door
    },
    keyOf: (s) => { const cid = idOf(s); return cid ? `${s.backend || 'claude'}:${cid}` : null; },
    turnOf: require('./turn-facts.js').turnOf, turnKnown: require('./turn-facts.js').turnKnown,
    heldOf: (s) => {
      const mm = s && s._normalizer;
      if (mm && typeof mm.queuePublished === 'function' && mm.queuePublished() && typeof mm.queueState === 'function') { const q = mm.queueState(); return Array.isArray(q) ? q.length : undefined; }
      return s && s._convFacts && Number.isInteger(s._convFacts.heldAtBoot) ? s._convFacts.heldAtBoot : undefined;   // the wrapper's sidecar queue, read at the adoption
    },
    asksOf: (key) => { if (!userTodos) return undefined; if (typeof userTodos.isHeldUnread === 'function' && userTodos.isHeldUnread()) return undefined; /* B-44f3: For you held unread — its asks are UNKNOWN, never «none» */ const all = userTodos.forSession([key]); return Array.isArray(all) ? all.filter((i) => i && i.by === 'agent' && i.kind !== 'notice' && i.kind !== 'page') : undefined; },
    goalOf: (s) => { if (!s) return undefined; if (!s._goal) return 'none'; const st = String(s._goalStatus || '').toLowerCase(); return st === 'complete' ? 'none' : st ? 'active' : undefined; },
    continueOf: (s, id) => { const ar = autoResume(); if (!ar || typeof ar.statusFor !== 'function') return undefined; const st = ar.statusFor(id); return st ? { armed: !!st.armed, resetsAt: st.resetsAt || null } : undefined; },
    jobsOf: (key) => { const by = jobsIndex(); if (!by) return undefined; if (by.ownerless) return { why: `${by.ownerless} job${by.ownerless === 1 ? '' : 's'} recovered from the store with no owner — whose they are is unknown` }; return by.get(cidOfKey(key)) || { running: 0, schedules: 0, nextFireAt: null, items: [] }; },
    handoverOf: (s) => { const cid = idOf(s); const sv = stashView(), dv = deliver(); if (!cid || !sv || typeof sv.inFlight !== 'function') return undefined; return !!(sv.inFlight(cid) || (dv && typeof dv.handoverArmed === 'function' && dv.handoverArmed(cid))); },
    browserOf: (s, id) => {
      const k = keeper(); if (!k || typeof k.inputSummaryFor !== 'function') return { known: false, why: WHY.notCollected };
      const bk = s && s._browserKey; if (!bk) return null;
      const sum = k.inputSummaryFor(bk); if (!sum || sum.has === false) return null;
      const bs = browserStream(); const viewers = bs && typeof bs.viewerCount === 'function' ? bs.viewerCount(id) : null;
      let personBrowsing = false;
      try { for (const st of (k.inputsFor ? k.inputsFor(bk) : [])) { if (st.profileId && k.humanOf) { const h = k.humanOf(st.profileId); if (h && h.state === 'driving') personBrowsing = true; } } } catch { personBrowsing = null; }
      return { browserKey: bk, drivenBy: sum.input === 'user' ? 'person' : null, viewers, personBrowsing, ...(Number.isInteger(viewers) && personBrowsing !== null ? {} : { known: false, why: WHY.notCollected }) };
    },
    // lane browsers-stop (majordomo piece 6): every running browser from the keeper's rows (stopRows: a read, no file) — the id
    // browsers.stop takes; its holders as conversation keys (a holder not running here stays a mark no key matches: never listed by it)
    browsers: () => {
      const k = keeper(); if (!k || typeof k.stopRows !== 'function') return { why: WHY.notCollected };
      let rows = null; try { rows = k.stopRows(); } catch { rows = null; }
      if (!Array.isArray(rows)) return { why: 'the browser keeper did not answer' };
      const keyOfSid = (sid) => { const s = sid && activeSessions && typeof activeSessions.get === 'function' ? activeSessions.get(sid) : null; const cid = idOf(s); return cid ? `${s.backend || 'claude'}:${cid}` : null; };
      return rows.map((r) => ({ id: r.id, kind: r.kind, name: r.name || null, running: true, memBytes: Number.isFinite(r.memBytes) ? r.memBytes : null, lastCommandAt: Number.isFinite(r.lastCommandAt) ? r.lastCommandAt : null,
        holders: (Array.isArray(r.holders) ? r.holders : []).map((h) => keyOfSid(h && h.sessionId) || 'a conversation not running here') }));
    },
    prepare: () => (persistenceRouter && typeof persistenceRouter.layoutsAsync === 'function' ? persistenceRouter.layoutsAsync() : null),
    desktopOf: (key) => { const L = layoutIndex(); if (!L) return { why: noLayout() }; const d = L.win.get(String(cidOfKey(key))); return { desktop: d || null, window: !!d }; },
    desktops: () => { const L = layoutIndex(); return L ? L.desktops : { why: noLayout() }; },
    endedRows: async () => {
      const kept = typeof stoppedSessions === 'function' ? await stoppedSessions() : [];
      return (Array.isArray(kept) ? kept : []).filter((r) => r && (r.backendSessionId || r.sessionId)).map((r) => ({
        key: `${r.backend || 'claude'}:${r.backendSessionId || r.sessionId}`, name: r.name || null, cwd: r.cwd || null, backend: r.backend || 'claude', mode: r.mode || null,
        // who ended it (lane end-obeys-verdict): a restart, or an end on purpose — a person, or an agent by id and name
        ended: { at: r.stoppedAt || null, by: r.stopReason === 'dead-socket-at-boot' ? 'restart' : r.stopReason === 'ended' ? (r.endedBy && typeof r.endedBy === 'object' ? r.endedBy : { kind: 'person', actorId: null, name: null }) : (r.stopReason || null) } }));
    },
    machineMem: async () => { const h = sysinfo && typeof sysinfo.history === 'function' ? sysinfo.history(5 * 60 * 1000) : null; const p = Array.isArray(h) && h.length ? h[h.length - 1] : null; return p && Number.isFinite(p.l) ? { memTotal: p.l, memAvailable: Number.isFinite(p.m) ? Math.max(0, p.l - p.m) : null } : { why: WHY.measuring }; },
    memOf: treeUsage ? async (s) => { const pid = s && s._childPid; if (!pid) return { why: WHY.noProcess }; const u = await treeUsage(pid); return u && Number.isFinite(u.memBytes) && u.memBytes > 0 ? u.memBytes : { why: WHY.noProcess }; } : null,
    // the age pass of the day-report unit itself (no copy, no stand-in): one fs.promises.stat per output file, null once cancelled
    agesOf: (entries, signal) => LDR.outputTimes(entries, buffersDir, { signal }),
  };
}

module.exports = { create, sourcesFrom, LINK_CONVERSATION, LINK_DESKTOP };
