#!/usr/bin/env node
// test-readings-writes — B-574d «usage-readings» (主开发 r5072, lane lg-group-parents). TWO HUB STORES OF THE USAGE READINGS NO LONGER
// REPLACE A FILE BY AN UNSYNCED TEMP + RENAME (after a power cut such a file could come back empty or torn). FAST, in-process: each
// site's REAL code over a scratch folder; every fault PLACED (a refused sync or close of the store's own temp) — never a mount, a clock.
//   SL the slot ledger's TRIM (src/slot-transitions.js _maybeTrim — a save bounded to a rare event, past MAX_LINES: synchronous by
//      the rate rule, r4957): the cut half appended to the day's archive shard and SYNCED there first, then the kept half through the
//      door (src/fd-close.js renameSynced).
//      SL1 the trim as it should: the archive holds the first half, the live file the second, nothing lost
//      SL2 an EIO placed at the ARCHIVE's sync: nothing is cut (the live file keeps every line), said once. RED: the release's trim
//          (an anchored copy) asks no sync of the archive and cuts the live file while the half it keeps may not be on disk
//      SL3 an EIO placed at the live temp's sync (the door's): nothing is cut, no temp left. RED: the release's trim renames the
//          unsynced half over the live file
//   HR the usage hold road's SET FILE (src/usage-hold-road.js _dropCompact, _setAsideLive) — replaced OFF the loop through the tree's
//      one door, its asynchronous twin (src/fd-close.js renameSyncedAsync), every step on the road's own queue (_holdIO)
//      HR1 _dropCompact under an EIO placed at its temp's sync, then at its close: the old set stands byte for byte, no temp left;
//          with nothing placed the set is rewritten. RED: the release's compaction (an anchored copy) asks no sync and renames the
//          new set over the old one
//      HR2 _setAsideLive under the same placed EIO: the rewrite fails by its own road (its `rewrite` said), the old set stands
//      HR3 a file system with no sync at all (EINVAL placed at the sync): the set lands, «does not do a sync» said ONCE a run
//      HR4 a rename the folder refuses (placed): the door removes its temp and throws — the old set stands, no temp left
// Run: node scripts/test-readings-writes.mjs
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratchDir, anchored } from './scratch.mjs';
import { checker } from './lib/check.mjs';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { ok, report } = checker();
/** a copy of a product module compiled AS that module's file (its relative requires resolve as the real one's) */
const asModule = (rel, code) => { const abs = path.join(REPO, rel); const m = new Module(abs, null); m.filename = abs; m.paths = Module._nodeModulePaths(path.dirname(abs)); m._compile(code, abs); return m.exports; };
const srcOf = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const bytes = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return null; } };
const eio = (at) => Object.assign(new Error(`a placed EIO at the ${at}`), { code: 'EIO' });
let worldN = 0;
const world = (name) => scratchDir(`rdw-${name}-${++worldN}`);

/** THE PLACED SYNC (or CLOSE), descriptor road: every fd opened on a path `match` admits counts its syncs; `at` answers EIO there */
function placeFd(match, at) {
  const o = fs.openSync, s = fs.fsyncSync, c = fs.closeSync, fds = new Set(), asked = [];
  fs.openSync = function (p, ...a) { const fd = o.call(this, p, ...a); if (typeof p === 'string' && match(p)) fds.add(fd); return fd; };
  fs.fsyncSync = function (fd, ...a) { if (fds.has(fd)) { asked.push(fd); if (at === 'sync') throw eio('sync'); } return s.call(this, fd, ...a); };
  fs.closeSync = function (fd, ...a) { const r = c.call(this, fd, ...a); if (fds.has(fd) && at === 'close') { fds.delete(fd); throw eio('close'); } return r; };
  return { asked, restore: () => { fs.openSync = o; fs.fsyncSync = s; fs.closeSync = c; } };
}
/** THE PLACED SYNC (or CLOSE), handle road (fs.promises.open): the handle's sync() / close() answers EIO for a path `match` admits */
function placeHandle(match, at, code = 'EIO') {
  const o = fs.promises.open, asked = [];
  fs.promises.open = async function (p, ...a) {
    const fh = await o.call(this, p, ...a);
    if (typeof p === 'string' && match(p)) {
      const sync0 = fh.sync.bind(fh), close0 = fh.close.bind(fh);
      fh.sync = async () => { asked.push(p); if (at === 'sync') throw Object.assign(eio('sync'), { code }); return sync0(); };
      fh.close = async () => { await close0(); if (at === 'close') throw eio('close'); };
    }
    return fh;
  };
  return { asked, restore: () => { fs.promises.open = o; } };
}

// ── SL: the slot ledger's trim ─────────────────────────────────────────────────────────────────────────────────────────────────
const SL_REL = 'src/slot-transitions.js';
const SL_RELEASE = "      fs.appendFileSync(out, lines.slice(0, cut).join('\\n') + '\\n');\n      fs.writeFileSync(this.file + '.tmp', lines.slice(cut).join('\\n') + '\\n');\n      fs.renameSync(this.file + '.tmp', this.file);\n    } catch { }\n";   // stale-pins: kept — the release's text: the red control's replacement, never an anchor
const slotRelease = () => { const s = srcOf(SL_REL); const a = s.indexOf("      // B-574d «usage-readings» (主开发 r5072, lane lg-group-parents): THE TRIM IS SYNCED ON BOTH SIDES"), b = s.indexOf("    } catch (e) { sayTrim(`the slot ledger's trim did not happen", a); if (a < 0 || b < 0) throw new Error('ANCHOR GONE «sl-release»: the trim block moved'); const end = s.indexOf('\n', b) + 1; return asModule(SL_REL, anchored(s, s.slice(a, end), SL_RELEASE, 'sl-release')); };
const LINES = Array.from({ length: 10 }, (_, i) => JSON.stringify({ key: `acct-${i}`, to: 'x', at: 1000 + i }));
/** a ledger of 10 lines over a bound of 4, its trim run once under `place` (null: nothing placed) */
function slotScene(M, place, tag) {
  const d = world('slot-' + tag), { SlotTransitions } = M, L = new SlotTransitions({ dataDir: d, max: 4 });
  const live = path.join(d, 'slot-transitions.jsonl'); fs.writeFileSync(live, LINES.join('\n') + '\n');
  const shard = () => { const dir = path.join(d, 'archive'); let n = []; try { n = fs.readdirSync(dir); } catch { } return n.length ? bytes(path.join(dir, n[0])) : null; };
  const w0 = console.warn, said = []; console.warn = (...a) => said.push(a.join(' '));
  const p = place ? placeFd((f) => (place.on === 'archive' ? f.startsWith(path.join(d, 'archive') + path.sep) : f === live + '.tmp'), place.at) : null;
  try { L._st.lines = null; L._maybeTrim(); } finally { if (p) p.restore(); console.warn = w0; }
  const liveNow = (bytes(live) || '').split('\n').filter(Boolean);
  return { liveLines: liveNow.length, liveWhole: liveNow.join('\n') === LINES.join('\n'), archived: (shard() || '').split('\n').filter(Boolean).length, temp: fs.existsSync(live + '.tmp'), asked: p ? p.asked.length : null, said };
}
console.log('SL the slot ledger\'s trim: the archive\'s half synced first, the kept half through the door');
{
  const SL = require(path.join(REPO, SL_REL));
  const g = slotScene(SL, null, 'ok');
  console.log('    facts: ' + JSON.stringify(g));
  ok(g.liveLines === 5 && g.archived === 5 && !g.temp, 'SL1 the trim as it should: the archive holds the cut half (5 lines), the live file the kept half (5), no temp left', g);
  let saidRun = 0;   // the trim's words are said ONCE A RUN (a failing trim is tried again at every record): counted over the scenes
  for (const on of ['archive', 'live']) {
    for (const at of ['sync', 'close']) {
      const t = slotScene(SL, { on, at }, `${on}-${at}`);
      console.log(`    ${on} ${at}: ${JSON.stringify(t)}`);
      saidRun += t.said.filter((l) => /\[slots\] the slot ledger's trim did not happen \(EIO\)/.test(l)).length;
      ok(t.liveWhole && t.asked === 1 && !t.temp,
        `SL${on === 'archive' ? 2 : 3} an EIO placed at the ${on === 'archive' ? 'ARCHIVE shard\'s' : 'live temp\'s'} ${at.toUpperCase()}: nothing is cut — the live file keeps all ten lines, no temp left`, t);
    }
    let red = null, why = null;
    try { red = slotScene(slotRelease(), { on, at: 'sync' }, `${on}-red`); } catch (e) { why = e.message; }
    console.log(`    RED ${on}: ${JSON.stringify(red || why)}`);
    ok(!!red && red.asked === 0 && red.liveLines === 5, `SL${on === 'archive' ? 2 : 3} RED CONTROL: the release's trim asks no sync of the ${on === 'archive' ? 'archive' : 'live temp'} and CUTS the live file to five lines under the same placed EIO`, red || why);
  }
  ok(saidRun === 1, 'SL the failed trims are SAID once a run (four placed failures of the same code: one journal line)', { saidRun });
}

// ── HR: the usage hold road's set file ─────────────────────────────────────────────────────────────────────────────────────────
const HR_REL = 'src/usage-hold-road.js';
const HR_RELEASE = "      else { await this._holdIO('compaction', f, fs.promises.writeFile(f + '.tmp', text)); await this._holdIO('compaction', f, fs.promises.rename(f + '.tmp', f)); h.goneBytes = Buffer.byteLength(text); }\n";   // stale-pins: kept — the release's text: the red control's replacement, never an anchor
const HR_TIP = "      else { await this._replaceSynced(f, text); h.goneBytes = Buffer.byteLength(text); }   // B-574d: synced before its name\n";
/** the road's REAL methods over a stand-in `this` (the mixin's own prototype): its held folder a scratch one */
const standOf = (proto, d) => Object.assign(Object.create(proto), { heldDir: d, holdSlowMs: 60000, _heldUnlink: async (f) => { try { await fs.promises.unlink(f); return true; } catch { return false; } }, _saidAside: function (h, gen, df, a) { this.saidAside = a; } });
const OLD_SET = '{"gone":"old-1"}\n{"gone":"old-2"}\n';
async function holdScene(proto, place, tag, road = 'compact', renameRefused = false) {
  const d = world('hold-' + tag), st = standOf(proto, d), f = st._dropFile('k1', 1);
  fs.writeFileSync(f, OLD_SET);
  const h = { key: 'k1', gen: 1, gone: new Set(['row-a', 'row-b']), below: null, goneBytes: 0, compactAt: 0, goneTorn: false };
  const p = place ? placeHandle((x) => x === f + '.tmp', place.at, place.code) : null;
  const r0 = fs.promises.rename; if (renameRefused) fs.promises.rename = async (a, b) => { if (a === f + '.tmp') throw Object.assign(new Error('a placed refusal of the rename'), { code: 'EACCES' }); return r0(a, b); };
  const w0 = console.warn, said = []; console.warn = (...a) => said.push(a.join(' '));
  try {
    if (road === 'compact') await proto._dropCompact.call(st, h);
    else { st._setAsideFile = async () => ({ copy: true }); await proto._setAsideLive.call(st, h, f, { bad: [1], below: null, retired: false, checked: false }); }
  } finally { if (p) p.restore(); fs.promises.rename = r0; console.warn = w0; }
  return { oldKept: bytes(f) === OLD_SET, now: bytes(f), temp: fs.existsSync(f + '.tmp'), asked: p ? p.asked.length : null, rewrite: st.saidAside ? st.saidAside.rewrite || null : undefined, said };
}
console.log('HR the usage hold road\'s set file: replaced synced, off the loop, on the road\'s own path');
{
  const { UsageHoldRoad } = require(path.join(REPO, HR_REL));
  const P = UsageHoldRoad.prototype;
  const g = await holdScene(P, null, 'ok');
  console.log('    facts: ' + JSON.stringify(g));
  ok(!g.oldKept && /row-a/.test(g.now || '') && !g.temp, 'HR1 with nothing placed the set is rewritten as the set (its gone rows), no temp left', g);
  for (const at of ['sync', 'close']) {
    const t = await holdScene(P, { at }, `compact-${at}`);
    console.log(`    compact ${at}: ${JSON.stringify(t)}`);
    ok(t.oldKept && t.asked === 1 && !t.temp, `HR1 _dropCompact under an EIO placed at its temp's ${at.toUpperCase()}: the OLD set stands byte for byte, no temp left`, t);
  }
  let red = null, why = null;
  try { red = await holdScene(asModule(HR_REL, anchored(srcOf(HR_REL), HR_TIP, HR_RELEASE, 'hr-release')).UsageHoldRoad.prototype, { at: 'sync' }, 'compact-red'); } catch (e) { why = e.message; }
  console.log(`    RED compact: ${JSON.stringify(red || why)}`);
  ok(!!red && red.asked === 0 && !red.oldKept && /row-a/.test(red.now || ''), 'HR1 RED CONTROL: the release\'s compaction asks no sync and renames the new set over the old one under the same placed EIO', red || why);
  const a = await holdScene(P, { at: 'sync' }, 'aside-sync', 'aside');
  console.log(`    aside sync: ${JSON.stringify(a)}`);
  ok(a.oldKept && a.asked === 1 && !a.temp && a.rewrite === 'EIO', 'HR2 _setAsideLive under an EIO placed at its temp\'s sync: the rewrite fails by its own road (its rewrite said, EIO), the old set stands, no temp left', a);
  const n1 = await holdScene(P, { at: 'sync', code: 'EINVAL' }, 'nosync-1'), n2 = await holdScene(P, { at: 'sync', code: 'EINVAL' }, 'nosync-2');
  const noSync = [...n1.said, ...n2.said].filter((l) => /\[usage\] the hold's set file: its file system does not do a sync \(EINVAL\)/.test(l));
  console.log(`    no sync: ${JSON.stringify({ n1: { landed: !n1.oldKept, temp: n1.temp }, n2: { landed: !n2.oldKept, temp: n2.temp }, said: noSync.length })}`);
  ok(!n1.oldKept && /row-a/.test(n1.now || '') && !n1.temp && !n2.oldKept && noSync.length === 1, 'HR3 a file system that does no sync at all (EINVAL placed at the sync): both sets land, «does not do a sync» said ONCE a run (the site\'s name and the code, no path)', { noSync });
  const rr = await holdScene(P, null, 'rename-refused', 'compact', true);
  console.log(`    rename refused: ${JSON.stringify(rr)}`);
  ok(rr.oldKept && !rr.temp, 'HR4 a rename the folder refuses (placed): the door removes its temp and throws — the old set stands, no temp left', rr);
}

report();
