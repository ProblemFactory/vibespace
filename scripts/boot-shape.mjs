// PRODUCTION-SHAPED STORES for a boot measurement (B-1319, lane boot-loop-hold): the stores a VibeSpace boot reads, at
// the SIZES production's had on 2026-10-13 (byte counts + row counts + field names, read off the files' shape — never
// a value: every value here is invented by a seeded PRNG). scripts/test-boot-loop-hold.mjs boots a scratch worktree
// server over them. The telemetry months (215 MB) are left out: a boot never reads them.
//   usage ledger: 13 monthly shards, 395 MB / ~815 k rows of 485 B; _cursors.json 12 543 keys; attribution 6.7 k rows
//   OTel stash 163 MB / 353 k rows; anchors 22 files / 34 MB; probe log 8.9 MB; jobs 297 + archive 2 000
//   channels index 2 032 conversations (2.5 MB) + poll stamps + outbox + groups + API proposals (1 MB)
//   task groups 1.8 MB, user todos 1 000 (1.2 MB), session status 500 + 545 histories, session-meta × 79,
//   the audit logs, user-state (6 291 archived sessions), the decision memo; HOME: 55 project dirs of transcripts
// The conversations' folders are /srv/work/… (never a /tmp/vs-* fixture root — the boot's fixture-ledger purge would
// eat those rows — and never another home: the home-rename self-heal would rewrite every store), and every one-shot
// migration reads as applied (production ran them long ago; `repoDir` names the registry they are read from).
// writeBootShape({ dataDir, homeDir, repoDir, scale = 1 }) → { rows, bytes } — deterministic for a given scale.
// only: 'ledger' writes the usage ledger's shards alone (the same rows) — test-ledger-rebuild's fixture (B-748f).
import fs from 'node:fs';
import path from 'node:path';

export function writeBootShape({ dataDir: D, homeDir: H, repoDir = null, scale: S = 1, now: NOW = Date.now(), only = null }) {
  let seed = 12345;
  const rnd = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; // mulberry32 (an LCG in doubles degenerates)
  const ri = (n) => Math.floor(rnd() * n), pick = (a) => a[ri(a.length)];
  const hex = (n) => { let s = ''; while (s.length < n) s += ri(0x10000000).toString(16).padStart(7, '0'); return s.slice(0, n); };
  const uuid = () => `${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`;
  const WORDS = 'the quick brown fox jumps over a lazy dog while agents build lanes and gates turn green after review of every census row'.split(' ');
  const text = (n) => { let s = ''; while (s.length < n) s += pick(WORDS) + ' '; return s.slice(0, n); };
  const mk = (p) => fs.mkdirSync(p, { recursive: true });
  let bytes = 0;
  const w = (rel, s) => { const f = path.join(D, rel); mk(path.dirname(f)); fs.writeFileSync(f, s); bytes += Buffer.byteLength(s); };
  const ndjson = (rel, want, row) => {
    const f = path.join(D, rel); mk(path.dirname(f)); const fd = fs.openSync(f, 'w'); let n = 0, b = 0, buf = [];
    while (b < want) { const l = JSON.stringify(row(n++)) + '\n'; b += Buffer.byteLength(l); buf.push(l); if (buf.length >= 5000) { fs.writeSync(fd, buf.join('')); buf = []; } }
    if (buf.length) fs.writeSync(fd, buf.join('')); fs.closeSync(fd); bytes += b; return n;
  };
  const DAY = 864e5, rows = {};
  const ACCTS = Array.from({ length: 14 }, () => 'sub-' + hex(12)), POOLS = Array.from({ length: 4 }, () => 'pool-' + hex(12));
  const SIDS = Array.from({ length: 400 }, uuid), CWDS = Array.from({ length: 55 }, (_, i) => `/srv/work/Project${String(i).padStart(2, '0')}`);
  const PROJ = CWDS.map((c) => path.join(H, '.claude/projects', c.replace(/[/._]/g, '-')));
  const MODELS = ['claude-opus-4-6', 'claude-fable-5-1', 'claude-sonnet-5', 'claude-haiku-4-5'];
  // ── the usage ledger (one shard per month, MB) ──
  const MONTHS = { '2025-10': 10.3, '2025-11': 4.5, '2025-12': 0.24, '2026-01': 9.5, '2026-02': 0.023, '2026-03': 4.1, '2026-04': 9.4, '2026-05': 16.5, '2026-06': 42.9, '2026-07': 46.7, '2026-08': 22.2, '2026-09': 114.6, '2026-10': 114.7 };
  const nowMonth = new Date(NOW), mOff = (nowMonth.getUTCFullYear() - 2026) * 12 + nowMonth.getUTCMonth() - 9; // the shards keep their AGE: the newest is this month
  rows.ledger = 0;
  for (const [m, mb] of Object.entries(MONTHS)) {
    const d0 = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5) - 1 + mOff, 1)), t0 = d0.getTime();
    const t1 = Math.min(NOW - 60e3, Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 1) - 1), name = d0.toISOString().slice(0, 7);
    const want = mb * 1e6 * S, est = Math.max(1, Math.round(want / 485));
    rows.ledger += ndjson(`usage-history/events-${name}.ndjson`, want, (n) => ({ rid: 'req_' + hex(24), mid: 'msg_' + hex(24), ts: Math.round(t0 + (t1 - t0) * Math.min(1, Math.max(0, (n + (ri(10) ? 0 : ri(400) - 200)) / est))), sid: pick(SIDS), be: 'claude', model: pick(MODELS), acct: pick(ACCTS), pool: pick(POOLS), atype: 'subscription', aname: 'Account ' + hex(3), mode: null, host: null, cwd: pick(CWDS), wcwd: pick(CWDS) + '/wt-x', origin: 'terminal', agent: 'general-purpose-' + hex(7), i: 1 + ri(400), cw5: ri(5) ? 0 : ri(30000), cw1: 0, cr: ri(200000), o: ri(3000), tier: 'standard' }));
  }
  if (only === 'ledger') return { rows, bytes };
  rows.otel = ndjson('usage-history/otel-truth.ndjson', 163.5e6 * S, (n) => ({ event: 'api_request', ts: NOW - 29 * DAY + Math.round(n * 29 * DAY / (353e3 * S)), rid: 'req_' + hex(24), sid: pick(SIDS), orgUuid: uuid(), accountUuid: uuid(), email: 'someone' + ri(9) + '@example.org', model: pick(MODELS), i: ri(400), o: ri(3000), cr: ri(200000), cw: ri(30000), costUsd: rnd(), cliVersion: '2.1.288', acct: pick(ACCTS), acctKnown: true, attributed: pick(ACCTS), agreed: true }));
  const cursors = {}; for (let i = 0; i < Math.round(12543 * S); i++) cursors[path.join(pick(PROJ), uuid() + '.jsonl')] = { offset: ri(5e6), lastRid: 'req_' + hex(24) };
  w('usage-history/_cursors.json', JSON.stringify(cursors));
  rows.attribution = ndjson('usage-history/attribution.ndjson', 0.79e6 * S, () => ({ sid: pick(SIDS), acct: pick(ACCTS), ts: NOW - ri(90) * DAY }));
  w('usage-history/pricing.json', '{}');
  w('usage-history/.attrib-rebake-v1', JSON.stringify({ at: NOW - 90 * DAY, changed: 0 })); // done long ago on production (a one-shot)
  // ── the usage probe log + the estimator's anchors ──
  const probeRow = () => ({ at: NOW - ri(30) * DAY, rung: 'probe', key: 'sub-' + hex(12), name: 'Account ' + hex(5), credsDir: H + '/.vibespace/subs/' + hex(40), configDir: H + '/.vibespace/config/' + hex(50), cwd: pick(CWDS) + '/' + hex(40), argv: ['claude', '-p', '/usage', '--x'], machineOrgBefore: { email: 'a@example.org', orgUuid: uuid(), orgName: text(40) }, machineOrgAfter: { email: 'a@example.org', orgUuid: uuid(), orgName: text(40) }, exitCode: 0, ms: ri(9000), rawStdout: text(1200), rawStderr: text(300), parsed: { fiveHour: { utilization: ri(100) }, sevenDay: { utilization: ri(100), resetsAt: NOW + DAY }, fetchedAt: NOW } });
  ndjson('usage-probe-log.ndjson.1', 8.39e6 * S, probeRow); ndjson('usage-probe-log.ndjson', 0.5e6 * S, probeRow);
  rows.anchors = 0;
  for (const k of [...Array.from({ length: 20 }, () => 'org_' + uuid()), 'codex___global__', 'email_x@example.org']) rows.anchors += ndjson(`usage-anchors/anchors-${k}.ndjson`, (34e6 / 22) * S, (n) => ({ ts: NOW - 60 * DAY + n * 600e3, fetchedAt: NOW - 60 * DAY + n * 600e3, source: 'probe', accountId: null, identityKey: k.slice(0, 16), buckets: { fiveHour: { u: ri(100), resetsAt: NOW + 3600e3 }, sevenDay: { u: ri(100), resetsAt: NOW + DAY }, scopedWeekly: [] }, prevFetchedAt: NOW - 60 * DAY + (n - 1) * 600e3, elapsedSec: 600, costSince: { total: rnd() * 10, requests: ri(100), models: { 'claude-opus-4-6': rnd() } } }));
  // ── jobs: done, no process (nothing to adopt) ──
  const job = () => ({ id: 'jb-' + hex(8), kind: 'task', name: text(35), note: '', cmd: { argv: ['bash', '-c', text(170)], cwd: pick(CWDS) }, envFrom: [], restart: 'on-failure', health: null, ports: [], publish: false, singleInstance: false, timeoutMs: null, untilOutput: null, stdinOpen: false, notifyUser: true, notify: 'end', notifyOk: true, schedule: null, catchUp: 'none', action: null, context: { payload: text(92) }, interaction: { pending: null, answers: [] }, owner: { conversation: { id: uuid() }, sessionId: 'cw-' + ri(30) + '-' + (NOW - ri(1e9)), sessionCreatedAt: NOW - ri(1e9), createdBy: 'agent', groupsSnapshot: ['T-261002-' + hex(6)] }, access: { view: 'group', control: 'creator' }, stopWithOwner: false, desiredUp: false, state: 'done', exitCode: 0, startedAt: NOW - ri(30) * DAY, endedAt: NOW - ri(30) * DAY, log: { tail: text(900) }, history: Array.from({ length: 3 }, () => ({ at: NOW - ri(9e8), state: 'done', why: text(80) })) });
  w('jobs-archive.json', JSON.stringify(Array.from({ length: Math.round(2000 * S) }, job))); w('jobs.json', JSON.stringify(Array.from({ length: Math.round(297 * S) }, job)));
  // ── channels ──
  const convs = {}, stamps = {};
  for (let i = 0; i < Math.round(2032 * S); i++) { const id = uuid(), k = 'c' + hex(27); convs[k] = { key: ('agents:' + id).slice(0, 43), id, adapterId: 'agents', vendorId: id, title: text(4 + ri(40)), kind: pick(['dm', 'group']), participants: text(4), lastAt: null, unread: ri(9), anchor: null, filterId: null, policy: null, pendingTodoId: null, reachEntries: [], stats: { hits7d: ri(9), msgs7d: ri(90) }, convCaps: { read: 'ok', sendAs: ['user'], why: null, at: NOW }, lane: { via: 'poll', lastPushAt: null, firstSeenByPoll: NOW - DAY, firstSeenTotal: 1 }, readAt: NOW - ri(9e8), createdAt: NOW - ri(9e9), listedAt: NOW, walkedAt: NOW, access: [], watchers: [], recent: Array.from({ length: 3 }, () => ({ at: NOW - ri(9e8), from: text(12), text: text(180) })) }; stamps[k] = [NOW, NOW, NOW]; }
  w('channels/index.json', JSON.stringify({ v: 1, conversations: convs, updatedAt: NOW, accountAssignments: {} })); rows.conversations = Object.keys(convs).length;
  w('channels/poll-stamps.json', JSON.stringify({ v: 1, fields: ['polledAt', 'seenAt', 'pushAt'], stamps }));
  const outbox = {}; for (let i = 0; i < 81; i++) { const id = 'ob-' + hex(9); outbox[id] = { id, adapterId: 'agents', convId: 'c' + hex(15), key: 'agents:' + hex(24), title: text(171), text: text(1215), originalText: text(1233), replyTo: null, why: { kind: 'rule', id: null, label: text(60) }, attachments: [], draftedBy: { kind: 'agent', id: uuid(), name: 'x' }, authority: 'owner', at: NOW, updatedAt: NOW, state: 'sent', sentAt: NOW, history: Array.from({ length: 6 }, () => ({ at: NOW, what: text(300) })) }; }
  w('channels/outbox.json', JSON.stringify({ v: 1, proposals: outbox }));
  const groups = {}; for (let i = 0; i < 100; i++) { const id = 'g-' + hex(8); groups[id] = { id, name: text(22), createdBy: uuid(), createdAt: NOW - DAY, pair: [uuid(), uuid()], members: [0, 1].map(() => ({ member: uuid(), name: 'agent', joinedAt: NOW - DAY, invitedBy: null, notify: 'next-turn', reportedUpTo: NOW, reportedAt: NOW })), archivedAt: null, lastAt: NOW, lastText: text(147) }; }
  w('channels/groups.json', JSON.stringify({ v: 1, groups, ownerRead: {} }));
  const props = {}; for (let i = 0; i < 10; i++) { const id = 'ap-' + hex(13); props[id] = { id, status: 'answered', cred: 'lark', credLabel: 'Lark key', kind: 'call', at: NOW, conv: uuid(), principal: { kind: 'agent', id: uuid(), name: 'x', groups: ['T-261002-x'] }, frozen: { method: 'GET', host: 'open.example.org', path: '/open-apis/' + text(100), query: [], headers: {} }, answer: { status: 200, body: text(100000) } }; }
  w('channels/api-proposals.json', JSON.stringify({ proposals: props }));
  // ── task groups, the For-you inbox, session status ──
  const tasks = {}; for (let t = 0; t < 6; t++) { const id = 'T-26100' + t + '-' + hex(6); tasks[id] = { id, title: text(20), kind: 'task', attention: null, objective: text(300), plan: [], progress: Array.from({ length: Math.round(500 * S) }, () => ({ id: hex(8), at: NOW - ri(9e8), note: text(176), session: 'claude:' + uuid() })), sessions: Array.from({ length: 7 }, () => 'claude:' + uuid()), folders: [{ path: H + '/lanes/**', recursive: true }], contextDir: H + '/workspace/AIWorkspace/SharedContext/' + hex(8), color: null, createdAt: NOW - 90 * DAY, updatedAt: NOW, archived: false, contentUpdatedAt: NOW, backlog: Array.from({ length: Math.round(280 * S) }, () => ({ id: 'B-' + hex(4), text: text(98), status: pick(['open', 'done']), priority: 'normal', claimedBy: [], detail: text(217), addedBy: 'claude:' + uuid(), addedAt: NOW - ri(9e8), resolvedBy: 'claude:' + uuid(), resolvedAt: NOW - ri(9e8) })) }; }
  w('task-groups.json', JSON.stringify({ version: 1, tasks }));
  w('user-todos.json', JSON.stringify({ items: Array.from({ length: Math.round(1000 * S) }, () => ({ id: 'ut-' + hex(10), sessionKey: 'claude:' + uuid(), text: text(52), detail: text(900), urgency: 'normal', status: pick(['resolved', 'resolved', 'dismissed', 'open']), by: 'agent', sessionName: text(12), createdAt: NOW - ri(9e8), resolvedAt: NOW - ri(9e8), resolvedBy: 'user' })) }));
  const statuses = {}, history = {}; for (let i = 0; i < Math.round(545 * S); i++) { const k = 'claude:' + uuid(); if (i < 500 * S) statuses[k] = { state: 'done', urgency: null, reason: text(20), detail: null, setBy: 'agent', at: NOW - ri(9e8), pendingNotices: [] }; history[k] = Array.from({ length: 1 + ri(12) }, () => ({ state: 'working', urgency: null, reason: text(96), detail: null, setBy: 'agent', at: NOW - ri(9e8) })); }
  w('session-status.json', JSON.stringify({ statuses, history }));
  // ── the mid-size stores ──
  w('decision-memo.json', JSON.stringify({ entries: Array.from({ length: 674 }, () => [hex(64), JSON.stringify({ v: text(560) })]) }));
  w('user-state.json', JSON.stringify({ stateVersion: 1, starredSessions: [], archivedSessions: Array.from({ length: Math.round(6291 * S) }, () => 'claude:' + uuid()) }));
  ndjson('exit-audit.jsonl', 2.06e6 * S, () => ({ at: NOW - ri(9e8), origin: 'user', hostId: 'h-' + hex(18), machine: 'MACHINE-' + hex(2), verb: 'grant', by: 'user', ok: true, changed: { use: true, run: false }, summary: { use: { mode: 'ask', n: ri(9) }, run: { mode: 'off', n: 0, ask: false } }, detail: text(1500) }));
  ndjson('browser-audit.jsonl', 1.36e6 * S, () => ({ at: NOW - ri(9e8), sessionId: 'cw-1-' + (NOW - ri(1e9)), browserKey: 'bk-' + hex(8), profileId: 'bp-' + hex(8), verb: 'open', ok: true }));
  ndjson('slot-transitions.jsonl', 0.87e6 * S, () => ({ sessionId: 'cw-1-' + (NOW - ri(1e9)), poolId: pick(POOLS), from: pick(ACCTS), to: pick(ACCTS), at: NOW - ri(9e8), why: 'quota-switch-' + hex(5) }));
  ndjson('window-audit.jsonl', 0.54e6 * S, () => ({ at: NOW - ri(9e8), origin: 'agent-cli', handle: 'w-' + hex(14), verb: 'focus', by: 'agent', ok: true, principal: { kind: 'session', id: 'claude:' + uuid() }, grantOrigin: 'owner', changed: false }));
  ndjson('decision-journal.jsonl', 0.2e6, () => ({ at: NOW - ri(9e8), use: 'feed', dialect: 'anthropic', model: 'claude-haiku-4-5', outcome: 'ok', status: 200, inputTokens: ri(3000), outputTokens: ri(200), reserved: 0, usd: rnd() / 100, est: 0, truncated: false, n: 1, keyFp: hex(6), rubric: 2 }));
  w('sysinfo-history.json', JSON.stringify({ fine: Array.from({ length: 1920 }, (_, i) => ({ t: NOW - (1920 - i) * 45e3, m: ri(100), l: ri(30), c: ri(100), e: 0 })), coarse: Array.from({ length: 672 }, (_, i) => ({ t: NOW - (672 - i) * 900e3, l: ri(30), m: ri(100), c: ri(100), e: 0 })) }));
  const ci = {}; for (let i = 0; i < 313; i++) ci[uuid()] = { hosts: { __local__: { lastSeen: NOW - ri(9e8), src: 'discovery', cwd: pick(CWDS), backend: 'claude' } } };
  w('conversation-index.json', JSON.stringify({ v: 1, conv: ci }));
  // ── session-meta × 79 (one of 433 KB): no socket behind them — the restore's dead-socket rule meets them ──
  for (let i = 0; i < 79; i++) { const sock = 'cw-' + (1 + ri(30)) + '-' + (NOW - ri(9e9)); const m = { name: text(8), cwd: pick(CWDS), host: null, hostName: null, backend: 'claude', backendSessionId: uuid(), claudeSessionId: uuid(), sourceKind: null, agentKind: 'claude', agentRole: '', agentNickname: '', parentThreadId: null, permissionMode: 'bypassPermissions', effort: 'xhigh', agentToken: 'vsst_' + hex(24), taskId: null, accountId: pick(ACCTS), authAtSpawn: 'subscription-pool', createdAt: NOW - ri(9e9), webuiSessionId: 'cw-' + ri(30) + '-' + NOW, mode: 'chat', sessionId: 'cw-' + ri(30) + '-' + NOW, sockName: sock }; if (i === 0) for (let k = 0; k < 52; k++) m['k' + k] = text(8300); w('session-meta/' + sock + '.json', JSON.stringify(m)); }
  // ── HOME: 55 project dirs, 4 small transcripts each (the cursors above name dead files in them, as on production) ──
  for (let p = 0; p < 55; p++) { mk(PROJ[p]); for (let k = 0; k < 4; k++) { const sid = uuid(); fs.writeFileSync(path.join(PROJ[p], sid + '.jsonl'), Array.from({ length: 40 }, (_, j) => JSON.stringify({ type: j % 2 ? 'assistant' : 'user', sessionId: sid, uuid: uuid(), timestamp: new Date(NOW - DAY + j * 6e4).toISOString(), cwd: CWDS[p], message: { role: j % 2 ? 'assistant' : 'user', content: [{ type: 'text', text: text(400) }] } })).join('\n') + '\n'); } }
  if (repoDir) { const ids = new Set([...fs.readFileSync(path.join(repoDir, 'src/server/migrations.js'), 'utf8').matchAll(/\bid: '(\d{4}-\d{2}-[a-z0-9-]+)'/g)].map((m) => m[1])); w('migrations.json', JSON.stringify({ applied: Object.fromEntries([...ids].map((id) => [id, NOW - 30 * DAY])) })); rows.migrations = ids.size; }
  return { rows, bytes };
}
