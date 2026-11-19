#!/usr/bin/env node
// test-delivery-wake.mjs — the manager design's piece 7 (主开发 2026-11-17; the owner's decision of 2026-11-16): DELIVERIES RESUME
// THEIR ADDRESSEE, the PURE half (src/delivery-wake.js). No hub, no CLI, no billed turn.
//   ① which deliveries OWE their ended addressee a wake (a job's result / missed one-time / interrupted task / reminder to its
//      OWNER; an agent's message to ONE addressee with a wake) and which ONLY WAIT, each by name (no wake, a fan-out, a subscriber's
//      copy, a channel message, anything archived) — RED CONTROL: a copy that drops the subscriber rule owes a copy
//   ①b HOW IT ENDED (the owner's narrowed rule, 主开发 2026-11-17 04:56Z / 05:02Z): a RESTART ⇒ resumed; an end ON PURPOSE (a
//      person's or an agent's, alike) ⇒ only a delivering job or schedule carrying the person's GRANT; no record / another reason
//      ⇒ it waits — RED CONTROL: the restart road applied to a person's end resumes a schedule with no grant; the doors' rows
//   ② the resume verb's rules as a DELIVERY reads them — piece 4's own, UNCHANGED (主开发 12:46Z MUST 1: a wake authorises ONE
//      turn, a goal runs many): an active goal, a CLI timer mark, an unknown goal, archived, «needs a page» each WAIT, by code —
//      RED CONTROL: a copy that admits the goal conversation (the d57aec1ae «continues») resumes it
//   ③ THE GATE, IN ORDER: cannot-resume, then how it ended, then who pays, then the account's limit (waits, until when), then the spend probe —
//      RED CONTROL: a copy that asks the probe before the limit answers «spend» for an account at its limit (the order bites)
//   ④ the words: the sender's (agent-facing, English), the journal's `wake` lane, the waiting row (keys + params, a limit's
//      `until` an epoch the page renders) and the SEEN line (rule 3), the hand-over's last sentence word for word; nothing says «sleep»
//   ⑤ no new spend reason: every reason a wake passes under is one the spend authorizer already knows
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { anchored } from './scratch.mjs';   // a control whose anchor moved throws «ANCHOR GONE» by its name (test-suite-files-parse §3)

const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (extra !== undefined ? '\n    ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const D = require(path.join(REPO, 'src/delivery-wake.js'));
const SRC = fs.readFileSync(path.join(REPO, 'src/delivery-wake.js'), 'utf8');
const M = mutantCopies('delivery-wake', REPO);
const mutant = (from, to, tag) => require(M.write('src/delivery-wake.js', anchored(SRC, from, to, tag), tag));

console.log('① which deliveries owe their ended addressee a wake');
{
  const owes = [
    [{ producer: 'jobs', kind: 'result' }, 'job-notification'], [{ producer: 'jobs', kind: 'missed' }, 'job-notification'],
    [{ producer: 'jobs', kind: 'interrupted' }, 'job-notification'], [{ producer: 'jobs', kind: 'reminder' }, 'job-notification'],
    [{ producer: 'groups', wake: true, addressees: 1 }, 'peer-message'],
  ];
  const got = owes.map(([d, reason]) => ({ d, want: reason, v: D.owesWake({ ...d }) }));
  ok(got.every((g) => g.v.owe === true && g.v.reason === g.want), 'a job\'s result / missed one-time / interrupted task / reminder to its owner, and a one-addressee wake, owe a wake — under the producer\'s own reason', got.map((g) => g.v));
  const waits = [
    [{ producer: 'groups', wake: false, addressees: 1 }, 'no_wake'], [{ producer: 'groups', wake: true, addressees: 3 }, 'fan_out'],
    [{ producer: 'jobs', kind: 'subscriber' }, 'subscriber_copy'], [{ producer: 'channel' }, 'channel'],
    [{ producer: 'outbox' }, 'only_waits'], [{ producer: 'handback' }, 'only_waits'], [{ producer: 'retry' }, 'only_waits'],
    [{ producer: 'jobs', kind: 'result', archived: true }, 'archived'],
  ];
  const w = waits.map(([d, code]) => ({ code, v: D.owesWake({ ...d }) }));
  ok(w.every((x) => x.v.owe === false && x.v.code === x.code), 'a message with no wake, a fan-out, a subscriber\'s copy, a channel message, an outbox receipt, a hand-back, a stash retry and anything archived ONLY WAIT — each by name', w.map((x) => x.v));
  const m = mutant("if (x.kind === 'subscriber') return { owe: false, code: 'subscriber_copy' };", '', 'no-subscriber-rule');
  ok(!!m && m.owesWake({ producer: 'jobs', kind: 'subscriber' }).code !== 'subscriber_copy', '① RED CONTROL: a copy without the subscriber rule no longer names a subscriber\'s copy — the rule is what says it', m && m.owesWake({ producer: 'jobs', kind: 'subscriber' }));
}

console.log('①b how it ended decides (the owner\'s narrowed rule; the grant on the job, 主开发 05:02Z)');
{
  const plain = [{ jobId: 'jb-nightly', jobName: 'nightly report' }];
  const granted = [{ jobId: 'jb-nightly', jobName: 'nightly report', granted: true }];
  const restart = D.endedHow({ stopReason: 'dead-socket-at-boot', stoppedAt: 5 });
  const older = D.endedHow({ stoppedAt: 5 });   // a kept record from before the field: boot-restore's own default
  const person = D.endedHow({ stopReason: 'ended', stoppedAt: 5, endedBy: { kind: 'person', by: 'user:owner' } });
  const agent = D.endedHow({ stopReason: 'ended', stoppedAt: 5, endedBy: { kind: 'agent', by: 'agent:c1', name: 'coordinator' } });
  const none = D.endedHow(null), other = D.endedHow({ stopReason: 'exited' });
  ok(restart.kind === 'restart' && older.kind === 'restart' && person.kind === 'person' && agent.kind === 'agent' && agent.name === 'coordinator' && none.kind === 'unknown' && other.kind === 'unknown',
    'the kept record says how it ended — by the reason\'s VALUE (a record without one is a restart\'s: boot-restore\'s default); who ended it is piece 3\'s field', { restart, older, person, agent, none, other });
  const r1 = D.endedRule(restart, plain), r2 = D.endedRule(person, plain), r3 = D.endedRule(person, granted), r4 = D.endedRule(agent, plain), r4b = D.endedRule(agent, granted), r5 = D.endedRule(none, granted), r6 = D.endedRule(person, [{ gid: 'g-1', granted: true }]);
  ok(r1.ok && r1.rule === 'restart', 'rule 1: a conversation a RESTART ended is resumed by its delivery — no grant needed', r1);
  ok(!r2.ok && r2.code === 'ended_on_purpose' && /a person/.test(r2.why), 'rule 2: a schedule WITHOUT the grant at a PERSON-ended conversation WAITS — said with who ended it', r2);
  ok(r3.ok && r3.rule === 'granted' && r3.jobs[0] === 'jb-nightly', '…the same schedule WITH the grant resumes it — and names the granting job', r3);
  ok(!r4.ok && /coordinator/.test(r4.why) && r4b.ok && r4b.rule === 'granted', 'an AGENT-ended conversation: its job WITHOUT the grant waits (the agent named), WITH it resumes — a person\'s end and an agent\'s alike', { r4, r4b });
  ok(!r5.ok && r5.code === 'ended_unknown' && !r6.ok, 'no record waits even for a granted job (unknown is not a restart); a PEER\'s wake never resumes an on-purpose end', { r5, r6 });
  const swapped = anchored(SRC, "if (h.kind === 'restart') return { ok: true, rule: 'restart', jobs: [] };", "if (h.kind === 'restart' || h.kind === 'person') return { ok: true, rule: 'restart', jobs: [] };", 'restart-road-for-person');
  const m = swapped !== SRC ? require(M.write('src/delivery-wake.js', swapped, 'restart-road-for-person')) : null;
  ok(!!m && m.endedRule(m.endedHow({ stopReason: 'ended', endedBy: { kind: 'person' } }), plain).ok === true, '①b RED CONTROL: the restart road applied to a person\'s end resumes the schedule that has no grant — the kind is what keeps it waiting', m && m.endedRule(m.endedHow({ stopReason: 'ended', endedBy: { kind: 'person' } }), plain));
  const rows = D.wakeChoiceRows([{ id: 'a', label: 'weekly', schedule: '0 9 * * 1', nextFireAt: 300 }, { id: 'b', label: 'build' }, { id: 'c', label: 'nightly', schedule: '0 2 * * *', nextFireAt: 100, grant: true }]);
  ok(rows.map((r) => r.id).join() === 'c,a,b' && rows[0].kind === 'schedule' && rows[2].kind === 'job' && rows[0].grant === true && rows[1].grant === false && rows[2].grant === false, 'the doors\' rows: soonest next fire first, a schedule named as one, each tick = the STORED grant (default no)', rows);
}

console.log('② the resume verb\'s rules, as a delivery reads them (piece 4\'s, unchanged)');
{
  const chat = { headless: true, resumeContinues: 'goal' };
  const goal = D.deliveryResumeVerdict({ goal: 'active', queue: 0, mode: 'chat' }, chat);
  const timer = D.deliveryResumeVerdict({ goal: 'none', queue: 0, timerMark: true, mode: 'chat' }, chat);
  const unknown = D.deliveryResumeVerdict({ goal: 'unknown', queue: 0, mode: 'chat' }, chat);
  const plain = D.deliveryResumeVerdict({ goal: 'none', queue: 0, mode: 'chat' }, chat);
  ok(!goal.ok && goal.code === 'goal_active' && !timer.ok && timer.code === 'timer_marked' && !unknown.ok && unknown.code === 'goal_unknown' && plain.ok === true && !('continues' in plain),
    'an active goal, a CLI timer mark and an unknown goal (on a harness that continues one by itself) each WAIT, by code — one counted turn could restart a goal loop nobody counts', { goal, timer, unknown, plain });
  const archived = D.deliveryResumeVerdict({ archived: true, goal: 'none', mode: 'chat' }, chat);
  const terminal = D.deliveryResumeVerdict({ goal: 'none', mode: 'terminal' }, chat);
  ok(!archived.ok && archived.code === 'archived' && !terminal.ok && terminal.code === 'needs_a_page', 'archived and «needs a page» (a terminal-only conversation) refuse too — the words wait', { archived, terminal });
  const g0 = D.gate({ verdict: goal, ended: { ok: true, rule: 'restart', jobs: [] }, identity: { key: 'k' }, limit: { usable: true }, probe: { ok: true } });
  ok(g0.go === false && g0.code === 'goal_active', '…and the gate answers with that code (the ended row words it: a person resumes it)', g0);
  const m = mutant("return v.ok ? { ok: true } : { ok: false, code: v.code, why: v.why };", "return v.ok || v.code === 'goal_active' ? { ok: true } : { ok: false, code: v.code, why: v.why };", 'goal-admitted');
  ok(!!m && m.deliveryResumeVerdict({ goal: 'active', queue: 0, mode: 'chat' }, chat).ok === true, '② RED CONTROL: a copy that admits the goal conversation resumes it — the kept refusal is what holds it', m && m.deliveryResumeVerdict({ goal: 'active', queue: 0, mode: 'chat' }, chat));
}

console.log('③ THE GATE, in order, before anything spawns');
{
  const id = { key: 'acct-1', name: 'Work Max' };
  const rst = { ok: true, rule: 'restart', jobs: [] };
  const go = D.gate({ verdict: { ok: true }, ended: rst, identity: id, limit: { usable: true }, probe: { ok: true } });
  ok(go.go === true && go.rule === 'restart' && !('continues' in go), 'all five answered yes ⇒ go (and by which rule)', go);
  const unread = D.gate({ ended: rst, identity: id, limit: { unread: true, why: 'its account\'s limit could not be read (the store threw)' }, probe: { ok: true } });
  ok(unread.go === false && unread.code === 'limit_unread' && /could not be read/.test(unread.why), 'a limit that could not be READ refuses with its own words (never a turn on a guess) — a missing reading stays the guard\'s', unread);
  const purpose = D.gate({ ended: { ok: false, code: 'ended_on_purpose', why: 'it was ended on purpose by a person (Terminate)' }, identity: id, limit: { usable: true }, probe: { ok: true } });
  const unknown = D.gate({ identity: id, limit: { usable: true }, probe: { ok: true } });
  ok(purpose.go === false && purpose.code === 'ended_on_purpose' && unknown.go === false && unknown.code === 'ended_unknown', '0b. how it ended refuses BEFORE who pays is read — and an unread end is no restart (fail closed)', { purpose, unknown });
  const cannot = D.gate({ verdict: { ok: false, code: 'archived', why: 'archived' }, identity: null, limit: { usable: false }, probe: { ok: false } });
  ok(cannot.go === false && cannot.code === 'archived', '0. a conversation a delivery cannot resume refuses first — by its own code', cannot);
  const nobody = D.gate({ ended: rst, identity: { key: '' }, limit: { usable: false, blockedUntil: 9 }, probe: { ok: false } });
  ok(nobody.go === false && nobody.code === 'identity', '1. who pays cannot be named ⇒ refused before anything is read (the guard\'s fail-closed rule)', nobody);
  const limit = D.gate({ ended: rst, identity: id, limit: { usable: false, blockedUntil: 1794900000000 }, probe: { ok: false, reason: 'hour cap' } });
  ok(limit.go === false && limit.code === 'limit' && limit.until === 1794900000000, '2. an account at its limit WAITS and says until when — before the spend guard is asked', limit);
  const spend = D.gate({ ended: rst, identity: id, limit: { usable: true }, probe: { ok: false, reason: 'the hour\'s 12 unattended turns are spent' } });
  ok(spend.go === false && spend.code === 'spend' && /12 unattended/.test(spend.why), '3. the spend probe refuses ⇒ refused by its own words', spend);
  const noProbe = D.gate({ ended: rst, identity: id, limit: { usable: true }, probe: null });
  ok(noProbe.go === false && noProbe.code === 'spend', '…no probe answer is a refusal (fail closed)', noProbe);
  const swapped = anchored(SRC, /(  if \(limit && limit\.usable === false\)[^\n]*\n)(  if \(!probe[^\n]*\n)/, '$2$1', 'probe-first');
  const m = swapped !== SRC ? require(M.write('src/delivery-wake.js', swapped, 'probe-first')) : null;
  ok(!!m && m.gate({ ended: rst, identity: id, limit: { usable: false, blockedUntil: 5 }, probe: { ok: false, reason: 'cap' } }).code === 'spend', '③ RED CONTROL: a copy that asks the probe before the limit answers «spend» for an account at its limit — the order is what says until when', m && m.gate({ ended: rst, identity: id, limit: { usable: false, blockedUntil: 5 }, probe: { ok: false } }));
}

console.log('④ the words each party is told');
{
  const s = ['resuming', 'refused', 'failed', 'fan_out', 'archived', 'owed', 'no_wake'].map((o) => D.senderWords(o, { why: 'the hour cap', count: 3 }));
  ok(s.every((x) => typeof x === 'string' && x.length > 20) && /being resumed/.test(s[0]) && /the hour cap/.test(s[1]) && /3 member/.test(s[3]) && /archived/.test(s[4]) && /restart/.test(s[5]) && /on purpose/.test(s[5]),
    'the sender (an agent) hears plain English: resuming, refused with why, failed with why, fan-out with the count, archived, owed (a restart resumes it, an on-purpose end waits), waiting', s);
  const j1 = D.journalWords('resuming'), j2 = D.journalWords('refused', { why: 'cap' });
  ok(j1.lane === 'wake' && j1.ok === true && j2.lane === 'wake' && j2.ok === false && j2.params.why === 'cap', 'the job journal gets a `wake` line (ok or not, its why)', { j1, j2 });
  const r0 = D.waitingRow(0), r1 = D.waitingRow(2), r2 = D.waitingRow(2, { code: 'limit', until: 1794900000000 }), r3 = D.waitingRow(2, { code: 'spend', why: 'the hour cap' });
  ok(r0 === null && r1.params.n === 2 && /notices are waiting for it/.test(r1.key) && r2.until === 1794900000000 && /until \{when\}/.test(r2.key) && r3.params.why === 'the hour cap',
    'the row / bar / card: «{n} notices are waiting for it», after a refusal «— not resumed: {why}», a limit with its until (an epoch the page renders); none drawn at 0', { r1, r2, r3 });
  const seen = D.resumedLine(['nightly report', 'nightly report', 'build'], 1794900000000), none = D.resumedLine([], 1794900000000);
  ok(seen.key === 'Resumed {when} to deliver: {what}' && seen.params.what === 'nightly report, build' && seen.at === 1794900000000 && none === null,
    'rule 3: the SEEN line names what resumed it (each once) and when (an epoch the page renders) — none without a name', { seen, none });
  const byYou = D.resumedLine(['nightly report'], 5, { by: { kind: 'person', by: 'person' } }), byKey = D.resumedLine(['nightly report'], 5, { by: { kind: 'key', by: 'automation:ak-1', name: 'dispatch' } });
  ok(/you allowed it/.test(byYou.key) && byYou.by.kind === 'person' && /the key «\{by\}»/.test(byKey.key) && byKey.params.by === 'dispatch',
    '…and after an end on purpose it names WHO allowed it — the person, or the manager key by its name (主开发 05:13Z)', { byYou, byKey });
  ok(/an agent cannot set wakesEndedOwner/.test(D.GRANT_REFUSAL) && /Terminate confirm/.test(D.GRANT_REFUSAL) && /jobs\.wakeGrant/.test(D.GRANT_REFUSAL) && /vibespace-job propose-wake <id>/.test(D.GRANT_REFUSAL),
    'a plain agent token\'s write is refused BY NAME, naming the doors that exist (the person\'s, the key verb) and the PROPOSE door (lane login-request-card\'s card binds it)', D.GRANT_REFUSAL);
  const rf = D.resumedRefusedLine(['nightly report'], 9, { code: 'spend', why: 'the hour cap' });
  ok(rf.refused.code === 'spend' && rf.params.what === 'nightly report' && rf.at === 9 && D.peerLead('alpha · crew') === 'alpha · crew sent it a message with a wake',
    'a hand-over refused AFTER the resume leaves its line on the live conversation (the code the page words); the bare peer lead names who woke it', { rf, lead: D.peerLead('alpha · crew') });
  ok(D.FRAME_TAIL === 'This conversation had been ended and was resumed to hand you this. Background tasks and timers it had before are gone.', 'the hand-over\'s last sentence, word for word (the design)');
  const all = [...s, j1.key, j2.key, r1.key, r2.key, r3.key, seen.key, byYou.key, byKey.key, rf.key, D.FRAME_TAIL, D.GRANT_REFUSAL].join(' ');
  ok(!/sleep|asleep|睡|眠/i.test(all), 'nothing says «sleep» (the brief)');
}

console.log('⑤ no new spend reason');
{
  const A = require(path.join(REPO, 'src/spend-authorizer.js'));
  const known = new Set(Object.keys(A.SPEND_REASONS || {}).length ? Object.keys(A.SPEND_REASONS) : (A.SPEND_REASONS || []));
  ok(D.WAKE_REASONS.length === 2 && D.WAKE_REASONS.every((r) => known.has(r)), `every reason a wake passes under is the producer's own, already known to the spend authorizer (${D.WAKE_REASONS.join(', ')})`, [...known].slice(0, 20));
}

for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 3, label: 'copies ' })) ok(r.pass, r.name, r.detail);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
