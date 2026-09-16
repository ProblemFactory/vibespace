// The NEUTRALIZED Background Work fixture shared by test-jobs-triage (fast)
// and test-jobs-panel (heavy, chrome). Shaped after the owner's measured
// instance on 2026-09-14 — 248 `task` records, 207 done and ALL older than a
// day, 36 failed (33 of them from two render sessions of one project, ages
// 1–7 days), the rail badge stuck on "36!" — with every name, session id and
// group id made up (public-repo hygiene) and EVERY instant derived from the
// `now` the caller injects (a fixture may never pin a calendar date or depend
// on the time of day). NOT a test-*.mjs on purpose: the tier census would
// demand a tier for a helper.
//
// The failed rows cover every acknowledgement source the design names:
//   - notified ok      (an ok:true message delivery in the journal)
//   - stashed only     (a stash entry nobody drained ⇒ UNACKNOWLEDGED)
//   - owner polled     (an `agent-read` stamp — what the owner-lineage route stamps)
//   - stranger read    (no stamp: a stranger session's read never acknowledges)
//   - self read        (no stamp: a jbt_ self-read never acknowledges)
//   - user opened      (a `user-opened` stamp — what POST /seen stamps)
const H = 3600e3, D = 86400e3;

export const SESSIONS = [
  { conversationId: 'e2e00000-0000-4000-8000-00000000a001', sessionId: 'sess-1-1700000000001', name: 'render session A' },
  { conversationId: 'e2e00000-0000-4000-8000-00000000a002', sessionId: 'sess-2-1700000000002', name: 'render session B' },
  { conversationId: 'e2e00000-0000-4000-8000-00000000a003', sessionId: 'sess-3-1700000000003', name: 'export session' },
];
export const GROUP = 'T-1';

const owner = (s) => ({ conversation: { backend: 'claude', id: s.conversationId }, sessionId: s.sessionId, sessionCreatedAt: 1, createdBy: 'agent', groupsSnapshot: [GROUP] });
const access = { view: 'group', control: 'session' };
const id = (n) => `jb-${n.toString(16).padStart(6, '0')}`;

/** @param {number} now  the clock every instant derives from
 *  @param {{done?:number, failed?:number}} [opts]  counts (defaults = the measured shape) */
export function makeFixture(now, { done = 200, failed = 36 } = {}) {
  const jobs = [];
  let n = 1;
  // 200 DONE one-shots, every one YOUNGER than the 24 h clock at `now` (1 h …
  // 23 h ago) so a boot at `now` archives nothing and a sweep at +25 h
  // archives all of them (the EXIT measurement); spread over the three
  // sessions and three name families
  for (let i = 0; i < done; i++) {
    const s = SESSIONS[i % 3];
    const fam = ['export', 'build', 'compile'][i % 3];
    const endedAt = now - (H + Math.round(i * (22 * H) / Math.max(done, 1)));
    jobs.push({ id: id(n++), kind: 'task', name: `${fam}-${i + 1}`, note: '', cmd: { argv: ['sh', '-c', 'true'], cwd: '/tmp' }, envFrom: [], restart: 'on-failure',
      state: 'done', desiredUp: true, proc: null, supervise: { consecutiveFails: 0, parkedAt: null }, owner: owner(s), access, interaction: { pending: null, answers: [] },
      runs: [{ startedAt: endedAt - 60e3, endedAt, exit: 0, cause: 'ok', trigger: 'manual', lastLine: 'ok' }], createdAt: endedAt - 61e3,
      notifyLog: [{ ts: endedAt + 1e3, lane: 'message', ok: true, to: 'peer' }] });
  }
  // 36 FAILED one-shots: 33 from the two render sessions (r1..), 3 from the export session
  const ackKinds = ['notified', 'stash', 'agent-read', 'stranger', 'self', 'user-opened'];
  const failedRows = [];
  for (let i = 0; i < failed; i++) {
    const s = i < 33 ? SESSIONS[i % 2] : SESSIONS[2];
    const fam = i < 33 ? 'render' : 'export';
    const endedAt = now - (D + (i % 5) * D + (i % 5) * H); // ages 1 … 5 days + hours (under the 7 d ack clock; never on a day boundary)
    const kind = ackKinds[i % ackKinds.length];
    const job = { id: id(n++), kind: 'task', name: `${fam}-r${i + 1}`, note: '', cmd: { argv: ['sh', '-c', 'exit 1'], cwd: '/tmp' }, envFrom: [], restart: 'on-failure',
      state: 'failed', desiredUp: true, proc: null, supervise: { consecutiveFails: 0, parkedAt: null }, owner: owner(s), access, interaction: { pending: null, answers: [] },
      runs: [{ startedAt: endedAt - 30e3, endedAt, exit: 1, cause: 'error', trigger: 'manual', lastLine: `Error: frame ${i + 1} failed to render` }], createdAt: endedAt - 31e3, notifyLog: [] };
    if (kind === 'notified') job.notifyLog.push({ ts: endedAt + 500, lane: 'message', ok: true, to: 'peer' });
    else if (kind === 'stash') job.notifyLog.push({ ts: endedAt + 500, lane: 'stash', ok: false, reason: 'not reachable', to: s.conversationId.slice(0, 8) });
    else if (kind === 'agent-read') job.ack = { by: 'agent-read', at: endedAt + 10 * 60e3 };
    else if (kind === 'user-opened') job.ack = { by: 'user-opened', at: endedAt + 20 * 60e3 };
    // 'stranger' / 'self': nothing — a stranger's or the job's own read never acknowledges
    job._fixtureAck = kind; // stripped by the engine's writer (a `_` key); the suite reads it from the generator, not from disk
    jobs.push(job); failedRows.push({ id: job.id, kind });
  }
  // the live shapes the fold must keep visible by default
  const s0 = SESSIONS[0];
  const running = { id: id(n++), kind: 'task', name: 'render-r99', note: '', cmd: { argv: ['sh', '-c', 'sleep 3600'], cwd: '/tmp' }, envFrom: [], restart: 'on-failure', state: 'up', desiredUp: true, proc: null, supervise: { consecutiveFails: 0, parkedAt: null }, owner: owner(s0), access, interaction: { pending: null, answers: [] }, runs: [{ startedAt: now - 5 * 60e3, trigger: 'manual' }], createdAt: now - 5 * 60e3 };
  const awaiting = { id: id(n++), kind: 'task', name: 'qr-login', note: '', cmd: { argv: ['sh', '-c', 'sleep 3600'], cwd: '/tmp' }, envFrom: [], restart: 'on-failure', state: 'awaiting-user', desiredUp: true, proc: null, supervise: { consecutiveFails: 0, parkedAt: null }, owner: owner(SESSIONS[2]), access, interaction: { pending: { panel: { title: 'code', blocks: [{ type: 'buttons', options: [{ id: 'ok', label: 'OK' }] }] }, version: 1, postedAt: now - 60e3, timeoutS: 1800 }, answers: [] }, runs: [{ startedAt: now - 2 * 60e3, trigger: 'manual' }], createdAt: now - 2 * 60e3 };
  const service = { id: id(n++), kind: 'service', name: 'dev-server', note: '', cmd: { argv: ['sh', '-c', 'sleep 3600'], cwd: '/tmp' }, envFrom: [], restart: 'on-failure', ports: [3000], publish: false, state: 'down', desiredUp: false, proc: null, supervise: { consecutiveFails: 0, parkedAt: null }, owner: owner(s0), access, interaction: { pending: null, answers: [] }, runs: [], createdAt: now - 3 * D };
  const cron = { id: id(n++), kind: 'cron', name: 'nightly', note: '', schedule: { cron: '0 3 * * *' }, catchUp: 'once', action: { type: 'spawn-task', task: { cmd: { argv: ['sh', '-c', 'true'] } } }, state: 'scheduled', desiredUp: true, nextFireAt: now + 6 * H, owner: owner(s0), access, interaction: { pending: null, answers: [] }, runs: [], createdAt: now - 3 * D };
  const cronChild = { id: id(n++), kind: 'task', name: 'nightly run', note: '', cmd: { argv: ['sh', '-c', 'true'], cwd: '/tmp' }, envFrom: [], restart: 'on-failure', state: 'done', desiredUp: true, proc: null, supervise: { consecutiveFails: 0, parkedAt: null }, owner: owner(s0), access, interaction: { pending: null, answers: [] }, cronParent: cron.id, runs: [{ startedAt: now - 2 * D, endedAt: now - 2 * D + 30e3, exit: 0, cause: 'ok', trigger: 'cron' }, { startedAt: now - D, endedAt: now - D + 30e3, exit: 0, cause: 'ok', trigger: 'cron' }], createdAt: now - 3 * D, notifyLog: [] };
  jobs.push(running, awaiting, service, cron, cronChild);
  // one stashed notification for the failed 'stash' rows' conversation, typed spend-cap (5b)
  const stashRows = failedRows.filter((r) => r.kind === 'stash');
  const notifs = {};
  for (const r of stashRows) {
    const j = jobs.find((x) => x.id === r.id);
    const cid = j.owner.conversation.id;
    (notifs[cid] = notifs[cid] || []).push({ jobId: j.id, jobName: j.name, text: `failed exit=1 error (1m)`, ts: j.runs[0].endedAt + 500, urgency: 'normal', held: { kind: 'spend-cap', why: 'hour-cap', identity: 'Member A', cap: 12 } });
  }
  return { jobs, notifs, failedRows, ids: { running: running.id, awaiting: awaiting.id, service: service.id, cron: cron.id, cronChild: cronChild.id } };
}

/** Make the engine ADOPT a fixture record as alive at boot: write the wrapper's
 *  pid.json stamp (pid + starttime + bootId — the engine's identity triple)
 *  for a REAL process the suite owns (a `sleep`). Linux /proc only. */
export function writeAliveStamp(fs, path, dataDir, job, pid) {
  const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf-8');
  const starttime = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19]);
  let bootId = '';
  try { bootId = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf-8').trim(); } catch { }
  const run = job.runs[job.runs.length - 1];
  const ctl = path.join(dataDir, 'job-logs', job.id, String(run.startedAt));
  fs.mkdirSync(ctl, { recursive: true });
  fs.writeFileSync(path.join(ctl, 'pid.json'), JSON.stringify({ pid, starttime, bootId, argvHash: 'fixture' }));
  fs.writeFileSync(path.join(ctl, 'current.log'), 'running…\n');
}
