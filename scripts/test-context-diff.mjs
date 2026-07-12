#!/usr/bin/env node
// Unit tests for TaskGroupManager.snapshotForDiff / renderContextDiff — the
// diff-based Task Group update injection (2.113.0). Pure store-level tests
// (no server): create a group in a temp data dir, snapshot, mutate, assert
// the rendered delta. Run: node scripts/test-context-diff.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { TaskGroupManager } = require('../src/task-groups.js');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ctxdiff-'));
const mgr = new TaskGroupManager({ dataDir: tmp, onChange: () => {} });

let failed = 0;
function check(name, cond, extra) {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++;
  console.error(`  ✗ ${name}${extra ? `\n    ${extra}` : ''}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const t = mgr.create({ title: '工作', objective: 'Keep the fleet healthy.' });
mgr.update(t.id, { plan: [ { text: 'ship the dashboard', done: false }, { text: 'rotate the keys', done: false, detail: 'all four hosts' } ] });
mgr.addProgress(t.id, { note: 'baseline entry', session: 'claude:aaa' });

console.log('— no change —');
{
  const snap = mgr.snapshotForDiff(t.id);
  const d = mgr.renderContextDiff(t.id, snap, {});
  check('identical state → empty string (skip injection)', d === '', JSON.stringify(d));
  check('unusable snapshot → null (fall back to full)', mgr.renderContextDiff(t.id, { bogus: true }, {}) === null);
}

console.log('— checklist changes —');
{
  const snap = mgr.snapshotForDiff(t.id);
  const plan = mgr.get(t.id).plan.map((p) => ({ ...p }));
  plan.push({ text: 'write the runbook', done: false, addedBy: 'user', addedAt: Date.now() });
  plan[0].done = true; plan[0].by = 'claude:bbb'; plan[0].doneAt = Date.now();
  plan[1].detail = 'all five hosts'; // detail edit
  mgr.update(t.id, { plan });
  const d = mgr.renderContextDiff(t.id, snap, {});
  check('NEW item listed', d.includes('Checklist NEW: [ ] write the runbook') && d.includes('added by user'), d);
  check('CHECKED with by', d.includes('Checklist CHECKED: ship the dashboard') && d.includes('(by claude:bbb)'), d);
  check('detail edit flagged', d.includes('Checklist item detail updated: rotate the keys'), d);
  check('wrapped in vibespace-task-update tag', d.startsWith('<vibespace-task-update>') && d.trimEnd().endsWith('</vibespace-task-update>'), d.slice(0, 80));
  check('unchanged sections absent (no objective/activity noise)', !d.includes('Objective') && !d.includes('New activity'), d);

  const snap2 = mgr.snapshotForDiff(t.id);
  const plan2 = mgr.get(t.id).plan.map((p) => ({ ...p })).filter((p) => p.text !== 'rotate the keys');
  plan2[0].done = false; delete plan2[0].by;
  mgr.update(t.id, { plan: plan2 });
  const d2 = mgr.renderContextDiff(t.id, snap2, {});
  check('REMOVED item listed', d2.includes('Checklist REMOVED: rotate the keys'), d2);
  check('UNCHECKED listed', d2.includes('Checklist UNCHECKED: ship the dashboard'), d2);
}

console.log('— objective / title —');
{
  const snap = mgr.snapshotForDiff(t.id);
  mgr.update(t.id, { title: '工作v2', objective: 'Keep the fleet healthy.\nAnd document it.' });
  const d = mgr.renderContextDiff(t.id, snap, {});
  check('rename listed', d.includes('Renamed: "工作" → "工作v2"'), d);
  check('new objective shown as blockquote', d.includes('Objective UPDATED to:') && d.includes('  > And document it.'), d);

  const snap2 = mgr.snapshotForDiff(t.id);
  mgr.update(t.id, { objective: 'x'.repeat(19000) });
  const d2 = mgr.renderContextDiff(t.id, snap2, {});
  check('huge objective bounded (<5100 bytes total)', Buffer.byteLength(d2, 'utf-8') < 5100, `bytes=${Buffer.byteLength(d2, 'utf-8')}`);
  check('huge objective marked truncated', d2.includes('truncated'), d2.slice(-300));

  const snap3 = mgr.snapshotForDiff(t.id);
  mgr.update(t.id, { objective: '' });
  check('cleared objective says CLEARED', mgr.renderContextDiff(t.id, snap3, {}).includes('Objective CLEARED'));
}

console.log('— activity —');
{
  const snap = mgr.snapshotForDiff(t.id);
  await sleep(3);
  mgr.addProgress(t.id, { note: 'fixed the flaky test', detail: 'root cause was X', session: 'claude:ccc' });
  await sleep(3);
  mgr.addProgress(t.id, { note: 'shipped 2.113.0', session: 'codex:ddd' });
  const d = mgr.renderContextDiff(t.id, snap, {});
  check('both new entries listed, old baseline absent', d.includes('fixed the flaky test') && d.includes('shipped 2.113.0') && !d.includes('baseline entry'), d);
  check('count + detail marker', d.includes('New activity (2)') && d.includes('fixed the flaky test †') && d.includes('† = has detail'), d);
  check('session attribution kept', d.includes('_(codex:ddd)_'), d);
}

console.log('— duplicate-text checklist items (occurrence-indexed pairing) —');
{
  // silent-loss repro: [done, undone] with same text; agent checks the 2nd
  mgr.update(t.id, { plan: [ { text: 'deploy', done: true }, { text: 'deploy', done: false } ] });
  const snap = mgr.snapshotForDiff(t.id);
  mgr.update(t.id, { plan: [ { text: 'deploy', done: true }, { text: 'deploy', done: true, by: 'claude:x' } ] });
  const d = mgr.renderContextDiff(t.id, snap, {});
  check('checking the 2nd duplicate is DELIVERED (was silently lost)', d.includes('Checklist CHECKED: deploy') && d.includes('(by claude:x)'), d);

  // phantom repro: [undone, done] unchanged + unrelated change → no phantom line
  mgr.update(t.id, { plan: [ { text: 'deploy', done: false }, { text: 'deploy', done: true } ] });
  const snap2 = mgr.snapshotForDiff(t.id);
  await sleep(3);
  mgr.addProgress(t.id, { note: 'unrelated note' });
  const d2 = mgr.renderContextDiff(t.id, snap2, {});
  check('unchanged duplicates emit NO phantom CHECKED/UNCHECKED', !d2.includes('Checklist'), d2);

  // extra occurrence added / removed
  const snap3 = mgr.snapshotForDiff(t.id);
  mgr.update(t.id, { plan: [ { text: 'deploy', done: false }, { text: 'deploy', done: true }, { text: 'deploy', done: false } ] });
  const d3 = mgr.renderContextDiff(t.id, snap3, {});
  check('3rd occurrence reads as NEW only', d3.includes('Checklist NEW: [ ] deploy') && !d3.includes('CHECKED') && !d3.includes('REMOVED'), d3);
  mgr.update(t.id, { plan: [ { text: 'ship the dashboard', done: false } ] }); // reset for later sections
}

console.log('— context folder —');
{
  const ctxDir = path.join(tmp, 'ctx'); fs.mkdirSync(ctxDir, { recursive: true });
  const snap = mgr.snapshotForDiff(t.id); // contextDir: null
  mgr.update(t.id, { contextDir: ctxDir });
  const d = mgr.renderContextDiff(t.id, snap, {});
  check('contextDir change → null (fall back to FULL context)', d === null, JSON.stringify(d));

  // file-level diff rides on the signatures agent-routes already tracks
  const snap2 = mgr.snapshotForDiff(t.id);
  const oldSig = 'notes.md:100:1|gone.md:5:1|k8s:tricky:name.md:9:1';
  const newSig = 'notes.md:120:2|new.md:7:1|k8s:tricky:name.md:9:1';
  const d2 = mgr.renderContextDiff(t.id, snap2, { oldSig, newSig });
  check('updated/new/removed files listed', d2.includes(`updated ${ctxDir}/notes.md`) && d2.includes(`new ${ctxDir}/new.md`) && d2.includes(`removed ${ctxDir}/gone.md`), d2);
  check('path containing colons survives sig parse', !d2.includes('tricky'), d2);
  const d3 = mgr.renderContextDiff(t.id, snap2, { oldSig, newSig, ctxBase: '/remote/ctx/T-x' });
  check('ctxBase translates file paths (remote)', d3.includes('updated /remote/ctx/T-x/notes.md'), d3);
  check('remote diff header omits the dead TASK.md pointer', !d3.includes('TASK.md') && d3.includes('show --full'), d3);
  check('local diff header keeps the TASK.md pointer', d2.includes(`${ctxDir}/.vibespace/TASK.md`), d2);
  check('identical sigs → no file section', mgr.renderContextDiff(t.id, snap2, { oldSig, newSig: oldSig }) === '');

  // '|' in a filename: signature escapes it, parse restores it (was: sheared
  // entry → wrong path reported, or a rename silently swallowed)
  fs.writeFileSync(path.join(ctxDir, 'notes|draft.md'), 'x');
  const sigNow = mgr.contextDirSignature(ctxDir);
  check('sig escapes | in filenames', sigNow.includes('notes%7Cdraft.md'), sigNow);
  const d4 = mgr.renderContextDiff(t.id, snap2, { oldSig: '', newSig: sigNow });
  check('pipe filename reported intact (no sheared path)', d4.includes(`new ${ctxDir}/notes|draft.md`) && !d4.includes(`${ctxDir}/draft.md`), d4);
  fs.rmSync(path.join(ctxDir, 'notes|draft.md'));
}

console.log('— multi-group pointers + size cap —');
{
  const snap = mgr.snapshotForDiff(t.id);
  const plan = mgr.get(t.id).plan.map((p) => ({ ...p }));
  plan.push({ text: 'multi test item', done: false });
  mgr.update(t.id, { plan });
  const d = mgr.renderContextDiff(t.id, snap, { multi: true });
  check('multi mode teaches --group in pointer', d.includes(`vibespace-task --group ${t.id} show --full`), d);

  const snap2 = mgr.snapshotForDiff(t.id);
  const plan2 = mgr.get(t.id).plan.map((p) => ({ ...p }));
  for (let i = 0; i < 60; i++) plan2.push({ text: `bulk item ${i} ` + 'y'.repeat(180), done: false });
  mgr.update(t.id, { plan2: undefined, plan: plan2 });
  for (let i = 0; i < 15; i++) mgr.addProgress(t.id, { note: `bulk note ${i} ` + 'z'.repeat(400) });
  const d2 = mgr.renderContextDiff(t.id, snap2, {});
  check('flood capped at ~5KB', Buffer.byteLength(d2, 'utf-8') <= 5200, `bytes=${Buffer.byteLength(d2, 'utf-8')}`);
  check('cap keeps closing tag + overflow pointer', d2.trimEnd().endsWith('</vibespace-task-update>') && /more (checklist changes|lines)/.test(d2), d2.slice(-200));
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall context-diff tests passed');
