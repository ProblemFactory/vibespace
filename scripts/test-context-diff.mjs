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
mgr.addProgress(t.id, { note: 'baseline entry', session: 'claude:aaa' });

console.log('— no change —');
{
  const snap = mgr.snapshotForDiff(t.id);
  const d = mgr.renderContextDiff(t.id, snap, {});
  check('identical state → empty string (skip injection)', d === '', JSON.stringify(d));
  check('unusable snapshot → null (fall back to full)', mgr.renderContextDiff(t.id, { bogus: true }, {}) === null);
}

console.log('— removed checklist stays out —');
{
  // checklist removed 2.121.0: a patch carrying `plan` must be IGNORED (old
  // client bundles may still send it) and never appear in any rendering
  const snap = mgr.snapshotForDiff(t.id);
  const contentBefore = mgr.get(t.id).contentUpdatedAt;
  await sleep(3);
  mgr.update(t.id, { plan: [ { text: 'ghost item', done: false } ] });
  const d = mgr.renderContextDiff(t.id, snap, {});
  check('plan patch is a no-op for the diff', d === '', JSON.stringify(d && d.slice(0, 120)));
  check('plan patch does not bump contentUpdatedAt', mgr.get(t.id).contentUpdatedAt === contentBefore, `${mgr.get(t.id).contentUpdatedAt} vs ${contentBefore}`);
  check('plan patch does not write a plan', !mgr.get(t.id).plan, JSON.stringify(mgr.get(t.id).plan));
  check('renderContext has no Checklist section', !mgr.renderContext(t.id).includes('Checklist'), '');
  check('list() carries no plan', mgr.list().every((x) => x.plan === undefined), '');
}

console.log('— backlog (parking lot 2.122.0; claim model 2.123.0) —');
{
  const ME = 'claude:me', OTHER = 'codex:other';
  const snap = mgr.snapshotForDiff(t.id);
  mgr.update(t.id, { backlog: [
    { text: 'user will pick a DB later', status: 'open', addedBy: ME, claimedBy: [ME], addedAt: Date.now(), detail: 'options: pg vs sqlite' },
    { text: 'revisit pricing page', status: 'open', addedBy: OTHER, claimedBy: [OTHER], addedAt: Date.now() },
  ] });
  const items = mgr.get(t.id).backlog;
  check('sanitizer mints stable unique ids', items.every((b) => /^B-[0-9a-f]{4}$/.test(b.id)) && items[0].id !== items[1].id, JSON.stringify(items.map((b) => b.id)));
  const [idA, idB] = [items[0].id, items[1].id];
  // unfiltered diff (no sessionKey — legacy/test callers) carries every event, with ids
  const d = mgr.renderContextDiff(t.id, snap, {});
  check('PARKED items in diff with id + by-attribution', d.includes(`Backlog PARKED [${idA}]: user will pick a DB later †`) && d.includes(`_(by ${ME})_`) && d.includes(`Backlog PARKED [${idB}]: revisit pricing page`), d);

  // injection reminders: CLAIMED items only; others = a one-line pointer
  const ctxMine = mgr.renderContext(t.id, { sessionKey: ME });
  check('claimed items appear as reminders (with id)', ctxMine.includes('Backlog reminders — items CLAIMED by THIS session') && ctxMine.includes(`[${idA}] user will pick a DB later`), ctxMine);
  check('unclaimed-by-me items NOT dumped', !ctxMine.includes('revisit pricing page') && ctxMine.includes('incl. 1 not claimed by you'), ctxMine);
  const ctxOther = mgr.renderContext(t.id, { sessionKey: 'claude:third' });
  check('no claims → one-line pointer teaching backlog-claim', !ctxOther.includes('Backlog reminders') && ctxOther.includes('2 open parked items') && ctxOther.includes('backlog-claim') && !ctxOther.includes('user will pick a DB later'), ctxOther);
  const md = mgr.renderTaskMd(mgr.get(t.id));
  check('TASK.md carries full open backlog with ids + claimants', md.includes('## Backlog') && md.includes(`[${idB}] revisit pricing page`) && md.includes(`claimed by ${OTHER}`), md);

  // TARGETED diff: an item's events reach only its creator/claimants
  const snap2 = mgr.snapshotForDiff(t.id);
  let bl = mgr.get(t.id).backlog.map((b) => ({ ...b }));
  bl[0] = { ...bl[0], status: 'done', resolvedBy: OTHER, resolvedAt: Date.now() };
  mgr.update(t.id, { backlog: bl });
  const dMine = mgr.renderContextDiff(t.id, snap2, { sessionKey: ME });
  check('RESOLVED reaches the claimer (with resolver + id)', dMine.includes(`Backlog RESOLVED [${idA}]: user will pick a DB later`) && dMine.includes(`_(by ${OTHER})_`), dMine);
  const dThird = mgr.renderContextDiff(t.id, snap2, { sessionKey: 'claude:third' });
  check('unrelated session gets NO backlog event (empty diff)', dThird === '', JSON.stringify(dThird && dThird.slice(0, 120)));

  // CLAIMED / UNCLAIMED events notify the other holders
  const snap3 = mgr.snapshotForDiff(t.id);
  bl = mgr.get(t.id).backlog.map((b) => ({ ...b }));
  bl[1] = { ...bl[1], claimedBy: [OTHER, ME] };
  mgr.update(t.id, { backlog: bl });
  const dClaim = mgr.renderContextDiff(t.id, snap3, { sessionKey: OTHER });
  check('CLAIMED event names the new claimer', dClaim.includes(`Backlog CLAIMED [${idB}]: revisit pricing page`) && dClaim.includes(`_(by ${ME})_`), dClaim);

  // text edit with a stable id reads as REWORDED (not REMOVED+NEW)
  const snap4 = mgr.snapshotForDiff(t.id);
  bl = mgr.get(t.id).backlog.map((b) => ({ ...b }));
  bl[1] = { ...bl[1], text: 'revisit pricing page copy' };
  mgr.update(t.id, { backlog: bl });
  const dRw = mgr.renderContextDiff(t.id, snap4, { sessionKey: ME });
  check('id-stable text edit → reworded', dRw.includes(`Backlog item reworded [${idB}]: revisit pricing page copy`) && !dRw.includes('REMOVED') && !dRw.includes('PARKED'), dRw);

  // DROPPED + no phantom lines on unrelated changes
  const snap5 = mgr.snapshotForDiff(t.id);
  bl = mgr.get(t.id).backlog.map((b) => ({ ...b }));
  bl[1] = { ...bl[1], status: 'dropped', resolvedBy: 'user', resolvedAt: Date.now() };
  mgr.update(t.id, { backlog: bl });
  check('DROPPED listed', mgr.renderContextDiff(t.id, snap5, { sessionKey: ME }).includes(`Backlog DROPPED [${idB}]`), '');
  const snap6 = mgr.snapshotForDiff(t.id);
  await sleep(3);
  mgr.addProgress(t.id, { note: 'unrelated note for backlog phantom test' });
  const d6 = mgr.renderContextDiff(t.id, snap6, { sessionKey: ME });
  check('unchanged backlog emits NO phantom lines', !d6.includes('Backlog'), d6);

  mgr.update(t.id, { backlog: [] }); // reset for later sections
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
  await sleep(3);
  mgr.addProgress(t.id, { note: 'multi test entry' });
  const d = mgr.renderContextDiff(t.id, snap, { multi: true });
  check('multi mode teaches --group in pointer', d.includes(`vibespace-task --group ${t.id} show --full`), d);

  // flood every bounded section at once (objective + files list + activity):
  // per-section budgets keep a natural diff under the block cap
  const snap2 = mgr.snapshotForDiff(t.id);
  mgr.update(t.id, { objective: 'o'.repeat(3000) });
  for (let i = 0; i < 15; i++) mgr.addProgress(t.id, { note: `bulk note ${i} ` + 'z'.repeat(400) });
  const manyFiles = Array.from({ length: 20 }, (_, i) => `sub/dir/long-file-name-${i}-${'f'.repeat(80)}.md:10:${i}`).join('|');
  const d2 = mgr.renderContextDiff(t.id, snap2, { oldSig: '', newSig: manyFiles });
  check('flood capped at ~5KB', Buffer.byteLength(d2, 'utf-8') <= 5200, `bytes=${Buffer.byteLength(d2, 'utf-8')}`);
  check('cap keeps closing tag', d2.trimEnd().endsWith('</vibespace-task-update>'), d2.slice(-120));

  // the ~5KB tail-drop itself, exercised directly (a natural diff rarely
  // crosses it now that every section is internally bounded — keep the belt)
  const big = { lines: Array.from({ length: 200 }, (_, i) => `- synthetic change line ${i} ` + 'w'.repeat(60)), bits: [] };
  const d3 = mgr.renderDiffBlock(t.id, big, {});
  check('renderDiffBlock cap trips + overflow pointer', Buffer.byteLength(d3, 'utf-8') <= 5200 && /more lines/.test(d3) && d3.trimEnd().endsWith('</vibespace-task-update>'), `bytes=${Buffer.byteLength(d3, 'utf-8')} tail=${d3.slice(-150)}`);
}

console.log('— legacy checklist → backlog seed (one-time migration) —');
{
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-blmig-'));
  fs.writeFileSync(path.join(tmp2, 'task-groups.json'), JSON.stringify({ version: 1, tasks: { 'T-9': {
    id: 'T-9', title: 'legacy', kind: 'task', archived: false, attention: null, objective: 'obj',
    plan: [ { text: 'done item', done: true }, { text: 'still open item', done: false, detail: 'ctx', addedBy: 'user' } ],
    progress: [], sessions: [], folders: [], contextDir: null, color: null, injectContext: true,
    createdAt: 1, updatedAt: 1, contentUpdatedAt: 1 } } }));
  const m2 = new TaskGroupManager({ dataDir: tmp2, onChange: () => {} });
  const bl = m2.get('T-9').backlog;
  check('unchecked plan items seed the backlog (open, detail kept)', bl.length === 1 && bl[0].text === 'still open item' && bl[0].status === 'open' && bl[0].detail === 'ctx', JSON.stringify(bl));
  check('seeded items get an id; user-added → unclaimed', /^B-[0-9a-f]{4}$/.test(bl[0].id) && Array.isArray(bl[0].claimedBy) && bl[0].claimedBy.length === 0, JSON.stringify(bl[0]));
  check('checked plan items are NOT seeded', !bl.some((b) => b.text === 'done item'), '');
  check('dormant plan untouched by the seed', m2.get('T-9').plan.length === 2, '');
  // a second load must not re-seed (backlog now defined — even if emptied)
  m2.update('T-9', { backlog: [] });
  const m3 = new TaskGroupManager({ dataDir: tmp2, onChange: () => {} });
  check('seed is one-time (empty backlog stays empty on reload)', m3.get('T-9').backlog.length === 0, '');
  fs.rmSync(tmp2, { recursive: true, force: true });
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall context-diff tests passed');
