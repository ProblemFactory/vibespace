#!/usr/bin/env node
// test-ledger-readers-census — lane usage-walk-one-folder (2.369.399; the page page-ledger-readers.md, 主开发's GO 03:50Z).
// A transcript folder with two names doubles the usage ledger's rows for the requests both names deliver in one walk
// (the local commit has no set for its own batch). NO NUMBER A PERSON SEES IS WRONG: every figure reads the in-memory
// cache, which keeps the FIRST row of each request id. This suite keeps that true:
//   ① THE 21 READERS (scripts/ledger-reader-census.mjs READERS): each one's function is in its file, its door and its
//      rule about a repeated id are named; exactly one reader counts copies — on purpose (the growth alarm)
//   ② THE SITES: every scope that names the ledger's shards is a row, at its count (a new raw reader is red until it
//      says which reader it is or why it is none); no row without a site
//   ③ THE CACHE: every file that reaches into the cache's internals is a row (it inherits the first-wins rule)
//   ④ THE MEASUREMENT on this tree's own walker and ledger: the same conversation CLEAN and DOUBLED (an alias made, two
//      requests appended) — every reader a person's number comes from answers the same; the alarm's ratio and the dedup
//      job see the copies (on purpose, and truthfully); a remote machine's doubled batch lands once; CONTROL: a reader that
//      sums the shard's raw lines reads the copies
//   ⑤ RED CONTROLS (patched sources, never src/): a new file reading shards, a new scope reading shards in a rowed file,
//      a new file reaching into the cache — each red; a reader row whose function is gone — red
// Run: node scripts/test-ledger-readers-census.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { READERS, SITES, CACHE, DOORS, RULES, scan } from './ledger-reader-census.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d === undefined ? '' : ' — ' + JSON.stringify(d))); } };
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const hasFn = (src, fn) => new RegExp(`(?:function\\s*\\*?\\s*${fn}\\s*\\(|(?:^|[\\s{;])(?:async\\s+)?${fn}\\s*\\([^)]*\\)\\s*\\{|${fn}\\s*[:=]\\s*(?:async\\s*)?(?:\\([^)]*\\)|[a-z]+)\\s*=>)`, 'm').test(src);
const judge = (r, sites = SITES, cache = CACHE) => {
  const want = new Map(sites.map(([k, c]) => [k, c])), red = [];
  for (const [k, c] of r.sites) if (!want.has(k)) red.push(`unrowed ${k} (${c})`); else if (want.get(k) !== c) red.push(`moved ${k}: ${want.get(k)} → ${c}`);
  for (const k of want.keys()) if (!r.sites.has(k)) red.push(`dead row ${k}`);
  const cf = new Set(cache.map(([f]) => f));
  for (const f of r.cache) if (!cf.has(f)) red.push(`unlisted cache reader ${f}`);
  for (const f of cf) if (!r.cache.has(f)) red.push(`dead cache row ${f}`);
  return red;
};

console.log('① the 21 readers');
ok(READERS.length === 21 && READERS.every((x, i) => x.n === i + 1), `21 readers, numbered as the page (${READERS.length})`);
const gone = READERS.filter((x) => { try { return !hasFn(read(x.file), x.fn); } catch { return true; } });
ok(!gone.length, `every reader's function is in its file (${READERS.length - gone.length} of ${READERS.length})`, gone.map((x) => `#${x.n} ${x.file} ${x.fn}`));
ok(READERS.every((x) => DOORS.has(x.door) && RULES[x.rule]), 'every reader names its door and its rule about a repeated request id', READERS.filter((x) => !DOORS.has(x.door) || !RULES[x.rule]).map((x) => x.n));
ok(READERS.filter((x) => x.rule === 'counts-copies').map((x) => x.n).join() === '17', 'exactly one reader counts copies — #17, the growth alarm, on purpose');

console.log('② the sites that name the shards');
const r = scan(REPO);
const red = judge(r);
ok(!red.length, `every scope naming the ledger's shards is a row, at its count (${r.sites.size} scopes over ${r.files} files)`, red);
ok(SITES.every(([, , who]) => typeof who === 'string' ? who.length > 10 : READERS.some((x) => x.n === who)), 'each site row names its reader, or why it is no reader');

console.log('③ the cache\'s readers');
ok([...r.cache].sort().join() === CACHE.map(([f]) => f).sort().join(), `every file reaching into the cache's internals is a row (${[...r.cache].join(', ')})`);
ok(CACHE.every(([, n]) => READERS.some((x) => x.n === n && (x.rule === 'inherits' || x.n === 21 || x.n === 5 || x.n === 19))), 'each is a reader that inherits the first-wins rule (or is it)');

console.log('④ the measurement — this tree\'s walker and ledger, CLEAN and DOUBLED');
{
  const { UsageHistory } = require(path.join(REPO, 'src/usage-history.js'));
  const LD = require(path.join(REPO, 'src/usage-ledger-dedup.js'));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-readers-'));   // (not the fixture prefix: its project names would be skipped)
  const SID = '1b2c3d4e-0000-4000-8000-00000000aaaa', now = Date.now();
  const rec = (i) => JSON.stringify({ type: 'assistant', sessionId: SID, cwd: '/w/proj', requestId: `req_L_${i}`, timestamp: new Date(now - (20 - i) * 60e3).toISOString(),
    message: { id: `msg_L_${i}`, model: 'claude-sonnet-4-5', usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 50, cache_creation: { ephemeral_5m_input_tokens: 70 } } } }) + '\n';
  const build = async (form) => {
    const home = path.join(tmp, form, 'home'), data = path.join(tmp, form, 'data'), P = path.join(home, '.claude', 'projects');
    fs.mkdirSync(path.join(P, '-w-proj'), { recursive: true }); fs.mkdirSync(data, { recursive: true });
    const fp = path.join(P, '-w-proj', SID + '.jsonl'); fs.writeFileSync(fp, rec(1) + rec(2) + rec(3));
    const uh = new UsageHistory({ dataDir: data, homeDir: home });
    await uh.scan({ force: true });
    if (form === 'doubled') fs.symlinkSync(path.join(P, '-w-proj'), path.join(P, '-w-proj-alias'));
    fs.appendFileSync(fp, rec(4) + rec(5));
    await uh.scan({ force: true });
    const shard = fs.readdirSync(uh.dir).filter((x) => /^events-\d{4}-\d{2}\.ndjson$/.test(x)).map((x) => path.join(uh.dir, x))[0];
    return { uh: new UsageHistory({ dataDir: data, homeDir: home }), shard, base: path.join(tmp, form) };
  };
  try {
    const C = await build('clean'), D = await build('doubled');
    const raw = (s) => fs.readFileSync(s, 'utf8').split('\n').filter(Boolean).length;
    ok(raw(C.shard) === 5 && raw(D.shard) === 7, `the premise: the doubled ledger holds the two appended requests twice (${raw(C.shard)} → ${raw(D.shard)} rows)`);
    const tot = (uh) => { const t = uh.aggregate({}).totals; return `${t.requests} · ${Math.round(t.cost * 1e6)}`; };
    const totA = async (uh) => { const t = (await uh.aggregateAsync({})).totals; return `${t.requests} · ${Math.round(t.cost * 1e6)}`; };
    ok(tot(C.uh) === tot(D.uh) && tot(D.uh).startsWith('5 ·'), `#1 aggregate — the Usage window's totals and splits: the same over both (${tot(C.uh)} / ${tot(D.uh)})`);
    ok((await totA(C.uh)) === (await totA(D.uh)), `#1 aggregateAsync — the route's own fold: the same (${await totA(D.uh)})`);
    const e4 = await D.uh.eventForRid('req_L_4');
    ok(!!e4 && e4.rid === 'req_L_4', '#3 eventForRid — the message popup: one event for a doubled request');
    const rows = (uh) => { const c = uh.cacheCensus(); const m = /"count":(\d+)/.exec(JSON.stringify(c)); return m ? Number(m[1]) : -1; };
    ok(rows(C.uh) === 5 && rows(D.uh) === 5, `#9 cacheCensus — Diagnostics: 5 rows in both (${rows(C.uh)} / ${rows(D.uh)})`);
    ok(D.uh.ledgerKnowsId('req_L_5') === true, '#8 ledgerKnowsId: a doubled id is known (a yes/no)');
    const sc = LD.shapeOf(C.shard), sd = LD.shapeOf(D.shard);
    ok(sc.ratio === 1 && sd.ratio > 1 && sd.ratio <= 2, `#17 shapeOf — the growth alarm COUNTS the copies, on purpose (${sc.ratio} → ${Math.round(sd.ratio * 100) / 100}); a pure double never passes its trigger of 2`);
    const copy = path.join(D.base, 'dedup-copy.ndjson'); fs.copyFileSync(D.shard, copy);
    const dd = LD.runNow(LD.dedupSteps(copy, {}));
    ok(dd && dd.removed === 2 && dd.kept === 5, `#16 dedupSteps — the dedup job removes exactly the copies, and says so (${dd && dd.removed} removed, ${dd && dd.kept} kept)`);
    const R = new UsageHistory({ dataDir: path.join(tmp, 'remote', 'data'), homeDir: path.join(tmp, 'remote', 'home') });
    fs.mkdirSync(path.join(tmp, 'remote', 'home', '.claude', 'projects'), { recursive: true });
    const ev = (i) => JSON.stringify({ rid: `req_R_${i}`, mid: `msg_R_${i}`, ts: now - (10 - i) * 60e3, sid: SID, model: 'claude-sonnet-4-5', cwd: '/r/p', origin: 'main', i: 1000, cw5: 70, cw1: 0, cr: 50, o: 200, tier: null });
    const ing = R.ingestRemoteEvents('h1', 'box', [1, 2, 3, 4, 4, 5, 5].map(ev).join('\n') + '\n');
    ok(ing && ing.appended === 5 && ing.duplicates === 2, `#20 a remote machine's doubled batch (7 rows, 5 ids) lands ONCE (${ing && ing.appended} appended, ${ing && ing.duplicates} refused)`);
    ok(raw(D.shard) === 7 && raw(D.shard) !== Number(tot(D.uh).split(' ')[0]), `CONTROL: a reader that summed the shard's raw lines would read ${raw(D.shard)} requests for 5 — what this census exists to keep out`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

console.log('⑤ red controls (patched sources — never the tree)');
{
  const newFile = "'use strict';\nconst fs = require('fs'), path = require('path');\nmodule.exports = (dir) => fs.readdirSync(dir).filter((f) => /^events-\\d{4}-\\d{2}\\.ndjson$/.test(f)).reduce((n, f) => n + fs.readFileSync(path.join(dir, f), 'utf8').split('\\n').length, 0);\n";
  const a = judge(scan(REPO, { patch: { 'src/zz-ledger-sum.js': newFile } }));
  ok(a.some((x) => x.startsWith('unrowed src/zz-ledger-sum.js')), `a NEW file summing the shards' raw lines is red until it is a row (${a[0]})`);
  const uhSrc = read('src/usage-history.js').replace('  ledgerKnowsId(id) {', "  rawCount() { return require('fs').readdirSync(this.dir).filter((f) => /^events-\\d{4}-\\d{2}\\.ndjson$/.test(f)).length; }\n  ledgerKnowsId(id) {");
  const b = judge(scan(REPO, { patch: { 'src/usage-history.js': uhSrc } }));
  ok(b.some((x) => x.includes('«UsageHistory.rawCount»')), `a new scope reading the shards in a rowed file is red (${b[0]})`);
  const cacheFile = "'use strict';\nmodule.exports = (uh) => uh._evCache.events.length;\n";
  const c = judge(scan(REPO, { patch: { 'src/zz-cache-peek.js': cacheFile } }));
  ok(c.some((x) => x === 'unlisted cache reader src/zz-cache-peek.js'), `a new file reaching into the cache's internals is red until it is a row (${c[0]})`);
  ok(!hasFn("function other() {}\n", 'aggregateAsync') && hasFn('  async aggregateAsync(opts = {}) {', 'aggregateAsync') && hasFn('function* dedupSteps(file) {', 'dedupSteps'), 'a reader row whose function is gone is red (the presence check finds a method, an async method, a function, a generator)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
