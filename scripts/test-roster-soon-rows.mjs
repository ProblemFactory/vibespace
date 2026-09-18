#!/usr/bin/env node
// THE TWO-SOONEST HIGHLIGHT NEVER LANDS ON THE POOL ROW (2026-09-18, owner:
// "你会把池账号也算作即将刷新的账号然后 highlight"). The roster marks the two rows
// whose "next reset" countdown is smallest (markSoonRows → .usage-acct-soon,
// 2026-09-15). A POOL row prints its current TARGET's countdown (that is what
// the pool bills right now), so ranking it spent one of the two slots on a
// member that is already listed — the owner's roster lit "全部" (mirroring
// Member M at 4h34m) and one member, and the second-soonest member went dark.
// The rule now skips rows flagged data-pooled; the pool keeps its label.
// Real markSoonRows over a fake list (manage-agents.js imports in node).
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (n, c, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
if (!fs.existsSync(path.join(REPO, 'src/lib/build-version.js'))) { console.error('src/lib/build-version.js is missing — run `npm run build` first'); process.exit(1); }
const { markSoonRows } = await import(path.join(REPO, 'src/lib/manage-agents.js'));

const NOW = Date.parse('2026-09-18T03:00:00Z');
const M = 60 * 1000, H = 60 * M;
// a fake roster row: the label element carries the instant it counts to (data-next-ms), the row carries data-pooled for a pool
const mkRow = (id, { nextMs = null, pooled = false, blocked = false } = {}) => {
  const classes = new Set();
  const lbl = nextMs == null ? null : { dataset: { nextMs: String(nextMs), bucket: '5h', blocked: blocked ? '1' : '' }, title: '' };
  return {
    id, dataset: pooled ? { id, pooled: '1' } : { id },
    classList: { toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); }, contains: (c) => classes.has(c) },
    querySelector: (sel) => (sel === '.acct-usage-next[data-next-ms]' ? lbl : null), lbl,
  };
};
const mkList = (rows) => ({ querySelectorAll: (sel) => (sel === '.acct-key-row' ? rows : []) });
const soon = (rows) => rows.filter((r) => r.classList.contains('usage-acct-soon')).map((r) => r.id);

console.log('— the incident shape');
{
  const rows = [
    mkRow('pool', { nextMs: NOW + 4 * H + 34 * M, pooled: true }), // "全部" → mirrors Member M
    mkRow('memberL', { nextMs: NOW + 2 * H + 4 * M, blocked: true }),
    mkRow('memberM', { nextMs: NOW + 4 * H + 34 * M }),
    mkRow('memberP', { nextMs: NOW + 13 * H + 3 * M }),
    mkRow('memberB', { nextMs: NOW + 5 * 24 * H }),
    mkRow('login', {}),                                            // the machine login: no countdown
  ];
  markSoonRows(mkList(rows), NOW);
  ok('the two soonest MEMBERS light up (L 2h4m, M 4h34m) — the pool row does not', JSON.stringify(soon(rows)) === '["memberL","memberM"]', JSON.stringify(soon(rows)));
  ok('the pool row keeps its countdown label and a plain tooltip (it is not a candidate, it is not unlabelled)', rows[0].lbl.title.length > 0 && !/closest to a reset/.test(rows[0].lbl.title), rows[0].lbl.title);
  ok('a highlighted member\'s tooltip says why', /closest to a reset/.test(rows[1].lbl.title) && /closest to a reset/.test(rows[2].lbl.title));
  ok('a row with no countdown is never marked', !rows[5].classList.contains('usage-acct-soon'));
}
console.log('— NEGATIVE CONTROL: the pre-fix shape (no data-pooled flag) is exactly the bug');
{
  const rows = [mkRow('pool', { nextMs: NOW + 4 * H + 34 * M, pooled: false }), mkRow('memberL', { nextMs: NOW + 2 * H + 4 * M }), mkRow('memberM', { nextMs: NOW + 4 * H + 34 * M }), mkRow('memberP', { nextMs: NOW + 13 * H })];
  markSoonRows(mkList(rows), NOW);
  ok('without the flag the pool takes a slot (L + pool, DOM order) — the control proves the flag is what excludes it', JSON.stringify(soon(rows).sort()) === '["memberL","pool"]', JSON.stringify(soon(rows)));
}
console.log('— edges');
{
  const rows = [mkRow('pool', { nextMs: NOW + 10 * M, pooled: true }), mkRow('only', { nextMs: NOW + 3 * H })];
  markSoonRows(mkList(rows), NOW);
  ok('one member + a pool: only the member is marked (fewer candidates ⇒ mark what exists)', JSON.stringify(soon(rows)) === '["only"]', JSON.stringify(soon(rows)));
  const rows2 = [mkRow('pool', { nextMs: NOW + 10 * M, pooled: true })];
  markSoonRows(mkList(rows2), NOW);
  ok('a pool alone marks nothing', soon(rows2).length === 0);
  const rows3 = [mkRow('a', { nextMs: NOW + 10 * M }), mkRow('b', { nextMs: NOW + 20 * M }), mkRow('c', { nextMs: NOW + 30 * M })];
  markSoonRows(mkList(rows3), NOW);
  markSoonRows(mkList(rows3), NOW + 15 * M); // a's reset has PASSED (label blank) — re-marking drops it
  ok('re-marking after a reset passed moves the highlight on (b, c)', JSON.stringify(soon(rows3)) === '["b","c"]', JSON.stringify(soon(rows3)));
}
console.log('— wiring pins');
{
  const ma = fs.readFileSync(path.join(REPO, 'src/lib/manage-agents.js'), 'utf8');
  ok('BOTH roster row templates (claude, codex) stamp data-pooled on a pool row', (ma.match(/\$\{isPool \? ' data-pooled="1"' : ''\}>/g) || []).length === 2);
  ok('markSoonRows reads the flag off the row and excludes it from the ranking', /pooled: row\.dataset\?\.pooled === '1'/.test(ma) && /r\.next\?\.text && !r\.pooled\)/.test(ma));
  ok('ci.mjs runs this suite', /'test-roster-soon-rows'/.test(fs.readFileSync(path.join(REPO, 'scripts/ci.mjs'), 'utf8')));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
