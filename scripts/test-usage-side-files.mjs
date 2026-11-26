#!/usr/bin/env node
// test-usage-side-files — B-f276 slice s1126 (lane lg-providers, 主开发 r4723): two small usage records UNDER THE STORE-READ LAW, each
// through its REAL module over a scratch data folder of this suite's own. (1) usage-cache/__models__.json, the learned models list:
// its hub writer (src/server/cli-env.js noteModelSeen) and its statusline hook (data/bin/vibespace-usage learnModel, run as a CHILD
// on a scratch cache folder). (2) usage-history/.attrib-emptied.json, the conversations a readings repair emptied: its writer
// (src/reading-repair.js repairAttribution, inside a migration as production runs it) and its reader (src/usage-history.js, the
// re-bake). The unreadable file is a PLACED refusal of the read call (fs.readFileSync answers EIO for that one path: in-process, or
// by a preload in the child), never a mode change; torn bytes are bytes written whole that do not parse. Each RED is the tip's read
// loaded as a copy and run. No vendor call, no real CLI.
import { scratch, anchored } from './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { checker } from './lib/check.mjs';
import { mutantCopies } from './mutant-copy.mjs';

const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const { ok, report } = checker();
const M = mutantCopies('usage-side-files', REPO);
const EIO = () => Object.assign(new Error('EIO: i/o error, read (placed)'), { code: 'EIO' });
const placeReads = (file) => {
  const f = path.resolve(file), realS = fs.readFileSync; const seen = { sync: 0 };
  fs.readFileSync = function (p, ...a) { if (typeof p === 'string' && path.resolve(p) === f) { seen.sync++; throw EIO(); } return realS.call(this, p, ...a); };
  return { seen, restore: () => { fs.readFileSync = realS; } };
};
const said = (fn) => { const out = [], w = console.warn, l = console.log; console.warn = (...a) => out.push(a.join(' ')); console.log = () => { }; try { return { r: fn(), out }; } finally { console.warn = w; console.log = l; } };
let dirN = 0;
const mk = (tag) => { const d = path.join(scratch('usage-side-files'), tag + '-' + (++dirN)); fs.mkdirSync(d, { recursive: true }); return d; };
// the learned models list is THE STORE WRITER's (r5060 (b)): a read of it, or a write of the suite's own over it, first lets what the
// writer owes for it land (its flushSync — as the suites over accounts.json wait for their saves)
const SWR = require(path.join(path.resolve(new URL('..', import.meta.url).pathname), 'src/store-writer.js'));
const landed = (f) => { try { SWR.storeWriter().flushSync([f], { waitedBy: 'test-usage-side-files: the models list read right after a sighting' }); } catch { /* nothing owed */ } };
const bytes = (f) => { landed(f); return fs.readFileSync(f); };
const put = (f, data) => { landed(f); fs.writeFileSync(f, data); };
const asides = (f) => fs.readdirSync(path.dirname(f)).filter((n) => n.startsWith(path.basename(f) + '.corrupt-'));
const TORN = Buffer.from('[{"id":"claude-a-1","label":"A 1"},{"id":"claude-a');
/** a wait on a FACT, bounded; its expiry is a named harness line */
const until = async (fact, what, ms = 5000) => { const end = Date.now() + ms; while (!fact() && Date.now() < end) await new Promise((r) => setTimeout(r, 10)); if (!fact()) ok(false, `THE HARNESS's BOUND (never the product's answer): ${what} within ${ms / 1000} s`); return fact(); };

console.log('§1 the learned models list — the hub writer (src/server/cli-env.js noteModelSeen)');
const CE_SRC = fs.readFileSync(path.join(REPO, 'src/server/cli-env.js'), 'utf8');
const CE = require(path.join(REPO, 'src/server/cli-env.js'));
const envOf = (Mod, root) => { fs.mkdirSync(path.join(root, 'data', 'usage-cache'), { recursive: true }); return Mod.create({ rootDir: root, CLAUDE_CMD_RAW: path.join(root, 'no-claude'), CODEX_CMD_RAW: path.join(root, 'no-codex'), resolveCmd: (c) => c, getOAuthToken: () => { }, usagePollingEnabled: () => false, refreshHarnessModels: () => { }, broadcast: () => { }, getTelemetry: () => null, getPlugins: () => null }); };
const modelsOf = (root) => path.join(root, 'data', 'usage-cache', '__models__.json');
const idsOf = (f) => { landed(f); return JSON.parse(fs.readFileSync(f, 'utf8')).map((m) => m.id); };
{
  const R = mk('hub'), F = modelsOf(R), env = envOf(CE, R);
  env.noteModelSeen('claude-a-1'); env.noteModelSeen('claude-a-2');
  ok(JSON.stringify(idsOf(F)) === '["claude-a-1","claude-a-2"]', 'CONTROL: no file starts the list, a list that parses merges', idsOf(F));
  const b0 = bytes(F);
  const pr = placeReads(F); let s;
  try { s = said(() => { for (const id of ['claude-a-3', 'claude-a-4', 'claude-a-5', 'claude-a-6']) env.noteModelSeen(id); }); } finally { pr.restore(); }
  ok(pr.seen.sync === 1 && !!env.modelsHeld() && bytes(F).equals(b0) && s.out.length === 1 && /could not be read \(EIO\) — held: nothing is written over it/.test(s.out[0]),
    'UNREADABLE (a placed EIO on its read): HELD — nothing written over the list (its bytes byte for byte), said ONCE, and the next three sightings read NOTHING (no read on the loop a record while held)', { reads: pr.seen.sync, out: s.out });
  const lifted = await env.modelsReadAgain();
  ok(lifted === true && !env.modelsHeld() && JSON.stringify(idsOf(F)) === '["claude-a-1","claude-a-2","claude-a-3","claude-a-4","claude-a-5","claude-a-6"]',
    'THE HEAL at the next good read (the hold\'s read again, off the loop): the ids seen while held are merged with the whole list', idsOf(F));
  put(F, TORN);
  const t = said(() => env.noteModelSeen('claude-a-7'));
  ok(bytes(F).equals(TORN) && /did not parse/.test(t.out.join('|')), 'TORN bytes: held, nothing written over them at the read (their bytes byte for byte), said', t.out);
  await until(() => { try { return JSON.stringify(idsOf(F)) === '["claude-a-7"]'; } catch { return false; } }, 'the hold\'s lift from torn bytes (their copy made off the loop, then a fresh list)');
  ok(asides(F).length === 1 && bytes(path.join(path.dirname(F), asides(F)[0])).equals(TORN), 'TORN: kept aside FIRST (the family\'s copy, off the loop), then a fresh list with the waiting id', { ids: idsOf(F), asides: asides(F) });
  env.noteModelSeen('claude-a-1');
  ok(idsOf(F).includes('claude-a-1'), 'after a fresh list the process learns its models again at their next sighting (what it had learned is not taken as written)', idsOf(F));
  put(F, TORN);
  const env2 = envOf(CE, R);
  said(() => env2.noteModelSeen('claude-a-8'));
  await until(() => { try { return idsOf(F).includes('claude-a-8'); } catch { return false; } }, 'a second start\'s lift over the same torn bytes');
  ok(asides(F).length === 1, 'the same torn bytes met again are kept ONCE (their copy found beside the file, none made twice)', asides(F));
  put(F, '');
  const env3 = envOf(CE, R), z = said(() => env3.noteModelSeen('claude-a-9'));
  ok(fs.statSync(F).size === 0 && !!env3.modelsHeld(), 'ZERO BYTES at the read: held, nothing written over them at the read (the hold\'s own two looks decide later)', { size: fs.statSync(F).size, out: z.out });
  // (r5060 (b)) THE HUB's WRITE WHOLE OR NOT AT ALL, OFF THE LOOP: the list is the store writer's (its temp, write and rename on its
  // thread — the writer's own suites hold that law); right after a sighting the newest list is what the writer OWES, the next sighting
  // reads it (never the older file), and it lands whole. Its RED: the release's write in place, a placed half-way write — torn
  const halfWrites = (file) => { const realW = fs.writeFileSync, f = path.resolve(file), seen = { n: 0 };
    fs.writeFileSync = function (q, data, ...x) { if (path.resolve(String(q)) === f && typeof data === 'string') { seen.n++; realW.call(this, q, data.slice(0, data.length >> 1)); throw Object.assign(new Error('EIO (placed, half-way)'), { code: 'EIO' }); } return realW.call(this, q, data, ...x); };
    return { seen, restore: () => { fs.writeFileSync = realW; } }; };
  {
    const R4 = mk('hub-whole'), F4 = modelsOf(R4), env4 = envOf(CE, R4);
    env4.noteModelSeen('claude-w-1'); env4.noteModelSeen('claude-w-2');
    const owedNow = SWR.storeWriter().owed(F4);
    ok(JSON.stringify(idsOf(F4)) === '["claude-w-1","claude-w-2"]' && !fs.readdirSync(path.dirname(F4)).some((n) => n.endsWith('.tmp')), 'THE HUB\'s WRITE IS THE STORE WRITER\'s (r5060 (b)): two sightings in a row — the second read what the first still OWED — land as one whole list, no temp beside it', { owed: owedNow != null, ids: idsOf(F4) });
    const INPLACE = M.load('src/server/cli-env.js', anchored(CE_SRC, "  try { modelsWriter().dirty(modelsFile(), { name: 'models.write', exclusive, onWritten: refused, produce: () => JSON.stringify(_modelsList) }); return true; } catch { return false; }\n", "  try { fs.writeFileSync(modelsFile(), JSON.stringify(list)); return true; } catch { return false; }\n", 'the release write in place'), 'models-inplace-write');
    const R5 = mk('hub-inplace'), F5 = modelsOf(R5), env5 = envOf(INPLACE, R5);
    env5.noteModelSeen('claude-w-1');
    const hw5 = halfWrites(F5); try { env5.noteModelSeen('claude-w-2'); } finally { hw5.restore(); }
    let torn5 = false; try { JSON.parse(fs.readFileSync(F5, 'utf8')); } catch { torn5 = true; }
    ok(hw5.seen.n === 1 && torn5, 'CONTROL (the release\'s write in place, run): a write that dies half-way leaves the list TORN — a reader would meet half a list', fs.readFileSync(F5, 'utf8').slice(0, 60));
  }
  // (r5110) A LIST READ MISSING IS WRITTEN EXCLUSIVELY (the store writer's door): the hook's list appears between the hub's read
  // («missing») and its write's landing — kept as it is, and the refused id is learned again at its next sighting, merged into it.
  // Its RED: the follow's write, not exclusive, lands over the hook's list
  {
    const HOOKS = JSON.stringify([{ id: 'claude-hook-1', label: 'Hook 1' }]);
    const R6 = mk('hub-excl'), F6 = modelsOf(R6), env6 = envOf(CE, R6);
    said(() => env6.noteModelSeen('claude-e-1'));   // the read answered missing: the write owed, exclusive
    fs.writeFileSync(F6, HOOKS);   // the hook's list appears before the hub's write lands (written here directly: no flush first)
    const hb = fs.readFileSync(F6);
    said(() => landed(F6));
    ok(fs.readFileSync(F6).equals(hb), 'A LIST READ MISSING IS WRITTEN EXCLUSIVELY (r5110): the hook\'s list that appeared meanwhile is kept as it is (byte for byte), never written over', fs.readFileSync(F6, 'utf8').slice(0, 80));
    await until(() => { said(() => env6.noteModelSeen('claude-e-1')); try { return idsOf(F6).includes('claude-e-1'); } catch { return false; } }, 'the refused id learned again at a later sighting');
    ok(JSON.stringify(idsOf(F6)) === '["claude-hook-1","claude-e-1"]', '…and the refused id is learned again at its next sighting, merged into the list that appeared', idsOf(F6));
    const NOEX = M.load('src/server/cli-env.js', anchored(CE_SRC, "name: 'models.write', exclusive, onWritten: refused,", "name: 'models.write', onWritten: refused,", 'the follow write, not exclusive'), 'models-not-exclusive');
    const R7 = mk('hub-noexcl'), F7 = modelsOf(R7), env7 = envOf(NOEX, R7);
    said(() => env7.noteModelSeen('claude-e-1'));
    fs.writeFileSync(F7, HOOKS);
    said(() => landed(F7));
    ok(JSON.stringify(JSON.parse(fs.readFileSync(F7, 'utf8')).map((m) => m.id)) === '["claude-e-1"]', 'CONTROL (the follow\'s write, not exclusive, run): it lands over the hook\'s list — the hook\'s id gone', fs.readFileSync(F7, 'utf8').slice(0, 80));
  }
  // THE TIP's read (the RED): a failed or torn read read as an empty list
  const TIP = M.load('src/server/cli-env.js', anchored(CE_SRC, '    const a = SR.storeAnswer(read, { valid: Array.isArray });\n', "    const a = (() => { try { const v = JSON.parse(read.text); return { state: 'data', value: Array.isArray(v) ? v : [] }; } catch { return { state: 'data', value: [] }; } })();\n", 'the tip read'), 'models-tip-read');
  const R2 = mk('hub-tip'), F2 = modelsOf(R2), tip = envOf(TIP, R2);
  tip.noteModelSeen('claude-b-1'); tip.noteModelSeen('claude-b-2');
  landed(F2);   // what the writer owed has landed: the next sighting reads the file
  const p2 = placeReads(F2); try { said(() => tip.noteModelSeen('claude-b-3')); } finally { p2.restore(); }
  ok(JSON.stringify(idsOf(F2)) === '["claude-b-3"]', 'CONTROL (the tip\'s read, run): an unreadable list is written over with ONE id — the two it held gone', idsOf(F2));
}

console.log('§2 the learned models list — the statusline hook (data/bin/vibespace-usage learnModel), run as a child');
const HOOK = path.join(REPO, 'data/bin/vibespace-usage');
const PRELOAD = path.join(mk('preload'), 'eio.cjs');
fs.writeFileSync(PRELOAD, "const fs = require('fs'), path = require('path'); const f = path.resolve(process.env.PLACED_EIO_FILE || '/none'), real = fs.readFileSync;\nfs.readFileSync = function (p, ...a) { if (typeof p === 'string' && path.resolve(p) === f) throw Object.assign(new Error('EIO (placed)'), { code: 'EIO' }); return real.call(this, p, ...a); };\n");
const PRELOAD_HALF = path.join(path.dirname(PRELOAD), 'half.cjs');
fs.writeFileSync(PRELOAD_HALF, "const fs = require('fs'), path = require('path'); const f = path.resolve(process.env.PLACED_HALF_FILE || '/none'), real = fs.readFileSync; let n = 0;\nfs.readFileSync = function (p, ...a) { const b = real.call(this, p, ...a); if (typeof p === 'string' && path.resolve(p) === f && n++ === 0 && Buffer.isBuffer(b)) return b.subarray(0, Math.max(1, b.length >> 1)); return b; };\n");
const runHook = (script, dir, id, mode = null) => {   // mode: 'eio' (a placed EIO on the list's reads) | 'half' (its FIRST read answers half the bytes: a writer mid-write)
  const f = path.join(dir, '__models__.json'), pre = mode === 'eio' ? ['-r', PRELOAD] : mode === 'half' ? ['-r', PRELOAD_HALF] : [];
  const env = { PATH: process.env.PATH, HOME: dir, VS_NO_REAL_CLI: '1', VIBESPACE_USAGE_CACHE: dir, ...(mode === 'eio' ? { PLACED_EIO_FILE: f } : mode === 'half' ? { PLACED_HALF_FILE: f } : {}) };
  return spawnSync(process.execPath, [...pre, script], { input: JSON.stringify({ model: { id, display_name: id } }), env, encoding: 'utf8', timeout: 20000 });
};
{
  const D = mk('hook'), F = path.join(D, '__models__.json');
  runHook(HOOK, D, 'claude-h-1'); runHook(HOOK, D, 'claude-h-2');
  ok(JSON.stringify(idsOf(F)) === '["claude-h-1","claude-h-2"]', 'CONTROL: the hook starts the list and merges into it', idsOf(F));
  const b0 = bytes(F), r = runHook(HOOK, D, 'claude-h-3', 'eio');
  ok(r.status === 0 && bytes(F).equals(b0), 'UNREADABLE (a placed EIO through a preload): the hook writes nothing over the list (its bytes byte for byte)', { status: r.status, err: (r.stderr || '').slice(0, 200) });
  runHook(HOOK, D, 'claude-h-3');
  ok(JSON.stringify(idsOf(F)) === '["claude-h-1","claude-h-2","claude-h-3"]', 'THE HEAL: the next status line that reads merges the id', idsOf(F));
  fs.writeFileSync(F, TORN); runHook(HOOK, D, 'claude-h-4');
  ok(JSON.stringify(idsOf(F)) === '["claude-h-4"]' && asides(F).length === 1 && bytes(path.join(D, asides(F)[0])).equals(TORN) && !fs.readdirSync(D).some((n) => n.endsWith('.part') || n.endsWith('.tmp')), 'TORN (two looks agree): the hook keeps the bytes aside first, written whole under a part name (no part, no temp left), then starts the list', { ids: idsOf(F), asides: asides(F) });
  { const DH = mk('hook-half'), FH = path.join(DH, '__models__.json'); runHook(HOOK, DH, 'claude-k-1'); runHook(HOOK, DH, 'claude-k-2'); const bh = bytes(FH), rh = runHook(HOOK, DH, 'claude-k-3', 'half');
    ok(rh.status === 0 && bytes(FH).equals(bh) && asides(FH).length === 0, 'A HALF READ (r5060 (b): its first read answers half the bytes — a writer mid-write): the second look disagrees, so no answer — nothing set aside, nothing written', { asides: asides(FH) }); }
  fs.writeFileSync(F, ''); const zr = runHook(HOOK, D, 'claude-h-5');
  ok(zr.status === 0 && fs.statSync(F).size === 0, 'ZERO BYTES (a writer mid-write): the hook writes nothing over them (no answer; the next status line reads again)', { size: fs.statSync(F).size });
  const HOOK_SRC = fs.readFileSync(HOOK, 'utf8');
  { const oneLook = path.join(mk('hook-onelook'), 'vibespace-usage');
    fs.writeFileSync(oneLook, anchored(HOOK_SRC, "      if (!again || !again.equals(buf)) return;\n", '', 'the hook judged torn after one read'));
    const DO = mk('hook-onelook-data'), FO = path.join(DO, '__models__.json'); runHook(oneLook, DO, 'claude-l-1'); runHook(oneLook, DO, 'claude-l-2'); runHook(oneLook, DO, 'claude-l-3', 'half');
    ok(JSON.stringify(idsOf(FO)) === '["claude-l-3"]' && asides(FO).length === 1, 'CONTROL (torn after ONE read, run): the same half read is set aside and the list starts again with one id — the hub\'s ids gone', { ids: idsOf(FO), asides: asides(FO) }); }
  const tipHook = path.join(mk('hook-tip'), 'vibespace-usage');
  fs.writeFileSync(tipHook, anchored(HOOK_SRC, "  try { buf = fs.readFileSync(f); } catch (e) { if (!e || e.code !== 'ENOENT') return; }\n", "  try { buf = fs.readFileSync(f); } catch (e) { buf = Buffer.from('[]'); }   // THE TIP: a failed read is an empty list\n", 'the hook tip read'));
  const D2 = mk('hook-tip-data'), F2 = path.join(D2, '__models__.json');
  runHook(tipHook, D2, 'claude-i-1'); runHook(tipHook, D2, 'claude-i-2'); runHook(tipHook, D2, 'claude-i-3', 'eio');
  ok(JSON.stringify(idsOf(F2)) === '["claude-i-3"]', 'CONTROL (the hook\'s tip read, run): an unreadable list is written over with ONE id', idsOf(F2));
}

console.log('§3 the emptied conversations list — its writer (the readings repair, in its migration) and its reader (the re-bake)');
const MR = require(path.join(REPO, 'src/migration-reads.js'));
const { SlotTransitions } = require(path.join(REPO, 'src/slot-transitions.js'));
const RR_SRC = fs.readFileSync(path.join(REPO, 'src/reading-repair.js'), 'utf8'), UH_SRC = fs.readFileSync(path.join(REPO, 'src/usage-history.js'), 'utf8');
const RR = require(path.join(REPO, 'src/reading-repair.js')), UH = require(path.join(REPO, 'src/usage-history.js')).UsageHistory;
const DEAD = 'sub-dead0000', LIVE = 'sub-live0000', WIPE = Date.parse('2026-09-03T05:55:00Z'), AFTER = Date.parse('2026-09-07T06:30:00Z');
const fixture = () => {   // conv-X: its ONLY attribution entry on the dead account (test-readings-attribution §11c's shape)
  const dataDir = path.join(mk('emptied'), 'data');
  for (const p of ['subs/' + DEAD, 'usage-cache', 'usage-history', 'session-meta']) fs.mkdirSync(path.join(dataDir, p), { recursive: true });
  const cp = path.join(dataDir, 'subs', DEAD, '.credentials.json');
  fs.writeFileSync(cp, JSON.stringify({ claudeAiOauth: { accessToken: '', refreshToken: '', expiresAt: 0 } })); fs.utimesSync(cp, WIPE / 1000, WIPE / 1000);
  const hist = path.join(dataDir, 'usage-history');
  fs.writeFileSync(path.join(hist, 'attribution.ndjson'), JSON.stringify({ sid: 'conv-X', acct: DEAD, pool: 'pool-1', ts: AFTER }) + '\n');
  fs.writeFileSync(path.join(hist, 'events-2026-09.ndjson'), JSON.stringify({ ts: AFTER, sid: 'conv-X', acct: DEAD, atype: 'subscription', aname: 'Personal', model: 'm', cost: 1 }) + '\n');
  fs.writeFileSync(path.join(hist, '.attrib-rebake-v1'), '{}');
  fs.writeFileSync(path.join(dataDir, 'session-meta', 'sess-x.json'), JSON.stringify({ claudeSessionId: 'conv-X', accountId: LIVE, backend: 'claude' }));
  return { dataDir, hist, list: path.join(hist, '.attrib-emptied.json'), map: path.join(hist, 'attribution.ndjson'), marker: path.join(hist, '.attrib-rebake-v1'), events: path.join(hist, 'events-2026-09.ndjson') };
};
const repairIn = (Mod, fx) => { try { return { r: said(() => MR.during(() => Mod.repairReadings({ dataDir: fx.dataDir, members: [{ id: DEAD, credsPath: path.join(fx.dataDir, 'subs', DEAD, '.credentials.json') }], transitions: new SlotTransitions({ dataDir: fx.dataDir }), id: 'T-s1126' }), fx.dataDir)).r }; } catch (e) { return { e }; } };
const rebake = (Cls, fx) => said(() => new Cls({ dataDir: fx.dataDir, homeDir: mk('home'), resolveAccount: (id) => (id === LIVE ? { type: 'subscription', name: 'Live' } : null) })._maybeRebakeAttribution());
const xOf = (fx) => fs.readFileSync(fx.events, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).find((e) => e.sid === 'conv-X');
{
  const fx = fixture(); fs.writeFileSync(fx.list, JSON.stringify(['conv-OLD']));
  const was = { list: bytes(fx.list), map: bytes(fx.map) };
  const pr = placeReads(fx.list); let held; try { held = repairIn(RR, fx); } finally { pr.restore(); }
  ok(!!held.e && held.e.code === MR.CODE && bytes(fx.list).equals(was.list) && bytes(fx.map).equals(was.map) && fs.existsSync(fx.marker),
    'WRITER, UNREADABLE (a placed EIO, inside its migration): the repair is «not run» and its attribution part writes NOTHING — the list and the attribution map byte for byte, the re-bake marker kept (the list read FIRST)', { code: held.e && held.e.code, msg: held.e && String(held.e.message).slice(0, 120) });
  const healed = repairIn(RR, fx);
  ok(!healed.e && JSON.stringify(JSON.parse(fs.readFileSync(fx.list, 'utf8'))) === '["conv-OLD","conv-X"]' && !fs.existsSync(fx.marker), 'THE HEAL: the next start\'s run (the read answers) runs the repair WHOLE — the list keeps what it held and names conv-X, the marker cleared for the re-bake', fs.readFileSync(fx.list, 'utf8'));
  const fx2 = fixture(); fs.writeFileSync(fx2.list, TORN); const w2 = bytes(fx2.map);
  const torn = repairIn(RR, fx2);
  ok(!!torn.e && torn.e.code === MR.CODE && /restore it from a copy/.test(String(torn.e.message)) && !/move it aside/i.test(String(torn.e.message)) && bytes(fx2.list).equals(TORN) && bytes(fx2.map).equals(w2) && fs.existsSync(fx2.marker), 'WRITER, TORN bytes: «not run», nothing written — its refusal (r5060 (c)) says the way out that keeps the spend right, «restore it from a copy», never «move it aside» (moved away, it reads as no conversation emptied)', String(torn.e && torn.e.message).slice(0, 200));
  const fxm = fixture(); const wm = bytes(fxm.map);
  const realU = fs.unlinkSync; fs.unlinkSync = function (p, ...x) { if (path.resolve(String(p)) === path.resolve(fxm.marker)) throw Object.assign(new Error('EIO (placed)'), { code: 'EIO' }); return realU.call(this, p, ...x); };
  let um; try { um = repairIn(RR, fxm); } finally { fs.unlinkSync = realU; }
  ok(!!um.e && um.e.code === MR.CODE && bytes(fxm.map).equals(wm) && fs.existsSync(fxm.marker), 'THE HAND-OFF: a marker that cannot be removed (a placed EIO) refuses the repair BEFORE the map is rewritten — «not run», never a done repair whose re-bake never comes', String(um.e && um.e.message).slice(0, 120));
  // the re-bake's reader
  const fx3 = fixture(); repairIn(RR, fx3);
  const p3 = placeReads(fx3.list); let rb; try { rb = rebake(UH, fx3); } finally { p3.restore(); }
  ok(xOf(fx3).acct === DEAD && !fs.existsSync(fx3.marker) && rb.out.some((l) => /re-bake not run/.test(l)), 'READER, UNREADABLE: nothing re-baked, the marker NOT written (no bake onto the refuted account for good), said', { x: xOf(fx3), out: rb.out });
  ok(rb.out.some((l) => /Restore the file from a copy/.test(l)) && !rb.out.some((l) => /move (the file|it) aside/i.test(l)), 'the held words tell the way out that keeps the spend right (restore it) — never «move it aside» (moved away it reads as nothing emptied)', rb.out);
  { const u = new UH({ dataDir: fx3.dataDir, homeDir: mk('home'), resolveAccount: () => null }); const p7 = placeReads(fx3.list); try { said(() => { u._maybeRebakeAttribution(); u._maybeRebakeAttribution(); u._maybeRebakeAttribution(); }); } finally { p7.restore(); }
    ok(p7.seen.sync === 1, 'HELD, the reader is asked again only on its ladder: three scans read the list ONCE (no read a scan while held)', p7.seen.sync); }
  rebake(UH, fx3);
  ok(xOf(fx3).acct === LIVE && fs.existsSync(fx3.marker), 'THE HEAL: the next start re-bakes once the list reads — conv-X onto the account its session was made under', xOf(fx3));
  const fx4 = fixture(); repairIn(RR, fx4); fs.writeFileSync(fx4.list, TORN); rebake(UH, fx4);
  ok(xOf(fx4).acct === DEAD && !fs.existsSync(fx4.marker) && bytes(fx4.list).equals(TORN), 'READER, TORN bytes: nothing re-baked, no marker, the bytes kept as they are', xOf(fx4));
  // THE TIP (the REDS): the list read after the map's rewrite; the reader's failed read an empty list
  const HOIST = RR_SRC.slice(RR_SRC.indexOf('    // (B-f276, lane lg-providers s1126) THE EMPTIED LIST FIRST'), RR_SRC.indexOf("    _appendArchive(archiveDir, 'readings-foreign-attribution.ndjson', archived);"));
  const RR_TIP_TEXT = anchored(anchored(RR_SRC, HOIST, '', 'the list read first, taken out'), '    // (the list itself is read and written FIRST, above — before the archive and the map: B-f276, lane lg-providers s1126; the marker too)\n',
    "    const emptied = [...sidsBefore].filter((sid) => !sidsKept.has(sid));\n    res.emptied = emptied.length;\n    if (emptied.length) {\n      const f = path.join(historyDir, '.attrib-emptied.json');\n      const prev = _readJson(f);\n      const merged = [...new Set([...(Array.isArray(prev) ? prev : []), ...emptied])].slice(-20000);\n      try { _writeAtomic(f, JSON.stringify(merged)); } catch { }\n    }\n    try { fs.unlinkSync(path.join(historyDir, '.attrib-rebake-v1')); } catch { }\n", 'the tip order');
  const RR_TIP = M.load('src/reading-repair.js', RR_TIP_TEXT, 'emptied-tip-order');
  const fx5 = fixture(); fs.writeFileSync(fx5.list, JSON.stringify(['conv-OLD']));
  const p5 = placeReads(fx5.list); try { repairIn(RR_TIP, fx5); } finally { p5.restore(); }
  repairIn(RR_TIP, fx5);
  ok(!JSON.parse(fs.readFileSync(fx5.list, 'utf8')).includes('conv-X') && fs.existsSync(fx5.marker), 'CONTROL (the tip\'s order, run): the map rewritten before the held read, the re-run never names conv-X and never clears the marker — its spend stays on the refuted account', fs.readFileSync(fx5.list, 'utf8'));
  const UH_TIP = M.load('src/usage-history.js', anchored(UH_SRC, "    if (a.state === 'data') return new Set(a.value);\n    if (a.state === 'missing') return new Set();\n    return null;\n", "    return new Set(a.state === 'data' ? a.value : []);\n", 'the tip reader'), 'emptied-tip-reader').UsageHistory;
  const fx6 = fixture(); repairIn(RR, fx6);
  const p6 = placeReads(fx6.list); try { rebake(UH_TIP, fx6); } finally { p6.restore(); }
  ok(xOf(fx6).acct === DEAD && fs.existsSync(fx6.marker), 'CONTROL (the tip\'s reader, run): an unreadable list is an empty one — conv-X baked on the refuted account and the marker written: for good', xOf(fx6));
  // (r5060 (a)) A PLAIN STOP between two steps of the repair (a placed throw: the hub dying there), then the next start's run and its
  // re-bake: every conversation named, nothing counted twice. Its RED: the release's order, stopped after the map's rewrite
  const ARCH = "    _appendArchive(archiveDir, 'readings-foreign-attribution.ndjson', archived);\n", LISTW = '      _writeAtomic(f, JSON.stringify(merged));\n';
  const stopAt = (src, anchor, tag) => M.load('src/reading-repair.js', anchored(src, anchor, anchor + "    throw new Error('A PLACED STOP');\n", tag), tag);
  const evOf = (fx) => fs.readFileSync(fx.events, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((e) => e.sid === 'conv-X');
  for (const [anchor, where] of [[LISTW, 'the list\'s write'], [ARCH, 'the archive\'s append']]) {
    const fx = fixture(); fs.writeFileSync(fx.list, JSON.stringify(['conv-OLD']));
    const stopped = repairIn(stopAt(RR_SRC, anchor, 'stop-after-' + (anchor === ARCH ? 'archive' : 'list')), fx), again = repairIn(RR, fx); rebake(UH, fx);
    const list = JSON.parse(fs.readFileSync(fx.list, 'utf8'));
    ok(!!stopped.e && /A PLACED STOP/.test(stopped.e.message) && !again.e && list.filter((s) => s === 'conv-X').length === 1 && list.includes('conv-OLD') && evOf(fx).length === 1 && evOf(fx)[0].acct === LIVE && fs.existsSync(fx.marker),
      `A PLAIN STOP after ${where} (r5060 (a)), then the next start and its re-bake: conv-X named ONCE, the earlier list kept, its one event on the account its session was made under — nothing counted twice`, { list, ev: evOf(fx) });
  }
  { const fx = fixture(); repairIn(stopAt(RR_SRC, ARCH, 'stop-after-archive-early'), fx); rebake(UH, fx); const early = evOf(fx).map((e) => e.acct); repairIn(RR, fx); rebake(UH, fx);
    ok(evOf(fx).length === 1 && evOf(fx)[0].acct === LIVE && fs.existsSync(fx.marker), 'THE RE-BAKE BEFORE THE NEXT RUN (stopped after the archive: the marker gone, the map not yet emptied): the next run clears the marker again, the re-bake after it puts conv-X right — one event', { early, ev: evOf(fx) }); }
  { const fx = fixture(); fs.writeFileSync(fx.list, JSON.stringify(['conv-OLD']));
    repairIn(stopAt(RR_TIP_TEXT, "    _writeAtomic(fp, out.join('\\n') + (out.length ? '\\n' : ''));\n", 'release-stop-after-map'), fx); repairIn(RR_TIP, fx); rebake(UH, fx);
    ok(!JSON.parse(fs.readFileSync(fx.list, 'utf8')).includes('conv-X') && evOf(fx)[0].acct === DEAD, 'CONTROL (the release\'s order, a plain stop after the map\'s rewrite, run): the next run never names conv-X — its spend stays on the refuted account for good', { list: fs.readFileSync(fx.list, 'utf8'), ev: evOf(fx) }); }
}

console.log('§4 production reads through these doors');
{
  const sr = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  ok(sr('server.js').includes('noteModelSeen: (...a) => noteModelSeen(...a),') && sr('src/server/migrations.js').includes("const rep = repairReadings({ dataDir, members, transitions, id: '2026-09-reattribute-readings-by-slot', journalText });") && sr('src/usage-history.js').includes('    try { this._maybeRebakeAttribution(); } catch (e) {'),
    'PRODUCTION: the hub hands its sessions noteModelSeen, the migration runs the repair, the history runs its re-bake — the roads these legs drive');
}

report();
