#!/usr/bin/env node
// THE RUN DIR IS THE TRUTH WHEN THE STREAM IS GONE (2026-09-26, owner: a
// workflow window with chip 运行中, "11 个 agent · 10 完成 · 运行中…" and
// eleven "(agent)" rows under one phase whose title claimed labels only appear
// when the run finishes — for a run whose newest file was two days old; the
// launching session's live tree had been lost to seven server restarts).
// The journal's `started` lines carry label + phase and every agent has a
// meta.json with description / workflowPhase / model (CLI ≥ 2.1.267); the old
// skeleton ignored both and called every snapshot-less run "running".
// PURE src/workflow-disk.js parseRunDir builds the view + a liveness verdict;
// /api/workflow serves it for every live return (local + remote); the window
// and the chat card word a stalled run with the ONE stallWords.
//   §1 the journal arithmetic moved VERBATIM (done / superseded / progress)
//   §2 the parse table (synthetic fixtures in the real dir's KEY shapes)
//   §3 the liveness table
//   §4 the words (stub t + the real zh / ja dictionaries)
//   §5 the REAL route (express mount, HOME = a scratch home): stalled, running,
//      live tree, snapshot (terminal path untouched), resumed, the pre-2.1.267 shape
//   §6 the REAL remote probe script (run by sh under the scratch home) → the route's ?host= branch
//   §7 negative controls: patched copies that ignore the metas / drop the liveness verdict go RED
//   §8 wiring pins (window, card, status bar, ci tier, docs)
// Run: node scripts/test-workflow-disk.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratchHome, fixtureSid } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + (typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 600) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const WD = require(path.join(REPO, 'src/workflow-disk.js'));
const { parseRunDir, journalAttemptsFromText, stallWords, agoWords, STALL_MS } = WD;
const MIN = 60 * 1000, DAY = 24 * 60 * MIN;
const NOW = Date.UTC(2026, 8, 26, 3, 50, 0);

// ── fixtures in the REAL run dir's KEY shapes (values synthetic — privacy law) ──
// journal: launched {type} · started {type,key,agentId,label,phase} (≥ 2.1.267; before: {type,key,agentId})
// · result {type,key,agentId,result} · failed {type,key,agentId}; agent ids are 17 hex chars;
// meta.json: {agentType,description,workflowPhase,spawnDepth,requestShape,requestNonInteractive,model?} (≥ 2.1.267)
// or {agentType,spawnDepth} (before).
const aid = (n) => 'a' + n.toString(16).padStart(16, '0');
const keyOf = (label) => ('k:' + label + ':').padEnd(67, '0');
function mkRun(spec, { labelled = true, metas = true, launched = true } = {}) {
  const lines = [], meta = {}, files = [];
  if (launched) lines.push(JSON.stringify({ type: 'launched' }));
  for (const a of spec) {
    const st = { type: 'started', key: a.key || keyOf(a.label), agentId: a.id };
    if (labelled) { st.label = a.label; st.phase = a.phase; }
    lines.push(JSON.stringify(st));
    if (a.file !== false) files.push(`agent-${a.id}.jsonl`);
    if (metas) {
      meta[a.id] = labelled || a.metaLabel !== false
        ? { agentType: 'workflow-subagent', description: a.metaLabel || a.label, workflowPhase: a.phase, spawnDepth: 1, requestShape: 'subagent-x', requestNonInteractive: true, ...(a.model ? { model: a.model } : {}) }
        : { agentType: 'workflow-subagent', spawnDepth: 1 };
      files.push(`agent-${a.id}.meta.json`);
    }
  }
  for (const a of spec) {
    if (a.result) lines.push(JSON.stringify({ type: 'result', key: a.key || keyOf(a.label), agentId: a.id, result: { ok: true, notes: 'synthetic' } }));
    if (a.failed) lines.push(JSON.stringify({ type: 'failed', key: a.key || keyOf(a.label), agentId: a.id }));
  }
  files.push('journal.jsonl');
  return { journalLines: lines, metas: metas ? meta : {}, agentFiles: files };
}
// the owner's shape: 5 phases of 1 / 7 / 1 / 1 / 1 agents, 11 started, 10 results, the last one unfinished
const PHASES = ['survey', 'lanes', 'merge', 'qa', 'ship'];
const OWNER = [
  { id: aid(1), label: 'survey:map', phase: 'survey', result: true, model: 'opus' },
  ...Array.from({ length: 7 }, (_, i) => ({ id: aid(2 + i), label: `lane:${i}`, phase: 'lanes', result: true, model: i === 3 ? undefined : 'opus' })),
  { id: aid(9), label: 'merge:all', phase: 'merge', result: true, model: 'opus' },
  { id: aid(10), label: 'qa:gate', phase: 'qa', result: true, model: 'opus' },
  { id: aid(11), label: 'ship:it', phase: 'ship', result: false, model: 'opus' },
];
const flat = (v) => v.phases.flatMap((p) => p.agents);

console.log('§1 the journal arithmetic moved VERBATIM (done / superseded / progress unchanged)');
{
  // the pre-move routes/sessions.js body, spelled here as the reference
  function preMove(text) {
    const started = new Set(), done = new Set();
    const keyOf = new Map(), lastAttempt = new Map();
    for (const line of String(text || '').split('\n')) {
      const t = line.trim(); if (!t) continue;
      let o; try { o = JSON.parse(t); } catch { continue; }
      if (!o.agentId) continue;
      if (o.type === 'started') {
        started.add(o.agentId);
        if (o.key) { keyOf.set(o.agentId, o.key); lastAttempt.set(o.key, o.agentId); }
      } else if (o.type === 'result') done.add(o.agentId);
    }
    const superseded = new Set();
    for (const [id, k] of keyOf) { if (!done.has(id) && lastAttempt.get(k) !== id) superseded.add(id); }
    return { started, done, superseded };
  }
  const retry = mkRun([
    { id: aid(1), label: 'a', phase: 'p', key: keyOf('same') },            // aborted, re-spawned
    { id: aid(2), label: 'a', phase: 'p', key: keyOf('same'), result: true },
    { id: aid(3), label: 'b', phase: 'p', failed: true, key: keyOf('b') }, // failed, retried
    { id: aid(4), label: 'b', phase: 'p', key: keyOf('b') },               // still going
    { id: aid(5), label: 'c', phase: 'p', failed: true },                  // failed, last attempt
  ]).journalLines.join('\n') + '\nnot json\n{"type":"started"}\n';
  const texts = [retry, mkRun(OWNER).journalLines.join('\n'), mkRun(OWNER, { labelled: false, launched: false }).journalLines.join('\n'), ''];
  const same = texts.every((tx) => { const a = preMove(tx), b = journalAttemptsFromText(tx); return ['started', 'done', 'superseded'].every((k) => JSON.stringify([...a[k]]) === JSON.stringify([...b[k]])); });
  ok('started / done / superseded are identical to the pre-move function over a retry chain, the owner shape, a pre-2.1.267 journal and an empty one', same);
  const r = journalAttemptsFromText(retry);
  ok('ADDITIVE: `failed` records are collected ({type,key,agentId} — never beside a result) and the started line\'s label/phase are kept per agent', r.failed.has(aid(3)) && r.failed.has(aid(5)) && r.failed.size === 2 && r.info.get(aid(2)).label === 'a' && r.info.get(aid(2)).phase === 'p');
  ok('the route no longer defines its own parser (ONE implementation, required from src/workflow-disk.js)', !/function journalAttemptsFromText/.test(read('src/routes/sessions.js')) && /require\('\.\.\/workflow-disk'\)/.test(read('src/routes/sessions.js')));
}

console.log('§2 the parse table');
{
  // (a) CLI ≥ 2.1.267: labels + phases in the journal, metas beside
  const a = parseRunDir({ runId: 'wf_x', ...mkRun(OWNER), newestMtime: NOW - 2 * DAY, now: NOW });
  ok('(a) journal with label/phase: 11 agents, 10 done, every label from the journal', a.agentCount === 11 && a.doneCount === 10 && flat(a).every((g, i) => g.label === OWNER[i].label), flat(a).map((g) => g.label));
  ok('(a) phases in FIRST-SEEN order (1/7/1/1/1), none untitled, no phase titled with a sentence', JSON.stringify(a.phases.map((p) => [p.title, p.agents.length])) === JSON.stringify(PHASES.map((p, i) => [p, [1, 7, 1, 1, 1][i]])) && a.phases.every((p) => !p.untitled), a.phases.map((p) => p.title));
  ok('(a) model from meta.json where the meta has one ("" where it has not)', flat(a)[0].model === 'opus' && flat(a)[4].model === '');
  ok('(a) states: done ×10, the resultless last agent `progress` (the journal arithmetic), transcripts on disk', flat(a).filter((g) => g.state === 'done').length === 10 && flat(a)[10].state === 'progress' && flat(a).every((g) => g.onDisk === true));
  ok('(a) 11 started / 10 result ⇒ exactly ONE unfinished agent, named', a.status === 'stalled' && JSON.stringify(a.stall.unfinished) === JSON.stringify(['ship:it']), a.stall);
  // (b) the journal WITHOUT label/phase, meta.json only
  const bRun = mkRun(OWNER, { labelled: false });
  for (const [i, g] of OWNER.entries()) bRun.metas[g.id] = { agentType: 'workflow-subagent', description: g.label, workflowPhase: g.phase, spawnDepth: 1, requestShape: 'subagent-x', requestNonInteractive: true };
  const b = parseRunDir({ runId: 'wf_x', ...bRun, newestMtime: NOW - MIN, now: NOW });
  ok('(b) journal WITHOUT label/phase + meta.json only ⇒ labels from meta.description, phases from meta.workflowPhase', flat(b).every((g, i) => g.label === OWNER[i].label) && b.phases.map((p) => p.title).join('|') === PHASES.join('|'));
  // (c) neither (a CLI before 2.1.267)
  const c = parseRunDir({ runId: 'wf_x', ...mkRun(OWNER, { labelled: false, metas: false, launched: false }), newestMtime: NOW - MIN, now: NOW });
  ok('(c) neither ⇒ label "" everywhere and ONE untitled phase "Agents" (the window then draws its "(agent)" fallback)', flat(c).every((g) => g.label === '') && c.phases.length === 1 && c.phases[0].title === 'Agents' && c.phases[0].untitled === true);
  ok('(c) …and the window still renders `ag.label || \'(agent)\'` for such a row', /escHtml\(ag\.label \|\| '\(agent\)'\)/.test(read('src/lib/workflow-detail.js')));
  // (d) mixed: named phases + an agent with none
  const d = parseRunDir({ runId: 'wf_x', ...mkRun([{ id: aid(1), label: 'x', phase: 'P1', result: true }, { id: aid(2), label: 'y', phase: '', result: true }, { id: aid(3), label: 'z', phase: 'P2' }]), newestMtime: NOW - MIN, now: NOW });
  ok('(d) an agent with no phase goes under ONE final "Other" phase beside the named ones', d.phases.map((p) => p.title + (p.untitled ? '*' : '')).join('|') === 'P1|P2|Other*' && d.phases[2].agents[0].label === 'y');
  // (e) precedence: journal label ?? meta description
  const eRun = mkRun([{ id: aid(1), label: 'from-journal', phase: 'J', metaLabel: 'from-meta' }]);
  eRun.metas[aid(1)].workflowPhase = 'M';
  const e = parseRunDir({ runId: 'wf_x', ...eRun, newestMtime: NOW, now: NOW });
  ok('(e) the journal\'s started line wins over the meta file (started.label ?? meta.description)', flat(e)[0].label === 'from-journal' && e.phases[0].title === 'J');
  // (f) superseded + (g) failed
  const f = parseRunDir({ runId: 'wf_x', ...mkRun([
    { id: aid(1), label: 'a#1', phase: 'P', key: keyOf('a') },
    { id: aid(2), label: 'a#2', phase: 'P', key: keyOf('a'), result: true },
    { id: aid(3), label: 'b#1', phase: 'P', key: keyOf('b'), failed: true },
    { id: aid(4), label: 'b#2', phase: 'P', key: keyOf('b') },
    { id: aid(5), label: 'c', phase: 'P', failed: true },
  ]), newestMtime: NOW - DAY, now: NOW });
  const fs_ = Object.fromEntries(flat(f).map((g) => [g.label, g.state]));
  ok('(f) a retry chain: the aborted attempt is `superseded`, its retry `done`', fs_['a#1'] === 'superseded' && fs_['a#2'] === 'done');
  ok('(g) a `failed` record on the LAST attempt ⇒ `error`; a failed attempt that was retried stays `superseded` (the journal arithmetic first)', fs_.c === 'error' && fs_['b#1'] === 'superseded' && fs_['b#2'] === 'progress', fs_);
  ok('(f/g) unfinished names only the resultless LIVE attempt — never a superseded or a failed one', JSON.stringify(f.stall.unfinished) === JSON.stringify(['b#2']), f.stall);
  // (h) transcript before its started line / started line before its transcript
  const hRun = mkRun([{ id: aid(1), label: 'x', phase: 'P', file: false }]);
  hRun.agentFiles.push(`agent-${aid(9)}.jsonl`);
  const h = parseRunDir({ runId: 'wf_x', ...hRun, newestMtime: NOW, now: NOW });
  ok('(h) a transcript whose started line has not landed is listed after the journal\'s agents (progress, onDisk); a started line with no transcript yet is onDisk:false (View Log disabled)', flat(h).map((g) => g.agentId).join(',') === `${aid(1)},${aid(9)}` && flat(h)[1].state === 'progress' && flat(h)[1].onDisk === true && flat(h)[0].onDisk === false);
  // (i) name, (j) purity, (k) text input, (l) junk
  const i = parseRunDir({ runId: 'wf_ab-1', scriptName: 'my-run-wf_ab-1.js', ...mkRun(OWNER), newestMtime: NOW, now: NOW });
  ok('(i) the run is named from the persisted script (<name>-<runId>.js), else "Workflow"', i.workflowName === 'my-run' && parseRunDir({ runId: 'wf_ab-1' }).workflowName === 'Workflow');
  const frozen = mkRun(OWNER);
  const deepFreeze = (o) => { Object.freeze(o); for (const v of Object.values(o)) if (v && typeof v === 'object' && !Object.isFrozen(v)) deepFreeze(v); return o; };
  deepFreeze(frozen);
  let threw = null; try { parseRunDir({ runId: 'wf_x', ...frozen, newestMtime: NOW, now: NOW }); } catch (err) { threw = err.message; }
  ok('(j) inputs are never mutated (deep-frozen fixture, strict mode)', threw === null, threw);
  ok('(k) journalLines may be the text itself', JSON.stringify(parseRunDir({ runId: 'wf_x', ...mkRun(OWNER), journalLines: mkRun(OWNER).journalLines.join('\n'), newestMtime: NOW, now: NOW })) === JSON.stringify(parseRunDir({ runId: 'wf_x', ...mkRun(OWNER), newestMtime: NOW, now: NOW })));
  const l = parseRunDir({ runId: 'wf_x', journalLines: ['', 'garbage', '42', 'null', '{"type":"started"}', '{"type":"launched"}'], metas: { nothex: { description: 'x' }, [aid(7)]: 'not an object' }, agentFiles: ['notes.txt', 'agent-XYZ.jsonl'], newestMtime: NOW, now: NOW });
  ok('(l) junk lines, id-less records, non-hex ids and non-object metas are ignored (one agent from the bare hex meta key, label "")', l.agentCount === 1 && flat(l)[0].agentId === aid(7) && flat(l)[0].label === '', flat(l));
}

console.log('§3 the liveness table (STALL_MS = 10 min)');
{
  const run = mkRun(OWNER);
  const v = (o) => parseRunDir({ runId: 'wf_x', ...run, now: NOW, ...o });
  ok('STALL_MS is ten minutes', STALL_MS === 10 * MIN);
  const tree = v({ liveTree: true, newestMtime: NOW - 2 * DAY });
  ok('a live tree ⇒ running REGARDLESS of mtime (2 days old), no stall', tree.status === 'running' && tree.liveness === 'tree' && tree.stall === null);
  const m9 = v({ newestMtime: NOW - 9 * MIN });
  ok('newest file 9 min old ⇒ running (recent)', m9.status === 'running' && m9.liveness === 'recent' && m9.stall === null);
  const m10 = v({ newestMtime: NOW - 10 * MIN });
  ok('newest file exactly 10 min old ⇒ stalled (the boundary belongs to stalled)', m10.status === 'stalled');
  const m11 = v({ newestMtime: NOW - 11 * MIN });
  ok('newest file 11 min old ⇒ stalled', m11.status === 'stalled' && m11.liveness === 'stalled' && m11.stall.lastActivityAt === NOW - 11 * MIN);
  const d2 = v({ newestMtime: NOW - 2 * DAY });
  ok('newest file 2 days old ⇒ stalled with lastActivityAt + the unfinished agent — NEVER "running"', d2.status === 'stalled' && d2.stall.lastActivityAt === NOW - 2 * DAY && d2.stall.unfinished.length === 1 && d2.live === true);
  const unk = v({ newestMtime: 0 });
  ok('unknown mtimes (0 / no clock) ⇒ running with liveness "unknown" — no evidence either way', unk.status === 'running' && unk.liveness === 'unknown' && v({ newestMtime: NOW, now: 0 }).liveness === 'unknown');
  ok('a RUNNING view carries no time: two polls with different newest mtimes are byte-identical (the window re-renders only on a changed run)', JSON.stringify(v({ newestMtime: NOW - MIN })) === JSON.stringify(v({ newestMtime: NOW - 2 * MIN })));
  ok('snapshotPresent (a resume after the terminal snapshot) ⇒ resumed:true; otherwise no resumed key', v({ snapshotPresent: true, newestMtime: NOW }).resumed === true && !('resumed' in v({ newestMtime: NOW })));
  const allDone = parseRunDir({ runId: 'wf_x', ...mkRun(OWNER.map((g) => ({ ...g, result: true }))), newestMtime: NOW - DAY, now: NOW });
  ok('every agent done but no snapshot and no write for a day ⇒ stalled with nothing unfinished (the orchestrator itself stopped)', allDone.status === 'stalled' && allDone.stall.unfinished.length === 0);
}

console.log('§3b treeAlive — is the launching session\'s stream tree proof of life NOW? (lane Q verify)');
{
  const { treeAlive, liveNoteKind } = WD;
  const tree = { phases: [], agents: [{ index: 0, agentId: aid(1), state: 'running' }] };
  const ti = (o) => ({ status: 'running', workflow: tree, aliveAt: NOW - MIN, ...o });
  const rows = [
    ['no taskInfo', null, false],
    ['no tree', { status: 'running', aliveAt: NOW }, false],
    ['running, newest record 1 min ago', ti({}), true],
    ['running, 9 min ago', ti({ aliveAt: NOW - 9 * MIN }), true],
    ['running, exactly 10 min ago (the boundary belongs to stalled, like the files)', ti({ aliveAt: NOW - 10 * MIN }), false],
    ['running, 2 days ago (a replay after a restart)', ti({ aliveAt: NOW - 2 * DAY }), false],
    ['running, NO aliveAt (a history conversion — no arrival known)', ti({ aliveAt: undefined }), false],
    ['no status (a card before task_started), fresh', ti({ status: undefined }), true],
    ['finished by the LEVEL set (a guess), fresh', ti({ status: 'finished', closedBy: 'level' }), true],
    ['finished by the level set, stale', ti({ status: 'finished', closedBy: 'level', aliveAt: NOW - DAY }), false],
    ['completed by its notification, fresh', ti({ status: 'completed', closedBy: 'notification' }), false],
    ['failed by task_updated, fresh', ti({ status: 'failed', closedBy: 'task_updated' }), false],
    ['killed, fresh', ti({ status: 'killed', closedBy: 'notification' }), false],
    ['finished by something other than the level set', ti({ status: 'finished', closedBy: 'notification' }), false],
  ];
  const bad = rows.filter(([, v, want]) => treeAlive(v, NOW) !== want).map(([n]) => n);
  ok(`the ${rows.length}-row table: open (running / no status / a level close) AND a record younger than STALL_MS; a closed task or an unknown / stale stamp is never proof of life`, bad.length === 0, bad);
  ok('no clock ⇒ never proof of life', treeAlive(ti({}), NaN) === false && treeAlive(ti({}), undefined) === false);
  // the note the window draws — THE STALL FIRST
  const nk = [
    [{ live: true, status: 'stalled', liveTree: true }, 'stalled'],
    [{ live: true, status: 'stalled', liveTree: false }, 'stalled'],
    [{ live: true, status: 'running', liveTree: true }, 'tree'],
    [{ live: true, status: 'running', liveTree: false }, 'files'],
    [{ live: false, status: 'completed' }, null],
    [null, null],
  ];
  const nkBad = nk.filter(([v, want]) => liveNoteKind(v) !== want).map(([v]) => JSON.stringify(v));
  ok('liveNoteKind: a stalled view says stalled EVEN WITH a merged tree; a running one says tree / files; a terminal view has no note', nkBad.length === 0, nkBad);
}

console.log('§4 the words — stallWords, the ONE spelling for the window and the card');
{
  const tStub = (k, p) => k.replace(/\{(\w+)\}/g, (m, x) => (p && p[x] !== undefined ? String(p[x]) : m));
  const zh = (await import(path.join(REPO, 'src/lib/i18n-zh.js'))).default;
  const ja = (await import(path.join(REPO, 'src/lib/i18n-ja.js'))).default;
  const tOf = (dict) => (k, p) => tStub(dict[k] ?? k, p);
  const view = parseRunDir({ runId: 'wf_x', ...mkRun(OWNER), newestMtime: NOW - 2 * DAY, now: NOW });
  const en = stallWords(view, { t: tStub, now: NOW });
  ok('en: "Stalled" + "Last activity 2 d ago; 1 unfinished agent(s)"', en.label === 'Stalled' && en.detail === 'Last activity 2 d ago; 1 unfinished agent(s)', en);
  const z = stallWords(view, { t: tOf(zh), now: NOW });
  ok('zh: 已中断 + "最后活动 2 天前；1 个 agent 未完成" (the owner\'s language)', z.label === '已中断' && z.detail === '最后活动 2 天前；1 个 agent 未完成', z);
  const j = stallWords(view, { t: tOf(ja), now: NOW });
  ok('ja: every word translated (no English left in the chip or the sentence)', j.label === '中断' && !/[A-Za-z]{3,}/.test(j.detail.replace(/agent/g, '')), j);
  ok('no unfinished agent ⇒ only "Last activity …"', stallWords({ status: 'stalled', stall: { lastActivityAt: NOW - 11 * MIN, unfinished: [] } }, { t: tStub, now: NOW }).detail === 'Last activity 11 min ago');
  ok('a running view / null / no t ⇒ null (nothing to say)', stallWords(parseRunDir({ runId: 'wf_x', ...mkRun(OWNER), newestMtime: NOW, now: NOW }), { t: tStub, now: NOW }) === null && stallWords(null, { t: tStub, now: NOW }) === null && stallWords(view, {}) === null);
  const ago = [30e3, 12 * MIN, 59 * MIN, 3 * 60 * MIN, 2 * DAY].map((ms) => agoWords(ms, tStub));
  ok('agoWords: just now / 12 min / 59 min / 3 h / 2 d (the keys the Usage window already reads)', JSON.stringify(ago) === JSON.stringify(['just now', '12 min ago', '59 min ago', '3 h ago', '2 d ago']), ago);
  const keys = ['Stalled', 'Last activity {ago}; {n} unfinished agent(s)', 'Last activity {ago}', '{n} unfinished agent(s)', 'unfinished — the run stopped before it returned',
    'None of this run’s files has changed for over {n} minutes and it never wrote its final result — it most likely stopped together with the session that launched it. Open any agent to read its transcript.',
    'Live view from the run’s own files — agent states update every few seconds; token totals appear when the run finishes. Open any agent to watch its transcript.',
    'just now', '{n} min ago', '{n} h ago', '{n} d ago', 'Other', 'Agents'];
  const missing = keys.filter((k) => !(k in zh) || !(k in ja));
  ok(`every sentence this change draws has a zh AND a ja entry (${keys.length} keys)`, missing.length === 0, missing);
}

// ── scratch home for §5–§6: the real route and the real remote probe script read THIS $HOME ──
// the REAL home's project list, read BEFORE this process is re-homed — the per-suite census
// at the end proves the fixture never landed there (test-fixture-isolation (c)); the route
// child inherits the re-homed env
const REAL_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const realBefore = (() => { try { return new Set(fs.readdirSync(REAL_PROJECTS)); } catch { return new Set(); } })();
const { fixtureLitter } = require(path.join(REPO, 'src/fixture-guard.js'));
const HOME = scratchHome('workflow-disk', fs);
const cleanup = () => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { } };
process.on('exit', cleanup);
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(143); });
process.env.HOME = HOME;
os.homedir = () => HOME;
const CWD = path.join(HOME, 'cwd');
fs.mkdirSync(CWD, { recursive: true });
const SID = fixtureSid('3fd1');
const PROJ = path.join(HOME, '.claude', 'projects', CWD.replace(/[/._]/g, '-'), SID);
const writeRun = (runId, run, { mtimeMs, scriptName } = {}) => {
  const dir = path.join(PROJ, 'subagents', 'workflows', runId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'journal.jsonl'), run.journalLines.join('\n') + '\n');
  for (const f of run.agentFiles) {
    const m = f.match(/^agent-([0-9a-f]+)\.(jsonl|meta\.json)$/);
    if (!m) continue;
    fs.writeFileSync(path.join(dir, f), m[2] === 'jsonl'
      ? JSON.stringify({ type: 'user', message: { role: 'user', content: 'synthetic prompt' }, agentId: m[1] }) + '\n'
      : JSON.stringify(run.metas[m[1]] || { agentType: 'workflow-subagent', spawnDepth: 1 }));
  }
  if (scriptName) { const sd = path.join(PROJ, 'workflows', 'scripts'); fs.mkdirSync(sd, { recursive: true }); fs.writeFileSync(path.join(sd, scriptName), 'export const meta = {}\n'); }
  if (mtimeMs) for (const f of fs.readdirSync(dir)) fs.utimesSync(path.join(dir, f), new Date(mtimeMs), new Date(mtimeMs));
  return dir;
};
const T = Date.now();
writeRun('wf_e2e0stall', mkRun(OWNER), { mtimeMs: T - 2 * DAY, scriptName: 'synthetic-run-wf_e2e0stall.js' });
writeRun('wf_e2e0fresh', mkRun(OWNER), { mtimeMs: T - 3 * MIN });
writeRun('wf_e2e0m11', mkRun(OWNER), { mtimeMs: T - 11 * MIN });
writeRun('wf_e2e0old', mkRun(OWNER, { labelled: false, metas: false, launched: false }), { mtimeMs: T - 5 * DAY });
// the remote twin's liveness input (lane Q verify): every file 2 days old EXCEPT one agent's
// meta.json written just now (a freshly spawned agent — its started line and transcript not yet
// written) ⇒ the run is alive by the local rule (readRunDirParts stats every file)
{ const d = writeRun('wf_e2e0metafresh', mkRun(OWNER), { mtimeMs: T - 2 * DAY }); fs.utimesSync(path.join(d, `agent-${aid(11)}.meta.json`), new Date(T), new Date(T)); }
// a finished run: the terminal snapshot + its run dir (older than the snapshot) …
const SNAP = { runId: 'wf_e2e0snap', workflowName: 'snap run', summary: 'done', status: 'completed', totalTokens: 1234, totalToolCalls: 7, agentCount: 1, durationMs: 60000,
  workflowProgress: [{ type: 'workflow_phase', index: 1, title: 'Only' }, { type: 'workflow_agent', index: 0, label: 'snap:agent', phaseIndex: 1, phaseTitle: 'Only', agentId: aid(1), state: 'done', model: 'opus' }] };
const writeSnap = (runId, snapMs, dirMs) => {
  const sd = path.join(PROJ, 'workflows'); fs.mkdirSync(sd, { recursive: true });
  const sp = path.join(sd, runId + '.json'); fs.writeFileSync(sp, JSON.stringify({ ...SNAP, runId }));
  fs.utimesSync(sp, new Date(snapMs), new Date(snapMs));
  writeRun(runId, mkRun([{ id: aid(1), label: 'disk:agent', phase: 'Disk', result: true }]), { mtimeMs: dirMs });
};
writeSnap('wf_e2e0snap', T - DAY, T - DAY - 1000);            // snapshot written after the last journal line
writeSnap('wf_e2e0resumed', T - DAY, T - 2 * MIN);            // …and one whose run dir kept going (a resume)

console.log('§5 the REAL route (express mount, HOME = a scratch home)');
// The probe is ONE child per module variant: the real modules (every leg), then the patched
// copies of §7 (ROUTE_PATH / MM_PATH / HOSTS_PATH) running only the legs their control judges.
// MODES = the launching session's normalizer states the route is asked under (activeSessions is
// the route's own Map, re-filled between requests):
//   tree        a stub taskInfo whose tree is FRESH (aliveAt 1 min ago)
//   staletree   the same tree, aliveAt 2 days ago (lane Q verify: a tree holds no clock of its own)
//   closedtree  the stream CLOSED the task (completed by its notification), tree still held
//   levelset    a REAL normalizer fed the wire's real order + a level set naming only the short id
//   replayold   a REAL rebuildHistory whose persisted task records arrived 2 days ago (a restart)
//   replayfresh the same, arrived 1 minute ago
const probe = `
const express = require(${JSON.stringify(path.join(REPO, 'node_modules/express'))});
const { execFileSync } = require('node:child_process');
const { HostManager } = require(process.env.HOSTS_PATH || ${JSON.stringify(path.join(REPO, 'src/hosts.js'))});
const { setup, router } = require(process.env.ROUTE_PATH || ${JSON.stringify(path.join(REPO, 'src/routes/sessions.js'))});
const { createMessageManager, rebuildHistory } = require(${JSON.stringify(path.join(REPO, 'src/normalizers.js'))});
const MMClass = process.env.MM_PATH ? require(process.env.MM_PATH).MessageManager : null;
const RID = 'wf_e2e0stall', DAY = 86400e3;
const TREE_PROGRESS = [{ type: 'workflow_phase', index: 0, title: 'lanes' }, { type: 'workflow_agent', index: 0, label: 'lane:0', phaseIndex: 0, phaseTitle: 'lanes', agentId: '${aid(2)}', state: 'running', lastToolName: 'Bash' }];
const tree = { phases: [{ index: 0, title: 'lanes' }], agents: [{ index: 0, label: 'lane:0', phaseIndex: 0, phaseTitle: 'lanes', agentId: '${aid(2)}', state: 'running', lastToolName: 'Bash' }] };
const stub = (ti) => ({ _normalizer: { taskInfoById: (rid) => (rid === RID ? ti : null) } });
async function sessionFor(mode) {
  if (mode === 'tree') return stub({ status: 'running', workflow: tree, usage: { totalTokens: 99 }, aliveAt: Date.now() - 60e3 });
  if (mode === 'staletree') return stub({ status: 'running', workflow: tree, usage: { totalTokens: 99 }, aliveAt: Date.now() - 2 * DAY });
  if (mode === 'closedtree') return stub({ status: 'completed', closedBy: 'notification', workflow: tree, usage: { totalTokens: 4321 }, aliveAt: Date.now() - 60e3 });
  if (mode === 'levelset') {
    const mm = MMClass ? new MMClass('w1') : createMessageManager('claude', 'w1');
    mm.processLive({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_e2e0wf', name: 'Workflow', input: { script: 'export const meta = {}' } }] } });
    mm.processLive({ type: 'system', subtype: 'task_started', task_id: 'wu9e2e0', tool_use_id: 'toolu_e2e0wf', task_type: 'local_workflow', description: 'synthetic', is_backgrounded: true });
    mm.processLive({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_e2e0wf', content: 'Workflow "synthetic" started in the background.\\nRun ID: ' + RID + '\\n' }] } });
    mm.processLive({ type: 'system', subtype: 'task_progress', task_id: 'wu9e2e0', tool_use_id: 'toolu_e2e0wf', description: 'synthetic', workflow_progress: TREE_PROGRESS });
    mm.processLive({ type: 'system', subtype: 'background_tasks_changed', tasks: [{ task_id: 'wu9e2e0', task_type: 'local_workflow', description: 'synthetic' }] });
    return { _normalizer: mm };
  }
  if (mode === 'replayold' || mode === 'replayfresh') {
    const at = Date.now() - (mode === 'replayold' ? 2 * DAY : 60e3);
    const s = { backend: 'claude', _taskRecords: { toolu_e2e0wf: { at,
      started: { type: 'system', subtype: 'task_started', task_id: 'wu9e2e0', tool_use_id: 'toolu_e2e0wf', task_type: 'local_workflow', description: 'synthetic', is_backgrounded: true },
      progress: { type: 'system', subtype: 'task_progress', task_id: 'wu9e2e0', tool_use_id: 'toolu_e2e0wf', description: 'synthetic', workflow_progress: TREE_PROGRESS } } } };
    await rebuildHistory(s, 'w1', [
      { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_e2e0wf', name: 'Workflow', input: { script: 'export const meta = {}' } }] } },
      { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_e2e0wf', content: 'Workflow launched in background. Task ID: wu9e2e0\\nSummary: synthetic\\nRun ID: ' + RID }] } },
    ]);
    return s;
  }
  return null;
}
const activeSessions = new Map();
// the REMOTE probe script, run for real by sh under this scratch $HOME; host h2 answers without its NOW line
const fakeHm = { get: (id) => ({ id, name: id }), _hostShell: async (h, script) => { const o = execFileSync('sh', ['-c', script], { encoding: 'utf8', timeout: 20000 }); return h.id === 'h2' ? o.replace(/^NOW:.*\\n/m, '') : o; } };
const hosts = { get: (id) => ({ id }), fetchWorkflowState: (...a) => HostManager.prototype.fetchWorkflowState.apply(fakeHm, a) };
const app = express();
setup({ activeSessions, webuiPids: new Set(), refreshWebuiPids: () => {}, createSessionMessages: () => null, BUFFERS_DIR: '/tmp', PERMISSION_MODES: [], execFileSync: () => '', hosts, serverSetting: () => null });
app.use(router);
const srv = app.listen(0, '127.0.0.1', async () => {
  const base = 'http://127.0.0.1:' + srv.address().port;
  const get = async (runId, extra = '') => { const r = await fetch(base + '/api/workflow?runId=' + runId + '&claudeSessionId=${SID}&cwd=' + encodeURIComponent(${JSON.stringify(CWD)}) + extra); return { status: r.status, body: await r.json() }; };
  const out = { modes: {} };
  const legs = (process.env.LEGS || 'base,modes,remote').split(',');
  if (legs.includes('base')) {
    for (const id of ['wf_e2e0stall', 'wf_e2e0fresh', 'wf_e2e0m11', 'wf_e2e0old', 'wf_e2e0snap', 'wf_e2e0resumed', 'wf_e2e0nope', 'wf_e2e0metafresh']) out[id] = await get(id);
    out.rawProbe = await HostManager.prototype.fetchWorkflowState.call({ ...fakeHm }, 'h1', 'wf_e2e0stall', '${SID}', ${JSON.stringify(CWD)});
  }
  if (legs.includes('remote')) {
    out.remote = await get('wf_e2e0stall', '&host=h1');
    out.remoteFresh = await get('wf_e2e0fresh', '&host=h1');
    out.remoteSnap = await get('wf_e2e0snap', '&host=h1');
    out.remoteMetaFresh = await get('wf_e2e0metafresh', '&host=h1');
    out.remoteNoNow = await get('wf_e2e0stall', '&host=h2');
  }
  if (legs.includes('modes')) {
    for (const mode of (process.env.MODES || 'tree,staletree,closedtree,levelset,replayold,replayfresh').split(',')) {
      activeSessions.clear();
      try { const sess = await sessionFor(mode); if (sess) activeSessions.set('w1', sess); } catch (e) { out.modes[mode] = { err: String(e && e.stack || e) }; continue; }
      out.modes[mode] = (await get(RID)).body;
    }
    activeSessions.clear();
  }
  console.log('@@' + JSON.stringify(out));
  srv.close(); process.exit(0);
});
`;
const runProbe = (env = {}) => {
  const r = spawnSync(process.execPath, ['-e', probe], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 90000 });
  const line = (r.stdout || '').split('\n').find((x) => x.startsWith('@@'));
  return { out: line ? JSON.parse(line.slice(2)) : null, err: (r.stderr || '').slice(-600) };
};
// the judges — each one run on the real modules here and on its patched copy in §7
const J = {
  levelset: (v) => !!v && v.status === 'running' && v.liveness === 'tree' && v.liveTree === true,
  replayold: (v) => !!v && v.status === 'stalled' && v.liveness === 'stalled' && !!v.stall,
  replayfresh: (v) => !!v && v.status === 'running' && v.liveness === 'tree',
  remoteMetaFresh: (r) => !!r && r.status === 200 && r.body.status === 'running' && r.body.liveness === 'recent',
  remoteNoNow: (r) => !!r && r.status === 200 && r.body.status === 'running' && r.body.liveness === 'unknown' && r.body.stall === null,
};
const { out, err } = runProbe();
ok('the route probe ran (real express mount of src/routes/sessions.js, HOME = scratch)', !!out, err);
if (out) {
  const s = out.wf_e2e0stall.body;
  ok('the owner\'s case: a snapshot-less run whose newest file is 2 days old ⇒ status `stalled`, NOT running', out.wf_e2e0stall.status === 200 && s.status === 'stalled' && s.live === true, { status: s.status, liveness: s.liveness });
  ok('…the eleven labels and the five phases come from the run dir, in spawn order', flat(s).map((g) => g.label).join('|') === OWNER.map((g) => g.label).join('|') && s.phases.map((p) => p.title).join('|') === PHASES.join('|'), s.phases.map((p) => p.title));
  ok('…lastActivityAt is the files\' own mtime and the one unfinished agent is named', Math.abs(s.stall.lastActivityAt - (T - 2 * DAY)) < 2000 && JSON.stringify(s.stall.unfinished) === '["ship:it"]', s.stall);
  ok('…the run is named from its persisted script; no phase title carries the old sentence', s.workflowName === 'synthetic-run' && !s.phases.some((p) => /live —|appear when the run finishes/.test(p.title)));
  ok('a run written 3 min ago ⇒ running', out.wf_e2e0fresh.body.status === 'running' && out.wf_e2e0fresh.body.stall === null);
  ok('a run written 11 min ago ⇒ stalled', out.wf_e2e0m11.body.status === 'stalled');
  ok('a pre-2.1.267 run (no labels anywhere) ⇒ label "" rows under one untitled "Agents" phase (the window\'s "(agent)" fallback), stalled after 5 days', flat(out.wf_e2e0old.body).every((g) => g.label === '') && out.wf_e2e0old.body.phases.length === 1 && out.wf_e2e0old.body.phases[0].untitled === true && out.wf_e2e0old.body.status === 'stalled');
  const sn = out.wf_e2e0snap.body;
  ok('a TERMINAL SNAPSHOT present ⇒ the terminal view exactly as before (status/labels/tokens from the snapshot, not live, no stall)', sn.status === 'completed' && !sn.live && sn.totalTokens === 1234 && flat(sn)[0].label === 'snap:agent' && !('stall' in sn), sn);
  const rs = out.wf_e2e0resumed.body;
  ok('a snapshot + run-dir activity > 15 s after it (a resume) ⇒ the disk view, resumed:true, labels from the run dir', rs.live === true && rs.resumed === true && flat(rs)[0].label === 'disk:agent' && rs.status === 'running', rs);
  ok('an unknown run ⇒ 404 as before', out.wf_e2e0nope.status === 404);
  ok('LOCAL: a run whose only fresh file is a just-spawned agent\'s meta.json ⇒ running (the newest mtime covers every file)', out.wf_e2e0metafresh.body.status === 'running' && out.wf_e2e0metafresh.body.liveness === 'recent', out.wf_e2e0metafresh.body.liveness);
  const rm = out.remote.body;
  ok('REMOTE (?host=): the compound probe ships the metas + the host\'s clock; the same stalled view with the labels and phases', out.remote.status === 200 && rm.status === 'stalled' && flat(rm).map((g) => g.label).join('|') === OWNER.map((g) => g.label).join('|') && rm.phases.map((p) => p.title).join('|') === PHASES.join('|') && JSON.stringify(rm.stall.unfinished) === '["ship:it"]', { status: out.remote.status, rm: JSON.stringify(rm).slice(0, 300) });
  ok('REMOTE: a fresh run reads running; a snapshot run the terminal view (unchanged)', out.remoteFresh.body.status === 'running' && out.remoteSnap.body.status === 'completed' && !out.remoteSnap.body.live);
  ok('REMOTE twin of the meta.json leg (lane Q verify): the probe\'s NMT covers every file ⇒ running like local, never stalled', J.remoteMetaFresh(out.remoteMetaFresh), out.remoteMetaFresh);
  ok('REMOTE with NO host clock (the NOW line missing) ⇒ liveness `unknown` (running, no stall) — never the hub\'s clock against the host\'s mtimes', J.remoteNoNow(out.remoteNoNow), out.remoteNoNow);
  const rp = out.rawProbe;
  ok('the raw probe: every meta.json parsed (11), NOW is the host clock, NMT the newest file, the journal section is the journal (no META marker leaked into it)', Object.keys(rp.metas || {}).length === 11 && Math.abs(rp.now - Date.now() / 1000) < 120 && Math.abs(rp.newestMtime - (T - 2 * DAY) / 1000) < 3 && !/__VSWF_/.test(rp.journalText) && rp.journalText.trim().split('\n').length === mkRun(OWNER).journalLines.length && rp.metas[aid(11)]?.description === 'ship:it', { metas: Object.keys(rp.metas || {}).length, now: rp.now, nmt: rp.newestMtime });
  const M5 = out.modes;
  const wt = M5.tree;
  ok('a FRESH live tree held by this server (aliveAt 1 min ago) ⇒ running regardless of the 2-day-old files, the tree merged (liveTree, its tokens) and the disk labels/phases fill what the tree lacks', wt && wt.status === 'running' && wt.liveness === 'tree' && wt.liveTree === true && wt.stall === null && wt.totalTokens === 99
    && flat(wt).length === 11 && flat(wt).every((g) => g.label) && wt.phases.map((p) => p.title).join('|') === 'lanes|survey|merge|qa|ship', { status: wt?.status, phases: wt?.phases?.map((p) => p.title) });
  ok('a STALE tree (its newest record 2 days old) is no proof of life ⇒ stalled by the files, the tree still merged (labels, tokens)', M5.staletree?.status === 'stalled' && M5.staletree.liveTree === true && M5.staletree.totalTokens === 99, { status: M5.staletree?.status, liveness: M5.staletree?.liveness });
  ok('a tree whose task the stream CLOSED (notification) ⇒ judged by its files: stalled, liveTree merged — the window\'s note must still say stalled (liveNoteKind)', M5.closedtree?.status === 'stalled' && M5.closedtree.liveTree === true && M5.closedtree.totalTokens === 4321, { status: M5.closedtree?.status });
  ok('REAL normalizer, the wire\'s real order + a level set naming ONLY the short task id ⇒ running, liveness `tree` over the 2-day-old dir (the card is named by either key)', J.levelset(M5.levelset), M5.levelset && { status: M5.levelset.status, liveness: M5.levelset.liveness, err: M5.levelset.err });
  ok('REAL rebuildHistory after a restart, the persisted records 2 days old ⇒ STALLED (the replay stamps the record\'s own arrival, the tree is not proof of life)', J.replayold(M5.replayold), M5.replayold && { status: M5.replayold.status, liveness: M5.replayold.liveness, err: M5.replayold.err });
  ok('…the same replay with records 1 minute old ⇒ running, liveness `tree` (the arrival time reaches the normalizer)', J.replayfresh(M5.replayfresh), M5.replayfresh && { status: M5.replayfresh.status, liveness: M5.replayfresh.liveness, err: M5.replayfresh.err });
}

console.log('§7 negative controls — patched copies of src/workflow-disk.js');
{
  const M = mutantCopies('workflow-disk', REPO);
  const src = read('src/workflow-disk.js');
  const cut = (s, from, to) => { if (!s.includes(from)) throw new Error('mutation anchor missing: ' + from); return s.replace(from, to); };
  // (1) ignores the metas
  const noMeta = M.load('src/workflow-disk.js', cut(src, 'const m = metaOf(id) || {};', 'const m = {};'), 'nometa');
  const bRun = mkRun(OWNER, { labelled: false });
  for (const g of OWNER) bRun.metas[g.id] = { agentType: 'workflow-subagent', description: g.label, workflowPhase: g.phase, spawnDepth: 1 };
  const judgeB = (mod) => { const v = mod.parseRunDir({ runId: 'wf_x', ...bRun, newestMtime: NOW, now: NOW }); return flat(v).every((g, i) => g.label === OWNER[i].label) && v.phases.map((p) => p.title).join('|') === PHASES.join('|'); };
  ok('the real module passes row (b) (labels + phases from meta.json only)', judgeB(WD));
  ok('CONTROL: a copy that IGNORES the metas fails the same row (the table sees the defect)', !judgeB(noMeta));
  // (2) the old "always running"
  const noStall = M.load('src/workflow-disk.js', cut(src, "else { status = 'stalled'; liveness = 'stalled'; }", "else { liveness = 'recent'; }"), 'nostall');
  const judgeStall = (mod) => { const v = mod.parseRunDir({ runId: 'wf_x', ...mkRun(OWNER), newestMtime: NOW - 11 * MIN, now: NOW }); return v.status === 'stalled' && v.stall && v.stall.unfinished.length === 1; };
  ok('the real module calls an 11-min-silent run stalled', judgeStall(WD));
  ok('CONTROL: a copy without the liveness verdict (the old skeleton\'s unconditional "running") fails it', !judgeStall(noStall));
  // (3) the window's note: the pre-fix order (tree first) — a stalled view with a merged tree said "live"
  const treeFirst = M.load('src/workflow-disk.js', cut(src, "  if (view.status === 'stalled') return 'stalled';\n  return view.liveTree ? 'tree' : 'files';", "  if (view.liveTree) return 'tree';\n  return view.status === 'stalled' ? 'stalled' : 'files';"), 'treefirst');
  const judgeNote = (mod) => mod.liveNoteKind({ live: true, status: 'stalled', liveTree: true }) === 'stalled';
  ok('the real module gives a stalled view with a merged tree the STALLED note', judgeNote(WD));
  ok('CONTROL: a copy that asks the tree first (the pre-fix window order) gives it the live-tree note', !judgeNote(treeFirst));
  // (4) treeAlive without the clock (the pre-fix route rule: any open tree is proof of life)
  const noClock = M.load('src/workflow-disk.js', cut(src, 'return open && Number.isFinite(at) && at > 0 && Number.isFinite(now) && now - at < STALL_MS;', 'return open;'), 'noclock');
  const judgeClock = (mod) => mod.treeAlive({ status: 'running', workflow: { agents: [] }, aliveAt: NOW - 2 * DAY }, NOW) === false;
  ok('the real module refuses a tree whose newest record is 2 days old', judgeClock(WD));
  ok('CONTROL: a copy that ignores aliveAt calls it alive', !judgeClock(noClock));

  // (5)–(7) THE ROUTE LEGS on patched copies, each in its own probe child (one variant per child).
  // (5) the route with BOTH pre-fix spellings: the tree rule (`status running ⇒ proof of life`, no
  //     clock) and the remote clock fallback (`st.now ? … : Date.now()`)
  const route = read('src/routes/sessions.js');
  const preRoute = M.write('src/routes/sessions.js', cut(cut(route,
    'const treeLive = treeAlive(ti, Date.now());', "const treeLive = !!(ti && ti.workflow && (!ti.status || ti.status === 'running'));"),
    'const now = st.now ? st.now * 1000 : 0;', 'const now = st.now ? st.now * 1000 : Date.now();'), 'preroute');
  // (6) the normalizer with the pre-fix per-KEY level-set loops
  const mmSrc = read('src/message-manager.js');
  const lsFrom = mmSrc.indexOf('      // THE SET NAMES A CARD, NOT A KEY'), lsTo = mmSrc.indexOf("      if (emit) this._emit({ op: 'meta', subtype: 'background-tasks'");
  if (!(lsFrom > 0 && lsTo > lsFrom)) throw new Error('mutation anchor missing: the per-card level-set section');
  const preMM = M.write('src/message-manager.js', mmSrc.slice(0, lsFrom) + `      const live = new Set(set.map((t) => t.id));
      for (const [tid, msgId] of this.taskMsgByTaskId) {
        if (!live.has(String(tid))) continue;
        const m = this.messageIndex.get(msgId);
        if (m?.taskInfo && m.taskInfo.status === 'finished' && m.taskInfo.closedBy === 'level') { m.taskInfo.status = 'running'; delete m.taskInfo.closedBy; }
      }
      for (const [tid, msgId] of this.taskMsgByTaskId) {
        if (live.has(String(tid))) continue;
        const m = this.messageIndex.get(msgId);
        if (m?.taskInfo && m.taskInfo.status === 'running' && m.taskInfo.backgrounded === true) { m.taskInfo.status = 'finished'; m.taskInfo.closedBy = 'level'; }
      }
` + mmSrc.slice(lsTo), 'perkey');
  // (7) the remote probe without its NMT line (the newest mtime = journal + transcripts only)
  const hostsSrc = read('src/hosts.js');
  const preHosts = M.write('src/hosts.js', cut(hostsSrc, `+ \`echo "NMT:$( [ -n "$D" ] && for f in "$D"/*; do [ -f "$f" ] && mt "$f"; done | sort -n | tail -1 )"; \``, "+ ''"), 'nonmt');
  const pr = runProbe({ ROUTE_PATH: preRoute, LEGS: 'modes,remote', MODES: 'replayold' });
  ok('the pre-fix route probe ran', !!pr.out, pr.err);
  ok(`CONTROL (the pre-fix tree rule): after a restart the 2-day-old replayed tree reads ${pr.out?.modes?.replayold?.status}/${pr.out?.modes?.replayold?.liveness} — the replayold leg sees the defect`, !!pr.out && !J.replayold(pr.out.modes.replayold) && pr.out.modes.replayold.status === 'running' && pr.out.modes.replayold.liveness === 'tree');
  ok(`CONTROL (the hub's clock as the host's): a probe without NOW reads ${pr.out?.remoteNoNow?.body?.status}/${pr.out?.remoteNoNow?.body?.liveness} — the no-clock leg sees the defect`, !!pr.out && !J.remoteNoNow(pr.out.remoteNoNow) && pr.out.remoteNoNow.body.status === 'stalled');
  // the levelset leg has TWO layers (feedback: a new guard layer is stripped from the old layer's
  // control): the ROOT (the normalizer names a card by either key) and the BELT (treeAlive counts a
  // level close — a guess — as open). Each layer holds alone; only with BOTH gone does the leg go red.
  const noBelt = M.write('src/routes/sessions.js', cut(route,
    'const treeLive = treeAlive(ti, Date.now());', "const treeLive = treeAlive(ti && ti.status === 'finished' ? null : ti, Date.now());"), 'nobelt');
  const legOf = (env) => { const r = runProbe({ ...env, LEGS: 'modes', MODES: 'levelset' }); return { v: r.out?.modes?.levelset, err: r.out ? r.out.modes.levelset?.err || '' : r.err }; };
  const beltOnly = legOf({ MM_PATH: preMM }), rootOnly = legOf({ ROUTE_PATH: noBelt }), neither = legOf({ MM_PATH: preMM, ROUTE_PATH: noBelt });
  ok(`layer 1 alone (the per-KEY normalizer, the real route's belt): ${beltOnly.v?.status}/${beltOnly.v?.liveness} — the belt holds`, J.levelset(beltOnly.v), beltOnly);
  ok(`layer 2 alone (the per-CARD normalizer, a route without the belt): ${rootOnly.v?.status}/${rootOnly.v?.liveness} — the root fix holds`, J.levelset(rootOnly.v), rootOnly);
  ok(`CONTROL (the per-KEY level set AND no belt — the build commit's code): the real-order run reads ${neither.v?.status}/${neither.v?.liveness} over the 2-day dir — the levelset leg sees the defect`, !J.levelset(neither.v) && neither.v?.status === 'stalled', neither);
  const ph = runProbe({ HOSTS_PATH: preHosts, LEGS: 'remote' });
  ok(`CONTROL (no NMT): the remote meta.json-fresh run reads ${ph.out?.remoteMetaFresh?.body?.status} — the remote twin leg sees the defect`, !!ph.out && !J.remoteMetaFresh(ph.out.remoteMetaFresh) && ph.out.remoteMetaFresh.body.status === 'stalled', ph.err);
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 8 })) ok(r.name, r.pass, r.detail);
}

console.log('§8 wiring pins (the 2.355.0 lesson: a pure fix with no call site is dead)');
{
  const win = read('src/lib/workflow-detail.js');
  ok('window: stallWords imported and drawn (chip label + tooltip + meta line), the stalled note, untitled phases in the device\'s words, unfinished rows, the pulse only while RUNNING, a stalled run polled slowly',
    /import \{ stallWords, liveNoteKind \} from '\.\.\/workflow-disk\.js'/.test(win) && /stalled:\s+\{ label: t\('Stalled'\)/.test(win) && /headChip\.title = chipTip/.test(win)
    && /if \(stall\) \{ if \(stall\.detail\) bits\.push\(stall\.detail\); \}/.test(win) && /phase\.untitled \? \(phase\.title === 'Other' \? t\('Other'\) : t\('Agents'\)\)/.test(win)
    && /wf\.status === 'stalled' && ag\.state === 'progress' \? 'unfinished'/.test(win) && /wf\.live && wf\.status === 'running' \? ' workflow-status-live'/.test(win)
    && /wf\.status === 'killed' \|\| wf\.status === 'failed' \|\| wf\.status === 'stalled'/.test(win));
  const STALE = /Phase names, labels (?:&|and) token|phase names, labels & tokens appear/;
  const hits = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(REPO, d), { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.js$/.test(e.name) && STALE.test(read(p))) hits.push(p); } };
  walk('src');
  ok('NO file under src/ (route, window, dictionaries) still says labels appear only when the run finishes', hits.length === 0, hits);
  const cr = read('src/lib/chat-renderers.js');
  ok('card: taskStatusChipHtml draws the stalled verdict through stallWords (warn chip + the sentence as its tooltip); the Workflow card passes the view\'s verdict for its runId',
    /import \{ stallWords \} from '\.\.\/workflow-disk\.js'/.test(cr) && /verdict && verdict\.status === 'stalled' \? stallWords\(verdict, \{ t, now: Date\.now\(\) \}\)/.test(cr) && /chat-task-status-chip warn/.test(cr)
    && /this\.renderTaskChip\(tiW, runId \? this\._getWorkflowVerdict\?\.\(runId\) : null\)/.test(cr) && /\.chat-task-status-chip\.warn \{ color: var\(--yellow\); \}/.test(read('public/chat.css')));
  const sb = read('src/lib/chat-status-bar.js'), cv = read('src/lib/chat-view.js');
  ok('status bar → view: the existing /api/workflow poll reports stalled (and clears on any other answer); ChatView keeps the verdict per run and patches the cards that name it',
    /this\._onWorkflowVerdict\?\.\(runId, d\.status === 'stalled' \? \{ status: 'stalled', stall: d\.stall \|\| null \} : null\)/.test(sb)
    && /onWorkflowVerdict: \(runId, verdict\) => this\._setWorkflowVerdict\(runId, verdict\)/.test(cv) && /getWorkflowVerdict: \(runId\) => this\._workflowVerdict\(runId\)/.test(cv)
    && /this\._renderers\.renderTaskChip\(ti, this\._workflowVerdict\(runId\)\)/.test(cv) && /btn\.dataset\.wfRun === runId\) this\._scheduleWorkflowPatch\(id\)/.test(cv));
  const hosts = read('src/hosts.js');
  ok('remote probe: the host\'s clock (NOW:) and a nonce-delimited META section of `<file>\\t<json>` lines, capped under the 1 MB dial slice', /echo "NOW:\$\(date \+%s\)"/.test(hosts) && /M\('META'\)/.test(hosts) && /head -c 40000/.test(hosts) && /now: Number\(grab\('NOW:'\)\) \|\| 0/.test(hosts));
  // lane Q verify (2026-09-26) wiring — each fix at its call site
  ok('lane Q: the window picks its note by liveNoteKind (the stall first) and every agent label / phase title carries its full text as a title',
    /const noteKind = liveNoteKind\(wf\);/.test(win) && /noteKind === 'stalled' \? ' workflow-live-note-stalled' : ''/.test(win)
    && /class="workflow-agent-label"\$\{ag\.label \? ` title="\$\{escHtml\(ag\.label\)\}"` : ''\}/.test(win) && /class="workflow-phase-title" title="\$\{escHtml\(phaseTitle\)\}"/.test(win));
  ok('lane Q: the status bar KEEPS a stalled run tracked (wf.stalled, re-asked every 15 s), draws only the running ones, and lets go only on a terminal answer or a 404',
    /if \(d && d\.status === 'stalled'\) \{ wf\.stalled = true; continue; \}/.test(sb) && /const WF_STALLED_POLL_MS = 15000;/.test(sb)
    && /if \(wf\.stalled && now - \(wf\.checkedAt \|\| 0\) < WF_STALLED_POLL_MS - 1000\) continue;/.test(sb) && /_runningWorkflows\(\) \{ return \[\.\.\.\(this\._workflows\?\.values\(\) \|\| \[\]\)\]\.filter\(\(w\) => !w\.stalled\); \}/.test(sb)
    && /const wfs = this\._runningWorkflows\(\);/.test(sb) && !/this\._workflows\.delete\(runId\); continue; \}\n\s*wf\.agents/.test(sb));
  const route = read('src/routes/sessions.js'), mm = read('src/message-manager.js'), norm = read('src/normalizers.js');
  ok('lane Q: the route asks treeAlive with THIS server\'s clock; a remote answer without NOW judges with no clock (unknown), and its newest mtime includes NMT',
    /const treeLive = treeAlive\(ti, Date\.now\(\)\);/.test(route) && /const now = st\.now \? st\.now \* 1000 : 0;/.test(route) && /Math\.max\(st\.journalMtime \|\| 0, st\.agentMtime \|\| 0, st\.newestMtime \|\| 0\) \* 1000/.test(route)
    && /echo "NMT:\$\( \[ -n "\$D" \] && for f in "\$D"\/\*; do/.test(hosts) && /newestMtime: Number\(grab\('NMT:'\)\) \|\| 0/.test(hosts));
  ok('lane Q: the normalizer names a CARD by any of its keys, stamps aliveAt on task_started / task_progress (now live, the record\'s arrival on replay, nothing in a history conversion), and the rebuild replays each record WITH its persisted `at`',
    /for \(const t of set\) \{ const msgId = this\.taskMsgByTaskId\.get\(t\.id\); if \(msgId\) named\.add\(msgId\); \}/.test(mm) && /for \(const msgId of new Set\(this\.taskMsgByTaskId\.values\(\)\)\)/.test(mm)
    && (mm.match(/const at = this\._taskRecordAt\(emit\); if \(at\)/g) || []).length === 2 && /_taskRecordAt\(emit\) \{ return this\._replayAt != null \? this\._replayAt : \(emit \? Date\.now\(\) : 0\); \}/.test(mm)
    && /for \(const \{ record, at \} of taskReplayRecords\(replay \|\| session\._taskRecords\)\) \{ try \{ mm\.replay\(record, \{ at \}\); \}/.test(norm));
  const kbf = read('docs/kb-file-structure.md'), kbb = read('docs/kb-bugfix-invariants.md');
  ok('lane Q docs: the workflow-disk essay names the tree\'s clock (aliveAt / treeAlive), the replayed-ring case it closes and the TRADE-OFF it accepts; the old "Known limit" sentence is gone; kb-bugfix records the six findings; kb-api states the fresh-tree + no-clock rules',
    /THE TREE HAS A CLOCK/.test(kbf) && /REPLAYED from persisted `taskRecords` after a restart re-proved a run that stalled days ago/.test(kbf) && /TRADE-OFF \(named on purpose\)/.test(kbf)
    && !/Known limit: the stream tree carries no freshness stamp/.test(kbf) && /the set names a CARD, not a key/.test(kbf)
    && /\*\*Lane Q verify \(2026-09-26, six findings, each reproduced red first\)\.\*\*/.test(kbb) && /no `NOW` line ⇒ `liveness:'unknown'`/.test(read('docs/kb-api.md')));
  const ci = read('scripts/ci.mjs');
  ok('ci: test-workflow-disk is in the FAST tier', /\{ name: 'test-workflow-disk', tier: 'fast' \}/.test(ci));
  ok('architecture: src/workflow-disk.js is classified PURE (it imports nothing)', /'src\/workflow-disk\.js'\]\);/.test(read('scripts/test-architecture.mjs')) && !/require\(|^import /m.test(read('src/workflow-disk.js')));
  const kb11 = read('docs/kb-design-lessons.md');
  ok('docs: CLAUDE.md indexes src/workflow-disk.js; kb §11 no longer calls the journal label-less; kb-bugfix names the invariant',
    /src\/workflow-disk\.js — PURE/.test(read('CLAUDE.md')) && !/journal\.jsonl` = the resume cache \(`\{started\|result, key, agentId\}`, live-appended, NO phase\/label\)/.test(kb11) && /started` lines carry `label` \+ `phase`/.test(kb11)
    && /the run dir is the truth when the stream is gone/.test(read('docs/kb-bugfix-invariants.md')));
}

// ── the REAL home is untouched (this process was re-homed before any fixture was written) ──
{
  const after = (() => { try { return fs.readdirSync(REAL_PROJECTS, { withFileTypes: true }); } catch { return []; } })();
  const added = after.filter((d) => !realBefore.has(d.name))
    .map((d) => ({ name: d.name, mtimeMs: (() => { try { return fs.statSync(path.join(REAL_PROJECTS, d.name)).mtimeMs; } catch { return Date.now(); } })() }));
  const lit = fixtureLitter(added);
  ok(`the real ~/.claude/projects gained no fixture entry (${added.length} new from concurrent real sessions, 0 fixtures)`, lit.offenders.length === 0 && !after.some((d) => d.name === path.basename(path.dirname(PROJ))), lit.offenders.slice(0, 3));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
