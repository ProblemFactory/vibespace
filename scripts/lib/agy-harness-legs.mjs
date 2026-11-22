// THE ONE TABLE OF test-agy-harness's LEGS (B-7e49, lane bl-vault, 主开发 r2347). The suite was split by the tier rule (a leg
// that starts a real child is heavy): the descriptor table and the in-process legs stay FAST in scripts/test-agy-harness.mjs
// (⑩ and ⑪ keep their short node children: the capture script 5 times, the wrapper's argv 6 times); the legs that drive the
// REAL data/bin/agy-wrapper.js through a chat over the fake agy run HEAVY in
// scripts/test-agy-harness-wrappers.mjs, moved verbatim. Each section is ONE row here: its heading's id, the file that runs it,
// the marks it prints (and `skippable`: the SKIP lines it may print in place of a mark). BOTH files judge themselves against
// this table at their end (judge): the run printed its own half, in the table's order, and no heading the table lacks; each
// section its marks (a declared SKIP stands in for one); the two sources hold disjoint halves of the headings, whole, and no
// other heading; the marks sum to the suite's 208 before the split (none lost). controls() plants each fault once (its RED).
export const FILES = Object.freeze({ fast: 'scripts/test-agy-harness.mjs', heavy: 'scripts/test-agy-harness-wrappers.mjs' });
export const TOTAL = 208;
export const LEGS = Object.freeze([
  { id: '①', file: 'fast', marks: 16 },
  { id: '①b', file: 'fast', marks: 5 },
  { id: '②', file: 'heavy', marks: 6 },
  { id: '③', file: 'heavy', marks: 3 },
  { id: '④', file: 'heavy', marks: 10 },
  { id: '④b', file: 'heavy', marks: 2 },
  { id: '④c', file: 'heavy', marks: 7 },
  { id: '⑤', file: 'heavy', marks: 3 },
  { id: '⑥', file: 'heavy', marks: 9 },
  { id: '⑥b', file: 'heavy', marks: 7 },
  { id: '⑦', file: 'heavy', marks: 13 },
  { id: '⑦b', file: 'heavy', marks: 2 },
  { id: '⑦c', file: 'heavy', marks: 25 },
  { id: '⑧', file: 'heavy', marks: 4 },
  { id: '⑨', file: 'fast', marks: 16 },
  { id: '⑩', file: 'fast', marks: 10 },
  { id: '⑪', file: 'fast', marks: 6 },
  { id: '⑫', file: 'heavy', marks: 16, skippable: 1 },   // B-0f7b's RED control needs the release b06f36e90 in the clone: a depth-1 checkout (the hosted runner's) SKIPs it by name
  { id: '⑬', file: 'heavy', marks: 9 },
  { id: '⑭', file: 'heavy', marks: 12 },
  { id: '⑮–⑲', file: 'heavy', marks: 27 }
].map((l) => Object.freeze(l)));
const HEAD_RE = /^— (\S+) /;
/** counts each printed mark («  ✓ » / «  ✗ », the suite's ok()) under the last section heading printed («— <id> …») */
export function trackLegs(con = console) {
  const seen = [], marks = new Map(), skips = new Map();
  let cur = null;
  const wrap = (fn) => (...a) => {
    const s = typeof a[0] === 'string' ? a[0] : '';
    const h = HEAD_RE.exec(s);
    if (h) { cur = h[1]; seen.push(cur); if (!marks.has(cur)) marks.set(cur, 0); } else if (cur && /^ {2}[✓✗] /.test(s)) marks.set(cur, marks.get(cur) + 1);
    else if (cur && /^ {2}- SKIP /.test(s)) skips.set(cur, (skips.get(cur) || 0) + 1);
    return fn(...a);
  };
  con.log = wrap(con.log.bind(con));
  con.error = wrap(con.error.bind(con));
  return { seen, marks, skips };
}
const headingIn = (src, id) => String(src).includes(`console.log('— ${id} `);
const headingsOf = (src) => [...String(src).matchAll(/console\.log\('— (\S+) /g)].map((m) => m[1]);
const TABLE_CHECK = 'ⓣ';   // each file's own closing section: no row of the table
/** the rows a file asserts at its end: [name, holds, facts] */
export function judge(half, run, ownSrc, otherSrc, legs = LEGS, total = TOTAL) {
  const other = half === 'fast' ? 'heavy' : 'fast';
  const ids = legs.map((l) => l.id), byId = new Map(legs.map((l) => [l.id, l]));
  const mine = legs.filter((l) => l.file === half).map((l) => l.id), theirs = legs.filter((l) => l.file === other).map((l) => l.id);
  const sum = legs.reduce((s, l) => s + (Number.isInteger(l.marks) ? l.marks : NaN), 0);
  const tableOk = new Set(ids).size === ids.length && legs.every((l) => (l.file === 'fast' || l.file === 'heavy') && (l.skippable === undefined || (Number.isInteger(l.skippable) && l.skippable > 0))) && sum === total;
  const ran = run.seen.filter((id) => id !== TABLE_CHECK);
  const skipsOf = (id) => (run.skips && run.skips.get(id)) || 0;
  const off = mine.filter((id) => { const l = byId.get(id), k = skipsOf(id); return run.marks.get(id) + k !== l.marks || k > (l.skippable || 0); })
    .map((id) => `${id}: printed ${run.marks.has(id) ? run.marks.get(id) : 'none'}${skipsOf(id) ? ` + ${skipsOf(id)} skipped` : ''}, the table ${byId.get(id).marks}${byId.get(id).skippable ? ` (${byId.get(id).skippable} may be skipped)` : ''}`);
  const unknown = [...new Set([...headingsOf(ownSrc), ...headingsOf(otherSrc)])].filter((id) => id !== TABLE_CHECK && !byId.has(id));
  const srcBad = [...mine.filter((id) => !headingIn(ownSrc, id) || headingIn(otherSrc, id)).map((id) => `${id} (this half)`),
    ...theirs.filter((id) => !headingIn(otherSrc, id) || headingIn(ownSrc, id)).map((id) => `${id} (the twin's half)`), ...unknown.map((id) => `${id} (no row of the table)`)];
  return [
    [`THE ONE TABLE: ${ids.length} sections, ids unique, each in one file; its marks sum to ${total}, the suite's before the split (none lost)`, tableOk, { sum, ids }],
    [`this run printed its half (${mine.join(' ')}) in the table's order, and no other heading`, JSON.stringify(ran) === JSON.stringify(mine), ran],
    [`each section of this half printed the table's marks, a declared skip line standing in for one (${mine.length} sections)`, off.length === 0, off],
    ['the two sources hold disjoint halves of the headings, whole: this file every one of its own and none of the twin\'s, the twin every one of its own and none of this file\'s, and neither a heading the table lacks', srcBad.length === 0, srcBad],
  ];
}
/** each fault planted once: every one must turn its row red */
export function controls(half, run, ownSrc, otherSrc, legs = LEGS) {
  const mine = legs.filter((l) => l.file === half).map((l) => l.id), theirs = legs.filter((l) => l.file !== half).map((l) => l.id);
  const held = (rows, i) => rows[i][1];
  const lessOne = legs.map((l, i) => (i ? l : { ...l, marks: l.marks - 1 }));
  const lost = new Map([...run.marks].map(([k, v]) => [k, k === mine[0] ? v - 1 : v]));
  const planted = [
    ['a section\'s marks lowered in the table (the sum off by one)', !held(judge(half, run, ownSrc, otherSrc, lessOne), 0)],
    ['a run that printed one of the twin\'s sections', !held(judge(half, { seen: [...run.seen, theirs[0]], marks: run.marks, skips: run.skips }, ownSrc, otherSrc, legs), 1)],
    ['a section one mark short', !held(judge(half, { seen: run.seen, marks: lost, skips: run.skips }, ownSrc, otherSrc, legs), 2)],
    ['a mark printed as a skip line where the table declares none', !held(judge(half, { seen: run.seen, marks: lost, skips: new Map([...(run.skips || []), [mine[0], 1]]) }, ownSrc, otherSrc, legs), 2)],
    ['a table with an id twice', !held(judge(half, run, ownSrc, otherSrc, [...legs, { ...legs[0], marks: 0 }]), 0)],
    ['a table row whose skippable is no whole number above 0', !held(judge(half, run, ownSrc, otherSrc, legs.map((l, i) => (i ? l : { ...l, skippable: 0 }))), 0)],
    ['a table row naming no file', !held(judge(half, run, ownSrc, otherSrc, legs.map((l, i) => (i ? l : { ...l, file: 'neither' }))), 0)],
    ['a run that printed a heading the table lacks', !held(judge(half, { seen: [...run.seen.slice(0, 1), '⑳', ...run.seen.slice(1)], marks: run.marks, skips: run.skips }, ownSrc, otherSrc, legs), 1)],
    ['a source holding a heading the table lacks', !held(judge(half, run, ownSrc, `${otherSrc}\nconsole.log('— ⑳ new');`, legs), 3)],
    ['the twin holding one of this half\'s headings too (a section in both files)', !held(judge(half, run, ownSrc, `${otherSrc}\nconsole.log('— ${mine[0]} again');`, legs), 3)],
    ['this file missing one of its own headings (a section in neither file)', !held(judge(half, run, String(ownSrc).split(`console.log('— ${mine[0]} `).join("console.log('gone "), otherSrc, legs), 3)],
  ];
  const red = planted.filter(([, r]) => !r).map(([n]) => n);
  return [[`RED CONTROLS of the one table — each planted fault turns its row red: ${planted.map(([n]) => n).join('; ')}`, red.length === 0, red]];
}
