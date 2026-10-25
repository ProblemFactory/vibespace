#!/usr/bin/env node
// Unit tests for TaskGroupManager.snapshotForDiff / renderContextDiff — the
// diff-based Task Group update injection (2.113.0). Pure store-level tests
// (no server): create a group in a temp data dir, snapshot, mutate, assert
// the rendered delta. lane injection-relevance (2.369.353): what a member is
// told first (addressed → group-wide → newest), its own lines counted not
// repeated, every session left out NAMED above the picked lines, others'
// backlog parks as ONE count line, and every cut (the 5000 / 6500 B blocks,
// a full context's cap) dropping the OLDEST lines — each with a RED control of
// the pop-from-the-end it replaced. Run: node scripts/test-context-diff.mjs
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
  // lane injection-relevance F2: no EVENT line (no item text) — only the one count line of what others resolved
  check('unrelated session gets NO backlog event — only the count line of what others did (F2)', !dThird.includes('user will pick a DB later') && !dThird.includes('RESOLVED') && dThird.includes('- Backlog: 1 resolved by others since your last update — `vibespace-task backlog`'), dThird);

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
  const snap = mgr.snapshotForDiff(t.id); // no Context table rows yet
  mgr.update(t.id, { contextDir: ctxDir });
  const d = mgr.renderContextDiff(t.id, snap, {});
  // lane task-group-context: the notes folder is a ROW of the Context table now — designating one re-tells that row at its
  // depth (its listing), so pre-existing files are never left invisible; only a LITE (restored) snapshot falls back to full
  check('contextDir designated → its Context row is re-told (path + listing), not a bare "folder is now X"', typeof d === 'string' && d.includes('Context row ADDED') && d.includes(`${ctxDir}/ — (no note yet) (agents keep the group's shared notes here)`), d);
  check('…a restored LITE snapshot (no row list) still falls back to the FULL context', mgr.renderContextDiff(t.id, { ...snap, ctxRows: undefined }, {}) === null);

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

console.log('— "Clear content…" (2026-09-28): a cleared entry — the injection shows the sentence, the diff says nothing —');
{
  const tmp3 = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ctxclear-'));
  const m = new TaskGroupManager({ dataDir: tmp3, onChange: () => {} });
  const g = m.create({ title: 'clear me', objective: 'obj' });
  m.addProgress(g.id, { note: 'MAILBOX-WORDS in the note', detail: 'and MAILBOX-WORDS in the detail', session: 'claude:s1' });
  m.addProgress(g.id, { note: 'kept entry', session: 'claude:s1' });
  const snap = m.snapshotForDiff(g.id);
  const before = m.renderContext(g.id, { sessionKey: 'claude:s1' });
  const id = m.get(g.id).progress[0].id;
  const r = m.clearProgress(g.id, [id], { by: 'owner' });
  const after = m.renderContext(g.id, { sessionKey: 'claude:s1' });
  check('the full injection before the clear carries the words, after it the sentence and not the words', before.includes('MAILBOX-WORDS') && !after.includes('MAILBOX-WORDS') && after.includes("[cleared at the user's request]") && r.cleared.length === 1, after.slice(-300));
  check('…no "† = has detail" for the cleared entry (its detail went with it)', !/cleared at the user's request\] †/.test(after), '');
  const d = m.diffChanges(g.id, snap, { sessionKey: 'claude:s1' });
  check('a diff from the pre-clear snapshot produces NO update block (a clear is not news to a member agent)', d && d.lines.length === 0 && m.renderContextDiff(g.id, snap, {}) === '', JSON.stringify(d));
  fs.rmSync(tmp3, { recursive: true, force: true });
}

console.log('— relevance first, existence always, a cut drops the oldest (lane injection-relevance) —');
{
  const tmpR = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-ctxrel-'));
  const m = new TaskGroupManager({ dataDir: tmpR, onChange: () => {} });
  const ME = 'claude:7c3e9a51-0000-4000-8000-000000000001', NAME = 'lane alpha-relay';
  const peer = (i) => `claude:${String(i).padStart(8, '0')}-1111-4111-8111-000000000000`;
  // the store's own entries, at strictly rising instants (an update tells what is newer than the snapshot's last line)
  const seed = (id, rows) => {
    const g = m._state.tasks[id];
    let at = Math.max(Date.now(), ((g.progress[g.progress.length - 1] || {}).at || 0) + 1);
    for (const r of rows) g.progress.push({ id: 'P-' + (at++).toString(36), at: at - 1, note: r.note, ...(r.detail ? { detail: r.detail } : {}), session: r.session === undefined ? null : r.session });
    g.contentUpdatedAt = at;
  };
  const sectionOf = (lines) => { const i = lines.findIndex((l) => l.startsWith('- New activity')); return i < 0 ? null : { head: lines[i], rest: lines.slice(i + 1) }; };
  const isDigest = (l) => / logged \d+ more/.test(l) || /^ {2}- … \d+ more from \d+ other session/.test(l);
  const B8 = (t) => Buffer.byteLength(t, 'utf-8');

  const g = m.create({ title: 'relevance', objective: 'obj' });
  seed(g.id, [{ note: 'baseline', session: peer(1) }]);
  m.update(g.id, { backlog: [{ id: 'B-a1a1', text: 'mine', status: 'open', addedBy: ME, claimedBy: [ME] }, { id: 'B-b2b2', text: 'a high one', status: 'open', priority: 'high', addedBy: peer(2), claimedBy: [peer(2)] }] });
  const snap = m.snapshotForDiff(g.id);
  // the OLDEST four are the ones that matter: addressed by its uuid head, by a word of its name, by a backlog id it
  // claims, and a group-wide «blocked»; then 4 of its own lines; then 20 plain lines from 10 sessions, all newer
  seed(g.id, [
    { note: 'review for 7c3e9a51: the pick looks right', session: peer(3) },
    { note: 'alpha-relay: please rebase on the new base', session: peer(4) },
    { note: 'touched B-a1a1 while fixing the census', session: peer(5) },
    { note: 'blocked on the runner image', session: peer(6) },
    ...[0, 1, 2, 3].map((k) => ({ note: `my own step ${k}`, session: ME })),
    ...Array.from({ length: 20 }, (_, k) => ({ note: `plain news ${k} from a busy lane`, session: peer(10 + (k % 10)) })),
  ]);
  const d = m.diffChanges(g.id, snap, { sessionKey: ME, sessionName: NAME });
  const sec = sectionOf(d.lines);
  const digest = sec.rest.filter(isDigest), picked = sec.rest.filter((l) => !isDigest(l));
  check('the header counts every new line, its own, the told, the addressed-first and the rest by session', sec.head === '- New activity (28, 4 of them yours — not repeated) — 8 told (3 addressed to you first), 16 more below by session:', sec.head);
  check('its OWN lines are counted, never repeated', !d.lines.join('\n').includes('my own step'), d.lines.join('\n'));
  check('the lines ADDRESSED to it are told first inside the 8 — by its uuid head, a word of its name, its backlog id — and the group-wide «blocked» next, though they are the OLDEST', ['review for 7c3e9a51', 'alpha-relay: please rebase', 'touched B-a1a1', 'blocked on the runner image'].every((n) => picked.some((l) => l.includes(n))), picked.join('\n'));
  check('…the rest of the 8 is the NEWEST of the others (news 16–19), news 15 not', [16, 17, 18, 19].every((k) => picked.some((l) => l.includes(`plain news ${k} `))) && !picked.some((l) => l.includes('plain news 15 ')) && picked.length === 8, picked.join('\n'));
  const at = (n) => picked.findIndex((l) => l.includes(n));
  check('…printed in TIME order', at('review for') < at('alpha-relay') && at('alpha-relay') < at('touched B-a1a1') && at('blocked on') < at('plain news 16') && at('plain news 16') < at('plain news 19'), picked.join('\n'));
  check('≤ 6 digest lines, one per session left out, + ONE overflow line', digest.length === 7 && digest.slice(0, 6).every((l) => / logged \d+ more/.test(l)) && digest[6] === '  - … 4 more from 4 other sessions', digest.join('\n'));
  check('…newest session first, its count, the first ≤ 48 chars of its newest note left out', digest[0] === `  - ${peer(15)} logged 2 more — newest: "plain news 15 from a busy lane"`, digest[0]);
  check('the digest sits ABOVE the picked lines (existence before text — a cut takes text first)', sec.rest.indexOf(digest[digest.length - 1]) < sec.rest.indexOf(picked[0]), sec.rest.join('\n'));
  check('every left-out line is in the digest\'s counts (8 told + 16 counted = the 24 others)', digest.reduce((n, l) => n + Number((/logged (\d+) more|… (\d+) more/.exec(l) || []).slice(1).find(Boolean)), 0) === 16, digest.join('\n'));
  check('bits stays «N new activity»', d.bits.includes('28 new activity'), JSON.stringify(d.bits));
  check('the result\'s shape stays { lines, bits } (the re-pick rides unenumerated)', JSON.stringify(Object.keys(d)) === '["lines","bits"]' && typeof d.act.pick === 'function', JSON.stringify(Object.keys(d)));
  // only its own lines new ⇒ nothing to tell
  const snapOwn = m.snapshotForDiff(g.id);
  seed(g.id, [{ note: 'my own step 9', session: ME }]);
  check('only its own lines new ⇒ no activity section (an empty update: nothing is news)', m.diffChanges(g.id, snapOwn, { sessionKey: ME }).lines.length === 0, '');
  check('…without a session key (legacy callers) the same line is told', m.renderContextDiff(g.id, snapOwn, {}).includes('my own step 9'), '');

  console.log('  · a line that does not fit is SKIPPED, never a stop');
  const gs = m.create({ title: 'skip', objective: 'o' });
  seed(gs.id, [{ note: 'baseline', session: peer(1) }]);
  const snapS = m.snapshotForDiff(gs.id);
  seed(gs.id, [...[0, 1, 2, 3].map((k) => ({ note: `small ${k}`, session: peer(2) })), ...[0, 1, 2, 3].map((k) => ({ note: `big${k} ` + '大'.repeat(194), session: peer(3) }))]);
  const pS = sectionOf(m.diffChanges(gs.id, snapS, { sessionKey: ME }).lines).rest.filter((l) => !isDigest(l));
  check('three ~660 B lines fill the room, the fourth is skipped, the OLDER short ones still ride (a `break` stopped at three)', pS.filter((l) => / big\d /.test(l)).length === 3 && pS.some((l) => l.includes('small 3')) && !pS.some((l) => l.includes(' big0 ')), pS.join('\n'));

  console.log('  · a 460-line burst');
  const gb = m.create({ title: 'burst', objective: 'o' });
  seed(gb.id, [{ note: 'baseline', session: peer(1) }]);
  const snapB = m.snapshotForDiff(gb.id);
  seed(gb.id, Array.from({ length: 460 }, (_, k) => (k % 23 === 0 ? { note: `my own ${k}`, session: ME } : { note: (k % 3 ? `lane ${k % 12} step ${k} ` : `车道 ${k % 12} 第 ${k} 步 `) + 'detail words '.repeat(k % 5 ? 3 : 20), detail: k % 4 ? undefined : 'more', session: peer(20 + (k % 12)) })));
  const dB = m.diffChanges(gB_id(), snapB, { sessionKey: ME });
  function gB_id() { return gb.id; }
  const blockB = m.renderDiffBlock(gb.id, dB, {});
  const secB = sectionOf(dB.lines);
  const actBytes = B8([secB.head, ...secB.rest].join('\n'));
  check(`a 460-line burst from 12 sessions: the activity section ${actBytes} B ≤ 3 600 B, the block ${B8(blockB)} B ≤ 5 000 B, nothing popped`, actBytes <= 3600 && B8(blockB) <= 5000 && !/more lines/.test(blockB), secB.head);
  check('…every one of the 12 sessions is named or counted (6 digest lines + the overflow)', secB.rest.filter(isDigest).length === 7, secB.rest.filter(isDigest).join('\n'));

  console.log('  · F1: every cut drops the OLDEST (RED controls: the pop from the end it replaced)');
  // the 5000 B block: a smaller cap re-picks the activity — the lowest-ranked, oldest picked line goes
  const told = (text, k) => text.includes(`plain news ${k} from a busy lane _(`);   // a PICKED line (a digest quote ends in a quote mark)
  const full = m.renderDiffBlock(g.id, d, {});
  const capped = m.renderDiffBlock(g.id, d, { cap: B8(full) - 120 });
  check(`renderDiffBlock over its cap (${B8(full)} → ≤ ${B8(full) - 120} B) RE-PICKS: the newest line stays, the oldest plain one goes, the addressed stay, the digest stays, no pointer`, B8(capped) <= B8(full) - 120 && told(capped, 19) && !told(capped, 16) && capped.includes('review for 7c3e9a51') && capped.includes(`${peer(15)} logged 2 more`) && !/more lines/.test(capped), capped);
  const popped = m.renderDiffBlock(g.id, { lines: d.lines, bits: d.bits }, { cap: B8(full) - 120 });
  check('CONTROL (RED): the same block without its re-pick (the pop from the end) loses the NEWEST line', !told(popped, 19) && told(popped, 16), popped.slice(-400));
  // the 6500 B several-groups block: the biggest group re-picked first
  const dS = m.diffChanges(gs.id, snapS, { sessionKey: ME });
  const multiFull = m.renderContextDiffMulti([{ id: g.id, changes: d }, { id: gs.id, changes: dS }]);
  const multiCut = m.renderContextDiffMulti([{ id: g.id, changes: d }, { id: gs.id, changes: dS }], { cap: B8(multiFull) - 700 });
  check(`renderContextDiffMulti over its cap (${B8(multiFull)} → ≤ ${B8(multiFull) - 700} B) RE-PICKS the biggest group's activity: its newest line stays, its oldest goes, no truncation pointer`, B8(multiCut) <= B8(multiFull) - 700 && multiCut.includes(' big3 ') && !multiCut.includes(' big1 ') && !/truncated/.test(multiCut), multiCut.slice(-900));
  const multiPop = m.renderContextDiffMulti([{ id: g.id, changes: { lines: d.lines, bits: d.bits } }, { id: gs.id, changes: { lines: dS.lines, bits: dS.bits } }], { cap: B8(multiFull) - 700 });
  check('CONTROL (RED): without the re-pick the biggest group loses its NEWEST lines', !multiPop.includes(' big3 '), multiPop.slice(-400));
  // a FULL context's cap (the route's fit; capInline's tail cut took the newest)
  const gf = m.create({ title: 'full', objective: 'o' });
  seed(gf.id, Array.from({ length: 12 }, (_, k) => ({ note: `entry ${String(k).padStart(2, '0')} ` + 'w'.repeat(150), session: peer(40) })));
  const ctx0 = m.renderContext(gf.id, {});
  const ctxCap = m.renderContext(gf.id, { cap: B8(ctx0) - 500 });
  check(`renderContext over its cap (${B8(ctx0)} → ≤ ${B8(ctx0) - 500} B) RE-PICKS the log: the newest entry stays, the oldest picked goes, the header still counts them`, B8(ctxCap) <= B8(ctx0) - 500 && ctxCap.includes('entry 11 ') && !ctxCap.includes('entry 00 ') && /## Activity log {2}_\(last \d+ of 12/.test(ctxCap) && ctxCap.trimEnd().endsWith('</vibespace-task-context>'), ctxCap.slice(-600));
  const tailCut = (text, cap) => { let h = Buffer.from(text, 'utf-8').subarray(0, cap).toString('utf-8'); const nl = h.lastIndexOf('\n'); if (nl > cap * 0.5) h = h.slice(0, nl); return h; };   // capInline's cut (src/agent-routes.js)
  check('CONTROL (RED): capInline\'s tail cut of the same context to the same bytes loses the NEWEST entry', !tailCut(ctx0, B8(ctx0) - 500).includes('entry 11 ') && tailCut(ctx0, B8(ctx0) - 500).includes('entry 05 '), '');
  const many = m.renderMultiContext([gf.id, g.id, gb.id], {});
  const manyCap = m.renderMultiContext([gf.id, g.id, gb.id], { cap: B8(many) - 900 });
  const lastNote = (id) => { const p = m.get(id).progress; return p[p.length - 1].note.slice(0, 40); };
  check(`renderMultiContext over its cap (${B8(many)} → ≤ ${B8(many) - 900} B): every group keeps its NEWEST line`, B8(manyCap) <= B8(many) - 900 && [gf.id, g.id, gb.id].every((id) => manyCap.includes(lastNote(id))), manyCap.slice(-700));
  check('CONTROL (RED): the tail cut loses the last group\'s newest line', !tailCut(many, B8(many) - 900).includes(lastNote(gb.id)), '');

  console.log('  · F2: other sessions\' parks — one count line');
  const gk = m.create({ title: 'parks', objective: 'o' });
  seed(gk.id, [{ note: 'baseline', session: peer(1) }]);
  m.update(gk.id, { backlog: [{ id: 'B-c3c3', text: 'old other item', status: 'open', addedBy: peer(2), claimedBy: [peer(2)], addedAt: 1 }, { id: 'B-d4d4', text: 'my item', status: 'open', addedBy: ME, claimedBy: [ME], addedAt: 1 }] });
  const snapK = m.snapshotForDiff(gk.id);
  const blK = () => m.get(gk.id).backlog.map((b) => ({ ...b }));
  m.update(gk.id, { backlog: [...blK().map((b) => (b.id === 'B-c3c3' ? { ...b, status: 'done', resolvedBy: peer(2), resolvedAt: Date.now() } : b)),
    { id: 'B-e5e5', text: 'URGENT-WORDS a high park', status: 'open', priority: 'high', addedBy: peer(3), claimedBy: [peer(3)], addedAt: Date.now() },
    { id: 'B-f6f6', text: 'NORMAL-WORDS a normal park', status: 'open', addedBy: peer(4), claimedBy: [peer(4)], addedAt: Date.now() },
    { id: 'B-a7a7', text: 'MY-NEW-WORDS my own park', status: 'open', addedBy: ME, claimedBy: [ME], addedAt: Date.now() }] });
  const dK = m.diffChanges(gk.id, snapK, { sessionKey: ME });
  const f2 = dK.lines.filter((l) => l.startsWith('- Backlog: '));
  check('others\' parks + resolves since the snapshot: ONE line, the HIGH id named, the rest counted, no item text', f2.length === 1 && f2[0] === '- Backlog: 2 parked (1 HIGH [B-e5e5]), 1 resolved by others since your last update — `vibespace-task backlog`' && !dK.lines.join('\n').includes('URGENT-WORDS') && !dK.lines.join('\n').includes('NORMAL-WORDS') && dK.bits.includes('backlog by others'), dK.lines.join('\n'));
  check('…its OWN park keeps its event line (not counted as others\')', dK.lines.some((l) => l.startsWith('- Backlog PARKED [B-a7a7]: MY-NEW-WORDS')), dK.lines.join('\n'));
  check('…~100 B', B8(f2[0] || '') <= 120, `${B8(f2[0] || '')} B`);
  const snapK2 = m.snapshotForDiff(gk.id);
  seed(gk.id, [{ note: 'quiet turn', session: peer(1) }]);
  check('…only on a turn where it changed (no backlog move ⇒ no line)', !m.diffChanges(gk.id, snapK2, { sessionKey: ME }).lines.some((l) => l.startsWith('- Backlog')), '');
  check('…never without a session key (a legacy caller hears every event already)', !m.diffChanges(gk.id, snapK, {}).lines.some((l) => l.startsWith('- Backlog: ')), '');
  // a restored LITE snapshot (seen-marks keeps only this session's items, `of`): the others' are judged by time
  const lite = { ...snapK2, backlog: snapK2.backlog.filter((b) => b.addedBy === ME), of: ME, lastProgressAt: m.get(gk.id).progress[0].at };
  const tParked = Date.now() + 5;
  m.update(gk.id, { backlog: [...blK(), { id: 'B-b8b8', text: 'after the snapshot', status: 'open', addedBy: peer(5), claimedBy: [peer(5)], addedAt: tParked }] });
  const f2L = m.diffChanges(gk.id, lite, { sessionKey: ME }).lines.filter((l) => l.startsWith('- Backlog: '));
  check('…a restored LITE snapshot counts only what others parked after its last activity line (not every item it does not hold)', f2L.length === 1 && /^- Backlog: \d+ parked /.test(f2L[0]) && !/ 4 parked /.test(f2L[0]), f2L.join('\n'));

  console.log('  · a cleared entry is never quoted');
  const gc = m.create({ title: 'clears', objective: 'o' });
  m.addProgress(gc.id, { note: 'baseline', session: peer(1) });
  const snapC = m.snapshotForDiff(gc.id);
  await sleep(3);
  m.addProgress(gc.id, { note: 'kept older words', session: peer(61) });
  for (let k = 0; k < 9; k++) m.addProgress(gc.id, { note: `kept ${k} news`, session: peer(50 + k) });
  m.addProgress(gc.id, { note: 'SECRET-WORDS the owner cleared', session: peer(60) });
  m.addProgress(gc.id, { note: 'SECRET-WORDS-2 also cleared', session: peer(61) });
  const gp = m.get(gc.id).progress;
  m.clearProgress(gc.id, [gp[gp.length - 2].id, gp[gp.length - 1].id], { by: 'owner' });   // the two SECRET entries
  // the cleared lines rank LAST and the newest 8 kept lines fill the picks, so the digest names peer 60 (only a cleared
  // line left out) and peer 61 (its kept OLDEST line + its cleared newest)
  const secC = sectionOf(m.diffChanges(gc.id, snapC, { sessionKey: ME }).lines);
  const dC = secC.rest.filter(isDigest).join('\n');
  check('a session whose only left-out line was cleared is counted, never quoted; a session\'s cleared newest is skipped for its newest UNCLEARED note', !/SECRET-WORDS/.test(dC) && !/cleared at the user/.test(dC) && dC.includes(`${peer(60)} logged 1 more`) && !new RegExp(`${peer(60)} logged 1 more —`).test(dC) && dC.includes(`${peer(61)} logged 2 more — newest: "kept older words"`), dC);

  console.log('  · the route passes the session\'s name');
  const routes = fs.readFileSync(new URL('../src/agent-routes.js', import.meta.url), 'utf-8');
  check('PIN: prompt-context hands diffChanges the session\'s name', /tasks\.diffChanges\(g\.id, snap, \{ gid: .*, sessionKey: key, sessionName: s\.name \}\)/.test(routes), '');
  fs.rmSync(tmpR, { recursive: true, force: true });
}

fs.rmSync(tmp, { recursive: true, force: true });
if (failed) { console.error(`\n${failed} FAILED`); process.exit(1); }
console.log('\nall context-diff tests passed');
