// deferred-save-census.mjs — lane lg-store-writes, B-0248 (主开发 03:00Z: the class becomes a CENSUS, a red test, not a hunt).
// For every store this chain DEFERS (its bytes handed to src/store-writer.js instead of written in place), EVERY CALL SITE of its
// save — found mechanically over server.js, src/*.js, src/server/*.js, src/routes/*.js (acorn, the enclosing scope named as
// scripts/sync-fs-census.mjs names it): the save, the commit, the hand-off, and the marks a tick turns into a save.
//   jobs           src/jobs.js `this._save(` / `this._saveNotifs(` / `this._dirty = true`; elsewhere `<jm>._save(` / `<jm>._saveNotifs(`
//   task-groups    src/task-groups.js `this._save(`; elsewhere `<tasks>._save(`
//   browser-keeper src/server/browser-keeper.js `commit(` / `commitSync(` / `save(` / `saveNow(` / `dirty = true` / `sweepDirty = true`
// (the usage readings left the census with the usage cache's move: 主开发 2026-11-19 08:56Z — their synchronous road is the release's)
// → [{store, file, line, scope, call}] — the census suite (test-deferred-save-census) holds ONE verdict per (store, file, scope, call).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { filesOf, walk, scopeOf } from './sync-fs-census.mjs';

const keyName = (k) => (!k ? '?' : k.type === 'Identifier' ? k.name : k.type === 'Literal' ? String(k.value) : '[computed]');
const objName = (o) => (!o ? '' : o.type === 'ThisExpression' ? 'this' : o.type === 'Identifier' ? o.name : o.type === 'MemberExpression' ? `${objName(o.object)}.${keyName(o.property)}` : '');
const JM_NAMES = /(^|\.)(jm|jobs|jobManager|JM)$/;
const TG_NAMES = /(^|\.)(tasks|tg|taskGroups|tgm)$/;

/** the deferred-save call sites of one file */
export function siteOfFile(repo, rel, { acorn = null, src: given = null } = {}) {
  const A = acorn || createRequire(path.join(repo, 'package.json'))('acorn');
  const src = given !== null ? given : fs.readFileSync(path.join(repo, rel), 'utf8');
  const code = src.replace(/^#!.*/, '');
  const opts = { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, locations: true };
  let ast;
  try { ast = A.parse(code, { ...opts, sourceType: 'script' }); } catch { ast = A.parse(code, { ...opts, sourceType: 'module', allowReturnOutsideFunction: false }); }
  const out = [];
  // the NAMED function a site sits in (scopeOf's last name): its whole text, so a verdict can be checked against the code
  const fnTextOf = (parents) => {
    for (let i = parents.length - 1; i >= 0; i--) {
      const p = parents[i];
      if (p.type === 'FunctionDeclaration' || p.type === 'FunctionExpression' || p.type === 'ArrowFunctionExpression') {
        const up = parents[i - 1];
        const named = p.type === 'FunctionDeclaration' || (up && (up.type === 'MethodDefinition' || up.type === 'Property' || up.type === 'VariableDeclarator' || up.type === 'AssignmentExpression' || (up.type === 'CallExpression' && up.callee && up.callee.type === 'MemberExpression')));
        if (named) return code.slice(p.start, p.end);
      }
    }
    return '';
  };
  const add = (store, n, parents, call) => out.push({ store, file: rel, line: n.loc.start.line, scope: scopeOf(parents), call, fnText: fnTextOf(parents) });
  walk(ast, (n, parents) => {
    if (n.type === 'AssignmentExpression' && n.operator === '=' && n.right && n.right.type === 'Literal' && n.right.value === true) {
      const l = n.left;
      if (rel === 'src/jobs.js' && l.type === 'MemberExpression' && l.object.type === 'ThisExpression' && keyName(l.property) === '_dirty') add('jobs', n, parents, '_dirty = true');
      if (rel === 'src/server/browser-keeper.js' && l.type === 'Identifier' && (l.name === 'dirty' || l.name === 'sweepDirty')) add('browser-keeper', n, parents, `${l.name} = true`);
      return;
    }
    if (n.type !== 'CallExpression') return;
    const c = n.callee;
    if (c.type === 'Identifier') {
      if (rel === 'src/server/browser-keeper.js' && (c.name === 'commit' || c.name === 'commitSync' || c.name === 'save' || c.name === 'saveNow')) add('browser-keeper', n, parents, `${c.name}()`);
      return;
    }
    if (c.type !== 'MemberExpression' || c.computed) return;
    const prop = keyName(c.property), obj = objName(c.object);
    if (prop === '_save' || prop === '_saveNotifs') {
      if (rel === 'src/jobs.js' && obj === 'this') add('jobs', n, parents, `${prop}()`);
      else if (rel === 'src/task-groups.js' && obj === 'this' && prop === '_save') add('task-groups', n, parents, '_save()');
      else if (JM_NAMES.test(obj)) add('jobs', n, parents, `${prop}()`);
      else if (TG_NAMES.test(obj) && prop === '_save') add('task-groups', n, parents, '_save()');
    }
  });
  return out;
}

/** every deferred-save call site of the tree */
export function deferredSaveSites(repo, opts = {}) {
  return filesOf(repo).flatMap((rel) => siteOfFile(repo, rel, opts));
}

const VERDICTS = new Set(['waits', 'rides', 'none', 'sync', 'sync-last']);   // sync-last = «sync, nothing follows» (主开发 2026-11-19 09:18Z): a synchronous save that is the last thing its act does — the release's own behaviour (a failed write is said by the writer's line)
const RIDE_RE = /\b(?:_ride|rideLanding|ride|afterLanding|afterNotifsLanded)\(/;
const SYNC_RE = /\b(?:landNow|_onDisk|_landNow|flushSync|commitSync)\(/;   // (a): no save call is its own landing (saveNow, _saveNotifs left)
// (b) a failure branch TESTS a landing's answer and STOPS what follows
const BRANCH_TEST = /if \(\s*!|\.ok\b|\.landed\b|\(saved\)|\bsaved \?|\blanded \?|\bok \?|\? \{\} :|if \((?:\w*[Ll]anded|commitSync\(\)|saveNow\(\))\)|\breturn (?:this\.)?_?landNow\(|\(\) && landNow\(\)/;   // + a helper that ANSWERS its landing to its caller
const BRANCH_STOP = /\b(?:throw|return)\b|notOnDisk|not_on_disk|not-on-disk|FINISHES|finishes-on-landing|_archOwed\.add|\b_?ride\(|\brideLanding\(/;   // + what follows RIDES the landing
const SUITE_NAMED = /\btest-[a-z0-9][a-z0-9-]*/;   // (e)
const words = (t) => String(t || '').trim().split(/\s+/).filter(Boolean).length;

/** THE CENSUS'S JUDGEMENT of a site list against the rows (test-deferred-save-census holds it) → {missing, dead, bad, wrong} */
export function judgeRows(REPO, sites, rows) {
  const byKey = new Map();
  for (const s of sites) { const k = rowKeyOf(s); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(s); }
  const rowOf = new Map(rows.map((r) => [r.key, r]));
  const missing = [...byKey.keys()].filter((k) => !rowOf.has(k));
  const dead = rows.filter((r) => !byKey.has(r.key)).map((r) => r.key);
  const bad = [], wrong = [];
  for (const r of rows) {
    if (!VERDICTS.has(r.verdict)) { bad.push(`${r.key}: «${r.verdict}» is not a verdict (waits / rides / none / sync / sync-last)`); continue; }
    const why = String(r.why || '').trim();
    if (!why) bad.push(`${r.key}: no why`);
    if (r.verdict === 'none' && why.split(/\s+/).length > 6) bad.push(`${r.key}: «none» says why in six words at most («${why}»)`);
    if (SUITE_NAMED.test(why)) bad.push(`${r.key}: its why borrows a suite's law («${why.match(SUITE_NAMED)[0]}») — (e) a why is the row's own`);
    if (r.verdict === 'rides') {
      if (!words(r.crash) || words(r.crash) > 12) bad.push(`${r.key}: «rides» says why its loss at a crash is harmless (crash, ≤ 12 words) — (c)`);
      if (!words(r.readers) || words(r.readers) > 12) bad.push(`${r.key}: «rides» says why no reader of the same run depends on it (readers, ≤ 12 words) — (c)`);
    }
    if ((r.verdict === 'sync' || r.verdict === 'waits') && (!words(r.stops) || words(r.stops) > 12)) bad.push(`${r.key}: «${r.verdict}» says what its failure branch withholds (stops, ≤ 12 words) — (b)`);
    const s = byKey.get(r.key); if (!s) continue;
    const text = s.map((x) => x.fnText).join('\n');
    if (r.verdict === 'sync' || r.verdict === 'waits') {
      // (b) the failure branch: in the function, or `file:text` — present, testing a landing's answer, stopping what follows
      const spec = String(r.branch || ''), m = /^((?:src\/|server)[^:]*\.js):([\s\S]+)$/.exec(spec);
      const door = r.at ? String(r.at).split(':').slice(1).join(':') : '';   // a waits row's branch may sit IN its waiting door's line
      let hay = ''; try { hay = m ? fs.readFileSync(path.join(REPO, m[1]), 'utf8') : (text.includes(spec) ? text : door); } catch { hay = ''; }
      const b = m ? m[2] : spec, at = spec ? hay.indexOf(b) : -1;
      // the stop is read in the branch's own block: the branch text and what follows it closely (its throw / return / ride)
      const win = at >= 0 ? hay.slice(at, at + b.length + 2500) : '';
      if (at < 0) wrong.push(`${r.key}: «${r.verdict}» names no failure branch the code holds (branch${spec ? `: «${spec.slice(0, 80)}» is not ${m ? 'in ' + m[1] : 'in its function'}` : ' missing'}) — (b)`);
      else if (!BRANCH_TEST.test(b) || !BRANCH_STOP.test(win)) wrong.push(`${r.key}: its failure branch «${b.slice(0, 80)}» ${!BRANCH_TEST.test(b) ? 'tests no landing\'s answer' : 'stops nothing that follows'} — (b)`);
    }
    const atOk = () => { const [f, ...rest] = String(r.at || '').split(':'); const needle = rest.join(':'); try { return !!f && !!needle && fs.readFileSync(path.join(REPO, f), 'utf8').includes(needle); } catch { return false; } };
    if (r.verdict === 'rides' && !(RIDE_RE.test(text) || (r.at && atOk()))) wrong.push(`${r.key}: «rides» but its function has no ride call${r.at ? ` and «${r.at}» is not in the tree` : ''}`);
    if (r.verdict === 'sync-last' && !(SYNC_RE.test(text) || (r.at && atOk()))) wrong.push(`${r.key}: «sync-last» but its function has no synchronous landing`);
    if (r.verdict === 'sync' && !(SYNC_RE.test(text) || (r.at && atOk()))) wrong.push(`${r.key}: «sync» but its function has no synchronous landing${r.at ? ` and «${r.at}» is not in the tree` : ''}`);
    if (r.verdict === 'waits' && !(r.at && atOk())) wrong.push(`${r.key}: «waits» names no door that waits («at»: file:fixed text${r.at ? ` — «${r.at}» is not in the tree` : ''})`);
  }
  return { missing, dead, bad, wrong };
}

/** the census's key of a site: one verdict covers every call of the same kind in one function */
export const rowKeyOf = (s) => `${s.store} · ${s.file} · ${s.scope} · ${s.call}`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const repo = process.argv[2] || process.cwd();
  const all = deferredSaveSites(repo);
  const keys = new Map(); for (const s of all) keys.set(rowKeyOf(s), (keys.get(rowKeyOf(s)) || 0) + 1);
  const by = {}; for (const s of all) by[s.store] = (by[s.store] || 0) + 1;
  const rows = {}; for (const k of keys.keys()) { const st = k.split(' · ')[0]; rows[st] = (rows[st] || 0) + 1; }
  console.log(JSON.stringify({ sites: all.length, byStore: by, rows: keys.size, rowsByStore: rows }));
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify([...keys].map(([k, n]) => ({ key: k, n })), null, 1));
}
