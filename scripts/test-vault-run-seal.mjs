#!/usr/bin/env node
// test-vault-run-seal — A RUN ENDS WHOLE (⑥b), THE STORE READ (⑥c), THE OWN ROAD (⑪) and THE OWNERSHIP SEAL + TOOL DIGEST + ENV
// ALLOWLIST (⑫, with ⑬ THE HOME CENSUS) of `vibespace-vault run`, moved word for word, in their old order, out of
// test-vault-run (B-54a9 split, 主开发 r3540 / r4355; lane bl-tests-a, 2026-11-25), over the ONE world scripts/vault-run-world.mjs
// that test-vault-run and test-vault-run-grants share.
// The words of the one suite it came from:
// test-vault-run — THE DOOR of `vibespace-vault run` (lane vault-run-door, design q-043 §8 + §5 P0-f): src/server/vault-run-door.js
// over the PURE src/vault-run.js, a REAL vault engine on a scratch dir, the REAL For-you store, and REAL children (a fake
// printer that leaks the value in every form, split across pipe chunks). Fast tier, in-process.
//   ⑥b A RUN ENDS WHOLE (the security review) — a backgrounded child in the group and a setsid'd one that ignores SIGTERM are
//      gone when the run ends, on a lock too; the boot sweep shreds a GONE hub's folder after ending its marked strays and
//      leaves a LIVE hub's alone; a grandchild holding the pipes mid-value never flushes half of it; the store's mark (a
//      non-hex mark reads as empty, never a throw), its generation (a restored older copy = a replay, read as empty),
//      switch-off taking its «always» back; bounded requests; the program on the card (a writable one gets no «always»);
//      the folder's hidden characters; `list` spelling an entry with !'()*
//   ⑪ THE OWN ROAD (lane vault-agent-own — the owner 2026-10-26: 「它自己存的使用为啥还要我的允许？」) — on a CLUSTER (which asks every
//      run of anything else): its own STORED entry runs with no switch, no grant, no card — scrubbed, its run line allowedBy
//      'own', its use line (door run, ok, the receipt); a resumed conversation (a new registered id, its durable one kept)
//      runs it too, a pending fork and another conversation are refused by name; its own MINTED entry runs to its --for host
//      with no card, to ANOTHER host draws ONE card naming both hosts (who stored it, why it asks; no «always») and after one
//      允许 that host runs without a card — until a LOCK ends the pass; ROUND 2: a known tool naming no host it can read
//      (`curl -s`) asks; a BLIND shape (a shell, `node -e`) asks EVERY run on a cluster (one 允许 is not kept), a blind shape
//      «always» is offered for (curl --resolve) passes after «always» + the second password until the lock ends the 8-hour
//      one; a LOCAL instance asks once and then runs that shape with no card; a lock still ends an own run mid-run; a
//      request for it answers `already: 'own'` (no card; a minted one says so and names its host); list names it (by own) to
//      its conversation only; the Vault row has no switch; the owner's entry still draws today's card, now saying who stored
//      it and why it asks
//   ⑬ THE HOME CENSUS (B-f1d3, lane lg-vault-env) — EVERY KNOWN_TOOLS row driven through the REAL door (a capturing spawn),
//      the hub's env carrying every pin's variable at a PLANTED dir: the child's HOME / XDG_* / pins / argv read against the
//      row's TOOL_HOME_SEAL entry; what is still OPEN is pinned BY ROW (a ratchet: a sealed row leaves the list)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { scratchDir, anchored } from './scratch.mjs';   // FIRST after node's own (§113)
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { require, REPO, R, pass, fail, ok, editAnchor, sleep, DOOR, VR, ROOT, SUITE_HOME, SUITE_ENV, M, PW, VALUE, SHORT, BIN, PRINTER, CURL, WCURL, NODE, GHBIN, WSEAL, NOTYET, EventEmitter, leaks, CALLER, world, cardsOf, waitCardOrEnd, waitCard, runAnswered, openRow, ENV, auditOf, runLines, runDirs, alive, SRCD, doorCopy } from './vault-run-world.mjs';   // THE ONE WORLD of the three suites (B-54a9, 主开发 r4355)
console.log('⑥b A RUN ENDS WHOLE; the store\'s mark; the bounds; the program on the card (the security review)');
{
  const w = await world({ killGraceMs: 300 });
  openRow(w);
  const bgPid = path.join(w.work, 'bg.txt'), strayPid = path.join(w.work, 'stray.txt');
  const bg = await runAnswered(w, ENV('bg', bgPid));
  const st = await runAnswered(w, ENV('stray', strayPid));
  const pb = Number(fs.readFileSync(bgPid, 'utf8')), ps = Number(fs.readFileSync(strayPid, 'utf8'));
  await sleep(30);
  const strayLine = runLines(w).filter((x) => x.outcome === 'ran').pop();
  ok(bg.r.ok && st.r.ok && !alive(pb) && !alive(ps) && strayLine.strays >= 1, 'a child left behind in the run\'s group, and one in its OWN session deaf to SIGTERM (it carried the run\'s mark), are both GONE when the run ends — the audit counts the stray', { bg: alive(pb), stray: alive(ps), strays: strayLine.strays });
  // on a lock: the setsid'd stray of a run still running
  const lw = await world({ killGraceMs: 300 });
  openRow(lw);
  const p2 = path.join(lw.work, 'stray2.txt'), hold = path.join(lw.work, 'hold.txt');
  const run = runAnswered(lw, ['--env', 'T=vault://mounts/m1/secretKey', '--', NODE, '-e', `const k=require('child_process').spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});require('fs').writeFileSync(${JSON.stringify(p2)},String(k.pid));k.unref();require('fs').writeFileSync(${JSON.stringify(hold)},'1');setInterval(()=>{},1000)`]);
  for (let i = 0; i < 300 && !fs.existsSync(hold); i++) await sleep(10);
  const sp = Number(fs.readFileSync(p2, 'utf8'));
  ok(alive(sp) && runDirs(lw).length === 1, 'a run whose child left a stray in its own session runs');
  lw.vault.lock('door');
  const dirsAtLock = runDirs(lw).length;
  const lr = (await run).r;
  // the stray is SIGKILLed before the answer; its REAPING is its new parent's (the user's systemd) a moment later — measured:
  // state R, parent systemd, gone ≤ 10 ms; checked at once it read alive 2 runs in 5 on the base. A bounded wait (as the leg
  // above sleeps 30 ms): a stray never killed (deaf to SIGTERM, an endless timer) is still alive after it ⇒ still RED
  for (let i = 0; i < 200 && alive(sp); i++) await sleep(10);
  ok(lr.code === 'vault_locked' && !alive(sp) && dirsAtLock === 0, 'a LOCK: the run\'s files are shredded AT ONCE, its child and the stray in its own session (deaf to SIGTERM) are gone, the answer vault_locked', { code: lr.code, stray: alive(sp), dirsAtLock });
  // a grandchild holding the pipes mid-value: cut after 2 s — half a value never flushed
  const hw = await world();
  openRow(hw);
  const ph = await runAnswered(hw, ENV('pipehold'));
  ok(ph.r.ok && hw.timerLog.includes(300) && !(ph.r.stdout || '').includes(VALUE.slice(0, 10)) && !leaks(ph.r.stdout, VALUE).length, 'a grandchild in its own session holds the pipes and prints HALF the value: the pipes are cut a grace after the child\'s exit (2 s; 300 ms here) and the held half is DROPPED, never flushed', JSON.stringify(ph.r.stdout));
  // THE BOOT SWEEP: a GONE hub's folder (its marked stray ended, its files shredded); a LIVE hub's folder kept
  const sw = await world();
  const deadHub = require('child_process').spawnSync(NODE, ['-e', 'console.log(JSON.stringify(require(' + JSON.stringify(path.join(REPO, 'src/proc-identity.js')) + ').identityOf(process.pid)))'], { encoding: 'utf8' });
  const deadId = JSON.parse(deadHub.stdout);
  const liveKid = require('child_process').spawn(NODE, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  const liveId = R('src/proc-identity.js').identityOf(liveKid.pid);
  const mkRunDir = (name, owner) => { const d = path.join(sw.runRoot, name); fs.mkdirSync(d, { mode: 0o700 }); fs.writeFileSync(path.join(d, DOOR.OWNER_FILE), JSON.stringify(owner)); fs.writeFileSync(path.join(d, 'f0'), VALUE, { mode: 0o600 }); return d; };
  const gone = mkRunDir(DOOR.RUN_DIR_PREFIX + 'gone01', deadId), kept = mkRunDir(DOOR.RUN_DIR_PREFIX + 'live01', liveId);
  const orphan = require('child_process').spawn(NODE, ['-e', 'process.on("SIGTERM",()=>{}); setInterval(()=>{},1000)'], { env: { ...process.env, [DOOR.MARK_ENV]: DOOR.RUN_DIR_PREFIX + 'gone01' }, stdio: 'ignore', detached: true });
  await sleep(80);
  const n = sw.door.sweep();
  await sleep(30);
  ok(n === 1 && !fs.existsSync(gone) && fs.existsSync(kept) && fs.existsSync(path.join(kept, 'f0')) && !alive(orphan.pid), 'the BOOT SWEEP: the folder of a hub that is GONE is shredded after its marked orphan child (deaf to SIGTERM) is ended; the folder of a hub that LIVES (another hub on the box) is never touched', { n, gone: fs.existsSync(gone), kept: fs.existsSync(kept), orphan: alive(orphan.pid) });
  // r1436 — THE SHRED's OVERWRITE IS BOUNDED (it runs on the loop): a dead owner's folder holding the door's value file and a file
  // over SHRED_OVERWRITE_MAX that the run's program left — the value is OVERWRITTEN before its unlink, the big file unlinked AS IT IS
  // (a second name of each, made before the sweep, reads the difference); RED: a copy without the bound overwrites the big file too
  {
    const boundOf = async (doorMod, tag) => {
      const bw = await world({ doorMod });
      const d = path.join(bw.runRoot, DOOR.RUN_DIR_PREFIX + tag); fs.mkdirSync(d, { mode: 0o700 });
      fs.writeFileSync(path.join(d, DOOR.OWNER_FILE), JSON.stringify(deadId));
      fs.writeFileSync(path.join(d, 'f0'), VALUE, { mode: 0o600 });
      const big = Buffer.alloc(DOOR.SHRED_OVERWRITE_MAX + 1, 0x61);
      fs.writeFileSync(path.join(d, 'left.bin'), big, { mode: 0o600 });
      const l0 = path.join(bw.runRoot, '..', tag + '-f0.link'), l1 = path.join(bw.runRoot, '..', tag + '-big.link');
      fs.linkSync(path.join(d, 'f0'), l0); fs.linkSync(path.join(d, 'left.bin'), l1);
      const n = bw.door.sweep();
      const v = fs.readFileSync(l0), b = fs.readFileSync(l1);
      fs.unlinkSync(l0); fs.unlinkSync(l1);
      return { n, gone: !fs.existsSync(d), valueOverwritten: v.length === Buffer.byteLength(VALUE) && v.toString() !== VALUE, bigAsIs: b.equals(big) };
    };
    const bd = await boundOf(DOOR, 'bound01');
    const DSRC = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const NB = M.load('src/server/vault-run-door.js', anchored(DSRC, '    if (st.isFile() && st.size > 0 && st.size <= SHRED_OVERWRITE_MAX) {', '    if (st.isFile() && st.size > 0) {', 'test-vault-run r1436 no bound'), 'r1436-nobound');   // the control writes the unbounded shred back on purpose — stale-pins: kept
    const bdc = await boundOf(NB, 'bound02');
    ok(bd.n === 1 && bd.gone && bd.valueOverwritten && bd.bigAsIs, `r1436: the shred's overwrite is BOUNDED — the door's value file is overwritten before its unlink, a file over ${DOOR.SHRED_OVERWRITE_MAX} bytes the run's program left is unlinked as it is (the folder gone)`, bd);
    ok(bdc.gone && bdc.valueOverwritten && !bdc.bigAsIs, 'CONTROL a copy without the bound: the big file is overwritten on the loop too — the leg above can tell', bdc);
  }
  // r1152 — A SWEEP REMOVES ONLY WHAT IT CAN PROVE IS ITS OWN DEAD THING: a folder of the door's name that carries NO owner mark
  // is not the door's to judge (another program's, a suite's scratch, a second hub's before its mark) — LEFT, its file untouched;
  // beside it a MARKED folder of a dead owner is still shredded and a live one's kept (the plant proves itself before the sweep)
  const unmarked = path.join(sw.runRoot, DOOR.RUN_DIR_PREFIX + 'nomark01'); fs.mkdirSync(unmarked, { mode: 0o700 }); fs.writeFileSync(path.join(unmarked, 'f0'), 'not the door\'s');
  const gone2 = mkRunDir(DOOR.RUN_DIR_PREFIX + 'gone02', deadId);
  const planted = fs.existsSync(path.join(unmarked, 'f0')) && !fs.existsSync(path.join(unmarked, DOOR.OWNER_FILE)) && fs.existsSync(path.join(gone2, DOOR.OWNER_FILE));
  const n2 = sw.door.sweep();
  ok(planted && n2 === 1 && fs.existsSync(unmarked) && fs.readFileSync(path.join(unmarked, 'f0'), 'utf8') === 'not the door\'s' && !fs.existsSync(gone2) && fs.existsSync(kept),
    'r1152: the sweep removes only what it can PROVE is its own dead thing — a folder of its name with NO owner mark is LEFT (its file untouched); a marked folder of a dead owner is shredded; a live owner\'s is kept', { planted, n2, unmarked: fs.existsSync(unmarked), gone2: fs.existsSync(gone2), kept: fs.existsSync(kept) });
  // RED — today's sweep (an anchored copy without the «no mark ⇒ left» line) takes the unmarked folder
  {
    const SRCs = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const NEWB = "      if (!owner || typeof owner !== 'object' || !Number.isInteger(Number(owner.pid))) continue;\n      // this hub's own run is its pid AND its start: a container restarted under the same small pid is NOT this hub, so its dead\n      // folder is judged, never kept forever by the pid alone — and ANOTHER hub that lives (or one that cannot be proven gone)\n      // keeps its runs (the review)\n      if (PI.aliveIdentity(owner) !== false) continue;\n";
    const OLDB = "      if (owner && Number(owner.pid) === process.pid) continue;   // this hub's own run\n      if (owner && PI.aliveIdentity(owner) !== false) continue;\n";
    const oldSweep = M.load('src/server/vault-run-door.js', anchored(SRCs, NEWB, OLDB, 'test-vault-run ⑥b r1152 sweep-unmarked (the release\'s two lines)'), 'r1152-sweep-unmarked');
    const ow = await world({ doorMod: oldSweep });
    const um = path.join(ow.runRoot, DOOR.RUN_DIR_PREFIX + 'nomark02'); fs.mkdirSync(um, { mode: 0o700 }); fs.writeFileSync(path.join(um, 'f0'), 'not the door\'s');
    const before = fs.existsSync(path.join(um, 'f0'));
    const nr = ow.door.sweep();
    ok(before && nr === 1 && !fs.existsSync(um), 'RED — today\'s sweep (the copy\'s plant proves itself: the unmarked folder was there): it SHREDS the unmarked folder of its name — the leg above goes red there', { before, nr, left: fs.existsSync(um) });
    // THIS HUB'S OWN RUN IS ITS PID AND ITS START: a folder marked with this very pid but ANOTHER start (a container restarted
    // under the same small pid) is a dead thing — shredded; this hub's real own folder is kept
    const me = R('src/proc-identity.js').identityOf(process.pid);
    const recycledOf = (w) => { const d = path.join(w.runRoot, DOOR.RUN_DIR_PREFIX + 'recycled01'); fs.mkdirSync(d, { mode: 0o700 }); fs.writeFileSync(path.join(d, DOOR.OWNER_FILE), JSON.stringify({ ...me, starttime: (Number(me && me.starttime) || 1) + 987654 })); fs.writeFileSync(path.join(d, 'f0'), VALUE, { mode: 0o600 }); return d; };
    const mineOf = (w) => { const d = path.join(w.runRoot, DOOR.RUN_DIR_PREFIX + 'mine01'); fs.mkdirSync(d, { mode: 0o700 }); fs.writeFileSync(path.join(d, DOOR.OWNER_FILE), JSON.stringify(me)); return d; };
    const rw = await world(), rec = recycledOf(rw), mine = mineOf(rw);
    const n3 = rw.door.sweep();
    ok(!!me && me.starttime != null && n3 === 1 && !fs.existsSync(rec) && fs.existsSync(mine), 'r1152: this hub\'s own run is its pid AND its start — a folder marked with this pid but another start (a recycled pid) is shredded as the dead thing it is; this hub\'s real own folder is kept', { start: me && me.starttime, n3, recycled: fs.existsSync(rec), mine: fs.existsSync(mine) });
    const pidOnly = M.load('src/server/vault-run-door.js', anchored(SRCs, "      if (PI.aliveIdentity(owner) !== false) continue;\n", "      if (Number(owner.pid) === process.pid) continue;\n      if (PI.aliveIdentity(owner) !== false) continue;\n", 'test-vault-run ⑥b r1152 own-by-pid-only'), 'r1152-own-by-pid-only');
    const pw = await world({ doorMod: pidOnly }), rec2 = recycledOf(pw);
    const np = pw.door.sweep();
    ok(fs.existsSync(path.join(rec2, DOOR.OWNER_FILE)) && np === 0 && fs.existsSync(rec2), 'RED — a sweep that keeps «this hub\'s own run» by the pid alone (its plant proves itself: the recycled folder carries its mark): the dead folder is KEPT forever — the leg above goes red there', { np, kept: fs.existsSync(rec2) });
    // THE MARK GOES LAST: shredding a dead folder unlinks every other file first and the mark last (a hub ended mid-shred leaves a
    // marked folder the next sweep finishes; a mark shredded first would leave its values unmarked forever)
    const unlinkOrder = async (doorMod) => {
      const w = await world({ doorMod });
      const d = path.join(w.runRoot, DOOR.RUN_DIR_PREFIX + 'gone03'); fs.mkdirSync(d, { mode: 0o700 });
      fs.writeFileSync(path.join(d, DOOR.OWNER_FILE), JSON.stringify(deadId)); fs.writeFileSync(path.join(d, 'f0'), VALUE, { mode: 0o600 }); fs.writeFileSync(path.join(d, 'f1'), VALUE, { mode: 0o600 });
      const order = [], un0 = fs.unlinkSync;
      fs.unlinkSync = function (p, ...rest) { try { if (String(p).startsWith(d + path.sep)) order.push(path.basename(String(p))); } catch { } return un0.call(this, p, ...rest); };
      let n = null; try { n = w.door.sweep(); } finally { fs.unlinkSync = un0; }
      return { n, order, gone: !fs.existsSync(d) };
    };
    const ul = await unlinkOrder(DOOR);
    ok(ul.n === 1 && ul.gone && ul.order.length === 3 && ul.order[2] === DOOR.OWNER_FILE, 'r1152: a dead folder is shredded MARK LAST — every value file first, then .owner, then the folder', ul);
    const FOR_LINE = "  for (const n of names) if (n !== OWNER_FILE) shredEntry(path.join(dir, n));\n", MARK_ANY = "  if (names.includes(OWNER_FILE)) shredFile(path.join(dir, OWNER_FILE));\n", LEFT_LINE = "  if (left && left.length === 1 && left[0] === OWNER_FILE) shredFile(path.join(dir, OWNER_FILE));\n";   // stale-pins: kept (MARK_ANY is the r1152 line, a RED's replacement — gone from the door on purpose)
    const markFirst = M.load('src/server/vault-run-door.js', anchored(anchored(SRCs, FOR_LINE, MARK_ANY + FOR_LINE, 'test-vault-run ⑥b r1152 mark-first'), LEFT_LINE, '', 'test-vault-run ⑥b r1152 mark-first (its last line)'), 'r1152-mark-first');
    const ulR = await unlinkOrder(markFirst);
    ok(ulR.n === 1 && ulR.order.length === 3 && ulR.order[0] === DOOR.OWNER_FILE, 'RED — a shred that takes the mark FIRST (its plant proves itself: three files were unlinked): the mark-last leg goes red there', ulR);
    // r1213 (a): THE MARK GOES ONLY WHEN NOTHING ELSE IS LEFT (the folder read again) — a file whose unlink failed, or what the run's
    // program left deeper than one level, keeps the folder MARKED, so the next start's sweep judges it again (an unmarked folder with
    // something in it would be kept for ever by the law). r1275 (2): a sub-folder the program made is shredded ONE level down — a value
    // copied into it is overwritten and gone, and the folder with it
    const leftOf = async (doorMod) => {
      const w = await world({ doorMod });
      const d = path.join(w.runRoot, DOOR.RUN_DIR_PREFIX + 'gone04'); fs.mkdirSync(d, { mode: 0o700 });
      fs.writeFileSync(path.join(d, DOOR.OWNER_FILE), JSON.stringify(deadId)); for (const f of ['f0', 'f1']) fs.writeFileSync(path.join(d, f), VALUE, { mode: 0o600 });
      const sd = path.join(w.runRoot, DOOR.RUN_DIR_PREFIX + 'gone05'); fs.mkdirSync(path.join(sd, 'made-by-the-program', 'deeper'), { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(sd, DOOR.OWNER_FILE), JSON.stringify(deadId)); fs.writeFileSync(path.join(sd, 'f0'), VALUE, { mode: 0o600 }); fs.writeFileSync(path.join(sd, 'made-by-the-program', 'deeper', 'x'), 'two levels down');
      const od = path.join(w.runRoot, DOOR.RUN_DIR_PREFIX + 'gone06'); fs.mkdirSync(path.join(od, 'made-by-the-program'), { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(od, DOOR.OWNER_FILE), JSON.stringify(deadId)); fs.writeFileSync(path.join(od, 'f0'), VALUE, { mode: 0o600 }); fs.writeFileSync(path.join(od, 'made-by-the-program', 'copy-of-f0'), VALUE, { mode: 0o600 });
      const outside = path.join(w.dir, 'outside-the-run.txt'); fs.writeFileSync(outside, 'keep me'); fs.symlinkSync(outside, path.join(od, 'made-by-the-program', 'link-out'));   // a link inside the sub-folder: never followed
      const un0 = fs.unlinkSync, op0 = fs.openSync; let refused = 0, copyOverwritten = false;
      fs.unlinkSync = function (q, ...rest) { if (String(q) === path.join(d, 'f1')) { refused++; throw Object.assign(new Error('EBUSY (the leg refuses this one unlink)'), { code: 'EBUSY' }); } return un0.call(this, q, ...rest); };
      fs.openSync = function (q, flags, ...rest) { if (String(q) === path.join(od, 'made-by-the-program', 'copy-of-f0') && typeof flags === 'number' && (flags & fs.constants.O_WRONLY)) copyOverwritten = true; return op0.call(this, q, flags, ...rest); };   // shredFile overwrites before it unlinks
      let n1 = null; try { n1 = w.door.sweep(); } finally { fs.unlinkSync = un0; fs.openSync = op0; }
      const at1 = { dMark: fs.existsSync(path.join(d, DOOR.OWNER_FILE)), dF1: fs.existsSync(path.join(d, 'f1')), dF0: fs.existsSync(path.join(d, 'f0')), sMark: fs.existsSync(path.join(sd, DOOR.OWNER_FILE)), sDeep: fs.existsSync(path.join(sd, 'made-by-the-program', 'deeper', 'x')), sF0: fs.existsSync(path.join(sd, 'f0')), odGone: !fs.existsSync(od), odCopy: fs.existsSync(path.join(od, 'made-by-the-program', 'copy-of-f0')), copyOverwritten, outsideKept: fs.readFileSync(outside, 'utf8') === 'keep me' };
      const n2 = w.door.sweep();   // the next start: the unlink works again
      return { refused, n1, at1, n2, dGone: !fs.existsSync(d), sMark2: fs.existsSync(path.join(sd, DOOR.OWNER_FILE)) };
    };
    const lf = await leftOf(DOOR);
    ok(lf.refused === 1 && lf.n1 === 3 && lf.at1.dMark && lf.at1.dF1 && !lf.at1.dF0 && lf.at1.sMark && lf.at1.sDeep && !lf.at1.sF0 && lf.at1.odGone && lf.at1.copyOverwritten && lf.at1.outsideKept && lf.n2 === 2 && lf.dGone && lf.sMark2,
      'r1213 (a) + r1275 (2): the mark is shredded only when NOTHING ELSE is left — a file whose unlink failed, or what the program left two levels down, keeps its folder MARKED (its other value files gone) and the next start\'s sweep judges it again; a value copied ONE level down is OVERWRITTEN and unlinked with its sub-folder (a link inside it never followed: the file it names kept), and that folder is gone', lf);
    const anyLeft = M.load('src/server/vault-run-door.js', anchored(SRCs, LEFT_LINE, MARK_ANY, 'test-vault-run ⑥b r1213 mark-with-something-left'), 'r1213-mark-any');
    const lfR = anyLeft ? await leftOf(anyLeft) : null;
    ok(!!anyLeft && lfR && lfR.refused === 1 && lfR.at1.dF1 && !lfR.at1.dMark && lfR.at1.sDeep && !lfR.at1.sMark && lfR.n2 === 0 && !lfR.dGone,
      'RED — the r1152 line (the mark shredded whatever is left; its plant proves itself: one unlink was refused): the folders are left UNMARKED with something in them, and the next sweep never judges them again — the leg above goes red there', lfR);
    const flat = M.load('src/server/vault-run-door.js', anchored(SRCs, FOR_LINE, "  for (const n of names) if (n !== OWNER_FILE) shredFile(path.join(dir, n));\n", 'test-vault-run ⑥b r1275 no level down'), 'r1275-flat');   // stale-pins: kept (the r1213 loop: this RED's replacement)
    const lfF = flat ? await leftOf(flat) : null;
    ok(!!flat && lfF && lfF.at1.odCopy && !lfF.at1.odGone, 'RED — r1213\'s loop (no level down; its plant proves itself: the copy was written): the value copied one level down STAYS, its folder kept marked for ever — the leg above goes red there', lfF && lfF.at1);
  }
  // THE ORDER THE LAW STANDS ON (pinned): in a run folder the door's mark is the FIRST file made — before any value file — so a
  // folder with no mark never holds a value of the door's. Every O_CREAT open under the world's run root is recorded
  {
    const orderOf = async (doorMod) => {
      const ow = await world({ doorMod });
      openRow(ow);
      const made = [], under = (p) => { try { return String(p).startsWith(ow.runRoot + path.sep); } catch { return false; } };
      const creates = (flags) => (typeof flags === 'number' ? !!(flags & fs.constants.O_CREAT) : /[wax]/.test(String(flags == null ? 'r' : flags)));
      const saved = { openSync: fs.openSync, writeFileSync: fs.writeFileSync, copyFileSync: fs.copyFileSync, renameSync: fs.renameSync, mkdirSync: fs.mkdirSync };   // every road a file is made by
      fs.openSync = function (p, flags, ...rest) { if (under(p) && creates(flags)) made.push(path.basename(String(p))); return saved.openSync.call(this, p, flags, ...rest); };
      fs.writeFileSync = function (p, ...rest) { if (under(p)) made.push(path.basename(String(p))); return saved.writeFileSync.call(this, p, ...rest); };
      fs.copyFileSync = function (a, b, ...rest) { if (under(b)) made.push(path.basename(String(b))); return saved.copyFileSync.call(this, a, b, ...rest); };
      fs.renameSync = function (a, b, ...rest) { if (under(b)) made.push(path.basename(String(b))); return saved.renameSync.call(this, a, b, ...rest); };
      let r = null;
      try { ({ r } = await runAnswered(ow, ['--file', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'ran', path.join(ow.work, 'ran.txt')])); } finally { Object.assign(fs, saved); }
      return { ok: !!(r && r.ok), code: r && r.code, made };
    };
    const real = await orderOf(DOOR);
    ok(real.ok && real.made[0] === DOOR.OWNER_FILE && real.made.includes('f0') && real.made.indexOf(DOOR.OWNER_FILE) < real.made.indexOf('f0'),
      'r1152: the order the law stands on — a run folder\'s FIRST file is the door\'s mark (.owner), then its value file (f0): a folder with no mark holds no value of the door\'s', real);
    const SRCo = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const MARK_W = "      try { const mb = Buffer.from(JSON.stringify(hubIdentity || { pid: process.pid })), wrote = fs.writeSync(ofd, mb); if (wrote !== mb.length) throw Object.assign(new Error(`the owner mark was written short (${wrote} of ${mb.length} bytes)`), { code: 'ESHORTMARK' }); } finally { fs.closeSync(ofd); }   // r1213 (b): a SHORT write is a failed mark — the run stops before any value file and its folder is shredded, as a thrown write is\n";   // the mark's CHECKED write (r1213 b)
    const OWN2 = "      const ofd = fs.openSync(path.join(dir, OWNER_FILE), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);\n" + MARK_W;
    const late = M.load('src/server/vault-run-door.js', anchored(anchored(SRCo, OWN2, '', 'test-vault-run ⑥b r1152 mark-late (cut)'), '      const rec = { conv: caller.conversationId', "      { const ofd = fs.openSync(path.join(dir, OWNER_FILE), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600); try { fs.writeSync(ofd, JSON.stringify(hubIdentity || { pid: process.pid })); } finally { fs.closeSync(ofd); } }\n      const rec = { conv: caller.conversationId", 'test-vault-run ⑥b r1152 mark-late (after)'), 'r1152-mark-late');
    const lateR = await orderOf(late);
    ok(lateR.ok && lateR.made.includes(DOOR.OWNER_FILE) && lateR.made.includes('f0') && lateR.made.indexOf('f0') < lateR.made.indexOf(DOOR.OWNER_FILE), 'RED — a door that writes a VALUE file before its mark (an anchored copy: the mark moved after the files; its run still runs — the plant is where it claims): the order leg above goes red there', lateR);
    // r1213 (b): THE MARK'S WRITE IS CHECKED — a SHORT write (fewer bytes than the mark) is a failed mark: the run stops before
    // any value file, nothing runs, and its folder is shredded, as a thrown write is
    const shortOf = async (doorMod) => {
      const ow = await world({ doorMod });
      openRow(ow);
      const under = (q) => { try { return String(q).startsWith(ow.runRoot + path.sep); } catch { return false; } };
      const saved = { openSync: fs.openSync, writeSync: fs.writeSync };
      let markFd = null, shorts = 0;
      let armed = true;   // only the MARK's write is made short: the shred that follows reopens the torn .owner to overwrite it (the round's must)
      fs.openSync = function (q, ...rest) { const fd = saved.openSync.call(this, q, ...rest); if (armed && under(q) && path.basename(String(q)) === DOOR.OWNER_FILE) { markFd = fd; armed = false; } return fd; };
      fs.writeSync = function (fd, buf, ...rest) { if (markFd != null && fd === markFd) { markFd = null; shorts++; const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf)); return saved.writeSync.call(this, fd, b, 0, Math.max(0, b.length - 1)); } return saved.writeSync.call(this, fd, buf, ...rest); };
      const ran = path.join(ow.work, 'ran-short.txt');
      let r = null;
      try { ({ r } = await runAnswered(ow, ['--file', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'ran', ran])); } finally { Object.assign(fs, saved); }
      return { shorts, ok: !!(r && r.ok), code: r && r.code, ran: fs.existsSync(ran), dirs: runDirs(ow).length };
    };
    const sh = await shortOf(DOOR);
    ok(sh.shorts === 1 && !sh.ok && sh.code === 'spawn_failed' && !sh.ran && sh.dirs === 0, 'r1213 (b): the mark\'s write is CHECKED — a write one byte short is a failed mark: spawn_failed, nothing ran, no run folder left', sh);
    const unchecked = M.load('src/server/vault-run-door.js', anchored(SRCo, MARK_W, "      try { fs.writeSync(ofd, JSON.stringify(hubIdentity || { pid: process.pid })); } finally { fs.closeSync(ofd); }\n", 'test-vault-run ⑥b r1213 mark-unchecked'), 'r1213-mark-unchecked');   // stale-pins: kept (the release's unchecked write is this RED's replacement — gone from the door on purpose)
    const shR = unchecked ? await shortOf(unchecked) : null;
    ok(!!unchecked && shR && shR.shorts === 1 && shR.ok && shR.ran, 'RED — the unchecked write (the release\'s line; its plant proves itself: the mark was written short): the run GOES over a torn mark — the leg above goes red there', shR);
  }
  // r1152 (A — the suites' hygiene) + r1213 (THE CLASS): NO SUITE'S SCRATCH WEARS A NAME A PRODUCT SWEEPER OWNS, AND NO PRODUCT
  // SWEEPER IS OFF THE TABLE. src/temp-sweepers.js is the product's table of every file that removes folders under the temp root
  // by a name prefix; the scratch helper refuses each row's prefix by READING it. This census holds (1) every src file that
  // sweeps by such a prefix to a row, and every row to a live sweep whose exported constant IS the row's prefix; (2) the refusal
  // of every row through each door into scratch(); (3) no tracked script asking for a row's shape — a scratch / scratchDir /
  // mutantCopies name, or a mkdtemp under the temp folder. Each half has its RED over a planted text
  {
    const SCR = await import(pathToFileURL(path.join(REPO, 'scripts/scratch.mjs')).href);
    const GE = await import(pathToFileURL(path.join(REPO, 'scripts/git-env.mjs')).href);   // the tree's git env (a caller's GIT_DIR never steers the census)
    const FG = R('src/fixture-guard.js'), TS = R('src/temp-sweepers.js');
    const MCm = await import(pathToFileURL(path.join(REPO, 'scripts/mutant-copy.mjs')).href);
    const refusedBy = (fn) => { try { fn(); return null; } catch (e) { return String(e.message || e); } };
    const problems = [];
    const lsOf = (globs) => { try { return require('child_process').execFileSync('git', ['ls-files', '--', ...globs], { cwd: REPO, encoding: 'utf8', env: GE.gitEnvFrom(process.env) }).split('\n').filter(Boolean); } catch (e) { problems.push(`git ls-files failed: ${String((e && e.message) || e).slice(0, 120)}`); return []; } };
    const textsOf = (rels) => rels.map((rel) => [rel, fs.readFileSync(path.join(REPO, rel), 'utf8')]);
    // (1) THE PRODUCT SIDE: a file sweeps by a prefix when it tests names with startsWith(<a 'vs-<word>-' prefix>) — a literal or a
    // const of its own — AND removes something; every such (file, prefix) is a row, every row is such a pair, the row's `export`
    // is the file's const of that very prefix and is exported
    const FOLDER_PREFIX = /^vs-[a-z0-9]+(?:-[a-z0-9]+)*-$/;
    const REMOVES = /\b(?:rmSync|rmdirSync|unlinkSync|shredDir|removeMarked)\(|\bfsp?\.rm\(|\bfs\.promises\.rm\(/;
    const constOf = (text, id) => { const d = new RegExp(`\\bconst\\s+${id}\\s*=\\s*(['"\`])([^'"\`]*)\\1`).exec(text); return d ? d[2] : null; };
    const sweepsOf = (text) => {
      if (!REMOVES.test(text)) return [];
      const out = new Set();
      for (const m of text.matchAll(/\.startsWith\(\s*(?:(['"`])([^'"`]*)\1|([A-Za-z_$][\w$]*))\s*\)/g)) { const v = m[2] != null ? m[2] : constOf(text, m[3]); if (v != null && FOLDER_PREFIX.test(v)) out.add(v); }
      return [...out];
    };
    const productCensus = (files, rows) => {
      const bad = [], found = new Map();
      for (const [rel, text] of files) { const ps = sweepsOf(text); if (ps.length) found.set(rel, { ps, text }); }
      for (const [rel, { ps }] of found) for (const pf of ps) if (!rows.some((r) => r.file === rel && r.prefix === pf)) bad.push(`${rel} sweeps «${pf}…» and is no row of src/temp-sweepers.js`);
      for (const r of rows) {
        const f = found.get(r.file);
        if (!f || !f.ps.includes(r.prefix)) { bad.push(`row ${r.file} «${r.prefix}» names no live sweep (a dead row)`); continue; }
        if (constOf(f.text, r.export) !== r.prefix || !new RegExp(`module\\.exports\\s*=\\s*\\{[^}]*\\b${r.export}\\b`).test(f.text)) bad.push(`row ${r.file}: its exported ${r.export} is not «${r.prefix}»`);
        if (!r.prefix.startsWith(FG.FIXTURE_CWD_PREFIX) || !String(r.proof || '').trim()) bad.push(`row ${r.file}: no proof, or a prefix scratch could never mint`);
      }
      return bad;
    };
    const SRC_FILES = textsOf(lsOf(['src/*.js', 'server.js']));
    const prodBad = productCensus(SRC_FILES, TS.ROWS);
    const plantSweep = productCensus([...SRC_FILES, ['src/server/planted-sweeper.js', "const P = 'vs-planted-x-';\nfor (const f of names) if (f.startsWith(P)) fs.rmSync(path.join(root, f), { recursive: true });\nmodule.exports = { P };\n"]], TS.ROWS);
    const plantDead = productCensus(SRC_FILES, [...TS.ROWS, { file: 'src/server/gone-sweeper.js', export: 'P', prefix: 'vs-gone-x-', proof: 'a plant' }]);
    ok(SRC_FILES.length > 500 && TS.ROWS.length === 3 && !prodBad.length && plantSweep.length === 1 && /planted-sweeper\.js sweeps «vs-planted-x-…» and is no row/.test(plantSweep[0]) && plantDead.length === 1 && /gone-sweeper\.js «vs-gone-x-» names no live sweep/.test(plantDead[0]),
      'r1213 (THE CLASS, the product side): every src file that removes folders by a vs-<word>- name prefix is a row of src/temp-sweepers.js (the vault run door, the sign-in card\'s scratch, the token mint\'s), each row a live sweep whose exported prefix IS the row\'s — RED: a planted sweeper off the table is named, a planted dead row is named', { files: SRC_FILES.length, rows: TS.ROWS.map((r) => r.prefix), prodBad, plantSweep, plantDead });
    // (2) THE REFUSAL, read from the table: every row through scratch(), a copies folder, scratchDir() and mutantCopies()
    const refusals = TS.ROWS.map((r) => {
      const nm = r.prefix.slice(FG.FIXTURE_CWD_PREFIX.length, -1);
      const said = [refusedBy(() => SCR.scratch(nm)), refusedBy(() => SCR.scratch(nm + '-mut')), refusedBy(() => SCR.scratchDir(nm + '-x')), refusedBy(() => MCm.mutantCopies(nm, REPO))];
      return { row: r.file, nm, ok: said.every((w) => w && w.includes(`the folder shape of ${r.file}`) && w.includes(`/tmp/${r.prefix}`)) };
    });
    const passes = refusedBy(() => SCR.scratch('vaultrun-census-probe')) === null && SCR.sweeperRowOf('oat') === null && SCR.sweeperRowOf('signincard') === null;
    const planted = SCR.sweeperRowOf('zz-planted', [...TS.ROWS, { file: 'src/server/planted.js', prefix: 'vs-zz-planted-' }]);
    ok(refusals.every((x) => x.ok) && passes && planted && planted.file === 'src/server/planted.js' && SCR.sweeperRowOf('zz-planted') === null,
      'r1152 (A) + r1213: the scratch helper REFUSES, by reading the table, a name that would mint ANY row\'s folder shape — through scratch(), a copies folder (<name>-mut), scratchDir() and mutantCopies(); a name beside a row\'s (oat, signincard, vaultrun…) passes — RED: a row planted in the table is refused, the same name without it passes', { refusals, passes, planted: planted && planted.file });
    // (3) THE SUITES: no tracked script asks for a row's shape — a scratch / scratchDir / mutantCopies name (a copies folder is
    // <name>-mut), or a mkdtemp under the temp folder (path.join(os.tmpdir(), '<lit>'), os.tmpdir() + '/<lit>')
    const scriptsCensus = (files, rows) => {
      const bad = [];
      for (const [rel, t] of files) {
        for (const m of t.matchAll(/\b(scratchDir|scratch|mutantCopies)\(\s*(['"`])([a-z0-9-]+)\2/g)) { const names = m[1] === 'mutantCopies' ? [m[3], m[3] + '-mut'] : [m[3]]; for (const nm of names) { const r = SCR.sweeperRowOf(nm, rows); if (r) bad.push(`${rel}: ${m[1]}('${m[3]}') wears ${r.prefix}…`); } }
        for (const m of t.matchAll(/mkdtemp(?:Sync)?\(\s*(?:path\.join\(\s*(?:os\.)?tmpdir\(\)\s*,\s*|(?:os\.)?tmpdir\(\)\s*\+\s*)(['"`])\/?([^'"`$]+)\1/g)) { const r = TS.rowOfName(m[2], rows); if (r) bad.push(`${rel}: mkdtemp '${m[2]}' wears ${r.prefix}…`); }
      }
      return bad;
    };
    const SCRIPT_FILES = textsOf(lsOf(['scripts/*.mjs', 'scripts/*.cjs', 'scripts/*.js']));
    const scrBad = scriptsCensus(SCRIPT_FILES, TS.ROWS);
    const SIGN = ['sign', 'in'].join('');   // built at run time: the census reads LITERALS, and these plants are its own
    const plantScr = scriptsCensus([['scripts/test-planted.mjs', `const a = scratch('${SIGN}-x');\nconst b = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-oat-${'mint'}-y-'));\n`]], TS.ROWS);
    ok(SCRIPT_FILES.length > 100 && !problems.length && !scrBad.length && plantScr.length === 2 && plantScr.some((l) => /scratch\('signin-x'\) wears vs-signin-/.test(l)) && plantScr.some((l) => /mkdtemp 'vs-oat-mint-y-' wears vs-oat-mint-/.test(l)),
      'r1152 (A) + r1213: no tracked script asks for a row\'s shape — no scratch / scratchDir / mutantCopies name and no mkdtemp under the temp folder (test-signin-card-ui\'s folder renamed) — RED: a planted scratch(\'signin-…\') and a planted mkdtemp of vs-oat-mint-… are each named', { scripts: SCRIPT_FILES.length, problems, scrBad, plantScr });
  }
  try { liveKid.kill('SIGKILL'); } catch { }
  // THE STORE'S MARK: a non-hex mark reads as empty (never a throw); a restored OLDER copy is a replay
  const mw = await world();
  openRow(mw);
  const FILE = path.join(mw.dataDir, DOOR.STORE_FILE);
  const good = fs.readFileSync(FILE, 'utf8');
  const g = JSON.parse(good);
  fs.writeFileSync(FILE, JSON.stringify({ ...g, mark: 'é'.padStart(64, 'a') }));
  let threw = null, r1 = null;
  try { r1 = await mw.mk().run({ caller: mw.caller, args: ENV('env'), cwd: mw.work }); } catch (e) { threw = e.message; }
  ok(!threw && r1.code === 'entry_not_runnable', 'a mark that is not 64 hex characters (é: the same length in JS, not in bytes) reads as EMPTY — never a throw that breaks every door', threw || r1.code);
  fs.writeFileSync(FILE, good);
  const d2 = mw.mk();
  d2.setRunnable({ id: 'app-secrets:app1#item.0.1', on: true, reauthed: true });   // a newer generation, read and written by this hub
  fs.writeFileSync(FILE, good);   // the older copy restored
  await mw.vault.lock('door'); await mw.vault.unlock(PW);
  const r2 = await d2.run({ caller: mw.caller, args: ENV('env'), cwd: mw.work });
  ok(r2.code === 'entry_not_runnable' && /a replay/.test(auditOf(mw)), 'a restored OLDER copy of the store (a generation below the one this hub wrote) is a REPLAY: read as empty, said in the audit', r2.code);
  // switch-off takes the entry's «always» back
  const aw = await world();
  openRow(aw);
  const CA = ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/a'];
  const c1 = await runAnswered(aw, CA, { answer: 'always', reauthed: true });
  const c2 = await runAnswered(aw, CA);
  aw.door.setRunnable({ id: 'mounts:m1#secretKey', on: false });
  openRow(aw);
  const c3 = await runAnswered(aw, CA, { answer: 'deny' });
  ok(c1.r.by === 'always' && c2.r.by === 'always' && !c2.card && !!c3.card && c3.r.code === 'ask_denied', 'switching the entry OFF takes back its «always» (and its seen shapes): switched on again, the same shape asks', [c1.r.by, c2.r.by, !!c3.card]);
  { // r6 (主开发: «a card's state follows the grant's life» — the Always + a revoke in the Vault window ⇒ the card says revoked)
    const FAr = R('src/foryou-actions.js');
    const ia = aw.userTodos.get(c1.card && c1.card.id), sa = ia && FAr.decidedStamp(ia);
    ok(ia && ia.resolvedBy === 'always' && ia.resolvedFact?.alwaysFor === '30d' && ia.resolvedFact?.endedBy === 'revoked' && sa && /^always allowed · revoked (\d+\/\d+ )?\d\d:\d\d$/.test(sa.text) && FAr.decisionCard(ia).state === 'revoked', 'r6: the run card\'s «Always» record carries its grant (alwaysFor, until); the entry switched OFF in the Vault window ⇒ the card says «always allowed · revoked HH:MM» (was: «always allowed by you» for ever)', { fact: ia && ia.resolvedFact, stamp: sa && sa.text });
    const a8 = await world(); openRow(a8);
    const c8 = await runAnswered(a8, CA, { answer: 'always', reauthed: true, ttl: '8h' });
    await a8.vault.lock('agent');
    const i8 = a8.userTodos.get(c8.card && c8.card.id), s8 = i8 && FAr.decidedStamp(i8);
    ok(c8.r.by === 'always' && i8 && i8.resolvedFact?.alwaysFor === '8h' && i8.resolvedFact?.endedBy === 'lock' && s8 && /^always allowed · ended /.test(s8.text) && FAr.decisionCard(i8).state === 'ended', 'r6: an 8-hour «Always» then a LOCK ⇒ its card «always allowed · ended HH:MM» at once', { fact: i8 && i8.resolvedFact, stamp: s8 && s8.text });
  }
  // the bounds, the folder's characters, the program on the card
  const big = await aw.door.run({ caller: aw.caller, args: ['--env', 'P=' + 'a.'.repeat(40000), '--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', 'https://api.example.com'], cwd: aw.work });
  const bigCwd = await aw.door.run({ caller: aw.caller, args: ENV('env'), cwd: '/tmp/' + 'a/'.repeat(3000) });
  const rlo = await aw.door.run({ caller: aw.caller, args: ENV('env'), cwd: aw.work + '/\u202e' });
  ok(big.code === 'request_too_large' && bigCwd.code === 'request_too_large' && rlo.code === 'hidden_chars', 'over 64 KiB of words or a 4 KiB folder ⇒ request_too_large before anything is read; a folder holding a direction mark ⇒ hidden_chars (the card prints the folder)', [big.code, bigCwd.code, rlo.code]);
  const wc = await runAnswered(aw, ['--env', 'T=vault://mounts/m1/secretKey', '--', WCURL, '-s', 'https://api.example.com/v1/a'], { answer: null });
  ok(!!wc.card && wc.card.action.always === false && new RegExp('Program: ' + WCURL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' — in a folder an agent can write').test(wc.card.detail) && /«Always» is not offered: the program sits where an agent could have written it/.test(wc.card.detail), 'the card names the PROGRAM that runs (its real path); one an agent could have written (a folder it can write) is said and gets no «always»', wc.card && wc.card.detail);
  aw.door.answer(wc.card.action.askId, { answer: 'deny' }); await wc.r;
  const ok1 = await runAnswered(aw, CA, { answer: null });
  ok(!!ok1.card && new RegExp('Program: ' + CURL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\n').test(ok1.card.detail + '\n'), 'a program in a folder no agent can write: its path on the card, no warning', ok1.card && ok1.card.detail.split('\n').slice(0, 3));
  aw.door.answer(ok1.card.action.askId, { answer: 'deny' }); await ok1.r;
  aw.door.setRunnable({ id: "mounts:b(x)!'*#secretKey", on: true, reauthed: true });
  const ls = aw.door.runnableFor();
  ok(ls.ok && ls.entries.some((e) => e.ref === "vault://mounts/b%28x%29%21%27%2A/secretKey") && ls.entries.every((e) => VR.parseRef(e.ref)), 'list spells every opened entry as a reference that parses — an entry name holding !\'()* too', ls.entries.map((e) => e.ref));
}

console.log('⑥c THE STORE READ (主开发 r2920) — a read of data/vault-run.json that FAILED is no state: the store is HELD, never written over');
{
  // the failed reads are PLACED (never a real mount): the store's open fails as the test says, then the file reads as it is
  const fileOf = (w) => path.join(w.dataDir, DOOR.STORE_FILE);
  // the red controls' edits (each anchor counted once in the door): a door with no hold asked, today's order (r3147: asked, then loaded)
  const NO_HOLD_SWITCH = [["    const o = ownerLoad(); if (o.held) return o.held;   // 主开发 r3147 (1): THE ONE DOOR — loaded, then the hold asked, before anything is taken back or touched", "    const o = { d: load() };"], ["    { const h = heldNow(); if (h) return h; }   // 主开发 r2920: the store is HELD (or its torn bytes' copy in flight) — refused BY NAME, nothing written over the unread file", '']];
  const NO_HOLD_PRESS = [["    const o = ownerLoad(); if (o.held) return o.held;   // 主开发 r3147 (1): THE ONE DOOR — the press's own load may SET the hold (torn bytes met again after a lift): loaded, THEN asked, before any snapshot or write", "    const o = { d: load() };"], ["    if (failCode === 'store_held' && touched.length === 1 && !made.length) return named('store_held', { why: storeHeld ? storeHeld.why : 'held' });   // 主开发 r3147 (2) / r3267 (2): the ONE early return — nothing was written, nothing to put back", '']];
  const NO_MARKS_ASKED = [["    { const m = marksHeldOf(); if (m) return m; }   // 主开发 r3255: the grants' marks held ⇒ refused by name beside the one door, before any snapshot or write (addMember would refuse AFTER this store's switch was written)", '']];
  const NO_HOLD_REVOKE = [["    const o = ownerLoad(); if (o.held) return o.held;   // 主开发 r3147 (1): THE ONE DOOR — never «done, 0» over approvals the unread file still holds", "    const o = { d: load() };"]];
  const TODAY_ORDER = [["  function ownerLoad({ carry = true } = {}) { const d = load({ carry }); const h = heldNow(); return h ? { held: h } : { d }; }", "  function ownerLoad({ carry = true } = {}) { const h = heldNow(); if (h) return { held: h }; return { d: load({ carry }) }; }"], ["    if (failCode === 'store_held' && touched.length === 1 && !made.length) return named('store_held', { why: storeHeld ? storeHeld.why : 'held' });   // 主开发 r3147 (2) / r3267 (2): the ONE early return — nothing was written, nothing to put back", '']];
  const placeSync = (file, codes) => { const real = fs.openSync; let k = 0; fs.openSync = function (p, ...x) { if (typeof p === 'string' && path.resolve(p) === path.resolve(file) && k < codes.length) { const code = codes[k++]; throw Object.assign(new Error(`placed ${code}`), { code }); } return real.call(this, p, ...x); }; return () => { fs.openSync = real; }; };
  const placeAsync = (file, codes) => { const real = fs.promises.open; let k = 0; fs.promises.open = function (p, ...x) { if (typeof p === 'string' && path.resolve(p) === path.resolve(file) && k < codes.length) { const code = codes[k++]; return Promise.reject(Object.assign(new Error(`placed ${code}`), { code })); } return real.call(this, p, ...x); }; return () => { fs.promises.open = real; }; };
  const suspendedOf = (w) => { try { return JSON.parse(fs.readFileSync(fileOf(w), 'utf8')).suspended || []; } catch { return null; } };
  const twoOff = (w) => { w.door.setRunnable({ id: 'mounts:m1#secretKey', on: false }); w.door.setRunnable({ id: 'mounts:m2#secretKey', on: false }); };
  const bothOff = (list) => !!(list && list.includes('mounts:m1#secretKey') && list.includes('mounts:m2#secretKey'));
  const SLOW = { storeRetry: { firstMs: 600000, maxMs: 600000, missingMs: 600000 } }, QUICK = { storeRetry: { firstMs: 15, maxMs: 30, missingMs: 15 } };
  // B-54a9 (主开发 r3437/r3540): THE LIFT'S WAIT ENDS ON ITS FACT for both copies, never a wall clock — lifted, OR every read again the
  // door ARMED has ENDED with no next one armed: each read again is counted at its end (a refused open, or its own fd closed — the
  // door reads open → stat → read → close — then its verdict run), each arming is the world's timer log (the door's timers are the
  // world's; a read again's delay is the scene's QUICK retry, at most its maxMs, so no other bound is counted as one). A copy whose
  // held read again never arms the next one (the red control's «return») is read at that end
  const countReads = (file) => { const real = fs.promises.open; let n = 0; fs.promises.open = function (p, ...x) { const q = real.call(this, p, ...x); if (typeof p !== 'string' || path.resolve(p) !== path.resolve(file)) return q; return q.then((fh) => { const close = fh.close.bind(fh); fh.close = () => close().then((v) => { n++; return v; }); return fh; }, (e) => { n++; throw e; }); }; return { ended: () => n, undo: () => { fs.promises.open = real; } }; };
  const waitLiftOrSettled = async (d, w, reads, armedFrom, ms = 30000) => {
    const armed = () => w.timerLog.slice(armedFrom).filter((t) => t <= QUICK.storeRetry.maxMs).length;   // the read-again timers the door armed
    for (const tEnd = Date.now() + ms; d._storeHeld() && Date.now() < tEnd;) {
      const n = reads.ended();
      if (n >= 1 && armed() <= n) { await new Promise((r) => setImmediate(r)); if (reads.ended() === n && armed() <= n) break; }   // settled: every armed read ended, none armed after
      await sleep(5);
    }
    return !d._storeHeld();
  };
  const waitLift = async (d, ms = 3000) => { for (let k = 0; k < ms / 10 && d._storeHeld(); k++) await sleep(10); return !d._storeHeld(); };
  // (1) THE VERIFIER'S SCENE (lg-store-writes VR1): two entries OFF; the door's next life reads the store ONCE with an error; the
  // owner's next switch — refused BY NAME, the file not written over, both OFF switches still on disk
  const scene = async (doorMod) => {
    const w = await world({ doorMod }); twoOff(w);
    const undo = placeSync(fileOf(w), ['EIO']);
    let d, c;
    try { d = w.mk(doorMod, SLOW); c = d.setRunnable({ id: 'mounts:m2#secretKey', on: true, reauthed: true }); } finally { undo(); }
    return { code: c && c.code, said: !!(c && /HELD/.test(String(c.words))), kept: bothOff(suspendedOf(w)), held: !!d._storeHeld() };
  };
  const RELEASE_LOAD = ["    let read;\n    try { const b = readBounded(FILE, STORE_MAX); read = { text: b.toString('utf8'), buf: b }; } catch (e) { read = { error: e }; }\n    const a = lawOf(SR.storeAnswer(read, { valid: STORE_VALID }));\n    if (a === 'held') { next.refused = storeHeld.why; next.held = true; db = next; dbEpoch = vault.epoch(); return db; }\n    let raw = null, why = null;\n    if (a.state === 'data') raw = a.value;\n    else if (a.state === 'corrupt') {", "    let raw = null, why = null;\n    try { raw = JSON.parse(readBounded(FILE, STORE_MAX).toString('utf8')); } catch (e) { if (!(e && e.code === 'ENOENT')) why = `unreadable (${e.code || 'not JSON'})`; }\n    if (false) {"];   // stale-pins: kept (the replacement IS the release's load)
  const s1 = await scene(DOOR), s0 = await scene(doorCopy([RELEASE_LOAD], null, 'the release load (a failed read starts empty)'));
  ok(s1.code === 'store_held' && s1.said && s1.kept && s1.held && !s0.kept, `r2920 THE VERIFIER'S SCENE: a store read that failed ONCE at the door's next life HOLDS it — the owner's next switch is refused by name (store_held) and both OFF switches stay on disk; red control: «the release load (a failed read starts empty)» loses them`, { s1, s0 });
  // (2) A SWITCH REFUSED WHILE HELD — the window says it by name (its own words, zh / ja); red control: the save with no hold check
  const refusedLeg = async (doorMod) => {
    const w = await world({ doorMod }); twoOff(w);
    const undo = placeSync(fileOf(w), ['EIO']);
    let d, off, on;
    try { d = w.mk(doorMod, SLOW); off = d.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true }); on = d.setRunnable({ id: 'mounts:m2#secretKey', on: false }); } finally { undo(); }
    return { codes: [off && off.code, on && on.code], kept: bothOff(suspendedOf(w)) };
  };
  const r1 = await refusedLeg(DOOR), r0 = await refusedLeg(doorCopy(NO_HOLD_SWITCH, null, 'a switch with no hold asked'));
  const winWords = fs.readFileSync(path.join(REPO, 'src/lib/vault-reveal.js'), 'utf8'), ZH = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), JA = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const KEY = "The vault's run settings could not be read just now, so nothing was changed. VibeSpace reads them again by itself: try again in a minute";
  ok(r1.codes.every((c) => c === 'store_held') && r1.kept && !r0.kept && winWords.includes("if (c === 'store_held') return t(") && ZH.includes(JSON.stringify(KEY).slice(0, 60)) && JA.includes(JSON.stringify(KEY).slice(0, 60)),
    'r2920 A SWITCH REFUSED WHILE HELD: an ON and an OFF are each refused by name (store_held), nothing written; the Vault window words the code (src/lib/vault-reveal.js, with zh / ja); red control: «a switch with no hold asked» (neither its door nor the save asks) writes over the file', { r1, r0 });
  // (3) THE LIFT WITHOUT A RESTART: the load's read fails, the first read again (off the loop) fails too, the next one reads — the hold
  // is lifted by itself, the owner's next switch lands, and every switch made before stands; red control: a read again that never lifts
  const liftLeg = async (doorMod) => {
    const w = await world({ doorMod }); twoOff(w);
    const undoS = placeSync(fileOf(w), ['EIO']), undoA = placeAsync(fileOf(w), ['ETIMEDOUT']), reads = countReads(fileOf(w));   // the load's read placed EIO, the first read again ETIMEDOUT: the next one would lift
    let d, held0, lifted, c, readsEnded;
    try { const armedFrom = w.timerLog.length; d = w.mk(doorMod, QUICK); held0 = !!(d.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true }).code === 'store_held'); undoS(); lifted = await waitLiftOrSettled(d, w, reads, armedFrom); readsEnded = reads.ended(); c = d.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true }); } finally { reads.undo(); undoS(); undoA(); }
    const list = suspendedOf(w);
    return { held0, lifted, readsEnded, ok: !!(c && c.ok), m2Off: !!(list && list.includes('mounts:m2#secretKey')), m1On: !!(list && !list.includes('mounts:m1#secretKey')) };
  };
  const l1 = await liftLeg(DOOR), l0 = await liftLeg(doorCopy("    if (lawOf(a, { applied: false }) === 'held') return;", '    return;', 'a read again that never lifts'));
  ok(l1.held0 && l1.lifted && l1.ok && l1.m2Off && l1.m1On && !l0.lifted && !l0.ok && l0.readsEnded >= 1, `r2920 THE LIFT WITHOUT A RESTART: held at the load, one read again failed, the next one read — lifted by itself; the owner's switch then lands and the OFF made before stands (m2 still OFF); red control: «a read again that never lifts» keeps refusing`, { l1, l0 });
  // (4) «MISSING» RIGHT AFTER «UNREADABLE» is read once more: the load fails, the read again answers «missing», the next one reads —
  // lifted; the load after it answers «missing» ONCE more, and is read again before it counts — the OFF switches stand; red control:
  // a «missing» taken at once (a new, empty store written over by the next switch)
  const missLeg = async (doorMod) => {
    const w = await world({ doorMod }); twoOff(w);
    const undoS = placeSync(fileOf(w), ['EIO']), undoA = placeAsync(fileOf(w), ['ENOENT']);
    let d, c, lifted;
    try {
      d = w.mk(doorMod, QUICK); d.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true }); undoS();
      lifted = await waitLift(d, 1500);
      const undoS2 = placeSync(fileOf(w), ['ENOENT']);   // the load right after the lift reads «missing» once
      try { c = d.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true }); } finally { undoS2(); }
      await waitLift(d, 1500);
    } finally { undoS(); undoA(); }
    return { lifted, first: c && c.code, kept: bothOff(suspendedOf(w)) };
  };
  const m1 = await missLeg(DOOR), m0 = await missLeg(doorCopy("    if (a.state === 'missing' && heldBefore) {", '    if (false) {', 'a «missing» taken at once'));
  ok(m1.lifted && m1.first === 'store_held' && m1.kept && !m0.kept, `r2920 «MISSING» RIGHT AFTER «UNREADABLE» IS READ ONCE MORE: a «missing» at the read again and at the load after the lift are each read again — the switch in that moment is refused by name and both OFF switches stand; red control: «a «missing» taken at once» writes a new, empty store over them`, { m1, m0 });
  // (5) TORN BYTES ARE KEPT ASIDE ONCE: bytes that were READ and do not parse — the door fails closed (as before), the bytes are kept
  // aside beside the store named by their digest, ONCE (a second life of the same bytes keeps no second copy)
  {
    const w = await world(); const torn = '{"suspended": ["mounts:m1#secretKey"], "ru';   // a torn write
    fs.writeFileSync(fileOf(w), torn);
    const d1 = w.mk(DOOR, SLOW); d1.setRunnable({ id: 'mounts:m2#secretKey', on: false });   // the load reads the torn bytes (kept aside), the door fails closed; the owner's write waits for the copy (refused by name while it is in flight)
    await sleep(50);
    fs.writeFileSync(fileOf(w), torn);   // the same torn bytes again, at the next life
    const d2 = w.mk(DOOR, SLOW); d2.setRunnable({ id: 'mounts:m2#secretKey', on: false });
    await sleep(50);
    const aside = fs.readdirSync(w.dataDir).filter((f) => f.startsWith(DOOR.STORE_FILE + '.corrupt-'));
    ok(aside.length === 1 && fs.readFileSync(path.join(w.dataDir, aside[0]), 'utf8') === torn, `r2920 TORN BYTES ARE KEPT ASIDE ONCE: the bytes that did not parse are kept beside the store, named by their digest (${aside.join(', ') || 'none'}), and a second life of the same bytes keeps no second copy`, aside);
  }
  // (6) TORN BYTES THAT COULD NOT BE KEPT ASIDE are never written over (the law's own: src/store-read.js afterSetAside — the file is
  // their only copy): the copy's write fails ONCE (PLACED) ⇒ HELD, the owner's switch refused by name, the file still the torn bytes;
  // the read again (its timer fired by hand) keeps them and lifts — the next switch lands; red control: a failed copy not held
  const unkeptLeg = async (doorMod) => {
    const w = await world({ doorMod }); const torn = '{"suspended": ["mounts:m1#secretKey"], "ru';
    fs.writeFileSync(fileOf(w), torn);
    const MS = 777777, again = [];   // the read again's own wait: its timer is kept here and fired by the leg, never by a clock
    const ex = { storeRetry: { firstMs: MS, maxMs: MS, missingMs: MS }, timers: { set: (fn, ms) => (ms === MS ? (again.push(fn), {}) : setTimeout(fn, ms)), clear: (h) => clearTimeout(h) } };
    const real = fs.promises.open; let fails = 1;   // the copy's own open (open · write · sync · close · rename)
    fs.promises.open = function (p, ...x) { if (typeof p === 'string' && path.basename(p).startsWith(DOOR.STORE_FILE + '.corrupt-') && fails > 0) { fails--; return Promise.reject(Object.assign(new Error('placed ENOSPC'), { code: 'ENOSPC' })); } return real.call(this, p, ...x); };
    let d, first, held, c1, tornStill, lifted, writtenAfter;
    try {
      d = w.mk(doorMod, ex);
      first = d.setRunnable({ id: 'mounts:m2#secretKey', on: false });   // the load reads the torn bytes; their copy is in flight
      await sleep(30);   // the copy's write failed (placed)
      held = !!d._storeHeld();
      c1 = d.setRunnable({ id: 'mounts:m2#secretKey', on: false });
      tornStill = fs.readFileSync(fileOf(w), 'utf8') === torn;
      if (again.length) again.shift()();   // the read again: the copy's write works now
      lifted = await waitLift(d, 1500);
      d.setRunnable({ id: 'mounts:m2#secretKey', on: false });   // the load after the lift: its compare with the copy beside it is in flight (refused by name) …
      await sleep(60);
      d.setRunnable({ id: 'mounts:m2#secretKey', on: false });   // … then the bytes are kept already — the write lands
      writtenAfter = fs.readFileSync(fileOf(w), 'utf8') !== torn;
    } finally { fs.promises.open = real; }
    const aside = fs.readdirSync(w.dataDir).filter((f) => f.startsWith(DOOR.STORE_FILE + '.corrupt-'));
    return { first: first && first.code, held, c1: c1 && c1.code, tornStill, lifted, writtenAfter, kept: aside.length === 1 && fs.readFileSync(path.join(w.dataDir, aside[0]), 'utf8') === torn };
  };
  const u1 = await unkeptLeg(DOOR), u0 = await unkeptLeg(doorCopy("if (!kept) hold('not set aside', null, TORN_UNKEPT);", '', 'a failed copy not held'));
  ok(u1.first === 'store_held' && u1.held && u1.c1 === 'store_held' && u1.tornStill && u1.lifted && u1.writtenAfter && u1.kept && !u0.tornStill,
    'r2920 TORN BYTES THAT COULD NOT BE KEPT ASIDE ARE NEVER WRITTEN OVER: while their copy is in flight the switch is refused by name; the copy failed (placed) ⇒ HELD, the next switch refused too and the file is still the torn bytes; the read again keeps them and lifts, and the switch after it lands; red control: «a failed copy not held» writes over their only copy', { u1, u0 });
  // the read again's timer kept and fired by the leg (its own wait, never a clock) — for the legs below
  const manualRetry = () => { const MS = 777777, again = []; return { again, ex: { storeRetry: { firstMs: MS, maxMs: MS, missingMs: MS }, timers: { set: (fn, ms) => (ms === MS ? (again.push(fn), {}) : setTimeout(fn, ms)), clear: (h) => clearTimeout(h) } } }; };
  // (7) 主开发 r3040 (a) — THE TORN COPY, THE FAMILY'S WAY: a short file left from before (a crash between a create and its write) is
  // never taken for the copy; a copy whose write fails PART-WAY (placed: three bytes written, then ENOSPC) leaves no file behind and
  // holds the store; the read again writes it WHOLE and lifts; its name is dated, no digest of the bytes; red control: a keep that
  // trusts «exists»
  const familyLeg = async (doorMod) => {
    const w = await world({ doorMod }); const torn = '{"suspended": ["mounts:m1#secretKey"], "ru';
    fs.writeFileSync(fileOf(w), torn);
    fs.writeFileSync(path.join(w.dataDir, DOOR.STORE_FILE + '.corrupt-2026-01-01T00-00-00-000Z'), torn.slice(0, 4));   // a short file from before
    const { again, ex } = manualRetry();
    const real = fs.promises.open; let fails = 1;   // the copy is written through its own handle (open · write · sync · close · rename)
    fs.promises.open = async function (p, ...x) { const fh = await real.call(this, p, ...x); if (typeof p === 'string' && path.basename(p).startsWith(DOOR.STORE_FILE + '.corrupt-') && fails > 0) { fails--; const rw = fh.writeFile.bind(fh); fh.writeFile = async (data) => { await rw(Buffer.from(data).subarray(0, 3)); throw Object.assign(new Error('placed ENOSPC'), { code: 'ENOSPC' }); }; } return fh; };
    let d, held = false, partLeft = true, lifted = false;
    try {
      d = w.mk(doorMod, ex);
      d.setRunnable({ id: 'mounts:m2#secretKey', on: false });   // the load: torn bytes — their copy fails part-way
      await sleep(60);
      held = !!d._storeHeld();
      partLeft = fs.readdirSync(w.dataDir).some((f) => f.includes('.part-'));
      if (again.length) again.shift()();
      lifted = await waitLift(d, 1500);
      d.setRunnable({ id: 'mounts:m2#secretKey', on: false });
      await sleep(60);
      d.setRunnable({ id: 'mounts:m2#secretKey', on: false });   // the owner's switch: writes over the torn file — their copy stands beside it
    } finally { fs.promises.open = real; }
    const copies = fs.readdirSync(w.dataDir).filter((f) => f.startsWith(DOOR.STORE_FILE + '.corrupt-'));
    return { held, partLeft, lifted, whole: copies.some((f) => fs.readFileSync(path.join(w.dataDir, f), 'utf8') === torn), dated: copies.every((f) => /\.corrupt-\d{4}-\d\d-\d\dT[\d-]+Z(-\d)?$/.test(f)), copies: copies.length };
  };
  const f1 = await familyLeg(DOOR), f0 = await familyLeg(doorCopy("if (st.isFile() && st.size === bytes.length && (await fs.promises.readFile(p)).equals(bytes)) return true;", 'if (st.isFile()) return true;', 'a keep that trusts «exists»'));
  ok(f1.held && !f1.partLeft && f1.lifted && f1.whole && f1.dated && !f0.whole, `r3040 (a) THE TORN COPY, THE FAMILY'S WAY: a short file from before is never taken for the copy; a copy that fails part-way leaves no file behind and HOLDS; the read again writes it whole (dated, no digest in its name — ${f1.copies} file(s)) and lifts; red control: «a keep that trusts «exists»» leaves only the short file`, { f1, f0 });
  // (8) 主开发 r3040 THE MUST — A PERSON'S PRESS WHILE HELD IS ATTENDED: a standing request filed while the store is held, its Allow
  // pressed (验证是你): refused BY NAME (store_held), the request still OPEN, nothing «put back», the file unchanged; after the lift
  // the same Allow lands; red control: a press road with no hold check (restore_failed, the request settled «denied»)
  const pressLeg = async (doorMod) => {
    const VUGs = R('src/server/vault-use-grants.js'), GSs = R('src/server/grants-store.js');
    const w = await world({ doorMod }); twoOff(w);
    const gss = GSs.create({ memory: true });
    const ugs = VUGs.create({ grants: () => gss, vault: w.vault, dataDir: w.dataDir, log: (m) => w.logs.push(String(m)) });
    const { again, ex } = manualRetry();
    const undo = placeSync(fileOf(w), ['EIO']);
    let d;
    try { d = w.mk(doorMod, { ...ex, useGrants: ugs, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) }); d.setRunnable({ id: 'mounts:m1#secretKey', on: false }); } finally { undo(); }   // the load: held
    const before = fs.readFileSync(fileOf(w), 'utf8'), logs0 = w.logs.length;
    const sq = await d.request({ caller: w.caller, entry: 'vault://mounts/m1/secretKey', purpose: 'a standing approval while the store is held', standing: true, hosts: ['api.example.com'], cwd: w.work });
    const first = sq && sq.askId ? d.answerRequest(sq.askId, { answer: 'standing', reauthed: true, person: true }) : null;
    const open1 = !!(sq && sq.askId && d._requests.has(sq.askId));
    const unchanged = fs.readFileSync(fileOf(w), 'utf8') === before, putBack = w.logs.slice(logs0).some((l) => /could not be put back/.test(l));
    if (again.length) again.shift()();
    const lifted = await waitLift(d, 1500);
    const second = open1 ? d.answerRequest(sq.askId, { answer: 'standing', reauthed: true, person: true }) : null;
    return { asked: !!(sq && sq.askId), first: first && first.code, open1, unchanged, putBack, lifted, second: !!(second && second.ok), sq: sq && (sq.code || null) };
  };
  const p1 = await pressLeg(DOOR), p0 = await pressLeg(doorCopy(NO_HOLD_PRESS, null, 'a press road with no hold check'));
  ok(p1.asked && p1.first === 'store_held' && p1.open1 && p1.unchanged && !p1.putBack && p1.lifted && p1.second && !p0.open1,
    `r3040 THE MUST — A PERSON'S PRESS WHILE HELD IS ATTENDED: a standing request's Allow while held is refused by name (store_held), the request stays open, nothing is «put back», the file is unchanged; pressed again after the lift it lands; red control: «a press road with no hold check» answers ${p0.first} and settles the request`, { p1, p0 });
  // (9) 主开发 r3040 (b) + (c) — THE HOLD IS ASKED FIRST at every owner door (a Revoke, a policy, a resume: refused by name, never «done»);
  // a hold that cannot mend by itself (the file a link) says its cause and what to do; red control: a Revoke with no hold check
  const firstLeg = async (doorMod) => {
    const w = await world({ doorMod }); twoOff(w);
    const link = path.join(w.dataDir, 'vault-run.real.json');
    fs.renameSync(fileOf(w), link); fs.symlinkSync(link, fileOf(w));   // the store is a link: never followed
    const d = w.mk(doorMod, SLOW);
    const sw = d.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true });
    const rv = d.revokeApprovals({ id: 'mounts:m1#secretKey' }), pol = d.setPolicy({ id: 'mounts:m1#secretKey', text: '', reauthed: true }), rs = d.resumeGrant({ id: 'mounts:m1#secretKey', principal: 'conversation:c-1', reauthed: true });
    return { sw: sw && sw.code, cause: sw && sw.cause, words: String(sw && sw.words), rv: rv && (rv.code || (rv.ok ? 'ok' : '?')), pol: pol && pol.code, rs: rs && rs.code };
  };
  const g1 = await firstLeg(DOOR), g0 = await firstLeg(doorCopy(NO_HOLD_REVOKE, null, 'a Revoke with no hold check'));
  const winW = fs.readFileSync(path.join(REPO, 'src/lib/vault-reveal.js'), 'utf8');
  ok(g1.sw === 'store_held' && g1.cause === 'link' && /is a link/.test(g1.words) && !/try again in a minute/.test(g1.words) && g1.rv === 'store_held' && g1.pol === 'store_held' && g1.rs === 'store_held' && g0.rv === 'ok' && winW.includes("if (c === 'store_held' && r.cause === 'link') return t("),
    `r3040 (b) + (c): THE HOLD IS ASKED FIRST — a Revoke, a policy and a resume while held are refused by name (never «done»); a store that is a link says so and what to do (cause «${g1.cause}», never «try again in a minute»), worded in the window; red control: «a Revoke with no hold check» answers ${g0.rv}`, { g1, g0 });
  // (10) 主开发 r3147 (1) + (2) + (4) — THE ONE DOOR, read in the source: every owner door and press road starts at ownerLoad() (loaded,
  // then the hold asked): no door asks heldNow() itself, none loads before it; the three press callers and the legacy save ask heldIn()
  // before any settle; the two For-you card handlers and the route word store_held; red control: a planted door that asks the hold itself
  const doorCensus = (t) => {   // 主开发 r3267 (1): EVERY body that saves or writes the grants store, a load matched with any argument
    const strip = (x) => x.replace(/\/\/[^\n]*/g, '');
    const heads = [];   // spans read on the RAW text (a `//` inside a string never cuts a line short); each body's comments stripped after
    const spanOf = (m) => { const le = t.indexOf('\n', m.index + 1); if (le < 0) return t.length; const k = t.slice(le).search(/\n  \S/); return k < 0 ? t.length : le + k; };   // a body ends where the next statement at create()'s own level begins
    for (const m of t.matchAll(/\n  (?:async )?function ([A-Za-z_]\w*)\(/g)) heads.push([m.index, spanOf(m), m[1]]);
    for (const m of t.matchAll(/\n  const ([A-Za-z_]\w*) = (?:async )?\([^)]*\) => /g)) heads.push([m.index, spanOf(m), m[1]]);
    const WRITES_GRANTS = /useGrants\.(?:setRow|addMember|restoreRow|revoke|revokeWindow|drop|carry|carryWildcards|pruneWindows)\(/;
    const EXEMPT = {
      save: 'the writer itself — it asks the hold before it writes', carryAlways: 'a migration carry, run by load on a store that reads', carryWild: 'a migration carry, run by load on a store that reads',
      reserveHour: 'the policy judge\'s hour booking — its road is gated on a store that reads', releaseHour: 'the policy judge\'s hour booking', recordApproval: 'the policy judge\'s memo — gated on a store that reads',
      resumeMember: 'an inner step: its callers (resumeGrant, standOpen, the owner\'s Save) are doors', answerWindow: 'its press writes through standOpen (the one door); its pruneWindows is the window\'s end timer, in the grants\' own store',
      takeBack: 'the ✕ — a narrowing in the grants\' own store (its own hold); nothing of this store', saveRow: 'its write is the setRow wrapper, which asks ownerLoad({ carry: false }) for an owner\'s 验证是你 Save',
    };
    const bad = [], doors = [], seen = new Set();
    for (const [p, e, name] of heads) {
      const body = strip(t.slice(p, e));
      if (!/[^\w.]save\(/.test(body) && !WRITES_GRANTS.test(body)) continue;
      seen.add(name);
      if (EXEMPT[name]) continue;
      doors.push(name);
      const own = body.indexOf('ownerLoad('), ld = body.search(/[^\w.]load\(/);
      if (own < 0) bad.push(`${name}: no ownerLoad()`);
      if (/\bheldNow\(/.test(body)) bad.push(`${name}: asks heldNow() itself`);
      if (ld >= 0 && (own < 0 || ld < own)) bad.push(`${name}: loads before ownerLoad()`);
    }
    for (const n of Object.keys(EXEMPT)) if (!seen.has(n)) bad.push(`${n}: an exempt row with no body that saves (a dead row)`);
    const w0 = t.indexOf('    useGrants.setRow = (id, row, opts = {}) => {'), wrap = strip(t.slice(w0, t.indexOf('      return r;\n    };', w0)));
    if (!/opts\.reauthed === true\) \{ const o = ownerLoad\(\{ carry: false \}\); if \(o\.held\) return o\.held; \}/.test(wrap) || /\bheldNow\(/.test(wrap)) bad.push('the owner\'s Save: not through ownerLoad()');
    return { bad, doors, settles: (t.match(/\{ const h = heldIn\((so|r)\); if \(h\) return h; \}/g) || []).length };
  };
  const dc = doorCensus(SRCD), dcp = doorCensus(SRCD.replace(NO_HOLD_REVOKE[0][0], "    { const h = heldNow(); if (h) return h; } const o = { d: load() };"));
  const dcNew = doorCensus(SRCD.replace('  function setPolicy(', "  function zzNewDoor({ id } = {}) {\n    const d = load({ carry: true });\n    return save({ runnable: d.runnable, always: d.always });\n  }\n  function setPolicy("));
  const dcArg = doorCensus(SRCD.replace(NO_HOLD_SWITCH[0][0], "    load({ carry: true }); const o = ownerLoad(); if (o.held) return o.held;"));
  const UTA = fs.readFileSync(path.join(REPO, 'src/lib/user-todos-actions.js'), 'utf8'), RV = fs.readFileSync(path.join(REPO, 'src/routes/vault.js'), 'utf8'), VRV = fs.readFileSync(path.join(REPO, 'src/lib/vault-reveal.js'), 'utf8');
  const worded = UTA.split("showToast(code === 'store_held' || code === 'vault_use_marks_unread' ? heldPressWords(r) : code === 'ask_settled'").length - 1;   // r3255: the grants' marks worded too
  ok(!dc.bad.length && ['setRunnable', 'setPolicy', 'revokeApprovals', 'standOpen', 'answer'].every((n) => dc.doors.includes(n)) && dc.settles === 4 && dcp.bad.some((b) => /revokeApprovals: asks heldNow\(\) itself/.test(b)) && dcNew.bad.some((b) => /zzNewDoor: no ownerLoad/.test(b)) && dcArg.bad.some((b) => /setRunnable: loads before ownerLoad/.test(b)) && worded === 2 && /store_held: 503/.test(RV) && /\n  store_held: 'the vault\\'s run settings could not be read just now/.test(RV) && /export function heldPressWords\(r\)/.test(VRV),
    `r3147 (1) + (2) + (4) + r3267 (1) THE ONE DOOR: EVERY body that saves or writes the grants store (${dc.doors.join(', ')}; the rest named exempt with their reasons) starts at ownerLoad() — none asks the hold or loads (with any argument) before it, the owner's Save through ownerLoad({ carry: false }); ${dc.settles} press callers ask heldIn() before any settle; both For-you card handlers word store_held (${worded}), the route says it (503 and its words); red controls: a planted door that asks the hold itself (${dcp.bad.join('; ')}), a NEW door under another name, and a door that loads with an argument first are each named`, { dc, dcp, dcNew: dcNew.bad, dcArg: dcArg.bad, worded });
  // (11) 主开发 r3147 THE MUST — THE HOLD IS ASKED AFTER THE LOAD THAT CAN SET IT: torn bytes whose copy fails (placed: the copy's open
  // refused, the disk full) ⇒ held; a standing request filed while held; space back: the read again keeps the copy and lifts; the
  // person presses Allow — the press's own load meets the torn bytes again (their compare in flight): refused BY NAME, the request
  // still OPEN, nothing «put back»; once the compare has answered, a second Allow lands; red control: today's order (asked, then loaded)
  const tornPressLeg = async (doorMod) => {
    const VUGs = R('src/server/vault-use-grants.js'), GSs = R('src/server/grants-store.js');
    const w = await world({ doorMod }); twoOff(w);
    const gss = GSs.create({ memory: true });
    const ugs = VUGs.create({ grants: () => gss, vault: w.vault, dataDir: w.dataDir, log: (m) => w.logs.push(String(m)) });
    const torn = '{"suspended": ["mounts:m1#secretKey"], "ru';
    fs.writeFileSync(fileOf(w), torn);
    const { again, ex } = manualRetry();
    const real = fs.promises.open; let fails = 1;
    fs.promises.open = function (p, ...x) { if (typeof p === 'string' && path.basename(p).startsWith(DOOR.STORE_FILE + '.corrupt-') && fails > 0) { fails--; return Promise.reject(Object.assign(new Error('placed ENOSPC'), { code: 'ENOSPC' })); } return real.call(this, p, ...x); };
    let d, held = false, sq = null, lifted = false, first = null, open1 = false, second = null, putBack = false;
    try {
      d = w.mk(doorMod, { ...ex, useGrants: ugs, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) });
      d.setRunnable({ id: 'mounts:m2#secretKey', on: false });   // the load: torn bytes, their copy refused ⇒ HELD
      await sleep(60);
      held = !!d._storeHeld();
      sq = await d.request({ caller: w.caller, entry: 'vault://mounts/m1/secretKey', purpose: 'a standing approval across a torn lift', standing: true, hosts: ['api.example.com'], cwd: w.work });
      if (again.length) again.shift()();   // space back: the read again keeps the copy whole and lifts
      lifted = await waitLift(d, 1500);
      const logs0 = w.logs.length;
      first = sq && sq.askId ? d.answerRequest(sq.askId, { answer: 'standing', reauthed: true, person: true }) : null;   // the press's own load: the torn bytes again
      open1 = !!(sq && sq.askId && d._requests.has(sq.askId));
      putBack = w.logs.slice(logs0).some((l) => /could not be put back/.test(l));
      await sleep(80);   // the compare answered: the copy is there
      second = open1 ? d.answerRequest(sq.askId, { answer: 'standing', reauthed: true, person: true }) : null;
    } finally { fs.promises.open = real; }
    return { held, asked: !!(sq && sq.askId), lifted, first: first && first.code, open1, putBack, second: !!(second && second.ok) };
  };
  const t1 = await tornPressLeg(DOOR), t0 = await tornPressLeg(doorCopy(TODAY_ORDER, null, 'today\'s order: the hold asked, then loaded'));
  ok(t1.held && t1.asked && t1.lifted && t1.first === 'store_held' && t1.open1 && !t1.putBack && t1.second && !t0.open1,
    `r3147 THE MUST — THE HOLD IS ASKED AFTER THE LOAD THAT CAN SET IT: across a torn lift the press's own load meets the torn bytes again; its Allow is refused by name, the request stays open, nothing is «put back»; once the compare has answered the second Allow lands; red control: «today's order» answers ${t0.first} and settles the request`, { t1, t0 });
  // (12) 主开发 r3147 (5): a .part- left by a crash mid-copy is never a copy — the keep reaps it once it is a day old; a fresh one stays
  {
    const w = await world(); const torn = '{"suspended": ["mounts:m1#secretKey"], "ru';
    fs.writeFileSync(fileOf(w), torn);
    const oldPart = path.join(w.dataDir, DOOR.STORE_FILE + '.corrupt-2026-01-01T00-00-00-000Z.part-1-aaaaaaaa'), freshPart = path.join(w.dataDir, DOOR.STORE_FILE + '.corrupt-2026-01-02T00-00-00-000Z.part-2-bbbbbbbb');
    fs.writeFileSync(oldPart, 'x'); fs.writeFileSync(freshPart, 'y');
    const t2 = (Date.now() - 2 * 86400e3) / 1000; fs.utimesSync(oldPart, t2, t2);
    const d = w.mk(DOOR, SLOW); d.setRunnable({ id: 'mounts:m2#secretKey', on: false });   // the load: torn bytes — the keep runs
    await sleep(80);
    ok(!fs.existsSync(oldPart) && fs.existsSync(freshPart), 'r3147 (5): the keep reaps a .part- file once it is a day old (a crash mid-copy, never a copy); a fresh one stays', { old: fs.existsSync(oldPart), fresh: fs.existsSync(freshPart) });
  }
  // (13) 主开发 r3255 — THE GRANTS' MARKS HELD (vault-use-marks.json under the store-read law, src/server/vault-use-grants.js): a
  // standing request's Allow while the MARKS are held is refused BY NAME (vault_use_marks_unread) before ANY write — this store's file
  // untouched, the request OPEN, nothing «put back» — and once the marks read again (src/store-read-hold.js readAgainOf) the same
  // Allow lands. The fact is asked through the name the PRODUCTION object carries: the REAL module's marksUnread, and the wiring that
  // hands that module to this door is pinned below; red control: a press road that asks no marks' fact
  const SRH = R('src/store-read-hold.js');
  const marksLeg = async (doorMod) => {
    const VUGs = R('src/server/vault-use-grants.js'), GSs = R('src/server/grants-store.js');
    const w = await world({ doorMod }); twoOff(w);
    const gss = GSs.create({ memory: true });
    const ugs = VUGs.create({ grants: () => gss, vault: w.vault, dataDir: w.dataDir, log: (m) => w.logs.push(String(m)) });
    const d = w.mk(doorMod, { useGrants: ugs, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) });
    const sq = await d.request({ caller: w.caller, entry: 'vault://mounts/m1/secretKey', purpose: 'a standing approval, then the vault-use marks held', standing: true, hosts: ['api.example.com'], cwd: w.work });   // filed while the marks read
    ugs._marksHold.start({ state: 'unreadable', code: 'EIO' });   // the marks HELD after the filing — a PLACED failed read on the production module's own hold (as a lift whose re-read fails)
    const held = !!ugs.marksUnread();
    const before = fs.readFileSync(fileOf(w), 'utf8'), logs0 = w.logs.length;
    const press = () => d.answerRequest(sq.askId, { answer: 'standing', reauthed: true, person: true });
    let first = null; if (sq && sq.askId) for (let k = 0; k < 3; k++) { first = press(); if (!first || first.code !== 'ask_redrawn') break; }   // a redraw (the card's changes read again while held) keeps it open
    const open1 = !!(sq && sq.askId && d._requests.has(sq.askId));
    const unchanged = fs.readFileSync(fileOf(w), 'utf8') === before, putBack = w.logs.slice(logs0).some((l) => /could not be put back/.test(l));
    for (let k = 0; k < 4 && ugs.marksUnread(); k++) await SRH.readAgainOf('vault-use-marks.json');   // the marks read again (a missing file: its second look, then lifted)
    const lifted = !ugs.marksUnread();
    let second = null; if (open1) for (let k = 0; k < 3; k++) { second = press(); if (!second || second.code !== 'ask_redrawn') break; }
    return { held, asked: !!(sq && sq.askId), sq: sq && (sq.code || null), first: first && first.code, open1, unchanged, putBack, lifted, second: !!(second && second.ok) };
  };
  const k1 = await marksLeg(DOOR), k0 = await marksLeg(doorCopy(NO_MARKS_ASKED, null, 'a press road that asks no marks\' fact'));
  const WIRE = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  const runCreate = (WIRE.match(/const vaultRun = require\('\.\/vault-run-door\.js'\)\.create\(\{((?:(?!\}\);)[\s\S])*)\}\);/) || [])[1] || '';   // the door's ONE create call, to its close
  const wired = /const vaultUseGrants = require\('\.\/vault-use-grants\.js'\)\.create\(/.test(WIRE) && /\buseGrants: vaultUseGrants\b/.test(runCreate);
  ok(k1.held && k1.asked && k1.first === 'vault_use_marks_unread' && k1.open1 && k1.unchanged && !k1.putBack && k1.lifted && k1.second && wired && (!k0.unchanged || k0.putBack),
    `r3255 THE GRANTS' MARKS HELD: a standing request's Allow is refused by name (${k1.first}) before any write — this store untouched, the request open, nothing «put back»; the marks read again, the same Allow lands; asked through the REAL module's marksUnread, and the wiring hands that module to the door (src/server/mounts-plugins-wiring.js: useGrants: vaultUseGrants — ${wired ? 'pinned' : 'NOT FOUND'}); red control: «a press road that asks no marks' fact» writes this store and puts it back`, { k1, k0, wired });
  // (14) 主开发 r3255 (3): the Vault window's row says the hold in place — rowFacts carries `held` (and its cause) while the store is
  // held, and the row draws the hold's sentence (src/lib/vault-use-row.js heldRowWords, zh / ja); it redraws when the hold lifts
  {
    const w = await world(); twoOff(w);
    const undo = placeSync(fileOf(w), ['EIO']);
    let d, f;
    try { d = w.mk(DOOR, SLOW); d.setRunnable({ id: 'mounts:m1#secretKey', on: false }); f = d.rowFacts({ id: 'mounts:m1#secretKey' }); } finally { undo(); }
    const UR = fs.readFileSync(path.join(REPO, 'src/lib/vault-use-row.js'), 'utf8'), VR2 = fs.readFileSync(path.join(REPO, 'src/lib/vault-reveal.js'), 'utf8');
    ok(!!(f && f.held === true && f.paused) && /if \(r && r\.run && r\.run\.held\) host\.append\(el\('div', 'vw-use-bad', heldRowWords\(r\.run\)\)\);/.test(UR) && /row\.run\.held\) \? \(row\.run\.heldCause \|\| 'held'\) : null\]/.test(UR) && /export function heldRowWords\(run\)/.test(VR2),
      'r3255 (3): while held the row facts say so (held, paused) and the Vault window draws the hold\'s sentence in its place (heldRowWords; the row redraws when the hold lifts)', f);
  }
}

// B-54a9 split: ⑦'s copies census read the copies ⑥b and ⑥c made (they ran before it); they run here now, so the same census line
// reads them here, at the same place in their order (after ⑥c, before ⑪) — the door's ⑦ keeps its own
  for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 2 })) ok(c.pass, c.name, c.detail);
console.log('⑪ THE OWN ROAD (lane vault-agent-own) — what an agent stored itself is its own to use; a minted value asks once per other host');
{
  const w = await world({ instance: 'cluster', killGraceMs: 400 });   // a cluster asks EVERY run of anything else: «no card» here is the own road's
  const OWN = 'vault://agent:conv-1/gh-token', MINT = 'vault://agent:conv-1/site-pw', OWN_V = 'agent-minted-value-0123456789', MINT_V = 'agent-minted-pw-0123456789abc';
  const usesOf = () => w.door.usesFor({ ...w.caller, scope: 'conv-1' }).uses || [];
  // STORED: no switch, no grant, no card — scrubbed, audited (allowedBy own), a use line with the receipt
  const r1 = await w.door.run({ caller: w.caller, args: ['--env', `T=${OWN}`, '--', NODE, PRINTER, 'env'], cwd: w.work });
  const line1 = runLines(w).filter((x) => x.outcome === 'ran').pop(), use1 = usesOf()[0];
  ok(r1.ok && r1.by === 'own' && !cardsOf(w).length && !leaks(r1.stdout + r1.stderr, OWN_V).length && /\[vault:agent:conv-1\/gh-token\]/.test(r1.stdout), 'its own STORED entry: no switch, no grant, NO CARD on a cluster — the output scrubbed to its placeholder', [r1.code || r1.by, cardsOf(w).length]);
  ok(!!line1 && line1.allowedBy === 'own' && line1.entries[0] === OWN && line1.receipt === r1.receipt && !!use1 && use1.door === 'run' && use1.outcome === 'ok' && use1.receipt === r1.receipt && use1.entry === OWN, 'still a use: its run line says allowedBy own, its use line (door run, ok) carries the run\'s receipt — `vibespace-vault uses` lists it', [line1 && line1.allowedBy, use1]);
  const sh = await w.door.run({ caller: w.caller, args: ['--env', `T=${OWN}`, '--', '/bin/sh', '-c', 'echo "$T"'], cwd: w.work });
  ok(sh.ok && sh.by === 'own' && !cardsOf(w).length && !leaks(sh.stdout, OWN_V).length, 'a shell too (a shell\'s whole command is its shape — still no card for its own stored value; the scrubber still reads the output)', sh.code || sh.by);
  const pr = await w.door.run({ caller: w.caller, args: ['--env', `T=${OWN}`, '--', 'cat', '$VAULT_FILE{T}'], cwd: w.work });
  ok(pr.code === 'tool_prints_secrets', 'the refusal tables still hold for its own entry: a printing tool is refused by name', pr.code);
  // WHOSE: a resumed conversation keeps it (its durable id); a pending fork and another conversation are refused by name
  const resumed = { ...w.caller, scope: 'sess-77-1', conv: 'conv-1', conversationId: 'conv-1' };
  const r2 = await w.door.run({ caller: resumed, args: ['--env', `T=${OWN}`, '--', NODE, PRINTER, 'env'], cwd: w.work });
  ok(r2.ok && r2.by === 'own', 'a conversation that ended and came back (a new registered id, its durable id kept) runs its own entry — no card', r2.code || r2.by);
  const fork = await w.door.run({ caller: { ...w.caller, scope: 'sess-78-1', conv: null, conversationId: 'conv-1' }, args: ['--env', `T=${OWN}`, '--', NODE, PRINTER, 'env'], cwd: w.work });
  const other = await w.door.run({ caller: { ...w.caller, conversationId: 'conv-2', sessionKey: 'claude:conv-2', name: 'Lane Y', scope: 'sess-79-1', conv: 'conv-2' }, args: ['--env', `T=${OWN}`, '--', NODE, PRINTER, 'env'], cwd: w.work });
  ok(fork.code === 'use_not_granted' && other.code === 'use_not_granted' && !cardsOf(w).length, 'a pending fork (it borrows its parent\'s id: conv null) and another conversation ⇒ use_not_granted by name — no card, nothing read', [fork.code, other.code]);
  // MINTED --for api.example.com: its host and no host ⇒ no card; another host ⇒ ONE card naming both; once allowed, that host is passed
  const m1 = await w.door.run({ caller: w.caller, args: ['--env', `T=${MINT}`, '--', 'curl', '-s', 'https://api.example.com/v1/login'], cwd: w.work });
  ok(m1.ok && m1.by === 'own' && !cardsOf(w).length && !leaks(m1.stdout, MINT_V).length, 'its own MINTED entry to the host it was minted for ⇒ no card', m1.code || m1.by);
  // ROUND 2: a known tool naming no host it can READ is not a local command (every tool of the table reaches the network)
  const m0 = await runAnswered(w, ['--env', `T=${MINT}`, '--', 'curl', '-s'], { answer: 'deny' });
  ok(!!m0.card && m0.r.code === 'ask_denied' && /Why it asks: where this command sends it cannot be told \(.*a host it does not read/.test(m0.card.detail || ''), 'its MINTED value in a known tool naming no host it can read (curl -s) ⇒ the card (where it goes cannot be told) — denied, nothing ran', m0.r.code);
  const away = await runAnswered(w, ['--env', `T=${MINT}`, '--', 'curl', '-s', 'https://elsewhere.example.net/x'], { answer: 'once' });
  const d = (away.card && away.card.detail) || '';
  ok(!!away.card && away.r.ok && away.r.by === 'once' && away.card.action.always === false && /Stored by: vault:\/\/agent:conv-1\/site-pw — this conversation \(the hub minted it for api\.example\.com/.test(d) && /Why it asks: it would go to another host — vault:\/\/agent:conv-1\/site-pw was minted for api\.example\.com, this run sends it to elsewhere\.example\.net/.test(d) && !d.includes(MINT_V),
    'to ANOTHER host ⇒ ONE card: who stored it and why it asks, BOTH hosts named, no «always» (a host at a time) — allowed once, it ran', { card: !!away.card, by: away.r.by, always: away.card && away.card.action.always, detail: d.split('\n').filter((l) => /^(Stored by|Why it asks)/.test(l)) });
  const again = await w.door.run({ caller: w.caller, args: ['--env', `T=${MINT}`, '--', 'curl', '-s', 'https://elsewhere.example.net/other'], cwd: w.work });
  ok(again.ok && again.by === 'own' && !cardsOf(w).length, 'ONCE per host: the same host again ⇒ no card (the 允许 was that host\'s pass for this entry)', again.code || again.by);
  const third = await runAnswered(w, ['--env', `T=${MINT}`, '--', 'curl', '-s', 'https://third.example.org/'], { answer: 'deny' });
  ok(!!third.card && third.r.code === 'ask_denied', 'a THIRD host asks again — denied, nothing ran', third.r.code);
  // THE REVIEW + ROUND 2: through a shell or an interpreter its destination cannot be told — even naming its own host — ⇒ on a
  // CLUSTER the card EVERY run (one plain 允许 is never kept there: the owner's own entries ask every run too)
  const shellArgs = ['--env', `T=${MINT}`, '--', '/bin/sh', '-c', 'curl -s https://api.example.com/v1/login'];
  const blind1 = await runAnswered(w, shellArgs, { answer: 'once' });
  const bd = (blind1.card && blind1.card.detail) || '';
  const blind2 = await runAnswered(w, shellArgs, { answer: 'deny' });
  ok(!!blind1.card && blind1.r.ok && !leaks(blind1.r.stdout || '', MINT_V).length && /Why it asks: where this command sends it cannot be told/.test(bd) && /on this shared instance every run of it asks again/.test(bd) && blind1.card.action.always === false && !!blind2.card && blind2.r.code === 'ask_denied',
    'its MINTED value through a SHELL on a cluster (where it goes cannot be told, even naming its own host) ⇒ the card; allowed once it ran — and the SAME shape asks AGAIN (a cluster keeps no shape pass)', { card: !!blind1.card, second: blind2.r.code, why: bd.split('\n').filter((l) => /^Why/.test(l)) });
  const nodeArgs = ['--env', `T=${MINT}`, '--', NODE, '-e', 'process.stdout.write("node got " + process.env.T + "\\n")'];
  const n1 = await runAnswered(w, nodeArgs, { answer: 'once' }), n2 = await runAnswered(w, nodeArgs, { answer: 'deny' });
  ok(!!n1.card && n1.r.ok && /node got \[vault:agent:conv-1\/site-pw\]/.test(n1.r.stdout || '') && !!n2.card && n2.r.code === 'ask_denied', 'node -e on a cluster: allowed once ⇒ it ran (scrubbed); the NEXT run asks again', [n1.r.code || n1.r.by, n2.r.code]);
  // RED COPY (round 2): a door that reads the LOCAL rule on a cluster — the remember-until-lock this round removed — runs the same node -e again with NO card
  const SRCD = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8'), fromD = 'instance: instanceKind(), policy: policy(), passes: passes(), now: now() });';
  const nD = SRCD.split(fromD).length - 1, modD = nD === 1 ? M.load('src/server/vault-run-door.js', editAnchor(SRCD, fromD, "instance: instanceKind(), policy: 'allow', passes: passes(), now: now() });", "src/server/vault-run-door.js"), 'cluster-keeps') : null;
  const wr = modD ? await world({ instance: 'cluster', doorMod: modD }) : null;
  const rn1 = wr ? await runAnswered(wr, nodeArgs, { answer: 'once' }) : null, rn2 = wr ? await runAnswered(wr, nodeArgs, { answer: 'deny' }) : null;
  ok(nD === 1 && !!rn1 && rn1.r.ok && !!rn2 && !rn2.card && rn2.r.ok, 'RED COPY (round 2): a door reading the local rule on a cluster runs the SAME node -e again with NO card after one plain 允许 — the shipped door asks (above)', { n: nD, second: rn2 && (rn2.r.by || rn2.r.code), card: rn2 && !!rn2.card });
  if (wr) wr.vault.lock('door');
  // round 25 (the vault-use-grants seam ruling): an OPAQUE route (curl --resolve remaps the destination off the named host — a routing flag, `blind`) never offers «always» — the card is once / deny only, and the SAME shape draws its OWN card again (an opaque destination is never a standing pass; vault-use-grants' rule stands at int-C)
  const kyArgs = ['--env', `T=${MINT}`, '--', 'curl', '-s', '--resolve', 'api.example.com:443:127.0.0.1', 'https://api.example.com/v1/login'];
  const k1 = await runAnswered(w, kyArgs, { answer: null });
  const kNoAlways = k1.card ? w.door.answer(k1.card.action.askId, { answer: 'always', ttl: '8h', reauthed: true }) : null;   // «always» is not on offer for an opaque route (even with the second password)
  const k1a = k1.card ? w.door.answer(k1.card.action.askId, { answer: 'once' }) : null;   // once is
  const k1r = await k1.r;
  const k2 = await runAnswered(w, kyArgs, { answer: 'deny' });   // the SAME opaque shape asks AGAIN — no standing pass was minted
  ok(!!k1.card && k1.card.action.always === false && kNoAlways && kNoAlways.code === 'always_not_offered' && k1a && k1a.ok && k1r.ok && k1r.by === 'once' && !!k2.card && k2.card.action.always === false && !leaks(k1r.stdout || '', MINT_V).length,
    'round 25 (the vault-use-grants seam ruling): an OPAQUE route (curl --resolve) never offers «always» — answering «always» is refused always_not_offered, the card is once / deny, the run goes by:once, and the same shape draws its OWN card again (an opaque destination is never a standing pass)', { always: k1.card && k1.card.action.always, kAlways: kNoAlways && kNoAlways.code, by: k1r.by || k1r.code, k2always: k2.card && k2.card.action.always });
  // round 17 (item 1): curl -K whose config is a $VAULT_FILE template the card RENDERS IN FULL ⇒ «always» IS offered (the owner
  // sees the agent's ONLY written input; the pass is keyed on the template bytes, already in the shape key). The owner's router case.
  fs.writeFileSync(path.join(w.work, 'router.cfg'), 'header = "X-API-KEY: $VAULT{agent:conv-1/site-pw}"\nheader = "Accept: application/json"\ninsecure\nsilent\n');
  const uArgs = ['--file', 'CFG=@router.cfg', '--', 'curl', '-s', '-K', '$VAULT_FILE{CFG}', 'https://192.168.1.1/api/v1/integration/sites'];
  const u1 = await runAnswered(w, uArgs, { answer: null });
  const ud = (u1.card && u1.card.detail) || '';
  const uNoPw = u1.card ? w.door.answer(u1.card.action.askId, { answer: 'always', ttl: '30d' }) : null;
  const uYes = u1.card ? w.door.answer(u1.card.action.askId, { answer: 'always', ttl: '30d', reauthed: true }) : null;
  const u1r = await u1.r;
  const u2 = await w.door.run({ caller: w.caller, args: uArgs, cwd: w.work });
  const ust = JSON.parse(fs.readFileSync(path.join(w.dataDir, DOOR.STORE_FILE), 'utf8'));
  const urow = (ust.always || []).find((a) => typeof a.templateHash === 'string');
  ok(!!u1.card && u1.card.action.always === true && /Template CFG \(@router\.cfg\):/.test(ud) && /X-API-KEY: \$VAULT\{agent:conv-1\/site-pw\}/.test(ud) && !/«Always» is not offered/.test(ud) && uNoPw && uNoPw.code === 'reveal_needs_password' && uYes && uYes.ok && u1r.ok && u1r.by === 'always' && u2.ok && u2.by === 'always' && !u2.card && !leaks((u1r.stdout || '') + (u2.stdout || ''), MINT_V).length && urow && /^[0-9a-f]{64}$/.test(urow.templateHash) && urow.templateBytes > 0,
    'round 17 (item 1): curl -K whose config is a $VAULT_FILE template the card RENDERS IN FULL ⇒ «always» IS offered (the owner sees the agent\'s only written input); the card shows the template, the second password grants it, an identical re-run runs with NO card (by «always»), and the persisted «always» row carries templateHash + templateBytes for lane vault-use-grants', { always: u1.card && u1.card.action.always, by: [u1r.by || u1r.code, u2.by || u2.code], templateHash: urow && urow.templateHash, templateBytes: urow && urow.templateBytes });
  // a template with one header ADDED ⇒ a NEW card (the stored «always» no longer matches; the card shows the template with the added line)
  fs.writeFileSync(path.join(w.work, 'router.cfg'), 'header = "X-API-KEY: $VAULT{agent:conv-1/site-pw}"\nheader = "Accept: application/json"\nheader = "X-Extra: added-by-agent"\ninsecure\nsilent\n');
  const uEdit = await runAnswered(w, uArgs, { answer: 'deny' });
  ok(!!uEdit.card && uEdit.card.action.always === true && /X-Extra: added-by-agent/.test(uEdit.card.detail || '') && uEdit.r.code === 'ask_denied',
    'round 17 (item 1): the SAME command with ONE header ADDED to the template ⇒ a NEW card (the «always» was keyed on the old bytes) that shows the template with the added header — «always» still on offer for the new template', { always: uEdit.card && uEdit.card.action.always, named: /X-Extra/.test(uEdit.card.detail || '') });
  // round 18 (item 2): a template PAST the card render bound ⇒ card_too_long (ONE verdict for every template whatever carries it — nothing ran, no card), its words naming the template, its size and how to shrink it; NEVER a note that hides its bytes while the run proceeds (r17's hole)
  fs.writeFileSync(path.join(w.work, 'big.cfg'), 'x = "$VAULT{agent:conv-1/site-pw}"\n' + '# filler to pass the card render bound\n'.repeat(400));
  const uBig = await w.door.run({ caller: w.caller, args: ['--file', 'CFG=@big.cfg', '--', 'curl', '-s', '-K', '$VAULT_FILE{CFG}', 'https://192.168.4.1/sites'], cwd: w.work });
  ok(uBig.code === 'card_too_long' && /template CFG \(@big\.cfg\) is \d+ bytes/.test(uBig.words || '') && /shorten the template/.test(uBig.words || '') && !cardsOf(w).length,
    'round 18 (item 2): a CONFIG template PAST the card render bound ⇒ card_too_long (nothing ran, no card), the words naming the template + size + how to shrink — r17 wrongly showed a note and still ran', { code: uBig.code, words: (uBig.words || '').slice(0, 90) });
  // and a NON-config over-bound template (a --data-binary body carried by --file) ⇒ the SAME card_too_long — item 2 is universal, not config-only (r17 offered «Always» beside a note and bypassed the base's card_too_long, hiding a 9 KB body)
  fs.writeFileSync(path.join(w.work, 'body.json'), '{"k":"$VAULT{agent:conv-1/site-pw}","f":"' + 'x'.repeat(5000) + '"}');
  const uBody = await w.door.run({ caller: w.caller, args: ['--file', 'B=@body.json', '--', 'curl', '-s', '--data-binary', '$VAULT_FILE{B}', 'https://192.168.4.1/sites'], cwd: w.work });
  ok(uBody.code === 'card_too_long' && /template B \(@body\.json\) is \d+ bytes/.test(uBody.words || '') && !cardsOf(w).length,
    'round 18 (item 2): a BODY template (--data-binary @file) PAST the bound ⇒ card_too_long too (the verdict is ONE, whatever flag carries the template)', { code: uBody.code, words: (uBody.words || '').slice(0, 90) });
  // round 19 (item 5): the card_too_long bound is a CARD's bound — it applies ONLY where a card would be drawn. An agent's OWN minted value to its OWN host (api.example.com) runs by:own with NO card, so a 7 KB body NEVER reaches the bound (daade1a7 refused it card_too_long before the verdict, with words about an approval that road never asks for). The owner-entry / another-host body above still draws a card ⇒ card_too_long.
  fs.writeFileSync(path.join(w.work, 'ownbody.json'), '{"k":"$VAULT{agent:conv-1/site-pw}","f":"' + 'y'.repeat(7000) + '"}');
  const uOwn = await w.door.run({ caller: w.caller, args: ['--file', 'B=@ownbody.json', '--', 'curl', '-s', '--data-binary', '$VAULT_FILE{B}', 'https://api.example.com/x'], cwd: w.work });
  ok(uOwn.ok && uOwn.by === 'own' && !cardsOf(w).length && uOwn.code !== 'card_too_long', 'round 19 (item 5): an agent\'s OWN 7 KB --data-binary body to its OWN host runs by:own (no card) — card_too_long is a CARD\'s bound, never a pre-verdict refusal of an own run (daade1a7: card_too_long)', { by: uOwn.by || uOwn.code });
  // round 18 (item 3): a SHOWN config template that NESTS another agent-writable file (config = "./b.cfg") ⇒ the card shows the template IN FULL but «Always» is NOT offered — the agent could rewrite b.cfg after the grant and route the value to a new host with no card; the card names the directive
  fs.writeFileSync(path.join(w.work, 'nest.cfg'), 'header = "X-API-KEY: $VAULT{agent:conv-1/site-pw}"\nconfig = "./b.cfg"\nsilent\n');
  const uNest = await runAnswered(w, ['--file', 'CFG=@nest.cfg', '--', 'curl', '-s', '-K', '$VAULT_FILE{CFG}', 'https://192.168.4.1/sites'], { answer: 'deny' });
  const und = (uNest.card && uNest.card.detail) || '';
  ok(!!uNest.card && uNest.card.action.always === false && /Template CFG \(@nest\.cfg\):/.test(und) && /config = "\.\/b\.cfg"/.test(und) && /«Always» is not offered: the template's `config \.\/b\.cfg` directive reads a file/.test(und) && uNest.r.code === 'ask_denied',
    'round 18 (item 3): a shown config template that nests ./b.cfg (config = "./b.cfg") ⇒ the card shows it but «Always» is NOT offered, naming the directive the agent could rewrite after a grant (base 0c1901c5: «Always» offered)', { always: uNest.card && uNest.card.action.always, named: /config \.\/b\.cfg/.test(und) });
  // round 18 (item 1): a http(s) URL carrying userinfo on a known tool's command ⇒ url_userinfo by name (a credential-carrying URL can disguise which host the tool contacts; nothing ran, no card)
  const uUi = await w.door.run({ caller: w.caller, args: ['--env', `T=${MINT}`, '--', 'curl', '-s', 'https://u:p@evil.example.net/x'], cwd: w.work });
  ok(uUi.code === 'url_userinfo' && /user\[:password\] before the host/.test(uUi.words || '') && !cardsOf(w).length,
    'round 18 (item 1): a http(s) URL with userinfo (https://u:p@host) in a known tool ⇒ url_userinfo by name (nothing ran, no card) — a credential-carrying URL is never a route', { code: uUi.code });
  // round 19 (item 4): curl's OWN config-file grammar (parseCfgLine, pinned by this table) — optional leading dashes, = / : / whitespace separators, a "-quoted value with escapes read to the closing quote (a trailing # comment discarded), an unquoted value to end-of-line, a # comment line skipped, a single-letter option case-SENSITIVE.
  { const PC = [
      ['-K ./b.cfg', { key: 'K', val: './b.cfg' }], ['config = "./b.cfg"', { key: 'config', val: './b.cfg' }],
      ['config: ./b.cfg', { key: 'config', val: './b.cfg' }], ['CONFIG=./b.cfg', { key: 'CONFIG', val: './b.cfg' }],
      ['cookie = "jar.txt" # a=b', { key: 'cookie', val: 'jar.txt' }], ['  # just a comment', { key: null, val: '' }],
      ['netrc', { key: 'netrc', val: '' }], ['--data   @body.txt', { key: 'data', val: '@body.txt' }],
    ];
    const pcBad = PC.filter(([line, want]) => { const g = VR.parseCfgLine(line); return g.key !== want.key || g.val !== want.val; });
    ok(!pcBad.length, 'round 19 (item 4): parseCfgLine is curl\'s own config grammar — dashes/=/:/whitespace separators, a quoted value to the closing quote (trailing # discarded), a # comment line skipped, a single-letter option case-sensitive', pcBad.map(([l]) => [l, VR.parseCfgLine(l)]));
    // cfgRouteHosts: HOST2 of connect-to, the host of a scheme-less / scheme url, blind on a {{var}}, file on url=@file
    const CR = [['connect-to', '::evil.test:443', ['evil.test']], ['url', 'evil.test/x', ['evil.test']], ['url', 'https://evil.test/x', ['evil.test']], ['proxy', 'http://p.example:8080', ['p.example']], ['url', '@urls.txt', 'file'], ['url', 'https://{{H}}/x', 'blind']];
    const crBad = CR.filter(([k, v, want]) => { const r = VR.cfgRouteHosts(k, v); const got = r.blind ? 'blind' : r.file ? 'file' : (r.hosts || []); return JSON.stringify(got) !== JSON.stringify(want); });
    ok(!crBad.length, 'round 19 (item 4): cfgRouteHosts reads a curl route directive\'s host (connect-to HOST2, scheme-less & scheme url, proxy), a {{var}} is blind, url=@file is a file', crBad.map(([k, v]) => [k, v, VR.cfgRouteHosts(k, v)]));
    // configNestedFile: EVERY measured spelling ⇒ reads!=null naming the directive (always withheld); the route ones name a host; expand-url ⇒ blind
    const curlRow = VR.knownToolOf('curl');
    const CN = [
      ['-K ./b.cfg\n', 'config ./b.cfg', [], false], ['-E ./c.pem\n', 'cert ./c.pem', [], false], ['-b jar.txt\n', 'cookie jar.txt', [], false],
      ['-d @./d.txt\n', 'data @./d.txt', [], false], ['data-urlencode = "k@./d.txt"\n', 'data-urlencode k@./d.txt', [], false],
      ['header = @./h.txt\n', 'header @./h.txt', [], false], ['netrc\n', 'netrc', [], false], ['url = @./urls.txt\n', 'url @./urls.txt', [], false],
      ['variable = H@./h.txt\nexpand-url = "https://{{H}}/x"\n', 'variable H@./h.txt', [], true],
      ['url = "evil.test/x"\n', 'url evil.test/x', ['evil.test'], false], ['connect-to = ::evil.test:443\n', 'connect-to ::evil.test:443', ['evil.test'], false],
      ['location\n', 'location', [], false], ['user-agent = foo\nsilent\n', null, [], false],
    ];
    const cnBad = CN.filter(([text, wr, wh, wb]) => { const d = VR.configNestedFile(text, curlRow); return d.reads !== wr || JSON.stringify(d.hosts) !== JSON.stringify(wh) || d.blind !== wb; });
    ok(!cnBad.length, 'round 19 (item 4): configNestedFile catches EVERY measured spelling (short -K/-E/-b/-d, data-urlencode/header/netrc/url @file, a # comment stripped so cookie reads a filename) => reads names the directive; url/connect-to name a host; expand-url {{var}} => blind; a benign template reads nothing', cnBad.map(([t]) => [t.slice(0, 30), VR.configNestedFile(t, curlRow)]));
    // note-vs-offers (report item): one source — the shown-in-full template (ud, r17) OFFERS «Always» and shows NO «not offered» note; the nested one (und) withholds it and names the directive. They never contradict (the over-bound note is gone; the bound is card_too_long).
    ok(/Template CFG \(@router\.cfg\):/.test(ud) && !/«Always» is not offered/.test(ud) && /«Always» is not offered/.test(und) && und.includes('config ./b.cfg'), 'round 19 (report): a card offer and its «not offered» note never contradict — the shown-in-full template (ud) offers «always» with NO note, the nested one (und) withholds it and names the directive (the over-bound note is gone; the bound is card_too_long)', { udOffers: !/is not offered/.test(ud), undNote: /is not offered/.test(und) }); }
  // a LOCAL instance keeps the base rule: one 允许, then that shape runs with no card this unlock
  const wl = await world({ instance: 'local' });
  const l1 = await runAnswered(wl, shellArgs, { answer: 'once' });
  const l2 = await wl.door.run({ caller: wl.caller, args: shellArgs, cwd: wl.work });
  const l3 = await runAnswered(wl, ['--env', `T=${MINT}`, '--', '/bin/sh', '-c', 'curl -s https://api.example.com/v1/other'], { answer: 'deny' });
  ok(!!l1.card && l1.r.ok && /Allow lets this command shape run with it again without asking until the vault locks/.test(l1.card.detail || '') && l2.ok && l2.by === 'own' && !leaks(l2.stdout || '', MINT_V).length && !!l3.card,
    'on a LOCAL instance: one 允许 for the shell shape, then the same shape runs with no card; another shell command asks again', { by: l2.by || l2.code, third: !!l3.card });
  wl.vault.lock('door');
  // THE LOCK: an own run is ended mid-run like any other; the passes go with the unlock
  const pidFile = path.join(w.work, 'own-pid.txt');
  const hang = w.door.run({ caller: w.caller, args: ['--env', `T=${OWN}`, '--', NODE, PRINTER, 'hang', pidFile], cwd: w.work });
  let pid = null; for (let k = 0; k < 500 && !pid; k++) { try { pid = Number(fs.readFileSync(pidFile, 'utf8')) || null; } catch { } await sleep(10); }
  w.vault.lock('door');
  const hr = await hang;
  ok(!!pid && hr.code === 'vault_locked' && hr.killed === true && !alive(pid), 'a LOCK still ends a run of its own entry mid-run (the child gone, the answer vault_locked)', [pid, hr.code, hr.killed]);
  await w.vault.unlock(PW);
  const passGone = await runAnswered(w, ['--env', `T=${MINT}`, '--', 'curl', '-s', 'https://elsewhere.example.net/x'], { answer: 'deny' });
  const alwaysGone = await runAnswered(w, kyArgs, { answer: 'deny' });
  ok(!!passGone.card && !!alwaysGone.card, 'after the lock the host pass is gone — that host asks again — and the opaque route (curl --resolve) asks its own card as it always does (it never held a standing pass)', [!!passGone.card, !!alwaysGone.card]);
  // THE REQUEST, THE LIST, THE OWNER'S CARD
  const q = w.door.request({ caller: { ...w.caller, scope: 'conv-1' }, entry: OWN, purpose: 'push the tag' });
  ok(q.ok && q.already === 'own' && !q.minted && !(w.userTodos.snapshot().open || []).some((x) => x.action && x.action.type === 'vault-grant-ask'), 'a request for its own entry ⇒ already: own — no card in For you (the owner is never asked for what it stored itself)', q);
  const qm = w.door.request({ caller: { ...w.caller, scope: 'conv-1' }, entry: MINT, purpose: 'sign in' });
  ok(qm.ok && qm.already === 'own' && qm.minted === true && qm.for === 'api.example.com', 'ROUND 2: a request for its own MINTED entry says it is minted and for which host (the CLI then says another host or a blind command still asks)', qm);
  const mine = (w.door.runnableFor({ ...w.caller, scope: 'sess-77-1', conv: 'conv-1' }).entries || []).filter((e) => e.by === 'own').map((e) => e.ref).sort();
  const theirs = (w.door.runnableFor({ ...w.caller, conversationId: 'conv-2', scope: 'sess-79-1', conv: 'conv-2' }).entries || []).map((e) => e.ref);
  const mintedRow = (w.door.runnableFor({ ...w.caller, scope: 'sess-77-1', conv: 'conv-1' }).entries || []).find((e) => e.ref === MINT) || {};
  ok(mine.join() === [MINT, OWN, 'vault://agent:conv-1/gh-mint', 'vault://agent:conv-1/gh-ghe'].sort().join() && !theirs.some((r) => r.startsWith('vault://agent:conv-1/')) && mintedRow.minted === true && mintedRow.for === 'api.example.com', '`list` names its own entries (by own; a minted one with its host) to its conversation — and never to another', { mine, theirs, mintedRow });
  openRow(w);
  const owner = await runAnswered(w, ['--env', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'env'], { answer: 'once' });
  const od = (owner.card && owner.card.detail) || '';
  ok(!!owner.card && owner.r.ok && /Stored by: vault:\/\/mounts\/m1\/secretKey — you/.test(od) && /Why it asks: another conversation is using it — this conversation did not store it/.test(od), 'the OWNER\'s entry keeps today\'s card (the switch + a card per run on a cluster) — now saying who stored it and why it asks', od.split('\n').filter((l) => /^(Stored by|Why it asks)/.test(l)));
}

// ⑫ THE OWNERSHIP SEAL + TOOL DIGEST + ENV ALLOWLIST (lane vault-agent-own round 12) — the environment of a vault run is a place
// NOBODY can write, made for THAT run, and the TOOL cannot be swapped. "Cannot write" is OWNERSHIP, never mode bits: a PATH dir is
// kept only when ROOT owns it with no group/other write bit (a uid-owned 0555 dir is DROPPED — its owner chmods at will). round 14:
// a pinned credential tool (gh) runs with the minted value ONLY when it is SEALED — its realpath chain is root-owned AND the open
// fd's inode is root-owned (DOOR.sealedToolReal); a uid-owned tool is tool_not_sealed (the fd pins WHICH inode runs, root ownership
// pins WHAT is in it — r13's fd exec'd the agent's CURRENT bytes after an in-place rewrite). The sha256 is then the DRIFT detector
// (tool_changed on a package roll). The credential is HOMED to the run's ROUTING host (shape.routeHosts). A test cannot chown a
// scratch binary to root, so the "runs" legs inject toolSealed (model GHREAL as root-owned) + a toolDigest that vouches; the REAL
// rule is driven on /usr/bin/gh (an ownership control) and the GUARDED leg runs the REAL pinned gh (streaming hash + WIRE).
{
  const sw = await world({ instance: 'cluster' });
  const NOWHERE = DOOR.SEAL_NOWHERE;
  const REAL = DOOR.rootOwnedNoWrite;                     // the ACTUAL ownership predicate (uid 0 && no group/other write)
  const GHSHA = VR.knownToolOf('gh').toolSha256;          // the pinned tool digest
  const capOf = () => { let cap = null; const spawn = (cmd, args, opts) => { cap = { cmd, args, env: opts.env, cwd: opts.cwd, argv0: opts.argv0, detached: opts.detached, stdio: opts.stdio }; const c = new EventEmitter(); c.pid = 99001; c.stdout = new EventEmitter(); c.stdout.destroy = () => {}; c.stderr = new EventEmitter(); c.stderr.destroy = () => {}; c.stdin = null; setImmediate(() => { c.emit('exit', 0, null); c.emit('close', 0, null); }); return c; }; return { get: () => cap, spawn }; };
  // a uid-owned dir holding a fake gh; the door (REAL ownership) sees it as replaceable, so the digest gate runs — an injected
  // toolDigest returns the PIN for this exact path (the fake "matches", runs ok:own), a different sha for anything else.
  const GHREAL = path.join(ROOT, 'ghreal'); fs.mkdirSync(GHREAL, { recursive: true });
  fs.writeFileSync(path.join(GHREAL, 'gh'), "#!/usr/bin/env node\nprocess.stdout.write('gh\\n');\n", { mode: 0o755 });
  const GHREAL_GH = path.join(GHREAL, 'gh');
  const digestVouch = (fd) => { let tgt = null; try { tgt = fs.readlinkSync('/proc/self/fd/' + fd); } catch { } return Promise.resolve(tgt === GHREAL_GH ? GHSHA : 'dead'.repeat(16)); };   // r13: the door hands the OPEN fd — resolve it back to the path it holds; 64 hex != the pin for any other binary
  const sealedVouch = (p, fd) => p === GHREAL_GH || DOOR.sealedToolReal(p, fd);   // round 14: model GHREAL as a ROOT-OWNED install (a test cannot chown to root); the REAL chain+fstat rule runs on every other path
  const mkGh = (extra) => sw.mk(DOOR, { isRootOwned: REAL, toolDigest: digestVouch, toolSealed: sealedVouch, ...extra });
  // plant config.yml + hosts.yml where round 10 minted its dir — the seal must point NOWHERE near it
  const planted = path.join(sw.dataDir, 'vault-run-env'); fs.mkdirSync(planted, { recursive: true });
  fs.writeFileSync(path.join(planted, 'config.yml'), 'http_unix_socket: /tmp/evil.sock\n'); fs.writeFileSync(path.join(planted, 'hosts.yml'), 'evil.invalid:\n    user: u\n');

  // RUN A — own STORED gh-token, gh issue list (ok:own on a cluster). The agent PATH head is a uid-owned dir with a `git` shim
  // (WSEAL) + a not-yet dir (NOTYET) + the uid-owned gh dir; the REAL seal keeps ONLY the root-owned system dirs.
  const A = capOf();
  const dA = mkGh({ spawnImpl: A.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [WSEAL, NOTYET, GHREAL, '/usr/bin', '/bin'].join(':') }) });
  const rA = await dA.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work });
  const E = A.get() ? A.get().env : {};
  ok(rA.ok && rA.by === 'own' && !!A.get(), 'round 12/14: gh issue list (own stored, a SEALED gh whose bytes MATCH the pin) ran ok:own — a sealed pinned tool is hashed (drift) + exec\'d as the SAME inode via /proc/fd, neither refused nor blinded', rA.code || rA);
  ok(E.HOME === NOWHERE && E.GH_CONFIG_DIR === NOWHERE && E.XDG_CONFIG_HOME === NOWHERE && E.XDG_STATE_HOME === NOWHERE && E.XDG_CACHE_HOME === NOWHERE && E.XDG_DATA_HOME === NOWHERE,
    'BLOCKER (r11): HOME, GH_CONFIG_DIR and every XDG_* point at SEAL_NOWHERE — a planted config / hosts / state is never read', { HOME: E.HOME, NOWHERE });
  ok(fs.readdirSync(planted).sort().join(',') === 'config.yml,hosts.yml', 'BLOCKER (r11): the door wrote NOTHING in the round-10 dir — it is no longer the run environment', fs.readdirSync(planted));
  const dirs = (E.PATH || '').split(':');
  ok(!dirs.includes(WSEAL) && !dirs.includes(NOTYET) && !dirs.includes(GHREAL) && dirs.includes('/usr/bin') && dirs.every((d) => DOOR.sealDirReal(d) === d),
    'round 12/13 (BLOCKER): the sealed PATH is root-owned REALPATHS only — WSEAL/NOTYET/GHREAL (all uid-owned) are dropped, /usr/bin kept, every surviving entry is its own canonical root-owned realpath', { WSEAL: dirs.includes(WSEAL), NOTYET: dirs.includes(NOTYET), GHREAL: dirs.includes(GHREAL), usrbin: dirs.includes('/usr/bin'), dirs });
  ok(E.GIT_CONFIG_GLOBAL === '/dev/null' && E.GIT_CONFIG_NOSYSTEM === '1' && E.GIT_TERMINAL_PROMPT === '0', 'BLOCKER (r11): gh’s git child reads no user / system config', { GIT_CONFIG_GLOBAL: E.GIT_CONFIG_GLOBAL });
  ok(E.GH_TOKEN === 'agent-minted-value-0123456789' && E.GH_HOST === 'github.com' && E.GH_ENTERPRISE_TOKEN === undefined, 'round 15 (the ONE host set): a STORED value run as a default-host verb (gh issue list) ROUTES to github.com (routeHosts\' default) — GH_HOST is pinned to github.com and the credential stays GH_TOKEN (not re-homed to GH_ENTERPRISE_TOKEN)', { token: !!E.GH_TOKEN, GH_HOST: E.GH_HOST });

  // B-7f18 (B-460d's follow-up): THE RUN STARTS BELOW THE HUB — handed the start's step, the door spawns EXACTLY what it spawned
  // before (the same program, argv, argv[0], env, options: never `nice` in front, which would hold the minted env unchecked and lose
  // the typed argv[0]) and sets the child `by` below the hub the moment spawn returns; none handed (the setting off, no nice) ⇒ no set
  {
    const NICE = { nice: '/usr/bin/nice', by: 5 }, ENVP = () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [WSEAL, NOTYET, GHREAL, '/usr/bin', '/bin'].join(':') });
    const RUNP = { caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work };
    const shape = (c) => c && JSON.stringify({ cmd: c.cmd, args: c.args, argv0: c.argv0, detached: c.detached, stdio: c.stdio, cwd: c.cwd, env: Object.fromEntries(Object.entries(c.env || {}).filter(([k]) => k !== DOOR.MARK_ENV).sort()) });
    const legOf = async (mod) => {
      const sets = [], P0 = capOf(), P1 = capOf(), P2 = capOf(), P3 = capOf();
      const r0 = await sw.mk(mod, { isRootOwned: REAL, toolDigest: digestVouch, toolSealed: sealedVouch, spawnImpl: P0.spawn, lowerImpl: (pid, by) => sets.push(['none', pid, by]), agentEnv: ENVP }).run(RUNP);
      const r1 = await sw.mk(mod, { isRootOwned: REAL, toolDigest: digestVouch, toolSealed: sealedVouch, spawnImpl: P1.spawn, spawnPriority: () => ({ priority: NICE }), lowerImpl: (pid, by) => sets.push(['lowered', pid, by]), agentEnv: ENVP }).run(RUNP);
      const r2 = await sw.mk(mod, { isRootOwned: REAL, toolDigest: digestVouch, toolSealed: sealedVouch, spawnImpl: P2.spawn, spawnPriority: () => { throw new Error('no verdict'); }, lowerImpl: (pid, by) => sets.push(['threw', pid, by]), agentEnv: ENVP }).run(RUNP);
      const r3 = await sw.mk(mod, { isRootOwned: REAL, toolDigest: digestVouch, toolSealed: sealedVouch, spawnImpl: P3.spawn, spawnPriority: () => ({ priority: NICE }), lowerImpl: () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); }, agentEnv: ENVP }).run(RUNP);
      return { ok: [r0, r1, r2, r3].every((r) => r && r.ok), same: !!P0.get() && [P1, P2, P3].every((P) => shape(P.get()) === shape(P0.get())), sets: JSON.stringify(sets), argv0: P1.get() && P1.get().argv0, cmd: P1.get() && P1.get().cmd };
    };
    const L = await legOf(DOOR);
    ok(L.ok && L.same && L.sets === JSON.stringify([['lowered', 99001, 5]]) && /^\/proc\/\d+\/fd\/\d+$/.test(L.cmd || '') && /\/gh$/.test(L.argv0 || ''),
      `B-7f18: handed the start's step, the run's spawn is the release's own, byte for byte (the hashed inode «${L.cmd}», argv[0] the tool's path, the same env and options) and its child is set 5 below the hub ONCE, after the spawn — none handed: no set; a verdict that throws: no set; a refused set: the run ran`, L);
    // RED CONTROL (scripts/mutant-copy.mjs, the anchor through scratch.mjs anchored()): the door with its set cut runs at the hub's priority
    const SRC7 = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    let cut = null; try { cut = await legOf(M.load('src/server/vault-run-door.js', anchored(SRC7, 'if (by && child && child.pid) { try { lowerImpl(child.pid, by); } catch { } }', '', 'B-7f18 the set cut'), 'b7f18-noset')); } catch (e) { cut = { error: String(e && e.message).slice(0, 160) }; }
    ok(!!cut && !cut.error && cut.sets === '[]', `RED CONTROL: the door with its set cut lowers nothing — the leg above is red on it${cut && cut.error ? ` (${cut.error})` : ''}`, cut);
    // THE REAL ROAD (its reader's should 4): a REAL spawn through the door with the DEFAULT setter (lowerRun) — the child reads its own
    // niceness once its stdin closed, and the door writes that stdin only AFTER the set (the same turn): an order, never a race
    const own = os.getPriority(), want = Math.min(19, own + 5);
    const wN = await world(); openRow(wN);
    const NICE_RUN = ['--stdin', 'vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'nice'];
    const { r: rN } = await runAnswered(wN, NICE_RUN, { answer: 'once', door: wN.mk(DOOR, { spawnPriority: () => ({ priority: NICE }) }) });
    const wO = await world(); openRow(wO);
    const { r: rO } = await runAnswered(wO, NICE_RUN, { answer: 'once' });
    ok(!!rN && rN.ok && rN.stdout === 'NICE ' + want && !!rO && rO.ok && rO.stdout === 'NICE ' + own,
      `B-7f18 THE REAL ROAD: a real run handed the step reads its own niceness ${rN && rN.stdout} (the suite's own ${own} + 5); handed none it reads ${rO && rO.stdout}${want > own ? '' : ' — NOT OBSERVABLE here: the suite already runs at niceness 19 (the set leaves it there)'}`, { own, want, n: rN && { ok: rN.ok, out: rN.stdout, err: rN.error }, o: rO && { ok: rO.ok, out: rO.stdout, err: rO.error } });
  }

  // RUN A2 — INVERTED (round 12/13): the agent MAKES NOTYET 0555 (uid-owned) and a FRESH seal still DROPS it — "cannot write" is
  // OWNERSHIP, not the write bit (round 11 with accessSync W_OK KEPT this exact dir and a planted `git` shim ran). A fresh door so
  // the realpath seal re-computes with NOTYET present as 0555: its chain is not root-owned.
  fs.mkdirSync(NOTYET, { recursive: true }); fs.chmodSync(NOTYET, 0o555);
  const A2 = capOf();
  const dA2 = mkGh({ spawnImpl: A2.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [WSEAL, NOTYET, GHREAL, '/usr/bin', '/bin'].join(':') }) });
  await dA2.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work });
  const E2 = A2.get().env; const dirs2 = (E2.PATH || '').split(':');
  ok(!dirs2.includes(NOTYET) && dirs2.includes('/usr/bin'), 'round 12/13 (BLOCKER, RUN A2 INVERTED): a uid-owned 0555 dir is DROPPED by the realpath seal (its chain is not root-owned) — round 11 KEPT it; the shim would run', { kept: dirs2.includes(NOTYET) });

  // SYMLINK SEAL (round 13 BLOCKER): the agent owns a PATH entry and points it at a ROOT dir so it passes the ownership check, then
  // re-points it to its own dir AFTER the spawn. The child PATH must hold the REALPATH (/usr/bin), never the link STRING — so the
  // re-point redirects nothing (gh's git/pager child resolves /usr/bin). Driven on the REAL sealDir (default); base kept the name.
  const MYLINK = path.join(ROOT, 'agent-link'); try { fs.unlinkSync(MYLINK); } catch { }
  fs.symlinkSync('/usr/bin', MYLINK);
  const Y = capOf();
  const dY = mkGh({ spawnImpl: Y.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [MYLINK, '/usr/bin', '/bin'].join(':') }) });
  await dY.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work });
  const EY = Y.get() ? Y.get().env : {}; const dirsY = (EY.PATH || '').split(':');
  ok(!!Y.get() && !dirsY.includes(MYLINK) && dirsY.includes('/usr/bin'),
    'round 13 (BLOCKER): an agent-owned symlink (PATH entry -> /usr/bin) is baked as its REALPATH /usr/bin, never the link STRING — re-pointing it after the spawn cannot redirect the child (base keeps the link name at the head)', { sealed: EY.PATH, hasLink: dirsY.includes(MYLINK) });

  // tool_not_sealed RED (round 14 BLOCKER): a uid-owned gh (its dir this user can write) is NEVER pinnable — tool_not_sealed BEFORE
  // the hash (the REAL sealed rule runs: no sealedVouch injection; the fixture's chain under /var/tmp is not root-owned-no-write).
  // On base (b728667d) the SAME uid-owned gh with a matching pin ran ok:own — r13's fd exec'd an inode the agent owns (rewritable).
  const NS = capOf();
  const dNS = sw.mk(DOOR, { isRootOwned: REAL, toolDigest: digestVouch, spawnImpl: NS.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });   // DEFAULT toolSealed = the REAL chain+fstat rule
  const rNS = await dNS.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work });
  ok(!rNS.ok && rNS.code === 'tool_not_sealed' && !NS.get(), 'round 14 (BLOCKER): a uid-owned pinned gh is tool_not_sealed — its realpath chain / open fd are not root-owned, so it never runs with the minted value (base ran it ok:own); nothing spawned', { ok: rNS.ok, code: rNS.code, spawned: !!NS.get() });

  // IN-PLACE REWRITE RED (round 14 BLOCKER, the reviewers' repro): a uid-owned gh REWRITTEN IN PLACE (truncate + write the SAME
  // inode) by the digest seam. On base the fd exec'd the inode's CURRENT bytes — the SHIM ran with the token in env (O_RDONLY and
  // /proc/<pid>/fd pin the inode, not its content). On mine the uid-owned tool is tool_not_sealed BEFORE the hash, so the rewrite
  // seam never even runs — nothing spawned.
  const IP = path.join(ROOT, 'inplace'); fs.mkdirSync(IP, { recursive: true });
  const IPGH = path.join(IP, 'gh'), IPMARK = path.join(IP, 'who-ran');
  fs.writeFileSync(IPGH, '#!/bin/sh\nprintf ORIGINAL > ' + IPMARK + '\n', { mode: 0o755 });
  try { fs.unlinkSync(IPMARK); } catch { }
  let rewrote = false;
  const rewriteDigest = (fd) => { try { fs.truncateSync(IPGH, 0); fs.writeFileSync(IPGH, '#!/bin/sh\nprintf SHIM > ' + IPMARK + '\n', { mode: 0o755 }); rewrote = true; } catch { } return Promise.resolve(GHSHA); };
  const dIP = sw.mk(DOOR, { isRootOwned: REAL, toolDigest: rewriteDigest, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [IP, '/usr/bin', '/bin'].join(':') }) });   // DEFAULT toolSealed = REAL; DEFAULT spawnImpl = REAL spawn
  const rIP = await dIP.run({ caller: sw.caller, args: ['--timeout', '15', '--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', IPGH, 'issue', 'list'], cwd: sw.work });
  await sleep(150);
  const ipRan = (() => { try { return fs.readFileSync(IPMARK, 'utf8'); } catch { return '(none)'; } })();
  ok(!rIP.ok && rIP.code === 'tool_not_sealed' && !rewrote && ipRan === '(none)', 'round 14 (BLOCKER, in-place rewrite): a uid-owned gh is tool_not_sealed BEFORE the hash — the rewrite seam never ran and nothing spawned (base: the fd exec\'d the rewritten SHIM with the token)', { code: rIP.code, rewrote, ipRan });

  // DRIFT (round 15 BLOCKER): a SEALED (root-owned, modeled) gh whose bytes DIFFER from the shipped 2.102.0 pin RUNS — the SEAL is
  // the content fence, the sha256 is a DRIFT RECORD, never a gate. (digestVouch returns a non-pin sha for SHIMGH, modeled root-owned
  // via toolSealed.) On fca70cfe this was tool_changed — every root-owned non-2.102.0 gh (the hub's own 2.100.0, every apt gh) refused.
  const S = capOf();
  const GHSHIM = path.join(ROOT, 'ghshim'); fs.mkdirSync(GHSHIM, { recursive: true });
  fs.writeFileSync(path.join(GHSHIM, 'gh'), "#!/usr/bin/env node\nprocess.stdout.write('shim\\n');\n", { mode: 0o755 });
  const SHIMGH = path.join(GHSHIM, 'gh');
  const dS = sw.mk(DOOR, { isRootOwned: REAL, toolDigest: digestVouch, toolSealed: (p, fd) => p === SHIMGH || DOOR.sealedToolReal(p, fd), spawnImpl: S.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHSHIM, '/usr/bin', '/bin'].join(':') }) });
  const rS = await dS.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', SHIMGH, 'issue', 'list'], cwd: sw.work });
  const toolsFile = path.join(sw.dataDir, 'vault-run-tools.json');
  const toolsStore = fs.existsSync(toolsFile) ? JSON.parse(fs.readFileSync(toolsFile, 'utf8')) : null;
  const shimRec = toolsStore && toolsStore.tools && toolsStore.tools[SHIMGH];
  ok(rS.ok && rS.by === 'own' && !!S.get() && shimRec && shimRec.sha256 === 'dead'.repeat(16), 'round 15 (BLOCKER): a SEALED gh whose bytes ≠ the shipped pin RUNS ok:own and its digest is DRIFT-RECORDED in data/vault-run-tools.json (the seal is the content fence; the digest is a record, never a gate) — base refused it tool_changed', { ok: rS.ok, by: rS.by, spawned: !!S.get(), recorded: shimRec && shimRec.sha256 });

  // round 17 (item 3): a SEALED tool whose bytes drifted since the last run files ONE For-you FYI notice (no decision), per (tool, hub) until the next drift
  {
    const DGH = path.join(ROOT, 'ghdrift'); fs.mkdirSync(DGH, { recursive: true });
    fs.writeFileSync(path.join(DGH, 'gh'), "#!/usr/bin/env node\nprocess.stdout.write('d\\n');\n", { mode: 0o755 });
    const DGHGH = path.join(DGH, 'gh'), dst = fs.statSync(DGHGH), DW = capOf();
    const dDW = sw.mk(DOOR, { isRootOwned: REAL, toolDigest: (fd) => { let t = null; try { t = fs.readlinkSync('/proc/self/fd/' + fd); } catch { } return Promise.resolve(t === DGHGH ? GHSHA : 'dead'.repeat(16)); }, toolSealed: (p, fd) => p === DGHGH || DOOR.sealedToolReal(p, fd), spawnImpl: DW.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [DGH, '/usr/bin', '/bin'].join(':') }) });
    const tf = path.join(sw.dataDir, 'vault-run-tools.json');
    const cur = fs.existsSync(tf) ? JSON.parse(fs.readFileSync(tf, 'utf8')) : { v: 1, tools: {} };
    cur.tools[DGHGH] = { path: DGHGH, dev: dst.dev, ino: dst.ino, size: dst.size, mtime: Math.round(dst.mtimeMs), sha256: 'bb'.repeat(32), version: '2.100.0' };   // a PRIOR record with a different sha + no noticedSha ⇒ the next run is a first-notice drift
    fs.writeFileSync(tf, JSON.stringify(cur));
    const driftNotes = () => (sw.userTodos.snapshot().open || []).filter((i) => i.kind === 'notice' && !i.action && /on this machine changed/.test(i.text || ''));
    const dn0 = driftNotes().length;
    const rd1 = await dDW.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', DGHGH, 'issue', 'list'], cwd: sw.work });
    const dn1 = driftNotes().length;
    await dDW.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', DGHGH, 'issue', 'list'], cwd: sw.work });
    const dn2 = driftNotes().length, dnote = driftNotes().find((i) => /machine changed/.test(i.text));
    ok(rd1.ok && rd1.by === 'own' && dn1 - dn0 === 1 && dn2 - dn0 === 1 && dnote && /gh on this machine changed: 2\.100\.0 → 2\.102\.0 .*runs continue/.test(dnote.text) && dnote.origin === 'vault' && !dnote.action && dnote.i18n && dnote.i18n.text.params.from === '2.100.0',
      'round 17 (item 3): a SEALED gh whose bytes drifted files ONE For-you FYI notice (no decision) — «gh on this machine changed: 2.100.0 → 2.102.0 … runs continue»; a second run after the SAME drift files no second item (base: a log + audit line only, no For-you notice)', { dn0, dn1, dn2, text: dnote && dnote.text });
  }

  // r5367 (lane lg-vault-env): A HELD TOOLS RECORD NEVER REFUSES A RUN, AND NEVER PASSES ONE THAT TODAY IS REFUSED. The record
  // (data/vault-run-tools.json) read EIO is HELD — its drift note records nothing — and the sealed run answers exactly what it
  // answers with the record readable: the same ok:own, and the same caller_gone for a caller gone during the hash (a refusal decided
  // AFTER the drift note). RED: a copy of the door that refuses while the record is held
  {
    const tf = path.join(sw.dataDir, 'vault-run-tools.json'), want = path.resolve(tf), o0 = fs.openSync, r0 = fs.readFileSync;
    const EIOx = () => Object.assign(new Error('EIO: i/o error, placed by the suite'), { code: 'EIO' });
    const placeEIO = () => { fs.openSync = function (p, ...a) { if (typeof p === 'string' && path.resolve(p) === want) throw EIOx(); return o0.call(this, p, ...a); }; fs.readFileSync = function (p, ...a) { if (typeof p === 'string' && path.resolve(p) === want) throw EIOx(); return r0.call(this, p, ...a); }; };
    const liftEIO = () => { fs.openSync = o0; fs.readFileSync = r0; };
    const heldRun = async (Mod, { gone = false } = {}) => {
      const SH = capOf(), ac = new AbortController();
      const d = sw.mk(Mod, { isRootOwned: REAL, toolDigest: (fd) => { if (gone) ac.abort(); return digestVouch(fd); }, toolSealed: (p, fd) => p === SHIMGH || DOOR.sealedToolReal(p, fd), spawnImpl: SH.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHSHIM, '/usr/bin', '/bin'].join(':') }) });
      const before = fs.existsSync(tf) ? r0.call(fs, tf, 'utf8') : null;
      placeEIO(); let r, held = null;
      try { r = await d.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', SHIMGH, 'issue', 'list'], cwd: sw.work, signal: ac.signal }); held = d._toolsHold ? d._toolsHold.held() : null; } finally { liftEIO(); }
      try { d._toolsHold && d._toolsHold.stop(); } catch { }
      return { ok: !!r.ok, by: r.by || null, code: r.code || null, spawned: !!SH.get(), heldCode: held && held.code, untouched: (fs.existsSync(tf) ? r0.call(fs, tf, 'utf8') : null) === before };
    };
    const rH = await heldRun(DOOR);
    ok(rH.heldCode === 'EIO' && rH.ok && rH.by === 'own' && rH.spawned && rH.untouched, 'r5367: a sealed gh run while its TOOLS RECORD is held (read EIO) RUNS ok:own, as with the record readable — the record recorded nothing and its file is untouched (a held record never refuses a run)', rH);
    const rG = await heldRun(DOOR, { gone: true });
    ok(rG.heldCode === 'EIO' && !rG.ok && rG.code === 'caller_gone' && !rG.spawned && rG.untouched, 'r5367: …and a run refused today stays refused while held: the caller gone during the hash is caller_gone, nothing spawned (a held record never passes a run that today is refused)', rG);
    const SRCh = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    // the copy GATES right AFTER the drift note (the note's own first read is what starts the hold); its witness: the record was held
    const GATE = editAnchor(SRCh, '        driftNote(spec.tool, tstat, got, head, toolName);', "        driftNote(spec.tool, tstat, got, head, toolName);\n        if (toolsHold.held()) { closeTool(); return named('tool_not_sealed', { tool: toolName }); }   // a copy that GATES on the held record", 'src/server/vault-run-door.js');
    const rR = await heldRun(M.load('src/server/vault-run-door.js', GATE, 'tools-held-gates'));
    if (rR.heldCode !== 'EIO') console.log('  ⊘ SKIP (named): r5367 CONTROL — the tools record was not held in the control\'s run (its plant was not in force): nothing judged');
    else ok(!rR.ok && rR.code === 'tool_not_sealed', 'r5367 CONTROL (a copy of the door that refuses while the tools record is held, its record held — the witness): the same sealed run is REFUSED — the leg above sees a held record that gates — red', rR);
  }

  // REAL-OWNERSHIP CONTROL (round 14 BLOCKER): the exported sealed predicate on the box's /usr/bin/gh (root-owned) vs a uid-owned
  // fixture — the VERDICT says sealed/unsealed with NO vendor call (gh --version is not a vault verb).
  const SYSGH = '/usr/bin/gh';
  if (fs.existsSync(SYSGH)) {
    const fdR = fs.openSync(SYSGH, 'r'); const sysSealed = DOOR.sealedToolReal(SYSGH, fdR); fs.closeSync(fdR);
    const fdX = fs.openSync(GHREAL_GH, 'r'); const uidSealed = DOOR.sealedToolReal(GHREAL_GH, fdX); fs.closeSync(fdX);
    ok(sysSealed === true && uidSealed === false, 'round 14 (BLOCKER, REAL ownership): /usr/bin/gh (root-owned chain + root-owned inode) IS sealed; the uid-owned fixture is NOT — the exported rule, no gh run', { sysSealed, uidSealed });
  } else { console.log('  – ①② real /usr/bin/gh ownership control SKIPPED: no /usr/bin/gh on this box'); }

  // CAP RED (round 14 MAJOR): the digest is taken FIRST, before the cap check, with NO await between the cap check and runs.add —
  // so 20 parallel own runs from one conversation spawn exactly RUNS_PER_CALLER (4) and the rest are too_many_runs by name (base:
  // the digest await sat between the cap check and runs.add, so all 20 saw callerRuns 0 and spawned).
  {
    const realKill = process.kill; process.kill = function (pid, sig) { if (typeof pid === 'number' && pid < 0 && -pid >= 93000 && -pid < 96000) return true; return realKill.call(process, pid, sig); };   // the fakes' pids are not ours: the door's group kill at their end is caught here (lane lg-vault-file's read: a real group with that id would have died)
    let spawns = 0;
    const capSpawn = (cmd, args, opts) => { spawns++; const c = new EventEmitter(); c.pid = 93000 + spawns; c.stdout = new EventEmitter(); c.stdout.destroy = () => {}; c.stderr = new EventEmitter(); c.stderr.destroy = () => {}; c.stdin = null; setImmediate(() => { c.emit('exit', 0, null); c.emit('close', 0, null); }); return c; };
    const dCap = mkGh({ spawnImpl: capSpawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const runs20 = await Promise.all(Array.from({ length: 20 }, () => dCap.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work })));
    const ran = runs20.filter((r) => r.ok).length, capped = runs20.filter((r) => !r.ok && r.code === 'too_many_runs').length;
    ok(ran === 4 && capped === 16 && spawns === 4, 'round 14 (MAJOR, caps): 20 parallel own runs ⇒ exactly 4 spawn + 16 too_many_runs by name (the digest is taken before the cap check; no await to runs.add) — base spawned all 20', { ran, capped, spawns });
    process.kill = realKill;
  }

  // LOCK-DURING-HASH RED (round 14 MAJOR): the vault locks WHILE the digest streams. On mine the door re-reads the state after the
  // await ⇒ vault_locked BY NAME, nothing spawned (base: the hash sat in spawnRun after the cap check, so valueOf then threw
  // entry_unknown — the WRONG name — and a child was spawned then stopped).
  {
    const LK = capOf();
    const lockDigest = () => { sw.vault.lock('door'); return Promise.resolve(GHSHA); };
    const dLK = mkGh({ toolDigest: lockDigest, spawnImpl: LK.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const rLK = await dLK.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work });
    ok(!rLK.ok && rLK.code === 'vault_locked' && !LK.get(), 'round 14 (MAJOR): a lock DURING the hash ⇒ vault_locked by name, nothing spawned (base: entry_unknown + a child spawned-then-stopped)', { code: rLK.code, spawned: !!LK.get() });
    await sw.vault.unlock(PW);
  }

  // CALLER-GONE-DURING-HASH RED (round 14 MAJOR): the caller aborts WHILE the digest streams. On mine the door re-checks the signal
  // after the await ⇒ caller_gone, nothing spawned (base: spawnRun had no signal re-check after the hash — spawn-then-stop).
  {
    const GN = capOf();
    const ac = new AbortController();
    const goneDigest = () => { ac.abort(); return Promise.resolve(GHSHA); };
    const dGN = mkGh({ toolDigest: goneDigest, spawnImpl: GN.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const rGN = await dGN.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work, signal: ac.signal });
    ok(!rGN.ok && rGN.code === 'caller_gone' && !GN.get(), 'round 14 (MAJOR): a caller gone DURING the hash ⇒ caller_gone, nothing spawned (base: spawn-then-stop)', { code: rGN.code, spawned: !!GN.get() });
  }


  // ── ROUND 15 ITEM 1 (BLOCKER): a ROOT-OWNED gh of ANY version RUNS (drift-recorded), never tool_changed ──
  // the REAL /usr/bin/gh (root-owned, likely NOT the pinned 2.102.0): SEALED ⇒ runs with a minted value + a drift baseline, no gate.
  {
    const SYSGH2 = '/usr/bin/gh';
    if (fs.existsSync(SYSGH2)) {
      const S1 = capOf();
      const dSys = sw.mk(DOOR, { isRootOwned: REAL, toolDigest: digestVouch, spawnImpl: S1.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: ['/usr/bin', '/bin'].join(':') }) });   // DEFAULT toolSealed = the REAL chain+fstat rule (no inject) — /usr/bin/gh is genuinely root-owned
      const rSys = await dSys.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', SYSGH2, 'issue', 'list'], cwd: sw.work });
      const ts = fs.existsSync(path.join(sw.dataDir, 'vault-run-tools.json')) ? JSON.parse(fs.readFileSync(path.join(sw.dataDir, 'vault-run-tools.json'), 'utf8')) : null;
      ok(rSys.ok && rSys.by === 'own' && !!S1.get() && ts && ts.tools && ts.tools[SYSGH2] && /^[0-9a-f]{64}$/.test(ts.tools[SYSGH2].sha256), 'round 15 (BLOCKER, REAL ownership): the box\'s root-owned /usr/bin/gh (any version) RUNS ok:own with a minted value and is drift-recorded — no tool_changed, no vendor call (base refused it unless it was exactly the pinned 2.102.0)', { ok: rSys.ok, by: rSys.by, recorded: !!(ts && ts.tools && ts.tools[SYSGH2]) });
    } else { console.log('  – round 15 item 1 REAL /usr/bin/gh run SKIPPED: no /usr/bin/gh on this box'); }
  }

  // ── ROUND 15 ITEM 2a (MAJOR, ONE host set): a GHES-minted value + -R o/r --body evil.test ──
  // the card asks for github.com (the ROUTE of -R o/r), names evil.test ONLY as a mention, and homes to github.com + GH_TOKEN.
  {
    const A2 = capOf();
    const dA2m = mkGh({ spawnImpl: A2.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const pA2 = dA2m.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/site-pw', '--', GHREAL_GH, 'issue', 'create', '-R', 'o/r', '--title', 't', '--body', 'see https://evil.test/x'], cwd: sw.work });
    const cA2 = await waitCard(sw); const dA2d = cA2 ? cA2.detail : '';
    if (cA2) dA2m.answer(cA2.action.askId, { answer: 'once' });
    const rA2 = await pA2; const EA2 = A2.get() ? A2.get().env : {};
    ok(rA2.ok && /sends it to github\.com/.test(dA2d) && !/sends it to evil\.test/.test(dA2d) && /Mentions.*evil\.test/.test(dA2d) && EA2.GH_HOST === 'github.com' && EA2.GH_TOKEN === 'agent-minted-pw-0123456789abc' && EA2.GH_ENTERPRISE_TOKEN === undefined,
      'round 15 (MAJOR 2a): a GHES-minted value + -R o/r --body evil.test — the CARD asks for github.com (the route), names evil.test only as a Mention, and homes to github.com + GH_TOKEN; evil.test is never a target (base: the card named evil.test)', { ok: rA2.ok, GH_HOST: EA2.GH_HOST, sendsGithub: /sends it to github\.com/.test(dA2d), mentionsEvil: /Mentions.*evil\.test/.test(dA2d) });
  }

  // ── ROUND 15 ITEM 2b (MAJOR, ONE host set): a github-minted value + --body evil.test (no -R) ⇒ NO card, NO pass ──
  // and the LATER run that ROUTES to evil.test (-R evil.test/o/r) on the SAME door ASKS (the body mention never became a pass).
  {
    const B2 = capOf();
    const dB2 = mkGh({ spawnImpl: B2.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const before = cardsOf(sw).length;
    const r1 = await dB2.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-mint', '--', GHREAL_GH, 'issue', 'create', '--title', 't', '--body', 'see https://evil.test/x'], cwd: sw.work });
    const added = cardsOf(sw).length - before;
    const p2 = dB2.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-mint', '--', GHREAL_GH, 'issue', 'list', '-R', 'evil.test/o/r'], cwd: sw.work });
    const c2 = await waitCard(sw);
    ok(r1.ok && r1.by === 'own' && added === 0 && !!c2 && /sends it to evil\.test/.test(c2.detail), 'round 15 (MAJOR 2b): --body evil.test (github-minted, no -R) routes to github.com ⇒ NO card, NO evil.test pass kept; a LATER -R evil.test/o/r on the same door ASKS (base: the body Allow kept a pass for evil.test, the later run ran silent)', { by: r1.by, addedCards: added, laterAsks: !!c2 });
    if (c2) dB2.answer(c2.action.askId, { answer: 'deny' });
    await p2.catch(() => {});
  }

  // ── ROUND 15 ITEM 2c (MAJOR, ONE host set): gh api <GHES url> — the endpoint URL is a ROUTE host ──
  // the card asks for the GHES host, and after approval GH_HOST + GH_ENTERPRISE_TOKEN carry the APPROVED credential there.
  {
    const C2 = capOf();
    const dC2 = mkGh({ spawnImpl: C2.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const pC2 = dC2.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-mint', '--', GHREAL_GH, 'api', 'https://ghe.example.test/api/v3/repos/o/r'], cwd: sw.work });
    const cC2 = await waitCard(sw); const dC2d = cC2 ? cC2.detail : '';
    if (cC2) dC2.answer(cC2.action.askId, { answer: 'once' });
    const rC2 = await pC2; const EC2 = C2.get() ? C2.get().env : {};
    ok(rC2.ok && rC2.by === 'once' && EC2.GH_HOST === 'ghe.example.test' && EC2.GH_ENTERPRISE_TOKEN === 'agent-minted-ghv-0123456789abc' && EC2.GH_TOKEN === undefined && /sends it to ghe\.example\.test/.test(dC2d),
      'round 15 (MAJOR 2c): gh api https://ghe.example.test/... — the endpoint URL is a ROUTE host; the card asks for ghe.example.test and after approval GH_HOST=ghe.example.test + GH_ENTERPRISE_TOKEN carry the credential there (base: sealed github.com + GH_TOKEN, so gh never sent the approved credential)', { by: rC2.by, GH_HOST: EC2.GH_HOST, ENT: !!EC2.GH_ENTERPRISE_TOKEN });
  }

  // ── ROUND 15 ITEM 3 (MINOR): only git-DRIVING verbs need git on the sealed PATH; the probe is RE-ASKED when it was false ──
  {
    const G1 = capOf();
    const dG1 = mkGh({ spawnImpl: G1.spawn, probeGit: () => false, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const rApi = await dG1.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'api', '/user'], cwd: sw.work });
    ok(rApi.ok && rApi.by === 'own' && !!G1.get(), 'round 15 (MINOR 3): gh api (never runs git) RUNS ok:own even when git is absent from the sealed PATH (base: run_path_unsafe refused EVERY gh run)', { ok: rApi.ok, by: rApi.by });
    const G2 = capOf();
    const dG2 = mkGh({ spawnImpl: G2.spawn, probeGit: () => false, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const rClone = await dG2.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'repo', 'clone', 'o/r'], cwd: sw.work });
    ok(!rClone.ok && rClone.code === 'git_not_on_seal' && !G2.get(), 'round 15 (MINOR 3): gh repo clone (DRIVES git) is git_not_on_seal by NAME when git is absent — not run_path_unsafe, and ONLY a git-driving verb is refused', { code: rClone.code, spawned: !!G2.get() });
    let gitHere = false;
    const G3 = capOf();
    const dG3 = mkGh({ spawnImpl: G3.spawn, probeGit: () => gitHere, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const rC1 = await dG3.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'repo', 'clone', 'o/r'], cwd: sw.work });
    gitHere = true;
    const rC2 = await dG3.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'repo', 'clone', 'o/r'], cwd: sw.work });
    ok(rC1.code === 'git_not_on_seal' && rC2.ok && rC2.by === 'own', 'round 15 (MINOR 3): the git-on-seal probe is RE-ASKED per refused call — git installed after boot ⇒ gh repo clone refused then RUNS (base: gitOnSeal probed once at boot, never re-checked)', { first: rC1.code, second: rC2.ok });
  }

  // ── ROUND 15 ITEM 4 (MINOR): the PER-CALLER cap is checked BEFORE the hash — an over-cap call never hashes ──
  {
    const realKill = process.kill; process.kill = function (pid, sig) { if (typeof pid === 'number' && pid < 0 && -pid >= 93000 && -pid < 96000) return true; return realKill.call(process, pid, sig); };   // the fakes' pids are not ours: the door's group kill at their end is caught here (lane lg-vault-file's read: a real group with that id would have died)
    let hashes = 0; const kids = [];
    const countingDigest = (fd) => { hashes++; return digestVouch(fd); };
    const holdSpawn = () => { const c = new EventEmitter(); c.pid = 95000 + kids.length; c.stdout = new EventEmitter(); c.stdout.destroy = () => {}; c.stderr = new EventEmitter(); c.stderr.destroy = () => {}; c.stdin = null; kids.push(c); return c; };   // never closes ⇒ the run stays in `runs`
    const dH = sw.mk(DOOR, { isRootOwned: REAL, toolDigest: countingDigest, toolSealed: sealedVouch, spawnImpl: holdSpawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const prime = Array.from({ length: 4 }, () => dH.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work }));
    for (let i = 0; i < 300 && dH.running() < 4; i++) await sleep(10);   // each run waits for its scrubber worker before its child spawns (lane lg-vault-file, the scan off the loop): the four are in `runs` within milliseconds, not turns
    const primedHashes = hashes;   // the 4 priming runs share ONE memoised hash (same inode)
    hashes = 0;
    const over = await Promise.all(Array.from({ length: 20 }, () => dH.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work })));
    const capped = over.filter((r) => !r.ok && r.code === 'too_many_runs').length;
    ok(dH.running() === 4 && capped === 20 && hashes === 0 && primedHashes === 1, 'round 15 (MINOR 4): an over-cap conversation (4 held) ⇒ 20 parallel calls are too_many_runs BEFORE the hash — 0 digests of the 42 MB binary (base: all 20 hashed); the 4 priming runs shared ONE memoised hash', { running: dH.running(), capped, hashes, primedHashes });
    for (const c of kids) { c.emit('exit', 0, null); c.emit('close', 0, null); }   // release the held runs (finish ⇒ runs.delete + shred) so the process exits clean
    await Promise.all(prime);
    process.kill = realKill;
  }

  // RUN B — own MINTED site-pw (--for api.example.com, a non-github host) ⇒ the door pins GH_HOST AND homes the credential to
  // GH_ENTERPRISE_TOKEN (the agent passed a GH_TOKEN reference and named neither the host nor the enterprise credential name).
  const B = capOf();
  const dB = mkGh({ spawnImpl: B.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
  const rB = await dB.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/site-pw', '--', GHREAL_GH, 'issue', 'list', '-R', 'api.example.com/o/r'], cwd: sw.work });
  const EB = B.get() ? B.get().env : {};
  ok(rB.ok && rB.by === 'own' && EB.GH_HOST === 'api.example.com' && EB.GH_ENTERPRISE_TOKEN === 'agent-minted-pw-0123456789abc' && EB.GH_TOKEN === undefined,
    'round 12 (MINOR): a value minted --for a GHES host pins GH_HOST and the DOOR homes the credential to GH_ENTERPRISE_TOKEN (GH_TOKEN cleared) — the agent named neither', { GH_HOST: EB.GH_HOST, ENT: EB.GH_ENTERPRISE_TOKEN, TOK: EB.GH_TOKEN });

  // RUN D (round 13 MINOR): a value minted --for github.com, the call NAMES a GHES host (-R ghe.example.test/o/r) approved on a
  // card ⇒ GH_HOST and the credential follow the host the VERDICT APPROVED (ghe.example.test → GH_ENTERPRISE_TOKEN), not the mint's
  // --for (github.com). On base the seal pinned the mint's --for: GH_HOST=github.com + GH_TOKEN, the request reaching nowhere.
  const Dd = capOf();
  const dDd = mkGh({ spawnImpl: Dd.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
  const pDd = dDd.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-mint', '--', GHREAL_GH, 'issue', 'list', '-R', 'ghe.example.test/o/r'], cwd: sw.work });
  const cardDd = await waitCard(sw);
  if (cardDd) dDd.answer(cardDd.action.askId, { answer: 'once' });
  const rDd = await pDd;
  const EDd = Dd.get() ? Dd.get().env : {};
  ok(rDd.ok && rDd.by === 'once' && EDd.GH_HOST === 'ghe.example.test' && EDd.GH_ENTERPRISE_TOKEN === 'agent-minted-ghv-0123456789abc' && EDd.GH_TOKEN === undefined,
    'round 13 (MINOR): a value minted --for github.com, the call -R ghe.example.test approved on a card ⇒ GH_HOST + GH_ENTERPRISE_TOKEN follow the APPROVED host, not the mint\'s --for (base pinned github.com + GH_TOKEN, reaching nowhere)', { ok: rDd.ok, by: rDd.by, GH_HOST: EDd.GH_HOST, ENT: !!EDd.GH_ENTERPRISE_TOKEN, TOK: EDd.GH_TOKEN, card: !!cardDd });

  // ITEM-4 FORWARD RED (round 14 MAJOR, sealHost routing): a github-minted value, the call names -R o/r (routes to github.com) but
  // mentions evil.test in the --body. The SEAL follows the ROUTING host (github.com) ⇒ GH_HOST=github.com + GH_TOKEN; evil.test (a
  // body URL, the card's words) is never a routing host. On base the seal took the single non-default shape host ⇒ GH_HOST=evil.test
  // + GH_ENTERPRISE_TOKEN (the token homed to a host named only in free text).
  const F = capOf();
  const dF = mkGh({ spawnImpl: F.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
  const pF = dF.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-mint', '--', GHREAL_GH, 'issue', 'create', '-R', 'o/r', '--title', 't', '--body', 'see https://evil.test/x'], cwd: sw.work });
  const cardF = await waitCardOrEnd(sw, pF);   // B-54a9: this road draws no card (the mint's own host): the wait ends at the run's end
  if (cardF) dF.answer(cardF.action.askId, { answer: 'once' });
  const rF = await pF; const EF = F.get() ? F.get().env : {};
  ok(rF.ok && EF.GH_HOST === 'github.com' && EF.GH_TOKEN === 'agent-minted-ghv-0123456789abc' && EF.GH_ENTERPRISE_TOKEN === undefined,
    'round 14 (MAJOR, sealHost routing): a github-minted value with -R o/r + a --body evil.test URL homes to GH_HOST=github.com + GH_TOKEN (the routing host), NOT the body URL (base: GH_HOST=evil.test + GH_ENTERPRISE_TOKEN)', { GH_HOST: EF.GH_HOST, TOK: EF.GH_TOKEN, ENT: EF.GH_ENTERPRISE_TOKEN, card: !!cardF });

  // ITEM-4 REVERSE RED (round 14 MAJOR): a value minted --for a GHES host (api.example.com), the call names -R github.com/o/r
  // (routes to github.com) approved on a card. The SEAL follows the APPROVED routing host (github.com) ⇒ GH_HOST=github.com +
  // GH_TOKEN. On base the seal stayed pinned to the mint's --for ⇒ GH_HOST=api.example.com + GH_ENTERPRISE_TOKEN (the wrong host).
  const RV = capOf();
  const dRV = mkGh({ spawnImpl: RV.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
  const pRV = dRV.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/site-pw', '--', GHREAL_GH, 'issue', 'create', '-R', 'github.com/o/r', '--title', 't', '--body', 'b'], cwd: sw.work });
  const cardRV = await waitCard(sw);
  if (cardRV) dRV.answer(cardRV.action.askId, { answer: 'once' });
  const rRV = await pRV; const ERV = RV.get() ? RV.get().env : {};
  ok(rRV.ok && ERV.GH_HOST === 'github.com' && ERV.GH_TOKEN === 'agent-minted-pw-0123456789abc' && ERV.GH_ENTERPRISE_TOKEN === undefined,
    'round 14 (MAJOR, sealHost both directions): a GHES-minted value used against -R github.com/o/r (approved) homes to GH_HOST=github.com + GH_TOKEN — the approved routing host wins over the mint\'s --for (base: GH_HOST=api.example.com + GH_ENTERPRISE_TOKEN)', { GH_HOST: ERV.GH_HOST, TOK: ERV.GH_TOKEN, ENT: ERV.GH_ENTERPRISE_TOKEN, card: !!cardRV });

  // BOOT SEAL (round 14 MINOR): the sealed PATH + git-on-seal are computed ONCE at the door's construction (a boot step, < 250 ms),
  // not on the event loop at the first spawn.
  const bs = dA._bootSeal();
  ok(typeof bs.ms === 'number' && bs.ms >= 0 && bs.gitOnSeal === true, 'round 14 (MINOR): the sealed PATH + git-on-seal are computed at BOOT (a finite ms, reported; the boot law < 250 ms is measured in the report, never asserted as a flaky wall-clock bound) — not lazily at the first spawn', bs);

  // RUN C — a runSeal tool resolved via an absolute path from a uid-owned dir, the agent PATH ALL uid-owned ⇒ the sealed PATH is
  // EMPTY ⇒ refused BY NAME (gh could not find git). A root hub, or git only under a writable prefix.
  const C = capOf();
  const dC = mkGh({ spawnImpl: C.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [WSEAL, GHREAL].join(':') }) });
  const rC = await dC.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work });
  ok(!rC.ok && rC.code === 'run_path_unsafe' && !C.get(), 'round 12 (MAJOR 2): a runSeal tool whose sealed PATH comes out empty (every dir uid-owned) is refused BY NAME (run_path_unsafe) — nothing spawned', { ok: rC.ok, code: rC.code });

  // ENV ALLOWLIST through the DOOR — a non-allowlisted agent env (GIT_TRACE2_ENV_VARS + GIT_TRACE2_EVENT) ⇒ env_refused BY NAME
  // before any plan; gh's git child can never write the token VALUE to a file the agent names.
  const rTrace = await dA.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--env', 'GIT_TRACE2_ENV_VARS=GH_TOKEN', '--env', 'GIT_TRACE2_EVENT=/tmp/x', '--', GHREAL_GH, 'pr', 'create', '-R', 'o/r', '--head', 'feat', '-t', 't', '-b', 'b'], cwd: sw.work });
  ok(!rTrace.ok && rTrace.code === 'env_refused', 'round 12 (MAJOR): GIT_TRACE2_ENV_VARS=GH_TOKEN + GIT_TRACE2_EVENT=<agent file> ⇒ env_refused BY NAME — the agent env is an allowlist, so no GIT_* road is open', { code: rTrace.code });

  // a NON-seal tool (the printer) is spawned on the agent env unchanged — the seal is row-driven (gh only), no blanket regression
  const P = capOf();
  const printDoor = mkGh({ spawnImpl: P.spawn, agentEnv: () => ({ ...SUITE_ENV, MARKER_XYZ: 'kept', PATH: [WSEAL, BIN, '/usr/bin', '/bin'].join(':') }) });
  await printDoor.run({ caller: sw.caller, args: ['--env', 'T=vault://agent:conv-1/gh-token', '--', NODE, PRINTER, 'ran', path.join(sw.work, 'x.txt')], cwd: sw.work });
  const EP = P.get() ? P.get().env : {};
  ok(EP.MARKER_XYZ === 'kept' && (EP.PATH || '').split(':').includes(WSEAL) && EP.GH_CONFIG_DIR === undefined && EP.HOME !== NOWHERE && EP.GIT_CONFIG_GLOBAL === undefined, 'BLOCKER: a NON-runSeal tool (node) is spawned on the agent env UNCHANGED (writable PATH head kept, no GH_CONFIG_DIR / nowhere-HOME / git-child seal) — the seal is row-driven', { MARKER_XYZ: EP.MARKER_XYZ, hasWseal: (EP.PATH||'').split(':').includes(WSEAL) });

  // the suite's OWN environment: no run of this suite sees the caller's (the mark only the caller's env carries) — RED: a door whose
  // agent env spreads process.env (the suite's old shape) hands the run the caller's mark
  ok(EP.VS_SUITE_CALLER_MARK === undefined && EP.HOME === SUITE_HOME, '主开发 00:56Z: the printer door\'s run carries no caller mark and the stand-in HOME — BY CONSTRUCTION (its env is built inline from SUITE_ENV); the leg through world()\'s own default door below is the one that carries the meaning', { mark: EP.VS_SUITE_CALLER_MARK, home: EP.HOME });
  { const P2 = capOf();
    const leakDoor = mkGh({ spawnImpl: P2.spawn, agentEnv: () => ({ ...process.env, PATH: [WSEAL, BIN, '/usr/bin', '/bin'].join(':') }) });   // stale-pins: kept — a RED control: the suite's old caller-env spread, on purpose
    await leakDoor.run({ caller: sw.caller, args: ['--env', 'T=vault://agent:conv-1/gh-token', '--', NODE, PRINTER, 'ran', path.join(sw.work, 'x2.txt')], cwd: sw.work });
    const E2 = P2.get() ? P2.get().env : {};
    ok(E2.VS_SUITE_CALLER_MARK === 'the-caller-env', 'RED control: a door built on the caller\'s env (process.env spread) hands the run the caller\'s mark — the suite\'s own environment is what keeps its verdicts the same everywhere', { mark: E2.VS_SUITE_CALLER_MARK }); }
  // …and through world()'s OWN default agent env (the one every ①–⑪ door uses — no agentEnv given): the mark is absent there too,
  // HOME the stand-in (the read: the printer door above builds its env inline, so that check alone holds by construction)
  { const P3 = capOf();
    const plainDoor = sw.mk(DOOR, { spawnImpl: P3.spawn });
    await plainDoor.run({ caller: sw.caller, args: ['--env', 'T=vault://agent:conv-1/gh-token', '--', NODE, PRINTER, 'ran', path.join(sw.work, 'x3.txt')], cwd: sw.work });
    const E3 = P3.get() ? P3.get().env : {};
    ok(!!P3.get() && E3.VS_SUITE_CALLER_MARK === undefined && E3.HOME === SUITE_HOME, '主开发 00:56Z: world()\'s own default door spawns a run on the SUITE\'s environment — the caller\'s mark absent, HOME the stand-in', { spawned: !!P3.get(), mark: E3.VS_SUITE_CALLER_MARK, home: E3.HOME }); }
  // GUARDED real-gh WIRE leg (minor 4): run the REAL pinned gh through the door (DEFAULT toolDigest = the streaming sha256, REAL
  // ownership) against a planted config.yml whose http_unix_socket points at a live unix socket I listen on — the socket must get
  // ZERO bytes (the seal, GH_CONFIG_DIR=NOWHERE, means no planted config is read), and the real binary RAN (its bytes match the pin).
  const REALGH = '/var/tmp/vibespace-lanes/vault-agent-own/bin/gh';
  if (!fs.existsSync(REALGH)) {
    console.log('  – ⑫ real-gh WIRE leg SKIPPED: the pinned gh is not at ' + REALGH + ' (the digest + wire property are proven in the report’s scratch harness)');
  } else {
    const net = require('node:net');
    const sockPath = path.join(sw.dir, 'evil.sock');
    let hits = 0, got = 0;
    const server = net.createServer((c) => { hits++; c.on('data', (d) => { got += d.length; }); c.on('error', () => {}); });
    await new Promise((res) => server.listen(sockPath, res));
    try {
      const pdir = path.join(sw.dir, 'planted-gh'); fs.mkdirSync(pdir, { recursive: true });
      fs.writeFileSync(path.join(pdir, 'config.yml'), `http_unix_socket: ${sockPath}\n`);   // if gh read this planted config, its API call would dial my socket — the seal (GH_CONFIG_DIR=NOWHERE) means it never does
      const dW = sw.mk(DOOR, { isRootOwned: REAL, toolSealed: (p, fd) => p === REALGH || DOOR.sealedToolReal(p, fd), agentEnv: () => ({ ...SUITE_ENV, HOME: pdir, GH_CONFIG_DIR: pdir, HTTPS_PROXY: 'http://127.0.0.1:1', HTTP_PROXY: 'http://127.0.0.1:1', PATH: [path.dirname(REALGH), '/usr/bin', '/bin'].join(':') }) });   // round 14: model the lane's pinned gh as root-owned (a test cannot chown it); the REAL streaming sha256 still verifies its bytes
      const rW = await dW.run({ caller: sw.caller, args: ['--timeout', '15', '--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', REALGH, 'pr', 'create', '-R', 'o/r', '--head', 'feat', '-t', 't', '-b', 'b'], cwd: sw.work });
      await sleep(150);
      ok(hits === 0 && got === 0, 'round 12 (minor 4, WIRE): the REAL pinned gh, run through the door with a planted config.yml (http_unix_socket → my live socket), connected to the socket ZERO times and sent ZERO bytes — the seal (GH_CONFIG_DIR=NOWHERE) means no planted config / hosts is read; the token never reached the agent socket', { hits, bytes: got, exit: rW.exit, stderr: (rW.stderr || '').slice(0, 90) });
      ok(rW.ok === true && rW.by === 'own', 'round 12/14/15 (minor 4): the REAL pinned gh is SEALED (root-owned) and its live bytes are DRIFT-RECORDED (never gated), and it RAN ok:own — the streaming sha256 the door computes on the live binary is the drift record, exec\'d as the SAME inode via /proc/fd', { ok: rW.ok, by: rW.by, exit: rW.exit });
    } finally { server.close(); try { fs.unlinkSync(sockPath); } catch { } }
  }

  // ── ROUND 16 ITEM 1 (BLOCKER): a <url> POSITIONAL whose host differs from -R / GH_HOST is TWO route hosts ⇒ two_hosts ──
  // base (6df327c0): urlArg did not exist, so the URL host was DROPPED from routeHosts; the verdict saw only the -R host, approved
  // ok:own with NO card, and the seal homed GH_ENTERPRISE_TOKEN to the -R host while gh CONTACTED the URL's host (evil.test) — the
  // leak, proven end-to-end by the report's dead-proxy GH_DEBUG=api trace (Host: evil.test, Authorization: token ████).
  {
    const EVIL = { 'issue view': 'https://evil.test/o/r/issues/1', 'pr view': 'https://evil.test/o/r/pull/2', 'issue comment': 'https://evil.test/o/r/issues/1', 'issue close': 'https://evil.test/o/r/issues/1', 'pr checks': 'https://evil.test/o/r/pull/2' };
    const bad = [];
    for (const [verb, url] of Object.entries(EVIL)) {
      const cap = capOf();
      const dV = mkGh({ spawnImpl: cap.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
      const extra = verb === 'issue comment' ? ['--body', 'x'] : [];
      const r = await dV.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-ghe', '--', GHREAL_GH, ...verb.split(' '), url, '-R', 'ghe.example.test/o/r', ...extra], cwd: sw.work });
      if (!(r.code === 'two_hosts' && !cap.get() && Array.isArray(r.hosts) && r.hosts.includes('evil.test') && r.hosts.includes('ghe.example.test') && /evil\.test/.test(r.words || '') && /ghe\.example\.test/.test(r.words || ''))) bad.push([verb, r.code, !!cap.get(), r.hosts]);
    }
    ok(!bad.length, `round 16 (BLOCKER): each URL-positional gh verb (${Object.keys(EVIL).join(', ')}) with a <url> host != the -R host ⇒ two_hosts BY NAME, naming BOTH hosts, nothing spawned — base dropped the URL host, approved ok:own, and homed GH_ENTERPRISE_TOKEN to the URL's host`, bad);
    // round 19 (item 1 BLOCKER): a <url>/<endpoint> the WHATWG parser REJECTS (port > 65535, a numeric last label) ⇒ bad_host BY NAME, nothing spawned — daade1a7 DROPPED the rejected host from routeHosts, approved ok:own with GH_HOST=ghe + GH_ENTERPRISE_TOKEN, and gh drops the bad port / dials the name (the dead-proxy trace: Host: evil.test, Authorization: token). The commit's own «a string the parser rejects ⇒ bad_host» contract, now implemented at the door.
    { const REJ = [['issue view', 'https://evil.test:99999/o/r/issues/1', ['-R', 'ghe.example.test/o/r']], ['pr view', 'https://evil.test:65536/o/r/pull/2', ['-R', 'ghe.example.test/o/r']], ['api', 'https://evil.test:99999/x', ['--hostname', 'ghe.example.test']], ['issue view', 'https://evil.test.123/o/r/issues/1', []]];
      const rbad = [];
      for (const [verb, url, extra] of REJ) { const cap = capOf(); const dR = mkGh({ spawnImpl: cap.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
        const r = await dR.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-ghe', '--', GHREAL_GH, ...verb.split(' '), url, ...extra], cwd: sw.work });
        if (!(r.code === 'bad_host' && !cap.get())) rbad.push([verb, url, r.code, !!cap.get()]); }
      ok(!rbad.length, 'round 19 (item 1 BLOCKER): a gh <url>/<endpoint> the WHATWG parser rejects (port > 65535, numeric last label) ⇒ bad_host BY NAME, nothing spawned — daade1a7 dropped the host and approved ok:own + GH_ENTERPRISE_TOKEN to the -R host while gh dials the rejected host', rbad); }
    // no FALSE two_hosts: a <url> whose host EQUALS the -R host (one route), and a number positional, both run ok:own
    const c1 = capOf(), c2 = capOf();
    const d1 = mkGh({ spawnImpl: c1.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const r1 = await d1.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-ghe', '--', GHREAL_GH, 'issue', 'view', 'https://ghe.example.test/o/r/issues/1', '-R', 'ghe.example.test/o/r'], cwd: sw.work });
    const d2 = mkGh({ spawnImpl: c2.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const r2 = await d2.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-ghe', '--', GHREAL_GH, 'issue', 'view', '123', '-R', 'ghe.example.test/o/r'], cwd: sw.work });
    const E1 = c1.get() ? c1.get().env : {}, E2 = c2.get() ? c2.get().env : {};
    ok(r1.ok && r1.by === 'own' && E1.GH_HOST === 'ghe.example.test' && !!E1.GH_ENTERPRISE_TOKEN && !E1.GH_TOKEN && r2.ok && r2.by === 'own' && E2.GH_HOST === 'ghe.example.test', 'round 16: NO false two_hosts — a <url> whose host EQUALS the -R host (one route), and a number positional + -R, both run ok:own with GH_HOST pinned to the ghe host + GH_ENTERPRISE_TOKEN homed', { r1: r1.code || r1.by, GH_HOST1: E1.GH_HOST, cred1: E1.GH_ENTERPRISE_TOKEN ? 'ENTERPRISE' : (E1.GH_TOKEN ? 'GH_TOKEN' : '-'), r2: r2.code || r2.by });
  }

  // ── ROUND 16 ITEM 2 (MAJOR): a no-row tool (a shell) names its host on the card, never «unknown» ──
  {
    const cap = capOf();
    const dSh = sw.mk(DOOR, { isRootOwned: REAL, spawnImpl: cap.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: ['/usr/bin', '/bin'].join(':') }) });
    const p = dSh.run({ caller: sw.caller, args: ['--env', 'T=vault://agent:conv-1/site-pw', '--', 'bash', '-c', 'curl https://x.example'], cwd: sw.work });
    const c = await waitCard(sw); const d = c ? c.detail : '';
    if (c) dSh.answer(c.action.askId, { answer: 'deny' });
    await p.catch(() => {});
    const hostsLine = (d.match(/^Hosts: (.+)$/m) || [])[1] || '(no card)';
    ok(!!c && /x\.example/.test(hostsLine) && !/unknown/.test(hostsLine), 'round 16 (MAJOR): bash -c "curl https://x.example" under a minted value — the card names x.example on the Hosts line (base said «unknown — the tool names none»: routeHosts was empty for a no-row tool)', { hostsLine });
  }

  // ── ROUND 16 MINOR #1: a routing host that does not parse ⇒ bad_host, never «null» at the verdict ──
  {
    const PSQLDIR = path.join(ROOT, 'psqlbin'); fs.mkdirSync(PSQLDIR, { recursive: true });
    fs.writeFileSync(path.join(PSQLDIR, 'psql'), '#!/bin/sh\necho psql\n', { mode: 0o755 });
    const cap = capOf();
    const dP = sw.mk(DOOR, { isRootOwned: REAL, spawnImpl: cap.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [PSQLDIR, '/usr/bin', '/bin'].join(':') }) });
    const r = await dP.run({ caller: sw.caller, args: ['--env', 'PGPASSWORD=vault://agent:conv-1/site-pw', '--', 'psql', '-h', ',db.example.com'], cwd: sw.work });
    ok(r.code === 'bad_host' && !cap.get() && !cardsOf(sw).length, 'round 16 (MINOR): psql -h ,db.example.com (a host-list element that does not parse ⇒ null) ⇒ bad_host BY NAME, no card, nothing ran — base let a null host reach the verdict («sends it to null»)', { code: r.code, spawned: !!cap.get() });
  }

  // ── ROUND 16 MINOR #2: a MALFORMED drift record is discarded + rewritten — the sealed gh still RUNS (never fails forever) ──
  {
    const toolsFile = path.join(sw.dataDir, 'vault-run-tools.json');
    fs.writeFileSync(toolsFile, JSON.stringify({ v: 1, tools: { [GHREAL_GH]: { sha256: 123 } } }));   // a number sha256: base's driftNote did prev.sha256.slice and THREW, failing EVERY sealed gh run and never healing
    const cap = capOf();
    const dM = mkGh({ spawnImpl: cap.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    let threw = null, r = null;
    try { r = await dM.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work }); } catch (e) { threw = (e && e.message) || String(e); }
    const rec = JSON.parse(fs.readFileSync(toolsFile, 'utf8')).tools[GHREAL_GH];
    ok(!threw && r && r.ok && r.by === 'own' && !!cap.get() && rec && typeof rec.sha256 === 'string', 'round 16 (MINOR): a MALFORMED drift record (sha256 is a number) is DISCARDED and rewritten as a fresh baseline — the sealed gh RUNS ok:own (base THREW on prev.sha256.slice, failing every sealed gh run and never healing)', { threw, ok: r && r.ok, recSha: rec && typeof rec.sha256 });
  }

  // ── ROUND 16 MINOR #3: the post-verdict tool_not_sealed (ownership moved between the hash and the spawn) RESTORES the once-grant ──
  {
    const w3 = await world({ instance: 'local' });
    let seals = 0;
    const statefulSeal = (p, fd) => { if (p !== GHREAL_GH) return DOOR.sealedToolReal(p, fd); seals++; return seals === 1; };   // SEALED at the in-block hash, UNSEALED at the pre-spawn re-check (ownership changed between them)
    const cap = capOf();
    const d3 = w3.mk(DOOR, { isRootOwned: REAL, toolDigest: digestVouch, toolSealed: statefulSeal, spawnImpl: cap.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const q3 = d3.request({ caller: w3.caller, entry: 'vault://mounts/m1/secretKey', purpose: 'drift re-check' });
    d3.answerRequest(q3.askId, { answer: 'once', reauthed: true });
    const before = d3._grants.size;
    const pr3 = d3.run({ caller: w3.caller, args: ['--env', 'GH_TOKEN=vault://mounts/m1/secretKey', '--', GHREAL_GH, 'issue', 'list'], cwd: w3.work });
    const c3 = await waitCard(w3, 800); if (c3) d3.answer(c3.action.askId, { answer: 'once' });   // a host pass may be asked; answering it does not touch the pre-created m1 once-grant (admitted before the ask)
    const r3 = await pr3;
    ok(before === 1 && r3.code === 'tool_not_sealed' && /ownership changed between/.test(r3.words || '') && !cap.get() && d3._grants.size === 1, 'round 16 (MINOR): a tool whose ownership changes between the hash and the spawn ⇒ tool_not_sealed AFTER the spend RESTORES the once-grant (nothing ran) and the words name THIS path (not the directory-writable remedy) — base lost the grant with nothing run', { code: r3.code, grantsBefore: before, grantsAfter: d3._grants.size, words: (r3.words || '').slice(0, 56) });
  }

  // ── ROUND 16 MINOR #4: a plain gh card never «mentions» the row default (api.github.com) ──
  {
    const cap = capOf();
    const dM4 = mkGh({ spawnImpl: cap.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const p = dM4.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-ghe', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work });
    const c = await waitCard(sw); const d = c ? c.detail : '';
    if (c) dM4.answer(c.action.askId, { answer: 'deny' });
    await p.catch(() => {});
    ok(!!c && /^Hosts: github\.com$/m.test(d) && !/Mentions/.test(d), 'round 16 (MINOR): a plain gh card (a GHES-minted value routed to github.com) names Hosts: github.com and shows NO Mentions line — base leaked the row default api.github.com into «Mentions» (a row default is a route host, never a mention)', { hosts: (d.match(/^Hosts: .+$/m) || [])[0], mentions: (d.match(/^Mentions.+$/m) || [])[0] || 'none' });
  }

  // ── ⑬ THE HOME CENSUS (B-f1d3, lane lg-vault-env): EVERY KNOWN_TOOLS row driven through the REAL door ──
  // Each row's fake tool (never executed: a capturing spawn) runs with a stored own value; the hub's env carries every pin's
  // variable pointed at a PLANTED dir (the inherited road) and a lower-case npm_config_userconfig (a hub started by npm). The
  // child's env and argv are then read against the row's census entry. What is still OPEN is pinned BY ROW (RED_LIST: how many
  // of its pins the child misses) — it only shrinks: a unit that seals a row takes it off, a new gap is red by name.
  {
    const CB = path.join(ROOT, 'census-bin'); fs.mkdirSync(CB, { recursive: true });
    const PLANT = path.join(ROOT, 'planted-home'); fs.mkdirSync(PLANT, { recursive: true });
    const ARGS = { curl: ['https://api.example.com/x'], wget: ['https://api.example.com/x'], http: ['https://api.example.com/x'], gh: ['issue', 'list'], git: ['ls-remote', 'https://api.example.com/r.git'], aws: ['s3', 'ls'], gcloud: ['compute', 'instances', 'list'], az: ['group', 'list'], npm: ['view', 'left-pad'], pip: ['download', 'left-pad'], docker: ['pull', 'alpine'], kubectl: ['get', 'pods', '-s', 'https://api.example.com'], psql: ['-h', 'api.example.com'], mysql: ['-h', 'api.example.com'], rclone: ['lsd', 'remote:'], ssh: ['api.example.com', 'true'], sftp: ['api.example.com'], scp: ['f.txt', 'api.example.com:/x'], rsync: ['f.txt', 'api.example.com:/x'] };
    const pinNames = [...new Set(Object.values(VR.TOOL_HOME_SEAL).flatMap((e) => Object.keys(e.env)))];
    const pinLower = new Set(pinNames.map((k) => k.toLowerCase()));
    const quiet = Object.fromEntries(Object.entries(SUITE_ENV).filter(([k]) => !pinLower.has(k.toLowerCase()) && !/^npm_config_/i.test(k)));   // the runner's own npm_config_* never reach the count
    const hubEnv = () => ({ ...quiet, HOME: SUITE_HOME, ...Object.fromEntries(pinNames.map((k) => [k, PLANT])), npm_config_userconfig: path.join(PLANT, '.npmrc'), PATH: [CB, GHREAL, '/usr/bin', '/bin'].join(':') });
    const tokenOk = (v, got) => {
      if (v === '<ssh>') return typeof got === 'string' && /^'?\/[^ ']+\/ssh'? -F \/dev\/null$/.test(got);
      const t = /^<(nowhere|fresh)>(.*)$/.exec(v);
      if (!t) return got === v;
      if (typeof got !== 'string') return false;
      return t[1] === 'nowhere' ? got === NOWHERE + t[2] : (got.startsWith(sw.runRoot + path.sep) && got.endsWith(t[2]) && !fs.existsSync(got));   // a fresh dir lives in THIS run's folder and is gone with it
    };
    // the SIXTH term (the U1 cure): the child's search path must be the door's sealed PATH — the root-owned realpaths of the
    // hub's PATH (the census bin and ghreal are uid-owned, so it is /usr/bin here); a tool starts programs BY NAME through it
    const SEALED_PATH = [...new Set(hubEnv().PATH.split(':').map((x) => DOOR.sealDirReal(x)).filter(Boolean))].join(':');
    const SEALED_ROOT_ONLY = SEALED_PATH.length > 0 && SEALED_PATH.split(':').every((x) => x !== CB && x !== GHREAL && DOOR.rootOwnedNoWrite(x));   // the yardstick itself is proven root-only (never the census bin, never ghreal)
    const missingOf = (name, E, A) => {
      const e = VR.TOOL_HOME_SEAL[name], out = [];
      for (const k of VR.SEAL_HOME_ENV) if (E[k] !== NOWHERE) out.push(k);
      if (E[VR.SEAL_PATH_ENV] !== SEALED_PATH) out.push(VR.SEAL_PATH_ENV);
      for (const [k, v] of Object.entries(e.env)) { if (!tokenOk(v, E[k])) out.push(k); for (const x of Object.keys(E)) if (x !== k && x.toLowerCase() === k.toLowerCase()) out.push(x + ' (a case variant)'); }
      if (e.argv.length && JSON.stringify(A.slice(0, e.argv.length)) !== JSON.stringify(e.argv)) out.push('argv ' + e.argv.join(' '));
      return out;
    };
    const measured = {}, why = {};
    for (const row of VR.KNOWN_TOOLS) {
      if (!VR.TOOL_HOME_SEAL[row.name] || !ARGS[row.name]) { measured[row.name] = -1; why[row.name] = !VR.TOOL_HOME_SEAL[row.name] ? 'no census entry (src/vault-run.js TOOL_HOME_SEAL)' : 'no census command (this leg\'s ARGS)'; continue; }   // a NEW row fails BY NAME, never a TypeError
      let cap = null;
      const spawn = (cmd, args, opts) => { cap = { cmd, args, env: opts.env }; const c = new EventEmitter(); c.pid = 99013; c.stdout = new EventEmitter(); c.stdout.destroy = () => {}; c.stderr = new EventEmitter(); c.stderr.destroy = () => {}; c.stdin = null; setImmediate(() => { c.emit('exit', 0, null); c.emit('close', 0, null); }); return c; };
      const isGh = row.name === 'gh';
      const tool = isGh ? GHREAL_GH : path.join(CB, row.name);
      if (!isGh) fs.writeFileSync(tool, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      const d = isGh ? mkGh({ spawnImpl: spawn, agentEnv: hubEnv }) : sw.mk(DOOR, { isRootOwned: (p) => p === CB || p.startsWith(CB + path.sep) || REAL(p), spawnImpl: spawn, agentEnv: hubEnv });   // each fake models a ROOT-OWNED install (a test cannot chown): the census measures the sealed case, never a programWritable one
      const { r } = await runAnswered(sw, ['--env', (isGh ? 'GH_TOKEN' : 'SECRET_T') + '=vault://agent:conv-1/gh-token', '--', tool, ...ARGS[row.name]], { door: d });
      if (!cap) { measured[row.name] = -1; why[row.name] = (r && (r.code || r.words)) || 'not spawned'; continue; }
      const miss = missingOf(row.name, cap.env || {}, cap.args || []);
      measured[row.name] = miss.length; if (miss.length) why[row.name] = miss;
      console.log(`    census ${row.name}: ${miss.length ? 'OPEN — ' + miss.join(', ') : 'sealed'}`);
    }
    ok(Object.values(measured).every((n) => n >= 0), 'B-f1d3: every KNOWN_TOOLS row has its census entry and command and reached the spawn through the door (none refused before it — the census reads a real child env); a NEW row is named here', Object.fromEntries(Object.entries(why).filter(([k]) => measured[k] < 0)));
    // THE RED LIST — the rows still OPEN and how many of their pins the child misses (HOME + 4 XDG + PATH + the row's env pins + a
    // case variant left beside one + the argv word). gh's 1 is its git child's ssh (GIT_SSH_COMMAND): its runSeal is the only seal today.
    const RED_LIST = { curl: 8, wget: 8, http: 8, gh: 1, git: 9, aws: 9, gcloud: 8, az: 9, npm: 10, pip: 8, docker: 7, kubectl: 8, psql: 9, mysql: 9, rclone: 7, ssh: 7, sftp: 7, scp: 7, rsync: 7 };
    const open = Object.fromEntries(Object.entries(measured).filter(([, n]) => n !== 0).sort(([a], [b]) => (a < b ? -1 : 1)));
    const want = Object.fromEntries(Object.entries(RED_LIST).sort(([a], [b]) => (a < b ? -1 : 1)));
    ok(JSON.stringify(open) === JSON.stringify(want), `B-f1d3 THE HOME CENSUS (a ratchet): the rows still OPEN and the pins each child misses equal the pinned red list (${Object.keys(want).length} rows open of ${VR.KNOWN_TOOLS.length})`, { measured: open, why });
    const pathOpen = VR.KNOWN_TOOLS.filter((r) => (why[r.name] || []).includes('PATH')).map((r) => r.name);
    ok(SEALED_ROOT_ONLY && JSON.stringify(pathOpen) === JSON.stringify(VR.KNOWN_TOOLS.map((r) => r.name).filter((n) => n !== 'gh')),
      'B-f1d3 (the U1 cure) PATH IS A TERM FOR EVERY ROW: the 18 rows without a seal hand the child the hub\'s PATH (its uid-owned census bin first) — open; gh\'s seal hands the sealed PATH — present (the red control: a census of five homes would count neither)', { SEALED_PATH, pathOpen });
    ok(JSON.stringify(why.gh) === '["GIT_SSH_COMMAND"]' && why.git && why.git.includes('GIT_CONFIG_GLOBAL') && why.npm && why.npm.includes('npm_config_userconfig (a case variant)'),
      'B-f1d3: the census READS the child — gh\'s sealed pins (HOME, XDG_*, PATH, GH_CONFIG_DIR, its git child\'s config) measure as present and only its ssh child is open; git\'s same pin is open; the hub\'s lower-case npm variable is seen', { gh: why.gh, git: why.git, npm: why.npm });
  }
}
try { fs.chmodSync(BIN, 0o755); } catch { }   // the read-only bin given back (the scratch dir is removed)
try { fs.chmodSync(GHBIN, 0o755); } catch { }   // B-f1d3: GHBIN too — left 0555 its gh could not be unlinked and the scratch dir outlived the suite (the test machine's LEFTOVERS)
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass})`);
process.exit(fail ? 1 : 0);
