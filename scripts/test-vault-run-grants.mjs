#!/usr/bin/env node
// test-vault-run-grants — THE REQUEST AND ITS GRANT (⑩) and THE CAP's SHAPE (⑩b) of `vibespace-vault run`, moved word for word, in
// their old order, out of test-vault-run (B-54a9 split, 主开发 r3540 / r4355; lane bl-tests-a, 2026-11-25), over the ONE world
// scripts/vault-run-world.mjs that test-vault-run and test-vault-run-seal share.
// The words of the one suite it came from:
// test-vault-run — THE DOOR of `vibespace-vault run` (lane vault-run-door, design q-043 §8 + §5 P0-f): src/server/vault-run-door.js
// over the PURE src/vault-run.js, a REAL vault engine on a scratch dir, the REAL For-you store, and REAL children (a fake
// printer that leaks the value in every form, split across pipe chunks). Fast tier, in-process.
//   ⑩ THE REQUEST AND ITS GRANT (lane vault-manual-and-lock — design D4): a closed entry's refusal names `request`; a request
//      lands ONCE (agent, entry, purpose — no expiry), a second for the same entry while one is open ⇒ request_pending by
//      name; its refusals by name; Allow once = a grant the run verdict honours for THAT conversation (the shape card still
//      asks) and spends; 8 hours = every run; deny / the card closed elsewhere / a changed item / a gone conversation grant
//      nothing; the switch OFF and a LOCK end every grant and withdraw every request; the use lines carry the purpose and the
//      run's receipt and `uses` reads back this conversation's alone; the request's card on the page
//   ⑩b THE CAP'S SHAPE (B-4934, q-043 verify L2): eight conversations × 8 open asks, then a NINTH conversation's first ask
//      is FILED (MUTANT: the old 64-request hub-wide cap ⇒ RED); one conversation's 9th ⇒ too_many_requests by name; 32
//      conversations asking ⇒ the 33rd too_many_askers by name while one already asking still asks; more than 8 asking ⇒
//      ONE Vault notice «N conversations are asking», re-worded in place, closed at 8 or fewer, quiet once the owner set it
//      aside, closed by a lock and by a boot
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { anchored } from './scratch.mjs';   // FIRST after node's own (§113)
import { REPO, R, pass, fail, ok, editAnchor, sleep, DOOR, VR, M, PW, VALUE, BIN, PRINTER, NODE, GHBIN, EventEmitter, leaks, ROWS, sourceOf, world, cardsOf, waitCard, runAnswered, openRow, ENV, auditOf } from './vault-run-world.mjs';   // THE ONE WORLD of the three suites (B-54a9, 主开发 r4355)
console.log('⑩ THE REQUEST AND ITS GRANT (lane vault-manual-and-lock — design D4: vibespace-vault request / uses)');
{
  // r4373 (the flake census of lane login-request-card, /var/tmp/vibespace-lanes/setting-doors/work/flake-census-419.md) and the
  // law of r4340 (1): A WAIT IS ON THE FACT THE LEG JUDGES, bounded generously, and its expiry FAILS BY A NAMED HARNESS LINE — never
  // a count of turns. untilFact(cond, what) reads cond() every 2 ms, 30 s at most, and is red «HARNESS: <what> — not reached» if it
  // never comes (the restarts below waited a bare 20 turns, or 200 turns and then read whatever was there).
  const untilFact = async (cond, what, ms = 30000, say = ok) => { for (const tEnd = Date.now() + ms; !cond();) { if (Date.now() > tEnd) { say(false, `HARNESS: ${what} — not reached in ${ms / 1000} s`); return false; } await sleep(2); } return true; };
  { const said = [], late = await untilFact(() => false, 'a fact that never comes', 20, (c, n) => said.push(n));
    ok(late === false && said.length === 1 && said[0] === 'HARNESS: a fact that never comes — not reached in 0.02 s', 'CONTROL (r4373): a wait whose fact never comes ends at its bound RED BY NAME — the harness line, never a silent read of whatever is there', said); }
  // the start's catch-up of the «Always» cards (src/server/vault-run-door.js endGrants) is the For-you store's deferred step
  // (userTodos.whenRead): it has run once the store is read and none of its deferred steps still waits
  const startSwept = (w) => !w.userTodos._unread && !(w.userTodos._readWaiters || []).length;
  const w = await world();   // a LOCAL instance (a seen shape runs without its card)
  const caller = { ...w.caller, scope: 'webui-1' };   // the use law's spelling of this conversation (its vault-use conv)
  const other = { conversationId: 'conv-9', sessionKey: 'claude:conv-9', name: 'Lane Nine', cwd: w.work, scope: 'webui-9' };
  const reqsOf = () => (w.userTodos.snapshot().open || []).filter((i) => i.action && i.action.type === 'vault-grant-ask');
  const M1 = 'vault://mounts/m1/secretKey', PURPOSE = 'upload the nightly backup to my bucket';
  const r0 = await w.door.run({ caller, args: ENV('env'), cwd: w.work });
  ok(r0.code === 'entry_not_runnable' && /vibespace-vault request <vault:\/\/…> --for/.test(r0.words) && !/in the chat/.test(r0.words), 'a CLOSED entry ⇒ entry_not_runnable, its words naming `vibespace-vault request … --for` (never «ask in the chat»)', r0.words);
  const bad = [
    [{ caller, entry: M1, purpose: '' }, 'purpose_required'], [{ caller, entry: M1, purpose: 'x'.repeat(201) }, 'purpose_too_long'],
    [{ caller, entry: 'mounts/m1/secretKey', purpose: 'p' }, 'bad_reference'], [{ caller, entry: 'vault://accounts/acct1/apiKey', purpose: 'p' }, 'entry_has_its_own_door'],
    [{ caller, entry: 'vault://channels/lark1/token', purpose: 'p' }, 'entry_has_its_own_door'], [{ caller, entry: 'vault://mounts/nope/secretKey', purpose: 'p' }, 'entry_unknown'],
    [{ caller: { ...caller, job: true }, entry: M1, purpose: 'p' }, 'job_no_use'], [{ caller: { ...caller, remote: true }, entry: M1, purpose: 'p' }, 'device_road_later'],
    [{ caller: other, entry: 'vault://agent:conv-1/gh-token', purpose: 'p' }, 'use_not_granted'], [{ caller, entry: M1, purpose: 'deploy \u202eit' }, 'hidden_chars'],
  ];
  const got = bad.map(([a]) => w.door.request(a).code);
  ok(got.every((c, i) => c === bad[i][1]) && !reqsOf().length, 'refused BY NAME, nothing filed: no purpose, a purpose over 200, not a reference, a login / a channel token (their own doors), no such entry, a job, a remote conversation, ANOTHER conversation\'s own entry, a hidden character', got);
  const q1 = w.door.request({ caller, entry: M1, purpose: PURPOSE });
  const it = reqsOf()[0];
  ok(q1.ok && q1.askId && reqsOf().length === 1 && it.origin === 'vault' && it.kind === 'action' && it.urgency === 'high' && !it.expiresAt && it.text === 'Lane X asks to use a stored secret'
    && it.detail.includes('my bucket — ' + M1) && it.detail.includes(PURPOSE) && it.action.askId === q1.askId, 'the request lands ONCE: one For-you ask naming the agent, the entry (label + reference) and the purpose — urgency high, NO expiry (it waits for the owner)', it);
  const q2 = w.door.request({ caller, entry: M1, purpose: 'again, please' });
  ok(q2.code === 'request_pending' && /already asked/.test(q2.words) && reqsOf().length === 1, 'a second request for the same entry while one is open ⇒ request_pending BY NAME — still ONE ask', q2);
  const u0 = w.door.usesFor(caller);
  ok(u0.ok && u0.requests.length === 1 && u0.requests[0].entry === M1 && u0.requests[0].purpose === PURPOSE && !u0.grants.length && !w.door.usesFor(other).requests.length, 'uses names the open request to ITS conversation only');
  const GHP = ['gh', 'p_abcdefghijklmnopqrstuvwxyz0123456789'].join('');   // a token shape built at runtime (the secret scan)
  const leaky = w.door.request({ caller, entry: 'vault://app-secrets/app1/item.0.1', purpose: `push with ${GHP} please` });
  const leakIt = reqsOf().find((x) => x.action.askId === leaky.askId);
  ok(leaky.ok && leakIt && !leakIt.detail.includes(GHP) && /«redacted»/.test(leakIt.detail) && !auditOf(w).includes(GHP), 'a purpose holding a secret shape lands «redacted» in the tray and the audit (the agent\'s words are a sink too)');
  ok(w.door.answerRequest(leaky.askId, { answer: 'deny' }).outcome === 'denied' && !w.door._grants.size && !reqsOf().some((x) => x.action.askId === leaky.askId), 'deny (a click) ⇒ no grant, the ask resolved');
  const again = w.door.request({ caller, entry: 'vault://app-secrets/app1/item.0.1', purpose: 'once more' });
  ok(again.code === 'request_quiet' && /10 minutes/.test(again.words) && !reqsOf().some((x) => x.detail.includes('once more')), 'the same entry asked again right after a deny ⇒ request_quiet for 10 minutes (no card — the owner is not asked twice)', again);
  w.door._reqQuiet.clear();   // (the suite's later legs ask for it again)
  ok(w.door.answerRequest(q1.askId, { answer: 'always' }).code === 'bad_grant_answer', 'the answer is once, 8h or deny (no «always» — the per-row switch is the owner\'s always)');
  const nr = w.door.answerRequest(q1.askId, { answer: 'once' });
  ok(nr.code === 'reveal_needs_password' && reqsOf().length === 1 && !w.door._grants.size, 'Allow WITHOUT this page\'s 验证是你 ⇒ reveal_needs_password, the card stays up (a grant opens the entry as the switch does — the review: a click alone is forgeable on a hub with no sign-in)', nr);
  const g1 = w.door.answerRequest(q1.askId, { answer: 'once', reauthed: true, person: true });
  ok(g1.ok && g1.outcome === 'granted-once' && g1.grantedFor === 'once' && !reqsOf().length && w.door._grants.size === 1 && !fs.existsSync(path.join(w.dataDir, DOOR.STORE_FILE)), 'Allow once ⇒ ONE grant row, in memory only (the store file holds no grant)', g1);
  // lane wake-approve-card r4: vault-grant-ask is a DECISION ROW — its record says which of ITS verbs, and the person's stamp
  const FA = R('src/foryou-actions.js');
  const i1 = w.userTodos.get(it.id), st1 = FA.decidedStamp ? FA.decidedStamp(i1) : null;
  ok(i1 && i1.status === 'done' && i1.resolvedBy === 'granted' && i1.resolvedFact && i1.resolvedFact?.decidedBy === 'person' && i1.resolvedFact?.grantedFor === 'once' && i1.resolvedFact?.until > Date.now() && st1 && /^allowed once by you · (\d+\/\d+ )?\d\d:\d\d$/.test(st1.text), 'r4: the record says the verb — «allowed once by you · HH:MM» (r6: resolvedBy `granted` — the value every reader names — + its facts {grantedFor: once, until}, the person verdict\'s mark)', { by: i1 && i1.resolvedBy, fact: i1 && i1.resolvedFact, stamp: st1 && st1.text });
  ok(w.door.answerRequest(q1.askId, { answer: 'once', reauthed: true }).code === 'ask_settled', 'a second answer ⇒ ask_settled');
  const ro = await w.door.run({ caller: other, args: ENV('env'), cwd: w.work });
  ok(ro.code === 'entry_not_runnable', 'the grant is THAT conversation\'s — another conversation\'s run of the same entry ⇒ entry_not_runnable');
  const run1 = await runAnswered(w, ENV('env'), { caller });
  ok(run1.card && run1.r.ok && run1.r.stdout.includes('[vault:mounts/m1/secretKey]') && !leaks(run1.r.stdout + run1.r.stderr, VALUE).length, 'THE GRANT IS HONOURED BY THE RUN VERDICT: the closed entry runs for this conversation — its new shape still draws the card first (the owner sees the command), the output scrubbed', run1.r && run1.r.code);
  ok(!w.door._grants.size, 'Allow once is SPENT by that run (before it started)');
  { const i1b = w.userTodos.get(it.id), sb = FA.decidedStamp(i1b); ok(i1b.resolvedFact?.endedBy === 'used' && sb && /^allowed once · ended (\d+\/\d+ )?\d\d:\d\d$/.test(sb.text) && FA.decisionCard(i1b).state === 'ended', 'r6: A CARD FOLLOWS THE GRANT\'S LIFE — the once-grant that ran ends on its record: «allowed once · ended HH:MM» (the card\'s state ended)', { fact: i1b.resolvedFact, stamp: sb && sb.text }); }
  const run2 = await w.door.run({ caller, args: ENV('env'), cwd: w.work });
  ok(run2.code === 'grant_expired' && /its one run was used at \d{4}-\d\d-\d\d \d\d:\d\d UTC/.test(run2.words || '') && !/has not opened/.test(run2.words || ''), 'the same (now seen) shape again ⇒ refused — once is once; B-a14b: said as the approval that ENDED (its one run was used, when, how to ask again), never «not opened»', run2);
  const uses = w.door.usesFor(caller).uses;
  ok(uses.some((u) => u.outcome === 'ok' && u.entry === M1 && u.door === 'run' && u.purpose === PURPOSE && u.receipt === run1.r.receipt) && uses[0].outcome === 'grant_expired' && !w.door.usesFor(other).uses.some((u) => u.outcome === 'ok'),
    'THE USE LINES: `uses` reads back THIS conversation\'s own — the entry, the purpose its grant carried, the outcome, the run\'s receipt (one receipt: the answer, the run line, the use line), newest first; another conversation\'s are not its', uses.slice(0, 3));
  const lines = auditOf(w).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  ok(lines.filter((l) => l.event === 'vault-request').length === 2 && lines.some((l) => l.event === 'vault-grant' && l.answer === 'once' && l.conv === 'webui-1') && lines.some((l) => l.event === 'vault-grant' && l.answer === 'deny') && !leaks(auditOf(w), VALUE).length, 'the audit: each request and each answer is a line (conversation, entry, purpose, answer) — never a value');
  // L3 (int331): a once-grant whose run FAILS before the child ran is NOT burned — it is restored, the agent runs it again
  const ql3 = w.door.request({ caller, entry: M1, purpose: PURPOSE });
  w.door.answerRequest(ql3.askId, { answer: 'once', reauthed: true });
  ok(w.door._grants.size === 1, 'L3 setup: a fresh once-grant opens the entry again');
  const _vL3 = ROWS.mounts[0].v; ROWS.mounts[0].v = null;   // the entry's value momentarily unreadable ⇒ the run gets entry_unknown, nothing runs
  const l3fail = await runAnswered(w, ENV('env'), { caller });
  ROWS.mounts[0].v = _vL3;
  ok(l3fail.r.code === 'entry_too_short_to_mask' && w.door._grants.size === 1, 'L3: a run that FAILS before the child ran (the value cannot be scrubbed — nothing ran) RESTORES the once-grant, it is not burned');
  const l3ok = await runAnswered(w, ENV('env'), { caller });
  ok(l3ok.r.ok && !w.door._grants.size, '…then a real run honours the restored grant once and SPENDS it (a once-grant is spent only when a child ran)');
  // 8 HOURS: every run of the conversation, until the switch goes OFF or the vault locks
  const q3 = w.door.request({ caller, entry: M1, purpose: PURPOSE });
  const i3id = reqsOf()[0] && reqsOf()[0].id;
  const g3 = w.door.answerRequest(q3.askId, { answer: '8h', reauthed: true, person: true });
  const i3 = w.userTodos.get(i3id), st3 = FA.decidedStamp ? FA.decidedStamp(i3) : null;
  ok(i3 && i3.resolvedBy === 'granted' && i3.resolvedFact?.grantedFor === '8h' && st3 && /^allowed by you for 8 h · (\d+\/\d+ )?\d\d:\d\d$/.test(st3.text) && FA.decisionCard(i3).state === 'approved', 'r4: For 8 hours ⇒ «allowed by you for 8 h · HH:MM» (the card\'s state approved) — r6: the record `granted` + {grantedFor: 8h, until} carries the duration', { by: i3 && i3.resolvedBy, stamp: st3 && st3.text });
  const ra = await w.door.run({ caller, args: ENV('env'), cwd: w.work }), rb = await w.door.run({ caller, args: ENV('env'), cwd: w.work });
  ok(g3.outcome === 'granted' && g3.grantedFor === '8h' && ra.ok && rb.ok && w.door._grants.size === 1 && [...w.door._grants.values()][0].until - Date.now() <= DOOR.GRANT_MS, 'For 8 hours ⇒ every run of the conversation (the seen shape without a card on a local instance), the grant stays — ≤ 8 hours', [ra.code, rb.code]);
  ok(w.door.request({ caller, entry: M1, purpose: 'x' }).already === 'granted' && w.door.runnableFor(caller).entries.some((e) => e.ref === M1 && e.by === 'grant') && !w.door.runnableFor(other).entries.length, 'a request for an entry already granted answers so (nothing filed); `list` names it to THAT conversation alone');
  { const i3n = w.userTodos.get(i3id), at9 = (i3n.resolvedFact?.until || 0) + 3600e3, s9 = FA.decidedStamp(i3n, { now: at9 });
    ok(FA.decisionCard(i3n, { now: at9 }).state === 'ended' && s9 && /^allowed for 8 hours · ended (\d+\/\d+ )?\d\d:\d\d$/.test(s9.text) && FA.decisionCard(i3n, { now: (i3n.resolvedFact?.until || 0) + 3 * 86400e3 }).state === 'ended', 'r6: the SAME record read at +9 h (and +3 d) ⇒ «allowed for 8 hours · ended HH:MM», the card\'s state ended (was: «allowed by you for 8 h · …», approved, for ever)', { stamp: s9 && s9.text }); }
  // B-a14b (fb-5a9b87b6e8): AN APPROVAL THAT ENDED IS SAID AS ITSELF — a second conversation's 8 hours run out: its next run names
  // the end (grant_expired: how, when, how to ask again), never «the user has not opened that entry»; `uses` lists it as ENDED
  {
    const c8 = { ...w.caller, conversationId: 'conv-8', sessionKey: 'claude:conv-8', name: 'Lane Eight', scope: 'webui-8' };
    const endedLeg = async (ww) => {
      const q8 = ww.door.request({ caller: c8, entry: M1, purpose: 'nightly backup' });
      ww.door.answerRequest(q8.askId, { answer: '8h', reauthed: true, person: true });
      const r8a = await runAnswered(ww, ENV('env'), { caller: c8 });
      const g8 = [...ww.door._grants.values()].find((g) => g.conv === 'webui-8');
      if (g8) g8.until = Date.now() - 1;   // its 8 hours ran out
      const r8b = await ww.door.run({ caller: c8, args: ENV('env'), cwd: ww.work });
      return { ranFirst: !!(r8a.r && r8a.r.ok && g8), r8b, u8: ww.door.usesFor(c8) };
    };
    const e8 = await endedLeg(w);
    ok(e8.ranFirst && e8.r8b.code === 'grant_expired' && /its 8 hours ran out at \d{4}-\d\d-\d\d \d\d:\d\d UTC/.test(e8.r8b.words || '') && /ask them again with its purpose: vibespace-vault request/.test(e8.r8b.words || '') && !/has not opened/.test(e8.r8b.words || ''),
      'the run AFTER its 8 hours names the END — grant_expired, the time, how to ask again — never «the user has not opened that entry»', e8.r8b);
    ok(e8.u8.ended.length === 1 && e8.u8.ended[0].entry === M1 && e8.u8.ended[0].endedBy === 'time' && /^\d{4}-\d\d-\d\dT/.test(e8.u8.ended[0].endedAt) && e8.u8.ended[0].purpose === 'nightly backup' && !e8.u8.grants.length && !w.door.usesFor(other).ended.length,
      '…and `uses` lists it as ENDED for that conversation only (how, when, its purpose) — never as a live grant, never in another conversation\'s', e8.u8.ended);
    const r8c = await w.door.run({ caller: other, args: ENV('env'), cwd: w.work });
    ok(r8c.code === 'entry_not_runnable', 'a conversation that never held an approval still reads entry_not_runnable (the switch is the news there)', r8c.code);
    const q8b = w.door.request({ caller: c8, entry: M1, purpose: 'nightly backup' });
    w.door.answerRequest(q8b.askId, { answer: '8h', reauthed: true, person: true });
    const r8d = await w.door.run({ caller: c8, args: ENV('env'), cwd: w.work });
    ok(r8d.ok && !w.door.usesFor(c8).ended.length && w.door.usesFor(c8).grants.length === 1, 'asked again and allowed ⇒ it runs, and the old end is no longer listed', { ok: r8d.ok, code: r8d.code });
    const SRCd = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8'), from = '  function noteEnded(g, endedBy, endedAt) {\n';
    const md = SRCd.split(from).length === 2 ? M.load('src/server/vault-run-door.js', editAnchor(SRCd, from, from + '    return;   // MUTANT: no end is kept\n', "src/server/vault-run-door.js"), 'endednote') : null;
    let mr = null;
    if (md) { const mw = await world({ doorMod: md }); mr = await endedLeg(mw); }
    ok(md && mr && mr.ranFirst && mr.r8b.code === 'entry_not_runnable', 'RED control: a door that keeps no end (the .407 shape) ⇒ the same run reads «the user has not opened that entry» — the misnamed cause the agent reported as a bug', mr && mr.r8b.code);
    // THE FIRST END STANDS (the adversarial read's must): a grant's 8-hour timer stays armed after a switch-off or a spend; when it
    // fires it must not write «its 8 hours ran out» over «revoked» (the owner's OFF) or «used» — the door's timers held by hand here
    const firstEnd = async (mod) => {
      const ww = await world(), held = [];
      ww.door = ww.mk(mod, { timers: { set: (fn, ms) => { held.push({ fn, ms }); return held.length; }, clear: () => { } } });
      const fire8h = () => { for (const h of held.filter((x) => x.ms > 3600e3)) h.fn(); };
      const qa = ww.door.request({ caller: c8, entry: M1, purpose: 'nightly backup' });
      ww.door.answerRequest(qa.askId, { answer: '8h', reauthed: true, person: true });
      openRow(ww); ww.door.setRunnable({ id: 'mounts:m1#secretKey', on: false });   // the owner switches the entry OFF (the grant revoked)
      fire8h(); held.length = 0;
      const offList = ww.door.usesFor(c8).ended.length, offRun = (await ww.door.run({ caller: c8, args: ENV('env'), cwd: ww.work })).code;
      const wb = await world(), heldB = [];   // a fresh hub: the entry CLOSED (never switched), a once-grant spent by its run
      wb.door = wb.mk(mod, { timers: { set: (fn, ms) => { heldB.push({ fn, ms }); return heldB.length; }, clear: () => { } } });
      const qb = wb.door.request({ caller: c8, entry: M1, purpose: 'one upload' });
      wb.door.answerRequest(qb.askId, { answer: 'once', reauthed: true, person: true });
      const rb = await runAnswered(wb, ENV('env'), { caller: c8 });
      for (const h of heldB.filter((x) => x.ms > 3600e3)) h.fn();
      const used = wb.door.usesFor(c8).ended[0];
      return { offList, offRun, ranOnce: !!(rb.r && rb.r.ok), usedBy: used && used.endedBy };
    };
    const fe = await firstEnd(DOOR);
    ok(fe.offList === 0 && fe.offRun === 'entry_not_runnable', 'the owner switched the entry OFF, then the grant\'s 8-hour timer fired ⇒ no «ended» record (the OFF stands: entry_not_runnable, never «the entry was not switched off»)', fe);
    ok(fe.ranOnce && fe.usedBy === 'used', 'a once-grant spent by its run, then its timer fired ⇒ the end stays «its one run was used»', fe);
    const SRCf = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8'), g0 = '    if (g && g.endedBy) return;\n';
    const mf = SRCf.split(g0).length === 2 ? M.load('src/server/vault-run-door.js', anchored(editAnchor(SRCf, g0, '', "src/server/vault-run-door.js"), "grantEnded(g, g && g.spent ? 'used' : 'time')", "grantEnded(g, 'time')", 'test-vault-run B-a14b: the first shape — no guard, the timer says time'), 'firstend') : null;   // B-a14b: a spent once-grant's timer says «used» by itself now — the batch's first shape is BOTH (no guard, the timer's «time»)
    const fr = mf ? await firstEnd(mf) : null;
    ok(!!(mf && fr && fr.usedBy === 'time'), 'RED control: no first-end guard (the batch\'s first shape) ⇒ the timer writes «its 8 hours ran out» over the spent run', fr);
    // the OFF half takes BOTH guards away: the first-end guard AND the list's «an OFF after the approval is the owner's news» —
    // either alone keeps the OFF from reading as «ran out» (the restack's tb run showed the one-guard mutant listing nothing there)
    const f0 = " && !(dOn && dOn.suspended && dOn.suspended.has(e.id) && offSinceOf(dOn, e.id) >= e.grantAt)";   // (B-a14b remainder: the OFF's time read through offSinceOf)
    const mf2 = SRCf.split(g0).length === 2 && SRCf.split(f0).length === 2 ? M.load('src/server/vault-run-door.js', anchored(editAnchor(editAnchor(SRCf, g0, '', "src/server/vault-run-door.js"), f0, '', "src/server/vault-run-door.js"), "      if (offAt.has(id) && (offAt.get(id) || 0) >= (Number(g.at) || 0)) continue;", '', 'test-vault-run B-a14b: no OFF skip at the record'), 'firstend-off') : null;   // B-a14b: the OFF after the approval is skipped at the RECORD too now — the third guard taken away with the two
    const fr2 = mf2 ? await firstEnd(mf2) : null;
    ok(!!(mf2 && fr2 && fr2.offList === 1), 'RED control: no first-end guard AND no «an OFF after the approval» filter ⇒ the timer\'s «its 8 hours ran out» is listed over the owner\'s OFF', fr2);
    // B-a14b (主开发 r542) 1: a ONCE-grant a run SPENT and still runs on when its 8 hours end ⇒ its end is «used» (the run took it),
    // never «its 8 hours ran out» — the timer fired WHILE the run ran (a run held open: the printer's `sleep`, ended by its caller
    // going away). RED: the timer that says «time» for a spent once-grant (the release)
    const SRCa = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const longRun = async (mod) => {
      const wl = await world(), heldL = [];
      wl.door = wl.mk(mod, { timers: { set: (fn, ms) => { heldL.push({ fn, ms }); return heldL.length; }, clear: () => { } } });
      const ql = wl.door.request({ caller: c8, entry: M1, purpose: 'one long upload' });
      wl.door.answerRequest(ql.askId, { answer: 'once', reauthed: true, person: true });
      const ac = new AbortController(), pidF = path.join(wl.work, 'long.pid');
      const pr = wl.door.run({ caller: c8, args: ['--env', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'sleep', pidF], cwd: wl.work, signal: ac.signal });
      const c0 = await waitCard(wl); if (c0) wl.door.answer(c0.action.askId, { answer: 'once' });   // the run's new shape draws its card (as runAnswered answers it)
      for (let k = 0; k < 1000 && !fs.existsSync(pidF); k++) await sleep(10);   // the child RAN (its pid written) — the run is in flight (bound 10 s: a loaded box)
      const running = fs.existsSync(pidF);
      for (const h of heldL.filter((x) => x.ms > 3600e3)) h.fn();   // its 8 hours end now, while the run that spent it runs on
      const mid = (wl.door.usesFor(c8).ended[0] || {}).endedBy || null;
      ac.abort(); const rr = await pr;
      return { running, mid, after: (wl.door.usesFor(c8).ended[0] || {}).endedBy || null, code: rr.code };
    };
    const lr = await longRun(DOOR);
    ok(lr.running && lr.mid === 'used' && lr.after === 'used', `B-a14b: a once-grant SPENT by a run that outlives its 8 hours ends «used» (the timer fired mid-run), never «ran out» — ${JSON.stringify(lr)}`, lr);
    const mlr = M.load('src/server/vault-run-door.js', anchored(SRCa, "grantEnded(g, g && g.spent ? 'used' : 'time')", "grantEnded(g, 'time')", 'test-vault-run B-a14b: the timer says time'), 'a14b-time');
    const lrr = await longRun(mlr);
    ok(lrr.running && lrr.mid === 'time', `RED control: the timer that says «time» for a spent once-grant ⇒ «its 8 hours ran out» over the run that used it — ${JSON.stringify(lrr)}`, lrr);
    // B-a14b 3: A RESTART KEEPS THE ENDS — an end written (data/vault-grant-ends.json, through the store writer: its own durable()
    // is the wait), then a NEW door over the same data (a restart) lists it; bytes that do not parse are set aside, never written
    // over. REDs: the ends kept in memory only (the release); a corrupt file read as empty and written over
    const SW = R('src/store-writer.js').storeWriter();
    const restartLeg = async (mod) => {
      const wr = await world(), heldR = [];
      wr.door = wr.mk(mod, { timers: { set: (fn, ms) => { heldR.push({ fn, ms }); return heldR.length; }, clear: () => { } } });
      const qr = wr.door.request({ caller: c8, entry: M1, purpose: 'nightly backup' });
      wr.door.answerRequest(qr.askId, { answer: '8h', reauthed: true, person: true });
      for (const h of heldR.filter((x) => x.ms > 3600e3)) h.fn();   // its 8 hours end
      const before = wr.door.usesFor(c8).ended.length;
      const landed = await SW.durable(path.join(wr.dataDir, 'vault-grant-ends.json'));
      wr.door = wr.mk(mod, { timers: { set: () => 0, clear: () => { } } });   // THE RESTART: a new door over the same data
      const e0 = wr.door.usesFor(c8).ended[0] || null;
      return { before, landed, file: fs.existsSync(path.join(wr.dataDir, 'vault-grant-ends.json')), afterRestart: e0 ? { endedBy: e0.endedBy, purpose: e0.purpose, entry: e0.entry } : null };
    };
    const rs = await restartLeg(DOOR);
    ok(rs.before === 1 && rs.landed && rs.file && rs.afterRestart && rs.afterRestart.endedBy === 'time' && rs.afterRestart.purpose === 'nightly backup' && rs.afterRestart.entry === M1,
      `B-a14b: A RESTART KEEPS THE ENDS — the end written through the store writer, a new door over the same data lists it (how, its purpose) — ${JSON.stringify(rs)}`, rs);
    const mrs = M.load('src/server/vault-run-door.js', anchored(SRCa, 'w.dirty(ENDS_FILE, {', 'void (ENDS_FILE, {', 'test-vault-run B-a14b: ends in memory only'), 'a14b-memory');
    const rsr = await restartLeg(mrs);
    ok(rsr.before === 1 && !rsr.afterRestart, `RED control: the ends kept in memory only (the release) ⇒ a restart forgets the end — ${JSON.stringify(rsr)}`, rsr);
    const corruptLeg = async (mod) => {
      const wc = await world(), f = path.join(wc.dataDir, 'vault-grant-ends.json'), bytes = '{ "ends": [ not json';
      fs.writeFileSync(f, bytes, { mode: 0o600 });
      const heldC = [];
      wc.door = wc.mk(mod, { timers: { set: (fn, ms) => { heldC.push({ fn, ms }); return heldC.length; }, clear: () => { } } });
      const asideOf = () => fs.readdirSync(wc.dataDir).filter((n) => n.startsWith('vault-grant-ends.json.corrupt-'));
      const fileNow = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')).ends.length; } catch { return null; } };
      const qc = wc.door.request({ caller: c8, entry: M1, purpose: 'after the corrupt file' });
      wc.door.answerRequest(qc.askId, { answer: '8h', reauthed: true, person: true });
      for (const h of heldC.filter((x) => x.ms > 3600e3)) h.fn();
      // B-54a9 (the split's follow): the end is ASKED onto disk (SW.durable: the shared writer writes a dirty store now, as an act), never
      // waited out at the writer's pace (its 500 ms floor: two of these waits were a second of this suite). The fact is the same —
      // the file landed with the end — and the bound is generous: 1000 tries
      for (let k = 0; k < 1000 && fileNow() === null; k++) { await SW.durable(f); if (fileNow() === null) await sleep(10); }   // the next end handed to the writer (after the set-aside's rename) and landed — what both roads come to
      await SW.durable(f);
      const a = asideOf();
      return { asides: a.length, keptBytes: a.length === 1 && fs.readFileSync(path.join(wc.dataDir, a[0]), 'utf8') === bytes, fileNow: fileNow() };
    };
    const cr = await corruptLeg(DOOR);
    ok(cr.asides === 1 && cr.keptBytes && cr.fileNow === 1, `B-a14b: bytes that do not parse are set aside under a dated name (kept), the ends start empty and the next end is written fresh — ${JSON.stringify(cr)}`, cr);
    const mcr = M.load('src/server/vault-run-door.js', anchored(SRCa, '    const st = endsHold.start(a);', "    const st = endsHold.start(a.state === 'corrupt' ? { state: 'missing' } : a);", 'test-vault-run B-a14b: corrupt read as empty'), 'a14b-corrupt');
    const crr = await corruptLeg(mcr);
    ok(crr.asides === 0 && crr.fileNow === 1, `RED control: a corrupt ends file read as empty ⇒ its bytes written over by the next end (nothing set aside) — ${JSON.stringify(crr)}`, crr);
    // the fold's read: a PLANTED ends file — a record is kept WHOLE or not at all (a conversation past its bound is not loaded: cut,
    // it would sit under another conversation's key and show that conversation its words), and the purpose passes the request's
    // own belt BEFORE its cut (a value written into a purpose by hand never comes back from the file). REDs: the cut; no belt
    const TOKP = ['gh', 'p_zyxwvutsrqponmlkjihgfedcba9876543210'].join('');   // a token shape built at runtime (the secret scan)
    const plantLeg = async (mod) => {
      const wp = await world(), t0 = Date.now(), S = 'w'.repeat(200), cS = { ...c8, scope: S };
      const rec = (conv, purpose, endedBy) => ({ conv, id: 'mounts:m1#secretKey', endedAt: t0 - 60e3, endedBy, once: true, purpose, grantAt: t0 - 120e3 });
      fs.writeFileSync(path.join(wp.dataDir, 'vault-grant-ends.json'), JSON.stringify({ v: 1, ends: [rec(S, 'this conversation words', 'time'), rec(S + 'x', 'another conversation words', 'used'), rec(c8.scope, 'paste ' + TOKP + ' here', 'time')] }), { mode: 0o600 });
      wp.door = wp.mk(mod, { timers: { set: () => 0, clear: () => { } } });   // the start reads the planted file
      const mine8 = wp.door.usesFor(c8).ended[0] || {};
      return { listedS: wp.door.usesFor(cS).ended.map((e) => `${e.endedBy}:${e.purpose}`), valueBack: String(mine8.purpose || '').includes(TOKP), head8: String(mine8.purpose || '').slice(0, 6) };   // the value itself never printed
    };
    const pl = await plantLeg(DOOR);
    ok(pl.listedS.join('|') === 'time:this conversation words' && !pl.valueBack && pl.head8 === 'paste ', `the fold read: a planted ends file — a record past its bound not loaded (this conversation sees its own words only), a value in a purpose comes back belted — ${JSON.stringify(pl)}`, pl);
    const mpl = M.load('src/server/vault-run-door.js', anchored(SRCa, '    if (e.conv.length > 200 || e.id.length > 400) return null;', '    e.conv = e.conv.slice(0, 200); e.id = e.id.slice(0, 400);', 'test-vault-run the fold read: the cut'), 'a14b-plant-cut');
    const plr = await plantLeg(mpl);
    ok(plr.listedS.join('|') === 'used:another conversation words', `RED control: the record cut to its bound ⇒ another conversation's end sits under this one's key and says its words here — ${JSON.stringify(plr)}`, plr);
    const mpl2 = M.load('src/server/vault-run-door.js', anchored(SRCa, "purpose: SS.redactSecrets(String(e.purpose || '')).text.slice(0, 400),", "purpose: String(e.purpose || '').slice(0, 400),", 'test-vault-run the fold read: no belt'), 'a14b-plant-belt');
    const plr2 = await plantLeg(mpl2);
    ok(plr2.valueBack, `RED control: the loaded purpose without the belt ⇒ the value written into it comes back — ${JSON.stringify(plr2)}`, plr2);
    // …a store whose READ fails (no permission: mode 000) is HELD until the next start: the ends stay in memory, nothing is written
    // over it (src/store-read.js). RED: a held read that lets the writer write (the file replaced). Root reads a mode-000 file: SKIPPED there
    const heldLeg = async (mod) => {
      const wh = await world(), f = path.join(wh.dataDir, 'vault-grant-ends.json'), bytes = '{"v":1,"ends":[]}';
      fs.writeFileSync(f, bytes, { mode: 0o600 }); fs.chmodSync(f, 0o000);
      const heldH = [];
      wh.door = wh.mk(mod, { timers: { set: (fn, ms) => { heldH.push({ fn, ms }); return heldH.length; }, clear: () => { } } });
      const qh = wh.door.request({ caller: c8, entry: M1, purpose: 'past a held store' });
      wh.door.answerRequest(qh.askId, { answer: '8h', reauthed: true, person: true });
      for (const h of heldH.filter((x) => x.ms > 3600e3)) h.fn();
      await SW.durable(f);
      const st = fs.statSync(f);
      const out = { listed: wh.door.usesFor(c8).ended.length, modeKept: (st.mode & 0o777) === 0, sizeKept: st.size === bytes.length };
      fs.chmodSync(f, 0o600);
      return out;
    };
    if (process.getuid && process.getuid() === 0) console.log('  – B-a14b held store SKIPPED: running as root (root reads a mode-000 file)');
    else {
      const hl = await heldLeg(DOOR);
      ok(hl.listed === 1 && hl.modeKept && hl.sizeKept, `B-a14b: an ends store whose read fails is HELD — the end said from memory, the file never written over — ${JSON.stringify(hl)}`, hl);
      const mhl = M.load('src/server/vault-run-door.js', anchored(SRCa, '    const st = endsHold.start(a);', "    const st = endsHold.start(a.state === 'unreadable' ? { state: 'missing' } : a);", 'test-vault-run B-a14b: a held read written over'), 'a14b-held');
      const hlr = await heldLeg(mhl);
      ok(!hlr.modeKept, `RED control: a held read that lets the writer write ⇒ the unreadable file replaced — ${JSON.stringify(hlr)}`, hlr);
    }
    // wl932b4e8 (主开发 r750) 3a: «used» is DATED AT THE SPEND — on the door's own clock the run takes the grant a minute after the
    // approval, and the 8-hour timer (held by the leg, fired by hand an hour after the spend) ends it: the end's instant is the
    // spend's, never the approval's or the timer's. REDs: the end dated at the timer; dated at the approval (the fold's read)
    let heldPid = 0;
    const runHeld = async (wl, beforeRun = () => { }) => {
      const ql = wl.door.request({ caller: c8, entry: M1, purpose: 'one long upload' });
      wl.door.answerRequest(ql.askId, { answer: 'once', reauthed: true, person: true });
      beforeRun();   // (the dated leg moves the door's clock here: the approval's instant is not the spend's)
      const ac = new AbortController(), pidF = path.join(wl.work, `held-${++heldPid}.pid`);
      const pr = wl.door.run({ caller: c8, args: ['--env', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'sleep', pidF], cwd: wl.work, signal: ac.signal });
      const c0 = await waitCard(wl); if (c0) wl.door.answer(c0.action.askId, { answer: 'once' });
      for (let k = 0; k < 1000 && !fs.existsSync(pidF); k++) await sleep(10);   // the child RAN — the grant is spent
      return { ac, pr, running: fs.existsSync(pidF) };
    };
    const datedLeg = async (mod) => {
      const wd = await world(), heldD = [], clk = { t: Date.now() };
      wd.door = wd.mk(mod, { now: () => clk.t, timers: { set: (fn, ms) => { heldD.push({ fn, ms }); return heldD.length; }, clear: () => { } } });
      const approvedAt = clk.t; let spentAt = null;
      const h = await runHeld(wd, () => { clk.t += 60e3; spentAt = clk.t; });   // a minute after the approval the run takes it
      clk.t += 3600e3;   // an hour after the spend on the door's clock: the leg fires the 8-hour timer it holds
      for (const x of heldD.filter((y) => y.ms > 3600e3)) x.fn();
      const e = wd.door.usesFor(c8).ended[0] || {};
      h.ac.abort(); await h.pr;
      return { running: h.running, endedBy: e.endedBy || null, endedAt: e.endedAt ? Date.parse(e.endedAt) : null, approvedAt, spentAt, timerAt: clk.t };
    };
    const dl = await datedLeg(DOOR);
    ok(dl.running && dl.endedBy === 'used' && dl.endedAt === dl.spentAt && dl.endedAt > dl.approvedAt && dl.endedAt < dl.timerAt, `wl932b4e8: «used» is DATED AT THE SPEND (the run's instant — after the approval's, before the timer's) — ${JSON.stringify(dl)}`, dl);
    const mdl = M.load('src/server/vault-run-door.js', anchored(SRCa, "endedBy === 'used' && g && g.spentAt ? g.spentAt : ", '', 'test-vault-run wl932b4e8: «used» dated at the timer'), 'a14b-dated');
    const dlr = await datedLeg(mdl);
    ok(dlr.running && dlr.endedBy === 'used' && dlr.endedAt === dlr.timerAt, `RED control: «used» dated at the timer ⇒ the end says the run used it an hour after it did — ${JSON.stringify(dlr)}`, dlr);
    const mdl2 = M.load('src/server/vault-run-door.js', anchored(SRCa, "endedBy === 'used' && g && g.spentAt ? g.spentAt : ", "endedBy === 'used' && g && g.spentAt ? g.at : ", 'test-vault-run the fold read: «used» dated at the approval'), 'a14b-dated-at');
    const dlr2 = await datedLeg(mdl2);
    ok(dlr2.running && dlr2.endedBy === 'used' && dlr2.endedAt === dlr2.approvedAt && dlr2.endedAt !== dlr2.spentAt, `RED control: «used» dated at the approval ⇒ the end says a minute before the run took it — ${JSON.stringify(dlr2)}`, dlr2);
    // 3b: a BURNED run (nothing ran — its run directory cannot be made: the run root a folder never made, for that one run ⇒
    // spawn_failed, after the spend; judged as root too) clears the mark — the once-grant given back carries no «spent» (judged on the
    // grant itself; the timer's end said as a fact). RED: the mark kept — its timer would say «used» for a run that never ran
    const burnedLeg = async (mod) => {
      const wb2 = await world(), heldB2 = []; let burn = false;
      wb2.door = wb2.mk(mod, { runRoot: () => (burn ? path.join(wb2.dir, 'run-never-made') : wb2.runRoot), timers: { set: (fn, ms) => { heldB2.push({ fn, ms }); return heldB2.length; }, clear: () => { } } });
      const qb2 = wb2.door.request({ caller: c8, entry: M1, purpose: 'a run that burns' });
      wb2.door.answerRequest(qb2.askId, { answer: 'once', reauthed: true, person: true });
      burn = true;
      const code = (await runAnswered(wb2, ENV('env'), { caller: c8 })).r.code;
      burn = false;
      const back = [...wb2.door._grants.values()].filter((g) => g.conv === c8.scope && g.once);   // the once-grant the burned run gave back
      const mark = back.map((g) => ({ spent: g.spent === true, spentAt: g.spentAt != null }));
      for (const x of heldB2.filter((y) => y.ms > 3600e3)) x.fn();
      return { code, givenBack: back.length === 1, mark, endedBy: (wb2.door.usesFor(c8).ended[0] || {}).endedBy || null };   // endedBy: a fact said, the mark is what is judged
    };
    {
      const bl = await burnedLeg(DOOR);
      ok(bl.code === 'spawn_failed' && bl.givenBack && bl.mark.length === 1 && !bl.mark[0].spent && !bl.mark[0].spentAt, `wl932b4e8: a BURNED run clears the mark — the once-grant given back carries no «spent» (its 8 hours would end «time») — ${JSON.stringify(bl)}`, bl);
      const mbl = M.load('src/server/vault-run-door.js', anchored(SRCa, 'if (burned) for (const a of spent) { a.g.spent = false; delete a.g.spentAt; }', 'if (false) { }', 'test-vault-run wl932b4e8: the mark kept'), 'a14b-burned');
      const blr = await burnedLeg(mbl);
      ok(blr.givenBack && blr.mark.length === 1 && blr.mark[0].spent && blr.mark[0].spentAt, `RED control: the mark kept on a burned run ⇒ the given-back grant still says «spent» (its timer would say «used» for a run that never ran) — ${JSON.stringify(blr)}`, blr);
    }
    // the fold's read: a BURNED run the vault's LOCK crosses (the lock lands after the spend, inside the run — at its run root's
    // reading — and the run directory cannot be made ⇒ spawn_failed): the grant is not given back (never across a lock) and it ENDS
    // «lock», as each grant the lock ended: its For-you record and `uses` say so, DATED AT THE LOCK (the door's clock moves a second
    // past the approval before the lock and five past the lock before the burn comes back — round w2ipz7162 + the follow's read).
    // REDs: no end at all (the record kept «allowed once»); dated at the burn
    const burnedLock = async (mod) => {
      const wk = await world(), clk = { t: Date.now() }; let armed = false, atLock = null;
      wk.door = wk.mk(mod, { now: () => clk.t, runRoot: () => { if (!armed) return wk.runRoot; armed = false; clk.t += 1000; atLock = { spent: ![...wk.door._grants.values()].some((g) => g.conv === c8.scope && g.once), lockClock: clk.t }; wk.door.onLocked('test'); clk.t += 5000; atLock.burnClock = clk.t; return path.join(wk.dir, 'run-never-made'); } });
      const qk = wk.door.request({ caller: c8, entry: M1, purpose: 'a run the lock crosses' });
      wk.door.answerRequest(qk.askId, { answer: 'once', reauthed: true, person: true });
      const g = [...wk.door._grants.values()].find((x) => x.conv === c8.scope && x.once), todoId = g ? g.todoId : null;
      armed = true;
      const r = (await runAnswered(wk, ENV('env'), { caller: c8 })).r;
      const it = todoId ? wk.userTodos.get(todoId) : null;
      return { code: r.code, todo: !!todoId, lockAfterSpend: !!(atLock && atLock.spent), givenBack: [...wk.door._grants.values()].some((x) => x.conv === c8.scope && x.once), recordEnd: (it && it.resolvedFact && it.resolvedFact.endedBy) || null, recordAtLock: !!(it && it.resolvedFact && atLock && it.resolvedFact.endedAt === atLock.lockClock), recordAtBurn: !!(it && it.resolvedFact && atLock && it.resolvedFact.endedAt === atLock.burnClock), recordClock: it && it.resolvedFact ? it.resolvedFact.endedAt : null, lockClock: atLock ? atLock.lockClock : null, burnClock: atLock ? atLock.burnClock : null, listed: wk.door.usesFor(c8).ended.map((e) => e.endedBy) };
    };
    const bk = await burnedLock(DOOR);
    ok(bk.code === 'spawn_failed' && bk.todo && bk.lockAfterSpend && !bk.givenBack && bk.recordEnd === 'lock' && bk.recordAtLock && bk.listed.includes('lock'), `the fold read: a burned run the lock crosses ENDS «lock» — not given back; its For-you record (dated at the lock) and \`uses\` say the lock — ${JSON.stringify(bk)}`, bk);
    const mbk2 = M.load('src/server/vault-run-door.js', anchored(SRCa, "lockT = lockGen !== lg0 ? lockedAt : now();", 'lockT = now();', 'test-vault-run follow: the lock end dated at the burn'), 'a14b-lock-dated');
    const bkr2 = await burnedLock(mbk2);
    ok(bkr2.recordEnd === 'lock' && !bkr2.recordAtLock && bkr2.recordAtBurn, `RED control: the lock end dated at the burn ⇒ the record says the grant ended five seconds after the lock did — ${JSON.stringify(bkr2)}`, bkr2);
    const mbk = M.load('src/server/vault-run-door.js', anchored(SRCa, "else if (!open) grantEnded(a.g, 'lock', lockT); else if (a.g.until > now())", 'else if (open && a.g.until > now())', 'test-vault-run the fold read: no end across a lock'), 'a14b-burned-lock');
    const bkr = await burnedLock(mbk);
    ok(bkr.code === 'spawn_failed' && bkr.todo && bkr.lockAfterSpend && !bkr.givenBack && bkr.recordEnd === null, `RED control: no end for a burned run across a lock ⇒ its For-you record keeps «allowed once» with no end — ${JSON.stringify(bkr)}`, bkr);
    // r901 (1): a BURNED run the owner's OFF crosses (the OFF lands after the spend, inside the run — at its run root's reading — and
    // the run directory is never made ⇒ spawn_failed): the grant is NOT given back (never after the owner's OFF) and it ENDS
    // «revoked» DATED AT THE OFF, as each grant the OFF ended (its For-you record says so). With a LOCK in the same window the FIRST
    // of the two is its end (the first end stands, as for a live grant); an OFF BEFORE the approval is not the news — that grant comes
    // back. REDs: the give-back that reads the lock alone (the release); dated at the burn; the lock read first; the OFF read alone;
    // an OFF at any time read as after the approval
    const offBurn = async (mod, { order = 'off' } = {}) => {
      const wf = await world(), clk = { t: Date.now() }; let armed = false, atOff = null;
      const offNow = () => { const o = wf.door.setRunnable({ id: 'mounts:m1#secretKey', on: false }); return o && o.ok === false ? o.code : 'ok'; };
      wf.door = wf.mk(mod, { now: () => clk.t, runRoot: () => {
        if (!armed) return wf.runRoot;
        armed = false; clk.t += 1000;
        atOff = { spent: ![...wf.door._grants.values()].some((g) => g.conv === c8.scope && g.once) };
        if (order === 'lockOff') { atOff.lockClock = clk.t; wf.door.onLocked('test'); clk.t += 1000; }
        if (order !== 'offBefore') { atOff.offClock = clk.t; atOff.off = offNow(); }
        if (order === 'offLock') { clk.t += 1000; atOff.lockClock = clk.t; wf.door.onLocked('test'); }
        clk.t += 5000; atOff.burnClock = clk.t;
        return path.join(wf.dir, 'run-never-made');
      } });
      const before = order === 'offBefore' ? offNow() : null;   // the owner's OFF of the closed entry, a second BEFORE the approval
      if (order === 'offBefore') clk.t += 1000;
      const qf = wf.door.request({ caller: c8, entry: M1, purpose: 'a run the OFF crosses' });
      wf.door.answerRequest(qf.askId, { answer: 'once', reauthed: true, person: true });
      const g = [...wf.door._grants.values()].find((x) => x.conv === c8.scope && x.once), todoId = g ? g.todoId : null;
      armed = true;
      const r = (await runAnswered(wf, ENV('env'), { caller: c8 })).r;
      const it = todoId ? wf.userTodos.get(todoId) : null, f = it && it.resolvedFact ? it.resolvedFact : null;
      const k = atOff || {};
      return { order, code: r.code, todo: !!todoId, before, off: k.off || null, offAfterSpend: !!k.spent, givenBack: [...wf.door._grants.values()].some((x) => x.conv === c8.scope && x.once), recordEnd: (f && f.endedBy) || null,
        recordAtOff: !!(f && k.offClock != null && f.endedAt === k.offClock), recordAtLock: !!(f && k.lockClock != null && f.endedAt === k.lockClock), recordAtBurn: !!(f && k.burnClock != null && f.endedAt === k.burnClock),
        recordClock: f ? f.endedAt || null : null, offClock: k.offClock || null, lockClock: k.lockClock || null, burnClock: k.burnClock || null };
    };
    const ob = await offBurn(DOOR);
    ok(ob.code === 'spawn_failed' && ob.todo && ob.off === 'ok' && ob.offAfterSpend && !ob.givenBack && ob.recordEnd === 'revoked' && ob.recordAtOff, `r901: a burned run the owner's OFF crosses is NOT given back — it ends «revoked» at the OFF, as each grant the OFF ended — ${JSON.stringify(ob)}`, ob);
    const mob = M.load('src/server/vault-run-door.js', anchored(SRCa, "if (offT && (open || offT <= lockT)) grantEnded(a.g, 'revoked', offT); else ", '', 'test-vault-run follow: the give-back reads the lock alone'), 'a14b-off-burn');
    const obr = await offBurn(mob);
    ok(obr.code === 'spawn_failed' && obr.offAfterSpend && obr.givenBack && obr.recordEnd === null, `RED control: the give-back that reads the lock alone ⇒ the once-grant comes back after the owner's OFF — ${JSON.stringify(obr)}`, obr);
    const mob2 = M.load('src/server/vault-run-door.js', anchored(SRCa, "grantEnded(a.g, 'revoked', offT);", "grantEnded(a.g, 'revoked');", 'test-vault-run follow: «revoked» dated at the burn'), 'a14b-off-dated');
    const obr2 = await offBurn(mob2);
    ok(obr2.recordEnd === 'revoked' && !obr2.recordAtOff && obr2.recordAtBurn, `RED control: «revoked» dated at the burn ⇒ the record says the grant ended five seconds after the OFF did — ${JSON.stringify(obr2)}`, obr2);
    const ol = await offBurn(DOOR, { order: 'offLock' });
    ok(ol.code === 'spawn_failed' && ol.off === 'ok' && ol.offAfterSpend && !ol.givenBack && ol.recordEnd === 'revoked' && ol.recordAtOff, `the follow's read: an OFF and then a LOCK in one burned run's window ⇒ the OFF is its end («revoked» at the OFF — the first end stands, as for a live grant) — ${JSON.stringify(ol)}`, ol);
    const mol = M.load('src/server/vault-run-door.js', anchored(SRCa, "if (offT && (open || offT <= lockT))", 'if (offT && open)', 'test-vault-run follow: the lock read first'), 'a14b-off-lock');
    const olr = await offBurn(mol, { order: 'offLock' });
    ok(olr.recordEnd === 'lock', `RED control: the lock read first ⇒ an OFF that came before the lock is said as the lock — ${JSON.stringify(olr)}`, olr);
    const lo2 = await offBurn(DOOR, { order: 'lockOff' });
    ok(lo2.code === 'spawn_failed' && lo2.off === 'ok' && lo2.offAfterSpend && !lo2.givenBack && lo2.recordEnd === 'lock' && lo2.recordAtLock, `the narrow read: a LOCK and then an OFF in that window ⇒ the lock is its end («lock» at the lock) — ${JSON.stringify(lo2)}`, lo2);
    const mlo2 = M.load('src/server/vault-run-door.js', anchored(SRCa, "if (offT && (open || offT <= lockT))", 'if (offT)', 'test-vault-run follow: the OFF read alone'), 'a14b-lock-off');
    const lor2 = await offBurn(mlo2, { order: 'lockOff' });
    ok(lor2.recordEnd === 'revoked', `RED control: the OFF read alone ⇒ an OFF that came after the lock is said as the end — ${JSON.stringify(lor2)}`, lor2);
    const oa = await offBurn(DOOR, { order: 'offBefore' });
    ok(oa.code === 'spawn_failed' && oa.before === 'ok' && oa.offAfterSpend && oa.givenBack && oa.recordEnd === null, `the narrow read: an OFF BEFORE the approval is not the news — the burned run's once-grant comes back, nothing ended — ${JSON.stringify(oa)}`, oa);
    const moa = M.load('src/server/vault-run-door.js', anchored(SRCa, 'if (o && o >= since && o > t) t = o;', 'if (o && o >= 0 && o > t) t = o;', 'test-vault-run follow: any OFF read as after the approval'), 'a14b-off-before');
    const oar = await offBurn(moa, { order: 'offBefore' });
    ok(oar.code === 'spawn_failed' && !oar.givenBack && oar.recordEnd === 'revoked', `RED control: an OFF at any time read as after the approval ⇒ a grant given after the OFF is never given back — ${JSON.stringify(oar)}`, oar);
    // the follow's read: a LATE «allow once» pass (an expired run card the owner still allowed) — (a) the owner's OFF takes it back
    // (as it takes back every «always» and seen shape — never outliving its switch); (b) one a run TOOK is never given back after an
    // OFF during that run (the OFF placed at the run root's reading, the run burned); (c) an OFF and an ON BEFORE the pass was minted
    // are not the news — the burned run gives that pass back. REDs: the OFF keeps the pass; the late give-back that reads the lock
    // alone; any OFF read as during the run
    const lateOff = async (mod, { inRun = false, offBefore = false } = {}) => {
      const wq = await world({ instance: 'cluster', askMs: 40 }); let armed = false, atOff = null;
      wq.door = wq.mk(mod, { runRoot: () => { if (!armed) return wq.runRoot; armed = false; atOff = { taken: wq.door._lateOnce.size === 0 }; if (!offBefore) wq.door.setRunnable({ id: 'mounts:m1#secretKey', on: false }); return path.join(wq.dir, 'run-never-made'); } });
      openRow(wq);
      if (offBefore) { wq.door.setRunnable({ id: 'mounts:m1#secretKey', on: false }); openRow(wq); }   // an OFF and an ON before the pass is minted
      const a1 = await runAnswered(wq, ENV('env'), { answer: null }); await a1.r;   // its card expires unanswered ⇒ a late card
      const lc = cardsOf(wq)[0]; if (lc) wq.door.answer(lc.action.askId, { answer: 'once' });   // the owner allows it late ⇒ ONE pass
      const passes = wq.door._lateOnce.size;
      if (!inRun) { wq.door.setRunnable({ id: 'mounts:m1#secretKey', on: false }); return { lateCard: !!lc, passes, afterOff: wq.door._lateOnce.size }; }
      armed = true;
      const r = await wq.door.run({ caller: wq.caller, args: ENV('env'), cwd: wq.work });   // the pass's own command: taken at the verdict, then burned
      return { offBefore, lateCard: !!lc, passes, code: r.code, offAfterTake: !!(atOff && atOff.taken), afterRun: wq.door._lateOnce.size };
    };
    const lo = await lateOff(DOOR);
    ok(lo.lateCard && lo.passes === 1 && lo.afterOff === 0, `the follow's read: the owner's OFF takes back a late «allow once» pass naming the entry — ${JSON.stringify(lo)}`, lo);
    const mlo = M.load('src/server/vault-run-door.js', anchored(SRCa, "    if (!on) for (const [pair, lp] of [...lateOnce]) if (lp && (lp.entries || []).includes(key)) lateOnce.delete(pair);", '', 'test-vault-run follow: the OFF keeps a late pass'), 'a14b-late-off');
    const lor = await lateOff(mlo);
    ok(lor.passes === 1 && lor.afterOff === 1, `RED control: an OFF that keeps the late pass ⇒ after an ON the exact command would run once with no card — ${JSON.stringify(lor)}`, lor);
    const li = await lateOff(DOOR, { inRun: true });
    ok(li.lateCard && li.passes === 1 && li.code === 'spawn_failed' && li.offAfterTake && li.afterRun === 0, `the follow's read: a late pass a burned run took is never given back after the owner's OFF during that run — ${JSON.stringify(li)}`, li);
    const mli = M.load('src/server/vault-run-door.js', anchored(SRCa, " && !offTimeOf(lateConsumed.lp, t0)) {", ') {', 'test-vault-run follow: the late give-back reads the lock alone'), 'a14b-late-back');
    const lir = await lateOff(mli, { inRun: true });
    ok(lir.code === 'spawn_failed' && lir.offAfterTake && lir.afterRun === 1, `RED control: the late give-back that reads the lock alone ⇒ the pass comes back after the owner's OFF — ${JSON.stringify(lir)}`, lir);
    const lb = await lateOff(DOOR, { inRun: true, offBefore: true });
    ok(lb.lateCard && lb.passes === 1 && lb.code === 'spawn_failed' && lb.offAfterTake && lb.afterRun === 1, `the narrow read: an OFF and an ON BEFORE the pass was minted are not the news — the burned run gives the late pass back — ${JSON.stringify(lb)}`, lb);
    const mlb = M.load('src/server/vault-run-door.js', anchored(SRCa, " && !offTimeOf(lateConsumed.lp, t0)) {", ' && !offTimeOf(lateConsumed.lp, 0)) {', 'test-vault-run follow: any OFF read as during the run'), 'a14b-late-before');
    const lbr = await lateOff(mlb, { inRun: true, offBefore: true });
    ok(lbr.code === 'spawn_failed' && lbr.offAfterTake && lbr.afterRun === 0, `RED control: any OFF read as during the run ⇒ a pass minted after an old OFF is never given back — ${JSON.stringify(lbr)}`, lbr);
    // 4: THE SCENE THE RECORD-TIME OFF SKIP EXISTS FOR — a once-grant a run spent, the owner's OFF while it runs (a second after the
    // approval on the door's clock), the run ends («used»), then a NEW door over the same data (a restart: the OFF's time is memory):
    // the end is not said. RED: the skip taken away — the end recorded, said after the restart over the owner's OFF
    const offRestart = async (mod) => {
      const wo2 = await world(), heldO2 = [], clk = { t: Date.now() };
      wo2.door = wo2.mk(mod, { now: () => clk.t, timers: { set: (fn, ms) => { heldO2.push({ fn, ms }); return heldO2.length; }, clear: () => { } } });
      const h = await runHeld(wo2);
      clk.t += 1000;
      wo2.door.setRunnable({ id: 'mounts:m1#secretKey', on: false });   // the owner's OFF, AFTER the approval, while the run runs
      h.ac.abort(); await h.pr;   // the run ends: the spent grant's end is «used»
      await SW.durable(path.join(wo2.dataDir, 'vault-grant-ends.json'));
      wo2.door = wo2.mk(mod, { timers: { set: () => 0, clear: () => { } } });   // THE RESTART
      return { running: h.running, afterRestart: wo2.door.usesFor(c8).ended.map((e) => e.endedBy) };
    };
    const orr = await offRestart(DOOR);
    ok(orr.running && orr.afterRestart.length === 0, `wl932b4e8: an end after the owner's OFF of an approval given before it is never recorded — a restart says nothing over the OFF — ${JSON.stringify(orr)}`, orr);
    const mor = M.load('src/server/vault-run-door.js', anchored(anchored(SRCa, "      if (offAt.has(id) && (offAt.get(id) || 0) >= (Number(g.at) || 0)) continue;", '', 'test-vault-run wl932b4e8: no record-time OFF skip'), '  const offSinceOf = (d, id) => Math.max(offAt.get(id) || 0, d && d.touched ? Number(d.touched[id]) || 0 : 0);', '  const offSinceOf = (d, id) => offAt.get(id) || 0;', 'test-vault-run B-a14b remainder: and the OFF from memory alone'), 'a14b-offskip');   // B-a14b's remainder: the persisted toggle hides that end too now — each guard alone keeps the OFF the news, so the RED takes both
    const orrR = await offRestart(mor);
    ok(orrR.running && orrR.afterRestart.join() === 'used', `RED control: no record-time OFF skip AND the OFF read from memory alone ⇒ after a restart the end is said over the owner's OFF (its time forgotten) — ${JSON.stringify(orrR)}`, orrR);
    // B-a14b's remainder (主开发 r1482): A RESTART ENDS a live approval (the vault locks at each start) — and the AGENT is told: a
    // new door over the same data (the restart) lists the end «restart» in `uses` and refuses the next run grant_expired with the
    // restart in its words (it read entry_not_runnable — «not switched on» — before); its For-you record says «restart»; a record
    // from before (no conversation / entry in its facts) is ended on the record only. RED: the start writes no end
    const restartEnds = async (mod, { old = false } = {}) => {
      const ws = await world();
      ws.door = ws.mk(mod, { timers: { set: () => 0, clear: () => { } } });
      const qs = ws.door.request({ caller: c8, entry: M1, purpose: 'a restart in between' });
      const ans = ws.door.answerRequest(qs.askId, { answer: '8h', reauthed: true, person: true });   // live for 8 hours
      const g = [...ws.door._grants.values()].find((x) => x.conv === c8.scope), todoId = g ? g.todoId : null;
      const it0 = todoId ? ws.userTodos.get(todoId) : null, f0 = (it0 && it0.resolvedFact) || {};
      const facts = { conv: f0.conv === c8.scope, entry: f0.entry === 'mounts:m1#secretKey', purpose: f0.purpose === 'a restart in between' };
      if (old && it0 && it0.resolvedFact) { delete it0.resolvedFact.conv; delete it0.resolvedFact.entry; }   // a record written before this release
      const liveEnded = ws.door.usesFor(c8).ended.length;
      ws.door = ws.mk(mod, { timers: { set: () => 0, clear: () => { } } });   // THE RESTART: a new door over the same data (its grants were memory)
      const recEnd = () => { const x = todoId ? ws.userTodos.get(todoId) : null; return (x && x.resolvedFact && x.resolvedFact.endedBy) || null; };
      await untilFact(() => !!recEnd(), "the restart's record says how the approval ended");   // the start's sweep has run: the record says how it ended
      const e0 = ws.door.usesFor(c8).ended[0] || null;
      const ra = await runAnswered(ws, ENV('env'), { caller: c8 });
      return { answered: !!(ans && ans.ok), facts, liveEnded, afterRestart: e0 ? { endedBy: e0.endedBy, purpose: e0.purpose, entry: e0.entry } : null, code: ra.r.code, card: !!ra.card, restartWords: typeof ra.r.words === 'string' && /the hub restarted at \d{4}-\d\d-\d\d \d\d:\d\d UTC/.test(ra.r.words), recordEnd: recEnd() };
    };
    const rse = await restartEnds(DOOR);
    ok(rse.answered && rse.facts.conv && rse.facts.entry && rse.facts.purpose && rse.liveEnded === 0 && rse.afterRestart && rse.afterRestart.endedBy === 'restart' && rse.afterRestart.purpose === 'a restart in between' && rse.afterRestart.entry === M1 && rse.code === 'grant_expired' && rse.restartWords && rse.recordEnd === 'restart',
      `B-a14b's remainder: a RESTART ends a live approval and the agent is told — \`uses\` lists «restart», the next run is refused grant_expired saying the hub restarted, the record says so — ${JSON.stringify(rse)}`, rse);
    const mrse = M.load('src/server/vault-run-door.js', anchored(SRCa, " if (keyed) noteEnded({ conv: f.conv, entries: [f.entry], once: f.grantedFor === 'once', at: Number(f.at) || 0, purpose: SS.redactSecrets(typeof f.purpose === 'string' ? f.purpose : '').text.slice(0, 400) }, 'restart', t0);", '', 'test-vault-run B-a14b remainder: the start writes no end'), 'a14b-restart');
    const rser = await restartEnds(mrse);
    ok(rser.recordEnd === 'restart' && !rser.afterRestart && rser.code !== 'grant_expired', `RED control: the start writes no end (the release) ⇒ \`uses\` silent after a restart and the run refused as ${rser.code} — never «your approval ended» — ${JSON.stringify(rser)}`, rser);
    const rso = await restartEnds(DOOR, { old: true });
    ok(rso.recordEnd === 'restart' && !rso.afterRestart, `B-a14b's remainder: a record from before (no conversation / entry in its facts) is ended on the record only — nothing written for an entry it cannot name — ${JSON.stringify({ recordEnd: rso.recordEnd, afterRestart: rso.afterRestart })}`, rso);
    // the read: an OFF while a spent once-grant's run RUNS, then a RESTART before that run ends (its record still reads live): the
    // restart's end must not be said over the owner's OFF — the persisted toggle is the OFF's time. RED: the OFF read from memory
    // alone (gone at the restart) ⇒ «the hub restarted … it already was when they approved», false
    const offThenRestart = async (mod) => {
      const wq = await world(), clk = { t: Date.now() };
      wq.door = wq.mk(mod, { now: () => clk.t, timers: { set: () => 0, clear: () => { } } });
      const h = await runHeld(wq);   // a once-grant approved and spent by a run held open
      clk.t += 1000;
      const off = wq.door.setRunnable({ id: 'mounts:m1#secretKey', on: false });   // the owner's OFF, a second after the approval, while the run runs
      await SW.durable(path.join(wq.dataDir, 'vault-grant-ends.json'));   // (r1700's read) the spend writes its end now — what the OFF dropped has landed before the restart reads the file
      wq.door = wq.mk(mod, { now: () => clk.t, timers: { set: () => 0, clear: () => { } } });   // THE RESTART before the run ended
      const recOf = () => (wq.userTodos.resolvedOf('vault-grant-ask') || []).find((x) => x.resolvedBy === 'granted');
      await untilFact(() => !!((recOf() || {}).resolvedFact || {}).endedAt, "the start's sweep ended the approval's record");   // the start's sweep ended the approval's record
      const listed = wq.door.usesFor(c8).ended.map((e) => e.endedBy);
      const r = await wq.door.run({ caller: c8, args: ENV('env'), cwd: wq.work });
      h.ac.abort(); await h.pr;   // the old run ends (its door's own business)
      return { running: h.running, off: !!(off && off.ok !== false), recordEnd: ((recOf() || {}).resolvedFact || {}).endedBy || null, listed, code: r.code, offWords: typeof r.words === 'string' && /it already was when they approved/.test(r.words) };
    };
    const otr = await offThenRestart(DOOR);
    ok(otr.running && otr.off && otr.recordEnd === 'restart' && otr.listed.length === 0 && otr.code === 'entry_not_runnable' && !otr.offWords, `the read: an OFF while the run ran, then a restart — the OFF stays the owner's news (no «restart» said over it; the run refused entry_not_runnable) — ${JSON.stringify(otr)}`, otr);
    const motr = M.load('src/server/vault-run-door.js', anchored(SRCa, '  const offSinceOf = (d, id) => Math.max(offAt.get(id) || 0, d && d.touched ? Number(d.touched[id]) || 0 : 0);', '  const offSinceOf = (d, id) => offAt.get(id) || 0;', 'test-vault-run B-a14b remainder: the OFF from memory alone'), 'a14b-off-restart');
    const otrR = await offThenRestart(motr);
    ok(otrR.listed.join() === 'restart' && otrR.code === 'grant_expired' && otrR.offWords, `RED control: the OFF read from memory alone ⇒ after the restart «restart» is said over the owner's OFF, with «it already was when they approved» — false — ${JSON.stringify(otrR)}`, otrR);
    // r1700 (1): a once-grant SPENT by a run still running at the restart — its spend said «used» (the first end stands), so the start
    // writes no «restart» over it: `uses` lists «used» dated at the spend, the run is refused saying its one run was used, the record
    // says «used» at the spend. RED: no end written at the spend ⇒ «restart». r1700 (2), the run in flight: the entry DELETED while
    // that run runs (the door's forget — both of the paste door's deletes call it: a free entry's and an agent's own), then the restart: nothing listed for the gone entry,
    // the record «used» at the spend. RED: the delete that skips the run in flight ⇒ «restart» listed for an entry that is gone.
    // (the read) a SECOND approval of the pair (8 hours) while that run runs, then the restart: the first record «used» at its spend,
    // the second «restart». RED: the new approval that drops the pair's end alone ⇒ the first record «restart»
    const spentRestart = async (mod, { forget = false, again = false } = {}) => {
      const wq = await world(), clk = { t: Date.now() }, endsF = path.join(wq.dataDir, 'vault-grant-ends.json');
      wq.door = wq.mk(mod, { now: () => clk.t, timers: { set: () => 0, clear: () => { } } });
      const h = await runHeld(wq);   // approved and spent at clk.t, its run held open
      const spentAt = clk.t;
      clk.t += 1000;
      const fe = forget ? wq.door.forgetEntry('mounts:m1#secretKey') : null;
      const q2 = again ? wq.door.request({ caller: c8, entry: M1, purpose: 'a second approval meanwhile' }) : null;
      const a2 = q2 ? wq.door.answerRequest(q2.askId, { answer: '8h', reauthed: true, person: true }) : null;
      await SW.durable(endsF);   // what the spend (and the delete) wrote has landed: a restart reads the file
      wq.door = wq.mk(mod, { now: () => clk.t, timers: { set: () => 0, clear: () => { } } });   // THE RESTART while the run still runs
      const recOf = (gf = 'once') => (wq.userTodos.resolvedOf('vault-grant-ask') || []).find((x) => x.resolvedBy === 'granted' && (x.resolvedFact || {}).grantedFor === gf);
      await untilFact(() => !!(((recOf() || {}).resolvedFact || {}).endedAt && (!again || ((recOf('8h') || {}).resolvedFact || {}).endedAt)), "the spent approval's record (and the new one's, when there is one) has its end after the restart");   // the records have their ends
      const e0 = wq.door.usesFor(c8).ended[0] || null;
      const r = forget || again ? null : await wq.door.run({ caller: c8, args: ENV('env'), cwd: wq.work });
      const f = (recOf() || {}).resolvedFact || {}, f2 = again ? (recOf('8h') || {}).resolvedFact || {} : null;
      h.ac.abort(); await h.pr;   // the old run ends (its door's own business)
      return { running: h.running, forgot: forget ? !!(fe && fe.ok) : null, listed: e0 ? { endedBy: e0.endedBy, atSpend: Date.parse(e0.endedAt) === spentAt } : null, code: r ? r.code : null, usedWords: !!(r && typeof r.words === 'string' && /its one run was used at/.test(r.words)), recordEnd: f.endedBy || null, recordAtSpend: Number(f.endedAt) === spentAt, ...(again ? { again: !!(a2 && a2.ok), againEnd: f2.endedBy || null } : {}) };
    };
    const spr = await spentRestart(DOOR);
    ok(spr.running && spr.listed && spr.listed.endedBy === 'used' && spr.listed.atSpend && spr.code === 'grant_expired' && spr.usedWords && spr.recordEnd === 'used' && spr.recordAtSpend,
      `r1700 (1): a once-grant spent by a run still running at the restart — the first end stands: «used» dated at the spend in \`uses\`, the run told its one run was used, the record «used» — ${JSON.stringify(spr)}`, spr);
    const mspr = M.load('src/server/vault-run-door.js', anchored(SRCa, " noteEnded(a.g, 'used', a.g.spentAt); inFlight.add(a.g); }", ' inFlight.add(a.g); }', 'test-vault-run r1700: no end written at the spend'), 'a14b-spent-restart');
    const sprR = await spentRestart(mspr);
    ok(sprR.running && sprR.listed && sprR.listed.endedBy === 'restart' && sprR.recordEnd === 'restart', `RED control: no end written at the spend ⇒ the restart is said over the run that used it — ${JSON.stringify(sprR)}`, sprR);
    const spf = await spentRestart(DOOR, { forget: true });
    ok(spf.running && spf.forgot && !spf.listed && spf.recordEnd === 'used' && spf.recordAtSpend, `r1700 (2): the entry deleted while a run that spent its once-grant runs, then a restart — nothing listed for the gone entry, the record «used» at the spend — ${JSON.stringify(spf)}`, spf);
    const mspf = M.load('src/server/vault-run-door.js', anchored(SRCa, "    for (const g of [...inFlight]) if (g && Array.isArray(g.entries) && g.entries.includes(key)) { if (g.ran) grantEnded(g, 'used'); else if (!g.pendingEnd) g.pendingEnd = { by: 'deleted', at: now() }; dropped++; }\n", '', 'test-vault-run r1700: the delete skips the run in flight'), 'a14b-spent-forget');
    const spfR = await spentRestart(mspf, { forget: true });
    ok(spfR.running && spfR.listed && spfR.listed.endedBy === 'restart' && spfR.recordEnd === 'restart', `RED control: the delete that skips the run in flight ⇒ after the restart «restart» is listed for an entry that no longer exists — ${JSON.stringify(spfR)}`, spfR);
    const spa = await spentRestart(DOOR, { again: true });
    ok(spa.running && spa.again && spa.recordEnd === 'used' && spa.recordAtSpend && spa.againEnd === 'restart' && spa.listed && spa.listed.endedBy === 'restart', `(the read) a second approval of the pair while the run that spent the first runs, then a restart — the first record «used» at its spend, the second «restart» (\`uses\`: the newest, «restart») — ${JSON.stringify(spa)}`, spa);
    const mspa = M.load('src/server/vault-run-door.js', anchored(SRCa, '    grants.set(q.pair, g);\n    endInFlight(q.scope, q.id);\n', '    grants.set(q.pair, g);\n', 'test-vault-run r1700 read: the new approval drops the pair end alone'), 'a14b-spent-again');
    const spaR = await spentRestart(mspa, { again: true });
    ok(spaR.running && spaR.again && spaR.recordEnd === 'restart' && spaR.againEnd === 'restart', `RED control: the new approval that drops the pair's end alone ⇒ the first record says «restart» over the run that used it — ${JSON.stringify(spaR)}`, spaR);
    // (the second read) EVERY road where an approval deletes its pair's end ends a spent in-flight once-grant of that pair first —
    // the 8-hour / once road (the leg above) AND the standing road (its approval needs the use-grants store this world does not
    // build): a census of the door's text — each `endedGrants.delete(q.…)` stands right after `endInFlight(q.scope, q.id);`. RED:
    // the standing road without it
    const inFlightCensus = (src) => { const ls = String(src).split('\n'), at = ls.map((l, i) => (/endedGrants\.delete\(q\./.test(l) ? i : -1)).filter((i) => i >= 0); return { sites: at.length, bare: at.filter((i) => !/^\s*endInFlight\(q\.scope, q\.id\);\s*$/.test(ls[i - 1] || '')).map((i) => ls[i].trim().slice(0, 70)) }; };
    const icz = inFlightCensus(SRCa);
    ok(icz.sites === 2 && icz.bare.length === 0, `(the second read) both roads that delete a pair's end on a new approval (the 8-hour / once road, the standing road) end a spent in-flight once-grant of the pair first — ${JSON.stringify(icz)}`, icz);
    const iczR = inFlightCensus(anchored(SRCa, '      endInFlight(q.scope, q.id);\n      if (endedGrants.delete(q.quietPair)) endsSave();', '      if (endedGrants.delete(q.quietPair)) endsSave();', 'test-vault-run r1700 read 2: the standing road without endInFlight'));
    ok(iczR.sites === 2 && iczR.bare.length === 1 && /q\.quietPair/.test(iczR.bare[0] || ''), `RED control: the standing road without endInFlight ⇒ the census names it — ${JSON.stringify(iczR)}`, iczR);
    // r1700 (1), its take-back: a BURNED run (nothing ran — its run folder never made) gives its once-grant back, and takes back the
    // «used» its spend wrote: a restart then ends that live approval «restart», never «used». RED: no take-back ⇒ «used» said of a
    // run that never ran
    const burnedRestart = async (mod) => {
      const wb3 = await world(); let burn = false;
      wb3.door = wb3.mk(mod, { runRoot: () => (burn ? path.join(wb3.dir, 'run-never-made') : wb3.runRoot), timers: { set: () => 0, clear: () => { } } });
      const qb3 = wb3.door.request({ caller: c8, entry: M1, purpose: 'a run that burns, then a restart' });
      wb3.door.answerRequest(qb3.askId, { answer: 'once', reauthed: true, person: true });
      burn = true;
      const code = (await runAnswered(wb3, ENV('env'), { caller: c8 })).r.code;
      burn = false;
      const givenBack = [...wb3.door._grants.values()].filter((g) => g.conv === c8.scope && g.once).length;
      await SW.durable(path.join(wb3.dataDir, 'vault-grant-ends.json'));
      wb3.door = wb3.mk(mod, { timers: { set: () => 0, clear: () => { } } });   // THE RESTART
      const recOf = () => (wb3.userTodos.resolvedOf('vault-grant-ask') || []).find((x) => x.resolvedBy === 'granted');
      await untilFact(() => !!((recOf() || {}).resolvedFact || {}).endedAt, "the burned run's record has its end after the restart");
      return { code, givenBack, recordEnd: ((recOf() || {}).resolvedFact || {}).endedBy || null, listed: wb3.door.usesFor(c8).ended.map((e) => e.endedBy) };
    };
    const brs = await burnedRestart(DOOR);
    ok(brs.code === 'spawn_failed' && brs.givenBack === 1 && brs.recordEnd === 'restart' && brs.listed.join() === 'restart', `r1700 (1): a burned run takes back the «used» its spend wrote — the approval given back ends «restart» at the restart — ${JSON.stringify(brs)}`, brs);
    const mbrs = M.load('src/server/vault-run-door.js', anchored(SRCa, ' if (burned) for (const a of spent) unsayUse(a.g);', '', 'test-vault-run r1700: no take-back'), 'a14b-burned-restart');
    const brsR = await burnedRestart(mbrs);
    ok(brsR.code === 'spawn_failed' && brsR.recordEnd === 'used' && brsR.listed.join() === 'used', `RED control: no take-back on a burned run ⇒ the restart says «its one run was used» of a run that never ran — ${JSON.stringify(brsR)}`, brsR);
    // r1700 (2): an entry DELETED while a grant to it is live: the grant and its record end there («deleted», its own word — r1825); a later restart writes
    // no end for the entry and `uses` offers no «ask again» for it. RED: the delete that leaves the live grant ⇒ «restart» listed
    const deletedLive = async (mod) => {
      const wd2 = await world();
      wd2.door = wd2.mk(mod, { timers: { set: () => 0, clear: () => { } } });
      const qd = wd2.door.request({ caller: c8, entry: M1, purpose: 'an entry deleted meanwhile' });
      wd2.door.answerRequest(qd.askId, { answer: '8h', reauthed: true, person: true });
      const g = [...wd2.door._grants.values()].find((x) => x.conv === c8.scope), todoId = g ? g.todoId : null;
      const recEnd = () => (((wd2.userTodos.get(todoId) || {}).resolvedFact || {}).endedBy) || null;
      wd2.door._seen.set('pair-seen-r1700', { at: Date.now(), entries: ['mounts:m1#secretKey'] });   // a shape the owner allowed once this unlock, naming the entry
      const fe = wd2.door.forgetEntry('mounts:m1#secretKey');   // the entry deleted (the door's forget — both of the paste door's deletes call it: a free entry's and an agent's own)
      const afterForget = { grants: [...wd2.door._grants.values()].filter((x) => x.conv === c8.scope).length, recordEnd: recEnd(), seen: wd2.door._seen.has('pair-seen-r1700') };
      wd2.door = wd2.mk(mod, { timers: { set: () => 0, clear: () => { } } });   // THE RESTART
      await untilFact(() => !!recEnd(), "the deleted entry's record has its end (at the delete, or at the start)");   // the record has its end (at the delete, or at the start)
      return { todo: !!todoId, forgot: !!(fe && fe.ok), afterForget, recordEnd: recEnd(), listed: wd2.door.usesFor(c8).ended.map((e) => e.endedBy) };
    };
    const dlv = await deletedLive(DOOR);
    ok(dlv.todo && dlv.forgot && dlv.afterForget.grants === 0 && !dlv.afterForget.seen && dlv.afterForget.recordEnd === 'deleted' && dlv.recordEnd === 'deleted' && dlv.listed.length === 0, `r1700 (2): an entry deleted while a grant to it is live — the grant and its record end there («deleted», its own word — r1825); after a restart \`uses\` offers nothing for the gone entry — ${JSON.stringify(dlv)}`, dlv);
    const mdlv = M.load('src/server/vault-run-door.js', anchored(SRCa, "    for (const [p, g] of [...grants]) if (g && Array.isArray(g.entries) && g.entries.includes(key)) { grants.delete(p); grantEnded(g, 'deleted'); dropped++; }\n", '', 'test-vault-run r1700: the delete leaves the live grant'), 'a14b-deleted-live');
    const dlvR = await deletedLive(mdlv);
    ok(dlvR.afterForget.grants === 1 && dlvR.recordEnd === 'restart' && dlvR.listed.join() === 'restart', `RED control: the delete that leaves the live grant ⇒ after a restart «restart» is listed for an entry that no longer exists — ${JSON.stringify(dlvR)}`, dlvR);
    const mdls = M.load('src/server/vault-run-door.js', anchored(SRCa, "    for (const [p, x] of [...seen]) if (x && Array.isArray(x.entries) && x.entries.includes(key)) { seen.delete(p); dropped++; }", '', 'test-vault-run r1700 read: the delete leaves the seen shape'), 'a14b-deleted-seen');
    const dlsR = await deletedLive(mdls);
    ok(dlsR.afterForget.seen && dlsR.afterForget.grants === 0, `RED control: the delete that leaves the seen shape ⇒ a shape the owner allowed for the gone entry outlives it (a value pasted later under the name would run it with no card) — ${JSON.stringify(dlsR.afterForget)}`, dlsR);
    // r1700 (3): a For-you store with NO whenRead that is not read yet (every noteFact refused): the start's sweep says ONE line for
    // all its records, their count named. RED: a line a record
    const sweepLog = async (mod) => {
      const wl3 = await world(), lines = [];
      const t1 = Date.now(), recs = [1, 2, 3].map((n) => ({ id: `rec-${n}`, status: 'done', resolvedBy: 'granted', action: { type: 'vault-grant-ask', askId: `ask-${n}` }, resolvedFact: { grantedFor: '8h', until: t1 + 3600e3, conv: c8.scope, entry: 'mounts:m1#secretKey', at: t1 - 1000, purpose: 'p' } }));
      const ut = new Proxy(wl3.userTodos, { get: (tt, k) => (k === 'whenRead' ? undefined : k === 'noteFact' ? () => { throw new Error('the For-you store is not read yet'); } : k === 'resolvedOf' ? (type) => (type === 'vault-grant-ask' ? recs.map((x) => ({ ...x })) : tt.resolvedOf(type)) : typeof tt[k] === 'function' ? tt[k].bind(tt) : tt[k]) });
      wl3.mk(mod, { userTodos: ut, log: (m) => lines.push(String(m)), timers: { set: () => 0, clear: () => { } } });
      const said = lines.filter((m) => /could not be ended at the start/.test(m));
      return { said: said.length, lines: said };
    };
    const swl = await sweepLog(DOOR);
    ok(swl.said === 1 && /^3 of 3 live approval record\(s\) could not be ended at the start \(the first: the For-you store is not read yet\)$/.test(swl.lines[0] || ''), `r1700 (3): a store not read yet refuses every record — ONE line for the whole sweep, its count named — ${JSON.stringify(swl)}`, swl);
    const mswl = M.load('src/server/vault-run-door.js', anchored(SRCa, "catch (e) { if (!failed++) why = (e && e.message) || String(e); }", "catch (e) { if (!failed++) why = (e && e.message) || String(e); log(`a live approval's record could not be ended at the start (${(e && e.message) || e})`); }", 'test-vault-run r1700: a line a record'), 'a14b-sweep-log');
    const swlR = await sweepLog(mswl);
    ok(swlR.said === 4, `RED control: a line a record ⇒ the log says it four times for three records — ${JSON.stringify({ said: swlR.said })}`, swlR);
    // B-a14b's last remainder (r1823/r1834) (2): the run card's 8-hour «Always» on the road WITH the use-grants store (the hub's one
    // wiring, src/server/mounts-plugins-wiring.js) is a STANDING member — this conversation × the card's hosts × until — the store's
    // own row; its record NAMES that member (principal + entries) and keeps the row's OWN until (one value). A restart ends nothing:
    // the start asks the row, the card stays live, the same command runs with no card. A ✕ of the member in the Vault window then
    // tells the card «revoked». On the road WITHOUT the store (memory: no production wiring) the restart did end it — «restart»,
    // and the command draws its card again. REDs: the release's stamp (the start that asks no row); the ✕ that tells no card
    const alwaysRestart = async (mod, { store = true } = {}) => {
      const VUGa = R('src/server/vault-use-grants.js'), GSa = R('src/server/grants-store.js'), FAa = R('src/foryou-actions.js');
      const wa = await world(), gsa = GSa.create({ memory: true });
      const uga = store ? VUGa.create({ grants: () => gsa, vault: wa.vault, dataDir: wa.dataDir, log: (m) => wa.logs.push(String(m)) }) : null;
      const mkA = () => (uga ? wa.mk(mod, { useGrants: uga, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) }) : wa.mk(mod));
      wa.door = mkA(); openRow(wa);
      const a8 = await runAnswered(wa, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/a'], { answer: 'always', reauthed: true, ttl: '8h' });
      const cardId = a8.card ? a8.card.id : null;
      const f0 = ((cardId ? wa.userTodos.get(cardId) : null) || {}).resolvedFact || {};
      let rowUntil = false;
      if (uga && typeof f0.principal === 'string') { const m = (uga.publicFor('mounts:m1#secretKey').to || []).find((x) => x.principal === f0.principal); rowUntil = !!(m && (m.scopes || []).some((x) => Number(x.until) === Number(f0.until))); }
      wa.door = mkA();   // THE RESTART: a new door over the same data (and the same grants store)
      await untilFact(() => startSwept(wa), "the start's catch-up of the «Always» cards ran (the For-you store read, no deferred step waiting)");   // the start's sweeps have run
      const it = cardId ? wa.userTodos.get(cardId) : null, f = (it && it.resolvedFact) || {};
      const after = await runAnswered(wa, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/b'], { answer: 'deny' });
      const out = { always: !!(a8.r && a8.r.ok && a8.a && a8.a.ok), alwaysFor: f.alwaysFor || null, named: typeof f0.principal === 'string' && Array.isArray(f0.entries) && f0.entries.includes('mounts:m1#secretKey'), rowUntil, recordEnd: f.endedBy || null, state: it ? FAa.decisionCard(it).state : null, ranNoCard: !!(after.r && after.r.ok) && !after.card, cardAgain: !!after.card };
      if (uga && typeof f0.principal === 'string') {   // the ✕ in the Vault window (the owner's take-back of that member)
        const tb = wa.door.takeBack({ id: 'mounts:m1#secretKey', principal: f0.principal, by: 'user' });
        const it2 = cardId ? wa.userTodos.get(cardId) : null;
        out.takeBack = { ok: !!(tb && tb.ok), recordEnd: ((it2 && it2.resolvedFact) || {}).endedBy || null, state: it2 ? FAa.decisionCard(it2).state : null };
      }
      return out;
    };
    const arc = await alwaysRestart(DOOR);
    ok(arc.always && arc.alwaysFor === '8h' && arc.named && arc.rowUntil && !arc.recordEnd && arc.state !== 'ended' && arc.ranNoCard, `B-a14b's last remainder (2): the run card's 8-hour «Always» with the use-grants store — its record names its member and keeps the row's own until; a restart ends nothing: the card stays live, the same command runs with no card — ${JSON.stringify(arc)}`, arc);
    ok(arc.takeBack && arc.takeBack.ok && arc.takeBack.recordEnd === 'revoked' && arc.takeBack.state === 'revoked', `(r1834) the member's ✕ in the Vault window ⇒ its card says «revoked», as the 1-hour window's does — ${JSON.stringify(arc.takeBack)}`, arc.takeBack);
    const marc = M.load('src/server/vault-run-door.js', anchored(SRCa, "const end = says === 'memory' ? (f.alwaysFor === '8h' ? 'restart' : null) : says === 'replaced' ? 'replaced' : says === 'gone' ? 'revoked' : null;", "const end = f.alwaysFor === '8h' ? 'restart' : null;", "test-vault-run r1834: the release's stamp (the start asks no row)"), 'a14b-always-restart');
    const arcR = await alwaysRestart(marc);
    ok(arcR.always && arcR.recordEnd === 'restart' && arcR.state === 'ended' && arcR.ranNoCard, `RED control: the release's stamp — the start that asks no row says «ended · restart» while the member still lets the command run with no card — ${JSON.stringify(arcR)}`, arcR);
    const marc2 = M.load('src/server/vault-run-door.js', anchored(SRCa, "    let toldA = 0; if (r && r.ok && scope !== 'window') { try { toldA = alwaysTakenBack(String(id), 'revoked', pk); } catch { } }", '    let toldA = 0;', 'test-vault-run r1834: the ✕ that tells no card'), 'a14b-always-takeback');
    const arcR2 = await alwaysRestart(marc2);
    ok(arcR2.takeBack && arcR2.takeBack.ok && !arcR2.takeBack.recordEnd && arcR2.takeBack.state !== 'revoked', `RED control: the ✕ that tells no card ⇒ the card still reads «always allowed» after the owner took its member back — ${JSON.stringify(arcR2.takeBack)}`, arcR2);
    const arm = await alwaysRestart(DOOR, { store: false });
    ok(arm.always && !arm.named && arm.recordEnd === 'restart' && arm.state === 'ended' && arm.cardAgain, `(r1834) the road WITHOUT the store (memory — no production wiring): the restart did end the 8-hour «Always»: «ended · restart», and the command draws its card again — ${JSON.stringify(arm)}`, arm);
    // (r1834's reads) a member whose END MOVED by a road that told no card (here: the store written directly — as a change made while
    // For you was held unread): the START, at For you's read, catches up what the row says — «replaced». RED: the start that tells
    // only the memory road (the read's third form) ⇒ the card keeps «always allowed» over a grant the row no longer says
    const alwaysMoved = async (mod, { shift = -3600e3 } = {}) => {
      const VUGm = R('src/server/vault-use-grants.js'), GSm = R('src/server/grants-store.js'), FAm = R('src/foryou-actions.js');
      const wm = await world(), gsm = GSm.create({ memory: true });
      const ugm = VUGm.create({ grants: () => gsm, vault: wm.vault, dataDir: wm.dataDir, log: (m) => wm.logs.push(String(m)) });
      const mkM = () => wm.mk(mod, { useGrants: ugm, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) });
      wm.door = mkM(); openRow(wm);
      const ID = 'mounts:m1#secretKey';
      const a8 = await runAnswered(wm, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/a'], { answer: 'always', reauthed: true, ttl: '8h' });
      const cardId = a8.card ? a8.card.id : null;
      const recOf = () => ((cardId ? wm.userTodos.get(cardId) : null) || {});
      const f0 = recOf().resolvedFact || {}, pk = f0.principal, later = Number(f0.until) + shift;   // r2175 (1): EARLIER by default (a later move is held)
      const moved = ugm.addMember(ID, { kind: 'conversation', key: wm.caller.conversationId, name: 'Lane X' }, { hosts: ['api.example.com'], until: later, source: 'owner' });
      const scopesNow = ((ugm.publicFor(ID).to || []).find((x) => x.principal === pk) || {}).scopes || [];
      const before = (recOf().resolvedFact || {}).endedBy || null;   // nothing told it: the store was written directly
      wm.door = mkM();   // THE RESTART (its read)
      await untilFact(() => startSwept(wm), "the start's catch-up of the «Always» cards ran (the For-you store read, no deferred step waiting)");
      return { pressed: !!(a8.a && a8.a.ok), moved: !!(moved && moved.ok) && scopesNow.some((x) => Number(x.until) === later) && !scopesNow.some((x) => Number(x.until) === Number(f0.until)), before, end: (recOf().resolvedFact || {}).endedBy || null, state: FAm.decisionCard(recOf()).state };
    };
    const amv = await alwaysMoved(DOOR), amvL = await alwaysMoved(DOOR, { shift: 30 * 86400e3 });
    ok(amvL.pressed && amvL.moved && !amvL.end && amvL.state !== 'ended', `r2175 (1): a member whose end moved LATER with no card told: the start leaves the card «always allowed» — ${JSON.stringify(amvL)}`, amvL);
    ok(amv.pressed && amv.moved && !amv.before && amv.end === 'replaced' && amv.state === 'ended', `(r1834's reads) a member whose end moved EARLIER with no card told: the start catches up what the row says — «replaced» — ${JSON.stringify(amv)}`, amv);
    const mamv = M.load('src/server/vault-run-door.js', anchored(SRCa, " : says === 'replaced' ? 'replaced' : says === 'gone' ? 'revoked' : null;", ' : null;', 'test-vault-run r1834 read 4: the start that tells only the memory road'), 'a14b-always-moved');
    const amvR = await alwaysMoved(mamv);
    ok(amvR.moved && !amvR.end, `RED control: the start that tells only the memory road ⇒ the card keeps «always allowed» over a grant the row no longer says — ${JSON.stringify(amvR)}`, amvR);
    // (the fifth read) the start's catch-up of a GONE scope, on a 30-day card (any «Always», not the 8-hour one alone): its
    // member revoked in the store directly (a road that told no card — as one made while For you was held unread), then a
    // restart ⇒ «revoked». RED: the catch-up that leaves a gone scope unsaid
    const alwaysGone = async (mod) => {
      const VUGg = R('src/server/vault-use-grants.js'), GSg = R('src/server/grants-store.js'), FAg = R('src/foryou-actions.js');
      const wg = await world(), gsg = GSg.create({ memory: true });
      const ugg = VUGg.create({ grants: () => gsg, vault: wg.vault, dataDir: wg.dataDir, log: (m) => wg.logs.push(String(m)) });
      const mkG = () => wg.mk(mod, { useGrants: ugg, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) });
      wg.door = mkG(); openRow(wg);
      const ID = 'mounts:m1#secretKey';
      const c30 = await runAnswered(wg, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/a'], { answer: 'always', reauthed: true, ttl: '30d' });
      const cardId = c30.card ? c30.card.id : null, recOf = () => ((cardId ? wg.userTodos.get(cardId) : null) || {}), f0 = recOf().resolvedFact || {};
      const rv = ugg.revoke(ID, f0.principal, { by: 'user' });   // the store written directly: no card told
      const before = (recOf().resolvedFact || {}).endedBy || null;
      wg.door = mkG();   // THE RESTART (its read)
      await untilFact(() => startSwept(wg), "the start's catch-up of the «Always» cards ran (the For-you store read, no deferred step waiting)");
      return { pressed: !!(c30.a && c30.a.ok), alwaysFor: f0.alwaysFor || null, revoked: !!(rv && rv.ok), before, end: (recOf().resolvedFact || {}).endedBy || null, state: FAg.decisionCard(recOf()).state };
    };
    const agn = await alwaysGone(DOOR);
    ok(agn.pressed && agn.alwaysFor === '30d' && agn.revoked && !agn.before && agn.end === 'revoked' && agn.state === 'revoked', `(the fifth read) a 30-day card whose scope is gone with no card told: the start catches it up — «revoked» — ${JSON.stringify(agn)}`, agn);
    const magn = M.load('src/server/vault-run-door.js', anchored(SRCa, " : says === 'gone' ? 'revoked' : null;", ' : null;', 'test-vault-run r1834 read 5: the catch-up that leaves a gone scope unsaid'), 'a14b-always-gone');
    const agnR = await alwaysGone(magn);
    ok(agnR.revoked && !agnR.end, `RED control: the catch-up that leaves a gone scope unsaid ⇒ the 30-day card keeps «always allowed» after its member was taken back — ${JSON.stringify(agnR)}`, agnR);
    // another member's ✕ tells the card nothing; its entry DELETED (its row dropped first, then the door's forget) tells it
    // «deleted». RED: the forget that tells no «Always» card
    const alwaysOther = async (mod) => {
      const VUGo = R('src/server/vault-use-grants.js'), GSo = R('src/server/grants-store.js'), FAo = R('src/foryou-actions.js');
      const wo = await world(), gso = GSo.create({ memory: true });
      const ugo = VUGo.create({ grants: () => gso, vault: wo.vault, dataDir: wo.dataDir, log: (m) => wo.logs.push(String(m)) });
      wo.door = wo.mk(mod, { useGrants: ugo, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) }); openRow(wo);
      const ID = 'mounts:m1#secretKey';
      const a8 = await runAnswered(wo, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/a'], { answer: 'always', reauthed: true, ttl: '8h' });
      const cardId = a8.card ? a8.card.id : null;
      const recOf = () => ((cardId ? wo.userTodos.get(cardId) : null) || {});
      const other = ugo.addMember(ID, { kind: 'conversation', key: 'conv-y', name: 'Lane Y' }, { hosts: ['api.example.com'], source: 'owner' });
      const tbY = wo.door.takeBack({ id: ID, principal: 'conversation:conv-y', by: 'user' });   // ANOTHER member's ✕
      const afterOther = (recOf().resolvedFact || {}).endedBy || null;
      const dropped = ugo.drop(ID, { by: 'user' });   // the entry deleted: its row first …
      const fe = wo.door.forgetEntry(ID);   // … then the door's forget
      return { pressed: !!(a8.a && a8.a.ok), other: !!(other && other.ok), tbY: !!(tbY && tbY.ok), afterOther, dropped: !!(dropped && dropped.ok), forgot: !!(fe && fe.ok), end: (recOf().resolvedFact || {}).endedBy || null, state: FAo.decisionCard(recOf()).state };
    };
    const aot = await alwaysOther(DOOR);
    ok(aot.pressed && aot.other && aot.tbY && !aot.afterOther && aot.dropped && aot.forgot && aot.end === 'deleted' && aot.state === 'ended', `(r1834's reads) another member's ✕ tells the card nothing; its entry deleted tells it «deleted» — ${JSON.stringify(aot)}`, aot);
    const mamv2 = M.load('src/server/vault-run-door.js', anchored(SRCa, "    try { alwaysTakenBack(key, 'deleted'); } catch { }", '', 'test-vault-run r1834 read: the forget that tells no «Always» card'), 'a14b-always-deleted');
    const aotR = await alwaysOther(mamv2);
    ok(aotR.forgot && !aotR.end, `RED control: the forget that tells no «Always» card ⇒ the card still reads «always allowed» for a deleted entry — ${JSON.stringify(aotR)}`, aotR);
    // (the fourth read) EVERY scope the card wrote: a card over TWO entries, then the ✕ of its member on ONE of them ⇒ «revoked»
    // (its command no longer runs as pressed). And the PRESS road: a second card over both entries pressed «Always» (30 days)
    // moves the first card's end ⇒ the first says «replaced»; a second card on the other entry alone leaves it. REDs: one listed
    // scope read as enough; the press that tells no card
    const twoEntries = async (mod, { second = null, firstTtl = '8h', secondTtl = '30d' } = {}) => {
      const VUGt = R('src/server/vault-use-grants.js'), GSt = R('src/server/grants-store.js'), FAt = R('src/foryou-actions.js');
      const wt = await world(), gst = GSt.create({ memory: true });
      const ugt = VUGt.create({ grants: () => gst, vault: wt.vault, dataDir: wt.dataDir, log: (m) => wt.logs.push(String(m)) });
      wt.door = wt.mk(mod, { useGrants: ugt, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) }); openRow(wt); openRow(wt, 'app-secrets:app1#item.0.1');
      const BOTH = ['--env', 'T=vault://mounts/m1/secretKey', '--env', 'U=vault://app-secrets/app1/item.0.1', '--', 'curl', '-s', 'https://api.example.com/v1/a'];
      const ONE = ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/a'];
      const APP = ['--env', 'U=vault://app-secrets/app1/item.0.1', '--', 'curl', '-s', 'https://api.example.com/v1/b'];
      const c1 = await runAnswered(wt, second ? ONE : BOTH, { answer: 'always', reauthed: true, ttl: firstTtl });
      const id1 = c1.card ? c1.card.id : null, recOf = () => ((id1 ? wt.userTodos.get(id1) : null) || {}), f1 = recOf().resolvedFact || {};
      let act = null;
      if (!second) act = wt.door.takeBack({ id: 'app-secrets:app1#item.0.1', principal: f1.principal, by: 'user' });   // the ✕ on ONE of its two entries
      else { const c2 = await runAnswered(wt, second === 'both' ? BOTH : APP, { answer: 'always', reauthed: true, ttl: secondTtl }); act = c2.a; }
      return { pressed: !!(c1.a && c1.a.ok), entries: Array.isArray(f1.entries) ? f1.entries.length : 0, act: !!(act && act.ok), end: (recOf().resolvedFact || {}).endedBy || null, state: FAt.decisionCard(recOf()).state };
    };
    const tw1 = await twoEntries(DOOR);
    ok(tw1.pressed && tw1.entries === 2 && tw1.act && tw1.end === 'revoked' && tw1.state === 'revoked', `(the fourth read) a card over two entries, the ✕ on one of them ⇒ «revoked» (its command no longer runs as pressed) — ${JSON.stringify(tw1)}`, tw1);
    const mtw = M.load('src/server/vault-run-door.js', anchored(SRCa, "    return missing ? 'gone' : moved ? 'replaced' : 'held';", "    return (missing < want.length * f.entries.slice(0, 64).length) ? 'held' : 'gone';", 'test-vault-run r1834 read 4: one listed scope read as enough'), 'a14b-two-entries');
    const tw1R = await twoEntries(mtw);
    ok(tw1R.act && !tw1R.end, `RED control: one listed scope read as enough ⇒ the card keeps «always allowed» after the ✕ on one of its entries — ${JSON.stringify(tw1R)}`, tw1R);
    const tw2 = await twoEntries(DOOR, { second: 'both', firstTtl: '30d', secondTtl: '8h' }), tw3 = await twoEntries(DOOR, { second: 'app' }), tw2L = await twoEntries(DOOR, { second: 'both' });
    ok(tw2L.pressed && tw2L.act && !tw2L.end && tw2L.state !== 'ended', `r2175 (1): a second press over both entries moving the first card's end LATER (8 hours ⇒ 30 days) ⇒ the first keeps «always allowed» — ${JSON.stringify(tw2L)}`, tw2L);
    ok(tw2.pressed && tw2.act && tw2.end === 'replaced' && tw2.state === 'ended' && tw3.pressed && tw3.act && !tw3.end, `(the fourth read) the PRESS road: a second card over both entries moves the first card's end ⇒ «replaced»; a second card on the other entry alone leaves it — ${JSON.stringify({ tw2, tw3 })}`, { tw2, tw3 });
    const mtp = M.load('src/server/vault-run-door.js', anchored(SRCa, "      try { for (const e of held.entries) alwaysTakenBack(String(e), 'revoked', held.principal); } catch { }", '', 'test-vault-run r1834 read 4: the press that tells no card'), 'a14b-press-tells');
    const tw2R = await twoEntries(mtp, { second: 'both', firstTtl: '30d', secondTtl: '8h' });
    ok(tw2R.act && !tw2R.end, `RED control: the press that tells no card ⇒ the first card keeps «always allowed (8 hours)» while its end is now the second press's — ${JSON.stringify(tw2R)}`, tw2R);
    // …and BOTH roads that take a member back from the row (the ✕ — takeBack; the Save — saveRow) tell the «Always» cards: a census
    // of the door's text (the Save's leg needs the page's row stamp). RED: the Save without it ⇒ the census names it
    const takeBackCensus = (src) => { const fnOf = (name) => { const i = src.indexOf(`  function ${name}(`); return i < 0 ? '' : src.slice(i, src.indexOf('\n  }\n', i)); }; return { takeBack: fnOf('takeBack').includes('alwaysTakenBack('), saveRow: fnOf('saveRow').includes('alwaysTakenBack('), press: fnOf('answer').includes('alwaysTakenBack('), standing: fnOf('answerRequest').includes('alwaysTakenBack('), forget: fnOf('forgetEntry').includes("alwaysTakenBack(key, 'deleted')") }; };
    const tbc = takeBackCensus(SRCa);
    ok(tbc.takeBack && tbc.saveRow && tbc.press && tbc.standing && tbc.forget, `(r1834 + its reads) every road that changes the row tells the cards it touches (the ✕, the Save, a second press, a standing Allow, a delete) — ${JSON.stringify(tbc)}`, tbc);
    const tbcR = takeBackCensus(anchored(SRCa, "    if (r && r.ok) { try { told += alwaysTakenBack(String(id)); } catch { } }", '', 'test-vault-run r1834: the Save that tells no card'));
    ok(tbcR.takeBack && !tbcR.saveRow, `RED control: the Save without it ⇒ the census names the Save road — ${JSON.stringify(tbcR)}`, tbcR);
    // (r1834's third read) THE CARD IS JUDGED BY ITS OWN SCOPES — the owner's Save through the Vault window («Who may use it…»):
    // one that MOVES the card's end ⇒ «replaced» (the card's own sentence no longer the row's); one that keeps the conversation
    // but leaves the card's host out ⇒ «revoked» (it no longer says more than the row). And a 1-hour window card whose entry is
    // DELETED ⇒ «deleted». REDs: the Save that tells no card (each); the delete that tells no window card
    const alwaysSaved = async (mod, { keepHost = true, shift = 3600e3 } = {}) => {
      const VUGs = R('src/server/vault-use-grants.js'), GSs = R('src/server/grants-store.js'), FAs = R('src/foryou-actions.js');
      const ws = await world(), gss = GSs.create({ memory: true });
      const ugs = VUGs.create({ grants: () => gss, vault: ws.vault, dataDir: ws.dataDir, log: (m) => ws.logs.push(String(m)) });
      ws.door = ws.mk(mod, { useGrants: ugs, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) }); openRow(ws);
      const ID = 'mounts:m1#secretKey';
      const a8 = await runAnswered(ws, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/a'], { answer: 'always', reauthed: true, ttl: '8h' });
      const cardId = a8.card ? a8.card.id : null, f0 = ((cardId ? ws.userTodos.get(cardId) : null) || {}).resolvedFact || {};
      const later = Number(f0.until) + shift;
      const to = [{ kind: 'conversation', key: ws.caller.conversationId, hosts: keepHost ? ['api.example.com'] : ['other.example.org'], ...(keepHost ? { until: later } : {}) }];
      const sv = ws.door.saveRow(ID, { to }, { by: 'user', reauthed: true });
      const it = cardId ? ws.userTodos.get(cardId) : null;
      return { pressed: !!(a8.a && a8.a.ok), scopes: Array.isArray(f0.scopeHosts) && f0.scopeHosts.includes('api.example.com'), saved: !!(sv && sv.ok), code: sv && sv.code, end: ((it && it.resolvedFact) || {}).endedBy || null, state: it ? FAs.decisionCard(it).state : null };
    };
    const asv = await alwaysSaved(DOOR), asvE = await alwaysSaved(DOOR, { shift: -3600e3 }), asd = await alwaysSaved(DOOR, { keepHost: false });
    ok(asv.pressed && asv.scopes && asv.saved && !asv.end && asv.state !== 'ended', `r2175 (1): the owner's Save that moves the card's end LATER ⇒ the card keeps «always allowed» (the runs it said are still admitted) — ${JSON.stringify(asv)}`, asv);
    const mlat = M.load('src/server/vault-run-door.js', anchored(SRCa, 'if (e < c) moved++;', 'if (e !== c) moved++;', 'test-vault-run r2175 (1): any moved end read as replaced'), 'a14b-end-later');
    const asvL = await alwaysSaved(mlat);
    ok(asvL.saved && asvL.end === 'replaced', `RED control: any moved end read as «replaced» ⇒ the later end says «ended» while its runs are admitted — ${JSON.stringify(asvL)}`, asvL);
    ok(asvE.pressed && asvE.scopes && asvE.saved && asvE.end === 'replaced' && asvE.state === 'ended', `(r1834's third read) the owner's Save that moves the card's end EARLIER ⇒ the card says «replaced» — ${JSON.stringify(asvE)}`, asvE);
    ok(asd.pressed && asd.saved && asd.end === 'revoked' && asd.state === 'revoked', `(r1834's third read) the owner's Save that keeps the conversation but leaves the card's host out ⇒ «revoked» — ${JSON.stringify(asd)}`, asd);
    const masv = M.load('src/server/vault-run-door.js', anchored(SRCa, "    if (r && r.ok) { try { told += alwaysTakenBack(String(id)); } catch { } }", '', 'test-vault-run r1834 read 3: the Save that tells no card'), 'a14b-always-saved');
    const asvR = await alwaysSaved(masv, { shift: -3600e3 }), asdR = await alwaysSaved(masv, { keepHost: false });
    ok(asvR.saved && !asvR.end && asdR.saved && !asdR.end, `RED control: the Save that tells no card ⇒ both cards still read «always allowed» — ${JSON.stringify({ moved: asvR.end, left: asdR.end })}`, { asvR, asdR });
    // r2175 (4): THE STANDING ALLOW's tell, by behaviour — a standing approval over the card's host writes a scope with NO end (later
    // than any card's): the card keeps «always allowed», as the runs it said are still admitted. RED: any moved end read as
    // «replaced» ⇒ «ended» over a member that still admits
    const standingOver = async (mod) => {
      const VUGs2 = R('src/server/vault-use-grants.js'), GSs2 = R('src/server/grants-store.js'), FAs2 = R('src/foryou-actions.js');
      const wst = await world(), gss2 = GSs2.create({ memory: true });
      const ugs2 = VUGs2.create({ grants: () => gss2, vault: wst.vault, dataDir: wst.dataDir, log: (m) => wst.logs.push(String(m)) });
      wst.door = wst.mk(mod, { useGrants: ugs2, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) }); openRow(wst);
      const c30 = await runAnswered(wst, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/a'], { answer: 'always', reauthed: true, ttl: '30d' });
      const cardId = c30.card ? c30.card.id : null, recOf = () => ((cardId ? wst.userTodos.get(cardId) : null) || {});
      const sq = await wst.door.request({ caller: wst.caller, entry: M1, purpose: 'a standing approval over the card host', standing: true, hosts: ['api.example.com', 'other.example.org'], cwd: wst.work });   // one host past the card's (the card's member already holds its own: a request for it alone is held already, nothing to ask)
      const sa = sq && sq.askId ? wst.door.answerRequest(sq.askId, { answer: 'standing', reauthed: true, person: true }) : null;
      const m = (ugs2.publicFor('mounts:m1#secretKey').to || []).find((x) => x.principal === (recOf().resolvedFact || {}).principal);
      return { pressed: !!(c30.a && c30.a.ok), asked: sq ? (sq.askId ? 'card' : sq.code || sq.already || 'none') : null, allowed: !!(sa && sa.ok), noEnd: !!(m && (m.scopes || []).some((x) => x.kind === 'host' && x.until == null)), end: (recOf().resolvedFact || {}).endedBy || null, state: FAs2.decisionCard(recOf()).state };
    };
    const sto = await standingOver(DOOR);
    ok(sto.pressed && sto.allowed && sto.noEnd && !sto.end && sto.state !== 'ended', `r2175 (4): a standing Allow over the card's host (no end — later than the card's) ⇒ the card keeps «always allowed» — ${JSON.stringify(sto)}`, sto);
    const stoR = await standingOver(mlat);
    ok(stoR.allowed && stoR.end === 'replaced', `RED control: any moved end read as «replaced» ⇒ the standing Allow ends the card over a member that still admits — ${JSON.stringify(stoR)}`, stoR);
    const windowDeleted = async (mod) => {
      const VUGw = R('src/server/vault-use-grants.js'), GSw = R('src/server/grants-store.js'), FAw = R('src/foryou-actions.js');
      const ww = await world(), gsw = GSw.create({ memory: true });
      const ugw = VUGw.create({ grants: () => gsw, vault: ww.vault, dataDir: ww.dataDir, log: (m) => ww.logs.push(String(m)) });
      ww.door = ww.mk(mod, { useGrants: ugw, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) }); openRow(ww);
      const ID = 'mounts:m1#secretKey';
      const sh = await runAnswered(ww, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'bash', '-c', 'curl https://api.example.com'], { answer: null });
      const win = sh.card && sh.card.action && sh.card.action.window === true;
      const yes = sh.card ? ww.door.answer(sh.card.action.askId, { answer: 'window', reauthed: true, person: true }) : null;
      await sh.r;
      const cardId = sh.card ? sh.card.id : null, f0 = ((cardId ? ww.userTodos.get(cardId) : null) || {}).resolvedFact || {};
      const dropped = ugw.drop(ID, { by: 'user' });   // the entry deleted: its row first …
      const fe = ww.door.forgetEntry(ID);   // … then the door's forget
      const it = cardId ? ww.userTodos.get(cardId) : null;
      return { offered: !!win, windowed: !!(yes && yes.ok) && f0.windowFor === '1h', dropped: !!(dropped && dropped.ok), forgot: !!(fe && fe.ok), end: ((it && it.resolvedFact) || {}).endedBy || null, state: it ? FAw.decisionCard(it).state : null };
    };
    const wdl = await windowDeleted(DOOR);
    ok(wdl.offered && wdl.windowed && wdl.dropped && wdl.forgot && wdl.end === 'deleted' && wdl.state === 'ended', `(r1834's third read) a 1-hour window card whose entry is DELETED ⇒ «deleted» — ${JSON.stringify(wdl)}`, wdl);
    const mwdl = M.load('src/server/vault-run-door.js', anchored(SRCa, "      if (f.windowFor) { if (!windows) continue; says = ", "      if (f.windowFor) { continue; says = ", 'test-vault-run r1834 read 3: the delete that tells no window card'), 'a14b-window-deleted');
    const wdlR = await windowDeleted(mwdl);
    ok(wdlR.windowed && wdlR.forgot && !wdlR.end, `RED control: the delete that tells no window card ⇒ it still reads «until HH:MM» for a deleted entry — ${JSON.stringify(wdlR)}`, wdlR);
    // r2230 (3) + (1): A FAILED DELETE's TELL, END TO END — a real run door holding a card over a FREE entry (pressed «Always», or the
    // 1-hour window) and a real paste door whose vault drop fails AFTER it dropped the entry's use row: the card reads ended
    // («revoked») at once — the 1-hour card too (the row took its window: this door refuses its runs). REDs: the paste door that
    // tells nothing on that road (the card keeps «always allowed» over a gone row); the tell that judges no 1-hour card (it keeps
    // «until HH:MM» to its hour's end)
    const FREE_ID = 'secrets:secret:r2230-free#secret', FREE = { entry: 'secret:r2230-free', field: 'secret', label: 'a pasted key', bytes: 30, v: 'free-pasted-value-0123456789ab' };
    const FREE_REF = ['vault://secrets', FREE.entry, FREE.field].join('/');   // its run ref, built (a literal reads to the secret scan as an assignment)
    const SRCp = fs.readFileSync(path.join(REPO, 'src/server/vault-paste-door.js'), 'utf8');
    const freeSources = () => { const rows = [...ROWS.secrets, FREE]; return { ...Object.fromEntries(Object.keys(ROWS).map((st) => [st, () => sourceOf(st)])), secrets: () => ({ vaultRows: () => rows.map(({ v, ...r }) => r), vaultReveal: (e, fl) => { const r = rows.find((x) => x.entry === e && x.field === fl); return r ? r.v : null; } }) }; };
    const failingDrop = (v) => new Proxy(v, { get: (t, k) => (k === 'secretDrop' ? () => ({ ok: false, code: 'store_failed' }) : (typeof t[k] === 'function' ? t[k].bind(t) : t[k])) });   // the vault whose drop fails
    const failedDeleteTold = async (kind, { mod = DOOR, pasteMod = R('src/server/vault-paste-door.js') } = {}) => {
      const VUGf = R('src/server/vault-use-grants.js'), GSf = R('src/server/grants-store.js'), FAf = R('src/foryou-actions.js');
      const wf = await world(), gsf = GSf.create({ memory: true });
      const ugf = VUGf.create({ grants: () => gsf, vault: wf.vault, dataDir: wf.dataDir, log: (m) => wf.logs.push(String(m)) });
      wf.door = wf.mk(mod, { useGrants: ugf, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }), sources: freeSources() }); openRow(wf, FREE_ID);
      const REF = ['--env', 'T=' + FREE_REF, '--'];
      let card = null, pressed = false;
      if (kind === 'always') { const c = await runAnswered(wf, [...REF, 'curl', '-s', 'https://api.example.com/v1/a'], { answer: 'always', reauthed: true, ttl: '30d' }); card = c.card; pressed = !!(c.a && c.a.ok); }
      else { const sh = await runAnswered(wf, [...REF, 'bash', '-c', 'curl https://api.example.com'], { answer: null }); card = sh.card; const yes = sh.card && sh.card.action && sh.card.action.window === true ? wf.door.answer(sh.card.action.askId, { answer: 'window', reauthed: true, person: true }) : null; await sh.r; pressed = !!(yes && yes.ok); }
      const cardId = card ? card.id : null, recOf = () => ((cardId ? wf.userTodos.get(cardId) : null) || {});
      const before = FAf.decisionCard(recOf()).state, members = ((ugf.publicFor(FREE_ID) || {}).to || []).length;
      const paste = pasteMod.create({ vault: failingDrop(wf.vault), useGrants: ugf, vaultRun: wf.door, log: (m) => wf.logs.push(String(m)) });
      const d = paste.dropEntry('r2230-free', { by: 'user' });
      const it = recOf();
      return { kind, pressed, window: (it.resolvedFact || {}).windowFor || null, before, members, code: (d && d.code) || null, rowGone: !ugf.rowsOf(FREE_ID).length, end: (it.resolvedFact || {}).endedBy || null, state: FAf.decisionCard(it).state };
    };
    const fdA = await failedDeleteTold('always'), fdW = await failedDeleteTold('window');
    ok(fdA.pressed && fdA.members >= 1 && fdA.before === 'approved' && fdA.code === 'store_failed' && fdA.rowGone && fdA.end === 'revoked' && fdA.state === 'revoked'
      && fdW.pressed && fdW.window === '1h' && fdW.before === 'approved' && fdW.code === 'store_failed' && fdW.rowGone && fdW.end === 'revoked' && fdW.state === 'revoked',
      `r2230 (3) + (1): a delete that FAILED after its use row was dropped, end to end through the real run door — the «Always» card AND the 1-hour card read «revoked» at once — ${JSON.stringify({ fdA, fdW })}`, { fdA, fdW });
    const mpsl = M.load('src/server/vault-paste-door.js', anchored(SRCp, "if (vaultRun && typeof vaultRun.useRowDropped === 'function') { try { vaultRun.useRowDropped(rid); } catch { } }", '', 'test-vault-run r2230 (3): the failed delete that tells nothing'), 'a14b-fail-silent');
    const fdAR = await failedDeleteTold('always', { pasteMod: mpsl });
    ok(fdAR.pressed && fdAR.code === 'store_failed' && fdAR.rowGone && !fdAR.end && fdAR.state === 'approved', `RED control: the paste door that tells nothing on that road ⇒ the card keeps «always allowed» over a gone row — ${JSON.stringify(fdAR)}`, fdAR);
    const mrwd = M.load('src/server/vault-run-door.js', anchored(SRCa, "'revoked', null, { windows: true })", "'revoked', null, { windows: false })", 'test-vault-run r2230 (1): the failed delete tell that judges no 1-hour card'), 'a14b-fail-nowindow');
    const fdWR = await failedDeleteTold('window', { mod: mrwd });
    ok(fdWR.pressed && fdWR.window === '1h' && fdWR.code === 'store_failed' && fdWR.rowGone && !fdWR.end && fdWR.state === 'approved', `RED control: the tell that judges no 1-hour card ⇒ it keeps «until HH:MM» while its runs are refused — ${JSON.stringify(fdWR)}`, fdWR);
    // r2230's read (its SHOULD, cured): while the vault is LOCKED no window can be read (windowOf reads no members) — a 1-hour card
    // over two entries, told that the free one's row went (its delete failing, the row gone before by another road), keeps the other
    // entry's window: no news, never «revoked» over a window that still admits once unlocked. RED: the judge that reads windows while
    // locked (every window reads null ⇒ the card ends). Its other half: a card over the deleted entry ALONE ends «revoked», locked
    // too (RED: anything locked read as no news ⇒ it keeps «until HH:MM» over a deleted entry)
    const lockedWindow = async (mod, { alone = false } = {}) => {
      const VUGl = R('src/server/vault-use-grants.js'), GSl = R('src/server/grants-store.js'), FAl = R('src/foryou-actions.js');
      const wl = await world(), gsl = GSl.create({ memory: true });
      const ugl = VUGl.create({ grants: () => gsl, vault: wl.vault, dataDir: wl.dataDir, log: (m) => wl.logs.push(String(m)) });
      wl.door = wl.mk(mod, { useGrants: ugl, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }), sources: freeSources() }); openRow(wl); openRow(wl, FREE_ID);
      const sh = await runAnswered(wl, [...(alone ? [] : ['--env', 'T=vault://mounts/m1/secretKey']), '--env', 'U=' + FREE_REF, '--', 'bash', '-c', 'curl https://api.example.com'], { answer: null });
      const yes = sh.card && sh.card.action && sh.card.action.window === true ? wl.door.answer(sh.card.action.askId, { answer: 'window', reauthed: true, person: true }) : null;
      await sh.r;
      const cardId = sh.card ? sh.card.id : null, recOf = () => ((cardId ? wl.userTodos.get(cardId) : null) || {});
      const f0 = recOf().resolvedFact || {};
      const gone = ugl.drop(FREE_ID, { by: 'user' });   // the free entry's row went by another road (unlocked, nothing told: the setup)
      const otherHolds = alone ? null : ugl.windowOf('mounts:m1#secretKey', f0.principal) === Number(f0.until);
      wl.vault.lock('test');
      const paste = R('src/server/vault-paste-door.js').create({ vault: failingDrop(wl.vault), useGrants: ugl, vaultRun: wl.door, log: (m) => wl.logs.push(String(m)) });
      const d = paste.dropEntry('r2230-free', { by: 'user' });
      const it = recOf();
      return { pressed: !!(yes && yes.ok), window: f0.windowFor || null, entries: (f0.entries || []).length, gone: !!(gone && gone.ok), otherHolds, code: (d && d.code) || null, end: (it.resolvedFact || {}).endedBy || null, state: FAl.decisionCard(it).state };
    };
    const lkw = await lockedWindow(DOOR);
    ok(lkw.pressed && lkw.window === '1h' && lkw.entries === 2 && lkw.gone && lkw.otherHolds && lkw.code === 'store_failed' && !lkw.end && lkw.state === 'approved', `r2230's read: a LOCKED vault — the 1-hour card over two entries, told of the one whose row went, keeps the other's window (no news) — ${JSON.stringify(lkw)}`, lkw);
    const mlkw = M.load('src/server/vault-run-door.js', anchored(SRCa, "vaultState() !== 'unlocked' ? String(e) !== id : ", '', 'test-vault-run r2230 read: the window judge that reads windows while locked'), 'a14b-locked-window');
    const lkwR = await lockedWindow(mlkw);
    ok(lkwR.pressed && lkwR.entries === 2 && lkwR.otherHolds && lkwR.end === 'revoked', `RED control: the judge that reads windows while locked ⇒ every window reads none and the card ends «revoked» over a window that still admits — ${JSON.stringify(lkwR)}`, lkwR);
    const lka = await lockedWindow(DOOR, { alone: true });
    ok(lka.pressed && lka.window === '1h' && lka.entries === 1 && lka.gone && lka.code === 'store_failed' && lka.end === 'revoked' && lka.state === 'revoked', `r2230's read, its other half: a LOCKED vault — a 1-hour card over the deleted entry ALONE ends «revoked» (its row went: no window left to it) — ${JSON.stringify(lka)}`, lka);
    const mlka = M.load('src/server/vault-run-door.js', anchored(SRCa, "vaultState() !== 'unlocked' ? String(e) !== id : ", "vaultState() !== 'unlocked' ? true : ", 'test-vault-run r2230 read: anything locked read as no news'), 'a14b-locked-alone');
    const lkaR = await lockedWindow(mlka, { alone: true });
    ok(lkaR.pressed && lkaR.entries === 1 && lkaR.code === 'store_failed' && !lkaR.end && lkaR.state === 'approved', `RED control: anything locked read as no news ⇒ the card over the deleted entry alone keeps «until HH:MM» — ${JSON.stringify(lkaR)}`, lkaR);
    // (r1825's readers) a once-grant whose run BURNS after its entry was DELETED — or after a NEW approval of its pair — while its
    // spawn was failing: nothing ran, so its record says that event's own word («deleted» / «replaced», at the event), never «used»;
    // it is not given back. A stand-in spawn returns a child with NO pid (the spawn's error comes after); the event lands in between.
    // REDs: the in-flight ending that says «used» whatever ran (at the delete; at the new approval)
    const { EventEmitter } = await import('node:events');
    const burnAfter = async (mod, { again = false } = {}) => {
      const wz = await world(), clk = { t: Date.now() }; let atEvent = null;
      const failing = () => {
        const c = new EventEmitter(); c.pid = undefined; c.stdout = null; c.stderr = null; c.stdin = null; c.kill = () => false;
        setTimeout(() => {
          clk.t += 1000; atEvent = clk.t;
          if (again) { const q2 = wz.door.request({ caller: c8, entry: M1, purpose: 'a new approval while the spawn fails' }); wz.door.answerRequest(q2.askId, { answer: '8h', reauthed: true, person: true }); }
          else wz.door.forgetEntry('mounts:m1#secretKey');
          setTimeout(() => c.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })), 5);
        }, 5);
        return c;
      };
      wz.door = wz.mk(mod, { now: () => clk.t, spawnImpl: failing, timers: { set: () => 0, clear: () => { } } });
      const qz = wz.door.request({ caller: c8, entry: M1, purpose: 'a run whose spawn fails' });
      wz.door.answerRequest(qz.askId, { answer: 'once', reauthed: true, person: true });
      const g = [...wz.door._grants.values()].find((x) => x.conv === c8.scope && x.once), todoId = g ? g.todoId : null;
      const ra = await runAnswered(wz, ENV('env'), { caller: c8 });
      const f = ((todoId ? wz.userTodos.get(todoId) : null) || {}).resolvedFact || {};
      return { code: ra.r && ra.r.code, recordEnd: f.endedBy || null, atEvent: atEvent != null && Number(f.endedAt) === atEvent, givenBack: [...wz.door._grants.values()].some((x) => x.conv === c8.scope && x.once) };
    };
    const bad = await burnAfter(DOOR);
    ok(bad.code === 'spawn_failed' && bad.recordEnd === 'deleted' && bad.atEvent && !bad.givenBack, `(r1825) a run that burns after its entry was deleted mid-spawn — its record says «deleted» at the delete, never «used»; not given back — ${JSON.stringify(bad)}`, bad);
    const mbad = M.load('src/server/vault-run-door.js', anchored(SRCa, "{ if (g.ran) grantEnded(g, 'used'); else if (!g.pendingEnd) g.pendingEnd = { by: 'deleted', at: now() }; dropped++; }", "{ grantEnded(g, 'used'); dropped++; }", 'test-vault-run r1825: the delete says «used» whatever ran'), 'a14b-burn-deleted');   // stale-pins: kept — a RED control: the shape before this unit restored on purpose
    const badR = await burnAfter(mbad);
    ok(badR.code === 'spawn_failed' && badR.recordEnd === 'used', `RED control: the delete that says «used» whatever ran ⇒ the record says the one run was used, for a run that never ran — ${JSON.stringify(badR)}`, badR);
    const baa = await burnAfter(DOOR, { again: true });
    ok(baa.code === 'spawn_failed' && baa.recordEnd === 'replaced' && baa.atEvent && !baa.givenBack, `(r1825) a run that burns after a new approval of its pair came mid-spawn — its record says «replaced» at the new approval, never «used» — ${JSON.stringify(baa)}`, baa);
    const mbaa = M.load('src/server/vault-run-door.js', anchored(SRCa, "{ if (g.ran) grantEnded(g, 'used'); else if (!g.pendingEnd) g.pendingEnd = { by: 'replaced', at: now() }; } }", "grantEnded(g, 'used'); }", 'test-vault-run r1825: the new approval says «used» whatever ran'), 'a14b-burn-replaced');   // stale-pins: kept — a RED control: the shape before this unit restored on purpose
    const baaR = await burnAfter(mbaa, { again: true });
    ok(baaR.code === 'spawn_failed' && baaR.recordEnd === 'used', `RED control: the new approval that says «used» whatever ran ⇒ «used» for a run that never ran — ${JSON.stringify(baaR)}`, baaR);
    // …and EVERY end the door can say has the agent CLI's words (data/bin/vibespace-vault `uses`): a census of the two lists.
    // RED: the CLI without the restart's words
    const endsSaidOf = (src) => { const m = /ENDS_SAID = new Set\(\[([^\]]*)\]\)/.exec(src); return m ? [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]) : null; };
    const cliHowOf = (src) => { const m = /const how = \{([^}]*)\};/.exec(src); return m ? [...m[1].matchAll(/([a-z]+): '/g)].map((x) => x[1]) : null; };
    const CLIsrc = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-vault'), 'utf8');
    const saidAll = (doorSrc, cliSrc) => { const said = endsSaidOf(doorSrc) || [], how = cliHowOf(cliSrc) || []; return { said, how, unsaid: said.filter((k) => !how.includes(k)) }; };
    const cz = saidAll(SRCa, CLIsrc), czR = saidAll(SRCa, anchored(CLIsrc, ", restart: 'the hub restarted (the vault locks at each start)'", '', 'test-vault-run B-a14b remainder: the CLI without the restart'));
    const fallbackOf = (said) => said.filter((k) => /^it ended at /.test(VR.endedWhy({ by: k, at: '2026-11-21T12:00:00.000Z' })));   // an end the door says with no words of its own
    cz.wordless = fallbackOf(cz.said); cz.probe = fallbackOf(['gone']);   // the probe proves itself: an end with no words of its own IS found
    ok(cz.said.includes('restart') && cz.said.length >= 4 && cz.unsaid.length === 0 && cz.wordless.length === 0 && cz.probe.join() === 'gone', `B-a14b's remainder: every end the door can say has the agent CLI's words and its own words in the refusal — ${JSON.stringify(cz)}`, cz);
    ok(czR.unsaid.join() === 'restart', `RED control: the CLI without the restart's words ⇒ named — ${JSON.stringify(czR)}`, czR);
    // r13 should (the readers of batch 52): an approval the user gave while the entry was ALREADY switched OFF — its end is said
    // as itself (the OFF came before it: not the news) AND the switch as it is: «the entry itself is switched off (it already was
    // when they approved)», never «the entry was not switched off» (the door's `off` on the ended fact)
    const offFirst = async (mod) => {
      const wo = await world(), heldO = []; let clk = Date.now();   // r14 (主开发's read): the door's OWN clock orders the OFF and the approval — never a real wait
      wo.door = wo.mk(mod, { timers: { set: (fn, ms) => { heldO.push({ fn, ms }); return heldO.length; }, clear: () => { } }, now: () => clk });
      openRow(wo); wo.door.setRunnable({ id: 'mounts:m1#secretKey', on: false });   // the owner switched the entry OFF first
      clk += 1000;   // the approval comes a second AFTER the OFF on the door's clock (offAt < the grant's at)
      const qo = wo.door.request({ caller: c8, entry: M1, purpose: 'one upload' });
      wo.door.answerRequest(qo.askId, { answer: 'once', reauthed: true, person: true });
      const ro = await runAnswered(wo, ENV('env'), { caller: c8 });
      const again = await wo.door.run({ caller: c8, args: ENV('env'), cwd: wo.work });
      return { ran: !!(ro.r && ro.r.ok), code: again.code, words: again.words || '' };
    };
    const of1 = await offFirst(DOOR);
    ok(of1.ran && of1.code === 'grant_expired' && /its one run was used at \d{4}-\d\d-\d\d \d\d:\d\d UTC/.test(of1.words) && /the entry itself is switched off \(it already was when they approved\): ask them again/.test(of1.words) && !/was not switched off/.test(of1.words),
      'r13: a once-approval given while the entry was OFF, then spent ⇒ grant_expired says the end AND «the entry itself is switched off (it already was when they approved)» — never «the entry was not switched off»', of1);
    const offPlant = ', ...(suspended ? { off: true } : {})';
    const offN = SRCf.split(offPlant).length - 1;
    ok(offN === 1, 'the RED control\'s plant is where it claims: the door\'s `off` on the ended fact, once', offN);
    const mo = offN === 1 ? M.load('src/server/vault-run-door.js', editAnchor(SRCf, offPlant, '', "src/server/vault-run-door.js"), 'endoff') : null;
    const ro2 = mo ? await offFirst(mo) : null;
    ok(!!(mo && ro2 && ro2.code === 'grant_expired' && /the entry was not switched off/.test(ro2.words)), 'RED control: the door without `off` (the batch\'s shape) ⇒ the agent reads «the entry was not switched off» over an entry that IS off', ro2);
  }
  openRow(w); w.door.setRunnable({ id: 'mounts:m1#secretKey', on: false });
  ok(!w.door._grants.size, 'switching the entry OFF ends its grants too (OFF = closed for every conversation)');
  { const i3r = w.userTodos.get(i3id), sr = FA.decidedStamp(i3r); ok(i3r.resolvedFact?.endedBy === 'revoked' && sr && /^allowed · revoked (\d+\/\d+ )?\d\d:\d\d$/.test(sr.text) && FA.decisionCard(i3r).state === 'revoked', 'r6: the entry\'s switch OFF in the Vault window REVOKES the grant ⇒ its record says «allowed · revoked HH:MM» (the card\'s state revoked)', { fact: i3r.resolvedFact, stamp: sr && sr.text }); }
  // the card closed elsewhere / a changed item / a gone conversation — no grant
  const q4 = w.door.request({ caller, entry: M1, purpose: PURPOSE });
  // r4 (主开发): a decision row — ✓ Mark done / ✕ Dismiss (a stale page's) / «Mark all seen» are REFUSED by name; the request stays
  // open (was: ✓ denied it silently and the toast offered a dead Undo); only Allow once / For 8 hours / Deny end it
  const i4id = reqsOf()[0].id;
  const tried = ['done', 'dismissed'].map((st) => { try { w.userTodos.setStatus(i4id, st, 'user'); return 'closed'; } catch (e) { return e.code; } });
  const many = w.userTodos.setStatusMany ? w.userTodos.setStatusMany([i4id], 'dismissed', 'user') : null;
  ok(tried.every((c) => c === 'decision_row') && (!many || !many.changed.length) && w.userTodos.get(i4id).status === 'open' && w.door._requests.has(q4.askId) && FA.closersOf(w.userTodos.get(i4id)).length === 0, 'r4: a generic close of the request\'s card (✓, ✕, «Mark all seen») is REFUSED by name (decision_row) — the request stays open; no ✓ / ✕ is drawn (closersOf [])', { tried, many: many && many.changed.length });
  const d4 = w.door.answerRequest(q4.askId, { answer: 'deny', person: true });
  const i4 = w.userTodos.get(i4id), st4 = FA.decidedStamp ? FA.decidedStamp(i4) : null;
  w.door._reqQuiet.clear();   // a deny quiets the pair (the next legs ask again)
  ok(d4.outcome === 'denied' && i4.resolvedBy === 'denied' && st4 && /^denied by you · /.test(st4.text) && w.door.answerRequest(q4.askId, { answer: 'once', reauthed: true }).code === 'ask_settled' && !w.door._grants.size, 'its own Deny ends it — «denied by you · HH:MM»; a late answer is ask_settled', { by: i4.resolvedBy, stamp: st4 && st4.text });
  const q5 = w.door.request({ caller, entry: M1, purpose: PURPOSE });
  const i5 = reqsOf()[0]; const held5 = w.userTodos._state.items.find((x) => x.id === i5.id); held5.detail = held5.detail.replace('nightly', 'Nightly');
  const a5 = w.door.answerRequest(q5.askId, { answer: 'once', reauthed: true });
  ok(q5.ok && a5.code === 'ask_changed' && !w.door._grants.size, 'a request whose item changed after it was shown ⇒ ask_changed, nothing granted (the belt)', a5);
  const q6 = w.door.request({ caller, entry: M1, purpose: PURPOSE });
  if (q6.ok) { w.gone.add('conv-1'); const a6 = w.door.answerRequest(q6.askId, { answer: 'once', reauthed: true }); w.gone.delete('conv-1'); ok(a6.code === 'conversation_gone' && !w.door._grants.size, 'the conversation that asked has ended ⇒ conversation_gone, nothing granted', a6); }
  // THE LOCK: an open request withdrawn vault_locked, every grant ended
  w.door._reqQuiet.clear();
  const q7 = w.door.request({ caller, entry: M1, purpose: PURPOSE });
  const q8 = w.door.request({ caller, entry: 'vault://app-secrets/app1/item.0.1', purpose: 'log in to the app' });
  const i8id = (reqsOf().find((x) => x.action.askId === q8.askId) || {}).id;
  w.door.answerRequest(q8.askId, { answer: '8h', reauthed: true });
  const i7 = reqsOf()[0];
  w.vault.lock('agent');
  const after = w.userTodos.get(i7.id);
  ok(q7.ok && after && after.status === 'done' && after.resolvedBy === 'vault_locked' && !w.door._requests.size && !w.door._grants.size, 'A LOCK withdraws every open request (its item resolved by vault_locked) and ends every grant', after && [after.status, after.resolvedBy]);
  { const i8 = w.userTodos.get(i8id), s8 = i8 && FA.decidedStamp(i8); ok(i8 && i8.resolvedFact?.endedBy === 'lock' && s8 && /^allowed for 8 hours · ended (\d+\/\d+ )?\d\d:\d\d$/.test(s8.text) && FA.decisionCard(i8).state === 'ended', 'r6: …and each grant\'s RECORD says so: the 8-hour grant locked ⇒ «allowed for 8 hours · ended HH:MM» at once (was: «allowed for 8 h» after the lock)', { fact: i8 && i8.resolvedFact, stamp: s8 && s8.text }); }
  await w.vault.unlock(PW);
  const r9 = await w.door.run({ caller, args: ['--env', 'T=vault://app-secrets/app1/item.0.1', '--', NODE, PRINTER, 'env'], cwd: w.work });
  ok(r9.code === 'grant_expired' && /a lock of the vault ended it at \d{4}-\d\d-\d\d \d\d:\d\d UTC/.test(r9.words || ''), 'after the unlock the 8-hour grant is gone — the entry is closed again, and the run says the LOCK ended its approval (B-a14b)', r9);
  { // r6: A RESTART ENDS EVERY GRANT (the grant rows are memory; the vault locks at each start) — a record still reading live says so
    const qR = w.door.request({ caller, entry: M1, purpose: PURPOSE });
    const iRid = (reqsOf().find((x) => x.action.askId === qR.askId) || {}).id;
    w.door.answerRequest(qR.askId, { answer: '8h', reauthed: true, person: true });
    const live0 = FA.decisionCard(w.userTodos.get(iRid)).state;
    w.mk();   // a new door over the same For-you store — the hub's next start
    const iR = w.userTodos.get(iRid), sR = FA.decidedStamp(iR);
    ok(live0 === 'approved' && iR.resolvedFact?.endedBy === 'restart' && sR && /^allowed for 8 hours · ended /.test(sR.text), 'r6: a hub restart inside the 8 hours ⇒ the next start writes the grant\'s end on its record («allowed for 8 hours · ended HH:MM» — the grant rows were memory)', { live0, fact: iR.resolvedFact, stamp: sR && sR.text });
  }
  { // r6 (主开发: «an answer never carries a value an old reader cannot name»): what THIS door answers and records, read by the OLD
    // clients — the production .357 client (fbaf6988 src/lib/user-todos-actions.js L393, its tray: no word for any grant — the raw
    // value) and 4b8896e7's (its toast L409 and src/lib/user-todos-row.js L94–95), copied here as fixtures (CI has no history)
    const OLD_TOAST = { '.357 (fbaf6988)': (r, t) => (r.outcome === 'granted' ? t('Granted for 8 hours — a lock ends it') : r.outcome === 'granted-once' ? t('Granted for its next run') : t('denied')),
      '4b8896e7': (r, t) => (r.outcome === 'granted' ? t('Granted for 8 hours — a lock ends it') : r.outcome === 'granted-once' ? t('Granted for its next run') : t('denied')) };
    const OLD_TRAY = { '.357 (fbaf6988)': (by) => by, '4b8896e7': (by) => (by === 'granted' ? 'allowed for 8 hours' : by === 'granted-once' ? 'allowed once' : by) };
    const wo = await world();   // a fresh hub (the legs above left grants and quiet pairs behind)
    const reqsO = () => (wo.userTodos.snapshot().open || []).filter((i) => i.action && i.action.type === 'vault-grant-ask');
    const cO = { ...wo.caller, scope: 'webui-1' }, cO2 = { ...cO, conversationId: 'conv-9', sessionKey: 'claude:conv-9', name: 'Lane Nine', scope: 'webui-9' };
    const qO = wo.door.request({ caller: cO, entry: M1, purpose: PURPOSE }), iOid = (reqsO().find((x) => x.action.askId === qO.askId) || {}).id;
    const aO = wo.door.answerRequest(qO.askId, { answer: 'once', reauthed: true, person: true });
    const q8b = wo.door.request({ caller: cO2, entry: M1, purpose: PURPOSE }), i8bid = (reqsO().find((x) => x.action.askId === q8b.askId) || {}).id;
    const a8b = wo.door.answerRequest(q8b.askId, { answer: '8h', reauthed: true, person: true });
    const tt = (x) => x;
    const byOf = (id) => (wo.userTodos.get(id) || {}).resolvedBy;
    const seen = Object.fromEntries(Object.keys(OLD_TOAST).map((k) => [k, { toastOnce: OLD_TOAST[k](aO, tt), toast8h: OLD_TOAST[k](a8b, tt), trayOnce: OLD_TRAY[k](byOf(iOid)), tray8h: OLD_TRAY[k](byOf(i8bid)) }]));
    const old4 = seen['4b8896e7'], old357 = seen['.357 (fbaf6988)'];
    ok(aO.ok && a8b.ok && Object.values(seen).every((v) => v.toastOnce !== 'denied' && v.toast8h !== 'denied') && old357.toastOnce === 'Granted for its next run' && old357.toast8h === 'Granted for 8 hours — a lock ends it' && /allowed/.test(old4.trayOnce) && /allowed/.test(old4.tray8h) && old357.tray8h === 'granted', `r6: the OLD clients read this door's answers and records — no «denied» for a grant (was: «denied» for a successful For 8 hours), the old tray «allowed…» (4b8896e7) / the raw \`granted\` the .357 tray always showed (was: raw \`granted-8h\`) — the new reader says the duration from \`grantedFor\``, seen);
    ok(aO.grantedFor === 'once' && a8b.grantedFor === '8h' && ((wo.userTodos.get(i8bid) || {}).resolvedFact || {}).grantedFor === '8h', 'r6: the duration is ADDITIVE — the answer\'s and the record\'s `grantedFor` (once / 8h)', { aO, a8b });
  }
  const lockedReq = (w.vault.lock('agent'), w.door.request({ caller, entry: M1, purpose: PURPOSE }));
  ok(lockedReq.code === 'vault_locked' && /already been told/.test(lockedReq.words) && w.vault.blockedSummary().actors.some((a) => a.verbs.includes('vibespace-vault request')), 'a LOCKED vault refuses a request first (the told words) and notes who it stopped', lockedReq);
  await w.vault.unlock(PW);
  // THE REVIEW'S USE-LINE LEGS: one receipt for every entry of a refused run; a child that RAN is a use whatever ended it;
  // the owner's silence / the hub's tray / the agent's own cancel never count toward the daily-failure card
  const two = await w.door.run({ caller, args: ['--env', 'A=vault://app-secrets/app1/item.0.1', '--env', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'env'], cwd: w.work });
  const twoLines = w.door.usesFor(caller).uses.slice(0, 2);
  ok(two.code === 'grant_expired' && twoLines.length === 2 && twoLines.every((u) => u.outcome === 'grant_expired' && /^vr-[0-9a-f]{16}$/.test(u.receipt)) && twoLines[0].receipt === twoLines[1].receipt && !JSON.stringify(two).includes('vr-'),
    'a refused run naming two entries: one use line each, ONE receipt between them (the audit\'s — never in the refused answer)', twoLines);
  openRow(w);
  const ac = new AbortController(), pidF = path.join(w.work, 'gone.pid');
  const pg = w.door.run({ caller, args: ['--env', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'sleep', pidF], cwd: w.work, signal: ac.signal });
  const c0 = await waitCard(w); if (c0) w.door.answer(c0.action.askId, { answer: 'once' });
  for (let k = 0; k < 300 && !fs.existsSync(pidF); k++) await sleep(10);
  ac.abort();
  const rg = await pg;
  const goneUse = w.door.usesFor(caller).uses[0];
  ok(rg.code === 'caller_gone' && goneUse && goneUse.outcome === 'caller_gone' && goneUse.door === 'run' && /^vr-/.test(goneUse.receipt), 'a run whose child RAN with the value and whose caller went away is still a use line (caller_gone, its receipt)', goneUse);
  w.door.setRunnable({ id: 'mounts:m1#secretKey', on: false });
  const VU = R('src/vault-use.js');
  ok(['ask_expired', 'ask_unfiled', 'caller_gone', 'vault_locked'].every((c) => !VU.counts(c)) && ['ask_denied', 'entry_not_runnable', 'use_not_granted'].every((c) => VU.counts(c)), 'the daily-failure count: the owner\'s silence, the hub\'s tray, the agent\'s own cancel and the lock never count; a refusal that IS the actor\'s (denied, closed, not granted) does');
  // the agent's OWN entry: its conversation may ask for it (the mint's scope = the use law's conv)
  const qa = w.door.request({ caller: { ...caller, conversationId: 'conv-x', scope: 'conv-1' }, entry: 'vault://agent:conv-1/gh-token', purpose: 'push the release tag' });
  ok(qa.ok, 'an agent may ask for its OWN minted entry (scope = the use law\'s conv, as vault-mint-put spells it)', qa);
  // a previous process's request: reconcile resolves it (the hub forgot it — and a restart locks the vault anyway)
  const w2 = await world();
  const d1 = w2.mk(); const qx = d1.request({ caller, entry: M1, purpose: PURPOSE });
  const d2 = w2.mk();
  ok(qx.ok && d2.reconcile() >= 1 && !(w2.userTodos.snapshot().open || []).some((x) => x.action && x.action.type === 'vault-grant-ask'), 'boot: a request a previous process filed is resolved (reconcile) — it can never be answered');
  const bounded = []; for (let k = 0; k < 9; k++) bounded.push(w2.door.request({ caller: { ...caller, scope: 'webui-b' }, entry: k < 3 ? ['vault://mounts/m1/secretKey', 'vault://mounts/m2/secretKey', 'vault://app-secrets/app1/item.0.1'][k] : 'vault://mounts/m1/secretKey', purpose: 'p' + k }).code || 'ok');
  ok(bounded.filter((c) => c === 'ok').length === 3 && bounded.slice(3).every((c) => c === 'request_pending'), 'one open request per conversation × entry — each further one for an entry already asked ⇒ request_pending', bounded);
  // the card on the page
  const L = await import(pathToFileURL(path.join(REPO, 'src/lib/inbox-window-layout.js')).href);
  const view = L.itemView({ id: 'ut-r', sessionKey: 'claude:conv-1', text: 'Lane X asks to use a stored secret', detail: 'Secret: my bucket — ' + M1, urgency: 'high', kind: 'action', status: 'open', createdAt: 1, options: null, reply: null,
    action: { type: 'vault-grant-ask', askId: 'b'.repeat(32) } }, { t: (x) => x, words: 'w', detail: 'd', name: 'Lane X', origin: { origin: 'vault', label: 'Vault' }, notice: false, reply: { show: false }, ago: () => '', expires: () => '', resolvedBy: () => '' });
  ok(view.actions.slice(0, 3).join() === 'hub-once,grant-8h,hub-deny' && !view.actions.includes('reply'), 'the For-you window: Allow once / For 8 hours / Deny first — no reply box', view.actions);
  const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
  ok(/const GRANT_ANSWERS = \['once', '8h', 'deny'\];/.test(read('src/lib/user-todos-row.js')) && /a === '8h' \? t\('For 8 hours'\)/.test(read('src/lib/user-todos-row.js')) && /a === 'grant-8h' \? '8h'/.test(read('src/lib/inbox-window.js'))
    && /\/api\/vault\/request\/asks\//.test(read('src/lib/user-todos-actions.js')) && R('src/inbox-reply.js').ANSWER_ACTION_TYPES.includes('vault-grant-ask') && /\{ type: 'vault-grant-ask', identity: 'askId',/.test(read('src/foryou-actions.js')), 'the popup row and the window answer once / 8h / deny through POST /api/vault/request/asks/:askId; a typed reply never answers it; one item per request (THE For-you action registry\'s row)');
}

console.log('⑩b THE CAP\'S SHAPE (B-4934, q-043 verify L2): 8 open asks per conversation; hub-wide a count of CONVERSATIONS (32); «N conversations are asking»');
{
  const CAP_ROWS = Array.from({ length: 9 }, (_, k) => ({ entry: `cap${k}`, field: 'secretKey', label: `bucket ${k}`, cipher: 'x'.repeat(60), v: VALUE }));
  ROWS.mounts.push(...CAP_ROWS);
  try {
    const capRef = (k) => `vault://mounts/cap${k}/secretKey`;
    const conv = (k, w) => ({ conversationId: `conv-c${k}`, sessionKey: `claude:conv-c${k}`, name: `Lane C${k}`, cwd: w.work, scope: `webui-c${k}` });
    /** eight conversations × 8 open asks (the table the old 64-request cap called full), then a NINTH conversation's first */
    const capLeg = async (doorMod) => {
      const w = await world({ doorMod });
      const eight = []; for (let k = 0; k < 8; k++) for (let j = 0; j < 8; j++) eight.push(w.door.request({ caller: conv(k, w), entry: capRef(j), purpose: `job ${j}` }));
      return { w, eight, ninth: w.door.request({ caller: conv(8, w), entry: capRef(0), purpose: 'my first ask' }) };
    };
    const { w, eight, ninth } = await capLeg(DOOR);
    ok(eight.every((r) => r.ok) && ninth.ok && w.door._requests.size === 65, 'eight conversations × 8 open asks (64), then a NINTH conversation\'s first ask is FILED — never refused for the other conversations\' asks', [eight.filter((r) => !r.ok).map((r) => r.code), ninth.code]);
    const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const NEW_CAP = "if (!askers.has(scope) && askers.size >= REQUEST_CALLERS_MAX) return named('too_many_askers');";
    const mOld = SRC.split(NEW_CAP).length === 2 ? M.load('src/server/vault-run-door.js', editAnchor(SRC, NEW_CAP, "if (requests.size >= 64) return named('too_many_requests');", "src/server/vault-run-door.js"), 'oldcap') : null;
    const old = mOld ? await capLeg(mOld) : null;
    ok(old && old.eight.every((r) => r.ok) && old.ninth.code === 'too_many_requests', 'MUTANT «the hub-wide bound counts REQUESTS (64)» — the pre-fix shape: the ninth conversation\'s first ask is refused too_many_requests ⇒ RED; the shipped door files it', old && old.ninth);
    const over = w.door.request({ caller: conv(0, w), entry: capRef(8), purpose: 'one more' });
    ok(over.code === 'too_many_requests' && over.words === DOOR.MORE_WORDS.too_many_requests && /this conversation already has 8 questions waiting/.test(over.words) && DOOR.statusOf(over.code) === 429 && w.door._requests.size === 65,
      'the PER-CONVERSATION cap holds: one conversation\'s 9th open ask ⇒ too_many_requests BY NAME (429; the words name ITS 8 and `vibespace-vault uses`)', over);
    // THE TRAY LINE: more than 8 conversations asking ⇒ ONE Vault notice, its count in its words
    const lineOf = () => (w.userTodos.snapshot().open || []).filter((i) => i.sessionKey === 'vault' && i.text === DOOR.ASKING_TEXT);
    const L9 = lineOf();
    ok(L9.length === 1 && L9[0].origin === 'vault' && L9[0].kind === 'notice' && !L9[0].action && L9[0].i18n.text.key === '{n} conversations are asking to use stored secrets' && L9[0].i18n.text.params.n === 9,
      'NINE conversations asking (more than 8) ⇒ ONE Vault notice in the owner\'s For you «9 conversations are asking to use stored secrets» — a notice (each ask is its own card)', L9);
    const id9 = L9[0] && L9[0].id;
    const t10 = w.door.request({ caller: conv(9, w), entry: capRef(0), purpose: 'p' });
    const L10 = lineOf();
    ok(t10.ok && L10.length === 1 && L10[0].id === id9 && L10[0].i18n.text.params.n === 10, 'a tenth conversation ⇒ the SAME row says 10 (re-worded in place — never a second row)', L10.map((i) => [i.id, i.i18n.text.params.n]));
    const idsOf = (k) => [...w.door._requests.values()].filter((q) => q.scope === `webui-c${k}`).map((q) => q.askId);
    for (const a of idsOf(9)) w.door.answerRequest(a, { answer: 'deny' });
    ok(lineOf().length === 1 && lineOf()[0].id === id9 && lineOf()[0].i18n.text.params.n === 9, 'an answer lowers it (10 → 9)', lineOf().map((i) => i.i18n.text.params.n));
    for (const a of idsOf(8)) w.door.answerRequest(a, { answer: 'deny' });
    const closed = w.userTodos.get(id9);
    ok(!lineOf().length && closed.status === 'done' && closed.resolvedBy === 'vault', '8 or fewer asking ⇒ the line is closed (by the vault, not the owner)', closed && [closed.status, closed.resolvedBy]);
    // THE HUB-WIDE BOUND counts CONVERSATIONS: 32 asking ⇒ the 33rd refused BY NAME; one already asking still asks
    w.door._reqQuiet.clear();   // (the denies above quieted conv-c8 / c9 × cap0)
    const more = []; for (let k = 8; k < 32; k++) more.push(w.door.request({ caller: conv(k, w), entry: capRef(0), purpose: 'p' }));
    const n33 = w.door.request({ caller: conv(32, w), entry: capRef(0), purpose: 'p' });
    const again31 = w.door.request({ caller: conv(31, w), entry: capRef(1), purpose: 'p' });
    ok(more.every((r) => r.ok) && n33.code === 'too_many_askers' && n33.words === DOOR.MORE_WORDS.too_many_askers && /^32 other conversations are waiting on the user's answers already — nothing was filed/.test(n33.words) && DOOR.statusOf('too_many_askers') === 429 && again31.ok,
      '32 conversations asking at once ⇒ the 33rd is refused too_many_askers BY NAME (429; nothing filed) while a conversation ALREADY asking still asks (the bound counts conversations, never requests)', [more.filter((r) => !r.ok).map((r) => r.code), n33, again31.code]);
    ok(lineOf().length === 1 && lineOf()[0].i18n.text.params.n === 32 && !(w.userTodos.snapshot().open || []).some((i) => i.sessionKey === 'claude:conv-c32'), 'the line says 32; the refused 33rd filed nothing', lineOf().map((i) => i.i18n.text.params.n));
    // SET ASIDE by the owner ⇒ quiet while the count moves
    const id32 = lineOf()[0].id;
    w.userTodos.setStatus(id32, 'dismissed', 'user');
    for (const a of idsOf(31)) w.door.answerRequest(a, { answer: 'deny' });
    ok(w.userTodos.get(id32).status === 'dismissed' && !lineOf().length, 'the owner dismissed the line ⇒ it stays dismissed while the count moves (32 → 31) — never reopened under their pointer');
    w.vault.lock('agent');
    ok(!w.door._requests.size && !lineOf().length, 'a LOCK withdraws every request; no line');
    await w.vault.unlock(PW);
    // a NEW episode files it again; a LOCK with the line open closes it; a BOOT closes a previous process's
    for (let k = 0; k < 9; k++) w.door.request({ caller: conv(k, w), entry: capRef(0), purpose: 'p' });
    const ep2 = lineOf();
    ok(ep2.length === 1 && ep2[0].i18n.text.params.n === 9, 'a new episode (nine asking after the lock) ⇒ the line again', ep2.map((i) => [i.status, i.i18n.text.params.n]));
    w.vault.lock('agent');
    const atLock = ep2[0] && w.userTodos.get(ep2[0].id);
    ok(atLock && atLock.status === 'done' && atLock.resolvedBy === 'vault' && !lineOf().length, 'a LOCK with the line open closes it (by the vault — one recount after the whole withdrawal)', atLock && [atLock.status, atLock.resolvedBy]);
    await w.vault.unlock(PW);
    for (let k = 0; k < 9; k++) w.door.request({ caller: conv(k, w), entry: capRef(0), purpose: 'p' });
    const before = lineOf().length;
    w.mk().reconcile();
    ok(before === 1 && !lineOf().length, 'a BOOT (reconcile): a line a previous process filed is closed — its requests died with it', before);
  } finally { ROWS.mounts.splice(-CAP_ROWS.length); }
}

try { fs.chmodSync(BIN, 0o755); } catch { }   // the read-only bin given back (the scratch dir is removed)
try { fs.chmodSync(GHBIN, 0o755); } catch { }   // B-f1d3: GHBIN too — left 0555 its gh could not be unlinked and the scratch dir outlived the suite (the test machine's LEFTOVERS)
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass})`);
process.exit(fail ? 1 : 0);
