#!/usr/bin/env node
// A POOL's MEMBER IS JUDGED BY ITS OWN HARNESS, AND A REMOVAL HEALS ITS POOLS FOR EVERY HARNESS (row B-e381, 主开发 r4531 / r4613 /
// r4614) — the formed chain's legs «B-e381» and «B-e381 (2)», moved WORD FOR WORD out of scripts/test-codex-pool.mjs into a fast suite
// of their own (主开发 r5303), as the kept folder's legs went to scripts/test-kept-signin-folder.mjs: the per-session writer by the
// pool's harness, the heal of a removed member's pools (its order: the links before the wipe; a failed heal keeps the folder), the
// host evaluation through the pool's own harness. Stand-in homes under the temp folder (removed at exit), made-up sign-in files;
// each red is the release's text — or the first unit's writer — planted in a copy, anchored.
import './scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const { waitEverySave } = require('./lib/accounts-landed.cjs');   // B-574d unit 1 (a): accounts.json is the store writer's — each save waited for (the suite's thread)
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
// every patched copy is written OUTSIDE the tree (scripts/mutant-copy.mjs: this process's scratch dir, `require` re-bound to the real
// module's path); the R-tree census at the end measures the placement while the copies exist
const MUTCP = mutantCopies('pool-member-harness', REPO);
const copyOrig = new Map();
let copySeq = 0;
const copyPath = (origRel, tag) => { const p = MUTCP.pathFor(`${path.basename(origRel, '.js')}-${tag}-${++copySeq}`); copyOrig.set(p, origRel); return p; };
const writeCopy = (p, src) => MUTCP.write(copyOrig.get(p), src, null, { esm: false, name: path.basename(p, '.cjs') });

let pass = 0, fail = 0;
const ok = (n, c, e) => { if (typeof n !== 'string') throw new TypeError(`ok: the leg's name is a ${typeof n}, not a string — the arguments are swapped`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const { AccountManager } = require(path.join(REPO, 'src/accounts.js'));
waitEverySave(AccountManager);
// B-e381's scenes make their stand-in homes through e381Tmp: each folder is removed when the process exits (its stores may
// still settle until then — never a folder taken from under a store mid-run)
const e381Dirs = [];
const e381Tmp = (prefix) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); e381Dirs.push(d); return d; };
process.on('exit', () => { for (const d of e381Dirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { } } });
process.env.CODEX_HOME = path.join(e381Tmp('vs-pmh-codex-home-'), 'shared-codex');   // keep _seedCodexDir off any real ~/.codex
const am = new AccountManager({ dataDir: e381Tmp('vs-pmh-am-') });   // the store the «no creds row» refusal asks (test-codex-pool's own top-level store before the move)

// ── B-e381 (主开发 r4531 / r4614): A POOL's MEMBER IS JUDGED BY ITS OWN HARNESS ──
// The per-session link's writers read a member by ITS harness's creds row (its reader, its folder, its sign-in file: _memberSignIn).
// The per-session writer then decides by the POOL's harness: a member of another harness is refused by name, and a per-session link is
// written only where the harness's process reads one (the capability row's planC) — a Codex pool's conversations read the pool's
// default, so its per-session link is refused by name. Stand-in homes, made-up sign-in files, judged BY NAME. REDs: the release's
// writers (the Claude reader, Claude's folder), and the first unit's writer (ace444d3b: no harness gate) — each planted in a copy.
console.log('\nB-e381 a pool member is read by its own harness; a per-session link only where its harness reads one');
{
  const { anchored } = await import('./scratch.mjs');
  const SRC = read('src/accounts.js');
  const GATE = "    // B-e381 (主开发 r4614): THE POOL's HARNESS decides — a member of another harness is refused by name (the pool's default writer's own\n    // words), and a per-session link is written ONLY where its harness's process reads one: the capability row's planC (the row the\n    // engine tests before its per-session loop) — never a harness's name. A harness without it holds its member for life on the pool's\n    // default; a link written there would credit the conversation to a member its process does not bill.\n    const pool = this.get(poolId), poolBe = pool && this._acctType(pool) === 'pooled' ? this._acctBackend(pool) : null;\n    if (poolBe != null) {\n      if (this._acctBackend(target) !== poolBe) throw new Error(`not a ${poolBe} subscription: ` + memberId);\n      if (!capsOf(poolBe).planC) throw new Error(`no per-session pool link for this harness (${poolBe}): its conversations read the pool's default`);\n    }\n";
  const READ_NEW = "    const signIn = this._memberSignIn(target);   // B-e381: judged by its OWN harness (its reader and folder)\n    if (!signIn.auth().loggedIn) throw new Error('pool member not logged in: ' + target.name);\n";
  const REL = anchored(anchored(anchored(SRC,
    GATE + READ_NEW, "    if (!this.readSubCreds(memberId).loggedIn) throw new Error('pool member not logged in: ' + target.name);\n", "B-e381: the release's member read (the Claude reader)"),   // stale-pins: kept (the red copy: the release's own text, planted)
    "    require('./account-material.js').repointPoolSymlink(link, signIn.dir, signIn.bump);\n",
    "    require('./account-material.js').repointPoolSymlink(link, this.subDir(memberId), this.subCredsPath(memberId));\n", "B-e381: the release's link target (Claude's folder and file)"),   // stale-pins: kept (the red copy: the release's own text, planted)
    "          let signIn = null; if (target) { try { signIn = this._memberSignIn(this.get(target)); } catch (e) { console.warn(`[pool] a conversation's link could not move to its member: that member's sign-in cannot be read here (${(e && e.code) || (this.get(target) ? 'refused by its harness' : 'no record of that member')}) — the link is dropped`); } }   // B-e381: the member's OWN harness folder; the reason said, no account named\n          if (signIn) {\n            require('./account-material.js').repointPoolSymlink(l.path, signIn.dir, signIn.bump);\n",
    "          if (target) {\n            require('./account-material.js').repointPoolSymlink(l.path, this.subDir(target), this.subCredsPath(target));\n", "B-e381: the release's heal re-point (Claude's folder and file)");   // stale-pins: kept (the red copy: the release's own text, planted)
  const U1 = anchored(SRC, GATE, '', "B-e381: the first unit's writer (ace444d3b), no harness gate");
  const relF = copyPath('src/accounts.js', 'e381-release'); writeCopy(relF, REL);
  const u1F = copyPath('src/accounts.js', 'e381-unit1'); writeCopy(u1F, U1);
  const RelAM = require(relF).AccountManager, U1AM = require(u1F).AccountManager;
  // A STORE with a Codex pool (two signed-in members, one signed out), a Claude pool, and one Codex subscription for the Claude pool
  const scene = (AM, tag) => {
    const d = e381Tmp('vs-cxpool-e381-' + tag + '-');
    const m = new AM({ dataDir: d });
    const cx = (name, signedIn) => { const { id } = m.createCodexSubscription({ name }); if (signedIn) fs.writeFileSync(path.join(m.codexSubDir(id), 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'tok-' + name } })); return id; };
    const cl = (name) => { const a = m.createSubscription({ name }); fs.writeFileSync(path.join(m.subDir(a.id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'fake-' + name, refreshToken: 'fake-rt', expiresAt: Date.now() + 3600e3, scopes: ['user:inference'] } })); return a.id; };
    const A = cx('CxIn', true), B = cx('CxIn2', true), O = cx('CxOut', false), L = cl('ClIn');
    const P = m.createPool({ name: 'CxP', backend: 'codex', members: [A, B] }).id, Q = m.createPool({ name: 'ClQ', members: [L] }).id;
    return { d, m, A, B, O, L, P, Q };
  };
  const tryLink = (m, ...a) => { try { const link = m.ensureSessionPoolLink(...a); return { to: fs.readlinkSync(link) }; } catch (e) { return { refused: e.message }; } };
  // (1) THE HELPER: a Codex member read by Codex's own reader and folder (a correctness of the helper)
  const w = scene(AccountManager, 'tip');
  const sB = w.m._memberSignIn(w.m.get(w.B)), sO = w.m._memberSignIn(w.m.get(w.O));
  ok('B-e381: the helper reads a CODEX member by its own harness — its Codex folder, no Claude file to bump, signed in; a signed-out one read signed out', sB.dir === w.m.codexSubDir(w.B) && sB.bump === null && sB.auth().loggedIn === true && sO.auth().loggedIn === false, JSON.stringify({ dir: sB.dir, bump: sB.bump }));
  ok('B-e381 RED — the release\'s reader (the Claude reader) reads that signed-in Codex member as NOT signed in', w.m.readSubCreds(w.B).loggedIn === false);
  // (2) A PER-SESSION LINK ONLY WHERE ITS HARNESS READS ONE: a Codex pool (planC false) refuses it by name; the first unit's writer linked it
  const cxLink = tryLink(w.m, w.P, 'sess-1', w.B, { why: 'spawn' }), u1 = scene(U1AM, 'unit1'), cxLinkU1 = tryLink(u1.m, u1.P, 'sess-1', u1.B, { why: 'spawn' });
  ok('B-e381 (r4614): a Codex pool\'s per-session link is REFUSED by name — its conversations read the pool\'s default (the capability row\'s planC)', /^no per-session pool link for this harness \(codex\): its conversations read the pool's default$/.test(cxLink.refused || ''), JSON.stringify(cxLink));
  ok('B-e381 (r4614) RED — the first unit\'s writer (no harness gate, in a copy) LINKS it: a link no Codex process reads', !!cxLinkU1.to && cxLinkU1.to === u1.m.codexSubDir(u1.B), JSON.stringify(cxLinkU1));
  // (3) THE SAME HARNESS: a Codex member asked into a CLAUDE pool is refused by name (setPoolTarget's own words); the first unit's writer linked it
  const mix = tryLink(w.m, w.Q, 'sess-2', w.B, { why: 'spawn' }), mixU1 = tryLink(u1.m, u1.Q, 'sess-2', u1.B, { why: 'spawn' });
  ok('B-e381 (r4614): a member of ANOTHER harness (a Codex member, a Claude pool) is refused by name — «not a claude subscription»', mix.refused === 'not a claude subscription: ' + w.B, JSON.stringify(mix));
  ok('B-e381 (r4614) RED — the first unit\'s writer links the Codex member into the Claude pool (a folder of another program)', !!mixU1.to && mixU1.to === u1.m.codexSubDir(u1.B), JSON.stringify(mixU1));
  // (4) A HARNESS THAT KEEPS NO SIGN-IN HERE (no creds row: opencode, an ACP harness — its descriptor's creds is null) is refused by name
  let noRow = null; try { am._memberSignIn({ id: 'sub-x', name: 'NoRow', backend: 'opencode' }); } catch (e) { noRow = e.message; }
  ok('B-e381: a member of a harness with NO creds row (opencode) is refused by name («keeps no sign-in here (opencode)»), never guessed as Claude', /keeps no sign-in here \(opencode\): NoRow$/.test(noRow || ''), noRow);
  // (5) A CLAUDE POOL IS UNCHANGED, BYTE FOR BYTE: the same scene through today's module and through the release's writers in a copy —
  // the link's target, the sign-in file beside it, the refusal's words, the heal's target (each id written as its role)
  const claudeRun = (AM, tag) => {
    const d = e381Tmp('vs-clpool-e381-' + tag + '-');
    const m = new AM({ dataDir: d });
    const sub = (name, signedIn) => { const a = m.createSubscription({ name }); if (signedIn) fs.writeFileSync(path.join(m.subDir(a.id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'fake-' + name, refreshToken: 'fake-rt', expiresAt: Date.now() + 3600e3, scopes: ['user:inference'] } })); return a.id; };
    const A = sub('ClA', true), B = sub('ClB', true), O = sub('ClOut', false);
    const P = m.createPool({ name: 'ClP', members: [A, B] }).id; m.setPoolTarget(P, A);
    const role = (x) => String(x).split(d).join('<data>').split(A).join('<A>').split(B).join('<B>').split(O).join('<O>').split(P).join('<P>');
    const out = {};
    const link = m.ensureSessionPoolLink(P, 'sess-1', B, { why: 'spawn' });
    out.link = role(link); out.to = role(fs.readlinkSync(link)); out.current = m.poolCurrentFor(P, 'sess-1') === B; out.credsFile = fs.existsSync(path.join(m.subDir(B), '.credentials.json'));
    try { m.ensureSessionPoolLink(P, 'sess-2', O, { why: 'spawn' }); out.refused = null; } catch (e) { out.refused = role(e.message); }
    m.remove(B);
    try { out.healed = role(fs.readlinkSync(link)); } catch (e) { out.healed = '(' + e.code + ')'; }
    return out;
  };
  const cl = claudeRun(AccountManager, 'tip'), clRel = claudeRun(RelAM, 'release');
  ok('B-e381: a CLAUDE pool is UNCHANGED, byte for byte — the link\'s target, its sign-in file, the refusal\'s words and the heal\'s target are the release\'s own (its writers in a copy)', JSON.stringify(cl) === JSON.stringify(clRel) && cl.to === '<data>/subs/<B>' && cl.healed === '<data>/subs/<A>' && /^pool member not logged in: ClOut$/.test(cl.refused || ''), JSON.stringify({ tip: cl, release: clRel }));
}

// ── B-e381 (2) (主开发 r4613): A REMOVAL HEALS THE POOLS OF A MEMBER OF ANY HARNESS THAT KEEPS A SIGN-IN HERE ──
// remove() healed pools only for a harness with oauthUsage (Claude alone): a Codex member's removal moved no link and wiped the folder
// the pool's default and every per-session link pointed at. Now every harness with a creds row heals; the heal's default road reads and
// unlinks the POOL's own link; a heal that fails keeps the member's folder and the answer says so; the host evaluation reads a pool's
// link through its own harness. RED: the release's removal (the oauthUsage gate, Claude's path for the default, the folder wiped
// whatever happened, the Claude reader for the pool's verdict) planted in a copy of today's module.
console.log('\nB-e381 (2) a removal heals the pools of a member of any harness that keeps a sign-in here');
{
  const { anchored } = await import('./scratch.mjs');
  const SRC2 = read('src/accounts.js');
  const REL2 = [
    ["    // (B-e381's second unit, 主开发 r4613) EVERY harness that keeps a sign-in here (its creds row — never a harness's name) has pools\n    // to heal: «this harness reports usage by its sign-in» (oauthUsage, the old gate) is not «this harness has pools». THE ORDER: the\n    // links move BEFORE the member's folder is wiped; a heal that failed keeps the folder standing and the answer says so\n    let kept = null, owedRow = null;\n    if (this._acctType(a) === 'subscription' && this._keepsSignIn(this._acctBackend(a))) {\n      // B-e381 (主开发 r4680) law 1: the folder's wipe is OWED from the removal's first store write — the row rides the SAME write that takes\n      // the record off the file, so a crash anywhere after leaves no folder nobody knows of; it is dropped once the folder is gone\n      // (r5260) once per id (a removal of an id a config import brought back replaces its old row), and the provider's CODE it served\n      // (no name: the retry's heal keeps q-055 M2 — never a conversation onto another provider — after a restart forgot it)\n      this._dropKept(id);\n      owedRow = { id, harness: this._acctBackend(a), since: Date.now(), pools: 0, ...(this._providerKeyOf(goneProvider) ? { provider: this._providerKeyOf(goneProvider) } : {}) };\n      this._keptRows().push(owedRow);\n      // poolMembers below must not offer the removed account; 主开发 r4168 (MUST 1): a row that held a sign-in is OFF THE FILE before its\n      // pools are healed and its folder wiped, as at the release (a kill after the wipe never brings it back with its sign-in and its pools);\n      // the act still finishes (it has no undo) and a landing that fails is said at its end (r3977 (2))\n      unlanded0 = hadSignIn ? this._saveFinishing('the removal of the account') : (this._save(), null);\n      const failed = this._healPoolsAfterRemoval(id, { ...opts, removedProvider: goneProvider });\n      if (failed.length) { kept = { pools: failed.length, codes: [...new Set(failed.map((f) => f.code))] }; owedRow.pools = failed.length; }\n",
     "    if (capsOf(this._acctBackend(a)).oauthUsage && this._acctType(a) === 'subscription') {\n      // poolMembers below must not offer the removed account; 主开发 r4168 (MUST 1): a row that held a sign-in is OFF THE FILE before its\n      // pools are healed and its folder wiped, as at the release (a kill after the wipe never brings it back with its sign-in and its pools);\n      // the act still finishes (it has no undo) and a landing that fails is said at its end (r3977 (2))\n      unlanded0 = hadSignIn ? this._saveFinishing('the removal of the account') : (this._save(), null);\n      this._healPoolsAfterRemoval(id, { ...opts, removedProvider: goneProvider });\n", "B-e381 (2): the release's gate (oauthUsage) and its first save (r4168)"],   // stale-pins: kept (the red copy: the release's own text, planted)
    ["      // (r5260) ONE RULE FOR BOTH WIPES: the removal's own wipe also asks the links' fresh read — a link that still names the folder,\n      // or one that cannot be read, keeps it (owed, said), as the retry's does\n      if (owedRow && !kept) { const reading = this._linksReading(id); if (reading) { kept = { pools: reading, codes: [] }; owedRow.pools = reading; } }\n      if (kept) console.warn(`[pool] a removed member's sign-in folder is KEPT: ${kept.pools} pool(s) could not be moved off it (${kept.codes.join(', ') || 'a link still names it or cannot be read'}) — its links still read it`);   // B-e381: names no account\n      else { try { fs.rmSync(this._acctDir(this._acctBackend(a), id), { recursive: true, force: true }); } catch { } }\n      if (owedRow && !kept && this._folderState(this._acctDir(this._acctBackend(a), id)).gone) this._dropKept(id);   // B-e381 (r4680): wiped — nothing owed («gone» only on no such file)\n    }\n    // B-e381 (r4680 / r5260): A PERSON's REMOVAL retries each other owed wipe — ONLY when its route asks (`retryKept`, set by DELETE\n    // /api/accounts/:id alone): the sign-in sweep's discard of a never-finished row (at every start and every sign-in press) and the\n    // relogin's rollback call remove() too, and they never reach it — never a timer, never a start\n    if (opts.retryKept === true) for (const r of [...(this._state.keptSignIns || [])]) if (r.id !== id) {   // (never makes the field: a list with no owed wipe stays as it was)\n      try { const o = this._retryKeptRow(r, opts); console.warn(`[pool] a kept sign-in folder (${r.harness}), retried at a removal: ${o.cleared ? 'cleared' : o.gone ? 'already gone — its row dropped' : o.live ? 'an account holds it again — nothing deleted, its row dropped' : o.kept.pools ? 'kept again: a pool still reads it' : 'kept again: it could not be deleted'}`); }   // names no account\n      catch (e) { console.warn(`[pool] a kept sign-in folder's wipe was not retried: ${(e && e.code) || 'error'}`); }\n    }\n",
     "      try { fs.rmSync(this._acctDir(this._acctBackend(a), id), { recursive: true, force: true }); } catch { }\n    }\n", "B-e381 (2): the release's wipe, whatever the heal did (no owed row, no retry of other rows)"],   // stale-pins: kept (the red copy: the release's own text, planted)
    ["    // B-e381 (formed with B-574d's r3977): a landing that fails is said at the end as before, and a kept folder rides it (keptFolder)\n    const owed = unlanded || unlanded0;\n    if (owed) { if (kept) owed.keptFolder = kept; throw owed; }\n    return kept ? { keptFolder: kept } : {};   // B-e381: the removal's answer — the folder kept when a pool could not be moved off it\n", "    if (unlanded || unlanded0) throw (unlanded || unlanded0);\n", "B-e381 (2): the release's said landing, silent on a kept folder"],   // stale-pins: kept (the red copy: the release's own text, planted)
    ["        if (readTarget(this._poolLinkDir(pool)) === removedId) {   // B-e381: the POOL's own link (its harness's folder), never Claude's path\n", "        if (readTarget(this.subDir(pool.id)) === removedId) {\n", "B-e381 (2): the release's default road (Claude's path)"],   // stale-pins: kept (the red copy: the release's own text, planted)
    ["            try { fs.unlinkSync(this._poolLinkDir(pool)); } catch { } // a dangling link reads as a phantom login path; absent = honestly signed-out (B-e381: the pool's own link)\n",
     "            try { fs.unlinkSync(this.subDir(pool.id)); } catch { } // a dangling link reads as a phantom login path; absent = honestly signed-out\n", "B-e381 (2): the release's unlink (Claude's path)"],   // stale-pins: kept (the red copy: the release's own text, planted)
    ["      const ok = !!this.poolCurrent(a.id) && !!this._readAuthFor(backend, a.id).loggedIn;   // B-e381: the pool's link read through its OWN harness\n",
     "      const ok = !!this.poolCurrent(a.id) && !!this.readSubCreds(a.id).loggedIn;\n", "B-e381 (2): the release's pool verdict (the Claude reader)"],   // stale-pins: kept (the red copy: the release's own text, planted)
  ].reduce((t, [from, to, why]) => anchored(t, from, to, why), SRC2);   // stale-pins: kept (the red copy: the release's own text, planted)
  const rel2F = copyPath('src/accounts.js', 'e381-release-removal'); writeCopy(rel2F, REL2);
  const Rel2AM = require(rel2F).AccountManager;
  const exists = (p) => { try { fs.lstatSync(p); return true; } catch { return false; } };
  const live = (p) => { try { fs.statSync(p); return true; } catch { return false; } };   // a link that reads something
  const cxPool = (AM, tag, { members = 2 } = {}) => {
    const d = e381Tmp('vs-cxrm-e381-' + tag + '-');
    const m = new AM({ dataDir: d });
    const sub = (name) => { const { id } = m.createCodexSubscription({ name }); fs.writeFileSync(path.join(m.codexSubDir(id), 'auth.json'), JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'tok-' + name } })); return id; };
    const ids = Array.from({ length: members }, (_, k) => sub('CxR' + k));
    const P = m.createPool({ name: 'CxRP', backend: 'codex', members: ids }).id;
    m.setPoolTarget(P, ids[0]);
    return { d, m, ids, P, linkDir: path.join(d, 'codex-subs', P) };
  };
  // (a) a Codex member removed: the pool's default moves to the member that stays — BEFORE its folder goes (a Codex pool holds no
  // per-session link: its conversations read the default — planC; a Claude pool's per-session links are healed in the scene below)
  const rmRun = async (AM, tag) => {
    const w = cxPool(AM, tag), [A, B] = w.ids;
    await new Promise((r) => setImmediate(r));   // the run's one listing (src/run-reads.js) ends
    const aDir = w.m.codexSubDir(A), bDir = w.m.codexSubDir(B);
    const ans = w.m.remove(A);
    return { def: exists(w.linkDir) ? fs.readlinkSync(w.linkDir) : null, defLive: live(w.linkDir), aWiped: !exists(aDir), bDir, ans: JSON.stringify(ans ?? null) };
  };
  const rm1 = await rmRun(AccountManager, 'tip'), rm1Rel = await rmRun(Rel2AM, 'release');
  ok('B-e381 (2): a CODEX member removed — the pool\'s default moves to the member that stays (its Codex folder) and reads a live sign-in, and only then is the removed member\'s folder wiped', rm1.def === rm1.bDir && rm1.defLive && rm1.aWiped && rm1.ans === '{}', JSON.stringify(rm1));
  ok('B-e381 (2) RED — the release\'s removal heals no Codex pool: its default still names the wiped folder (dead)', rm1Rel.def !== rm1Rel.bDir && !rm1Rel.defLive && rm1Rel.aWiped, JSON.stringify(rm1Rel));
  // the last member removed: the pool's OWN link is unlinked (honestly signed out), never left dangling — as a Claude pool's
  const lastRun = async (AM, tag) => { const w = cxPool(AM, tag, { members: 1 }); await new Promise((r) => setImmediate(r)); w.m.remove(w.ids[0]); return { linkLeft: exists(w.linkDir), linkLive: live(w.linkDir) }; };
  const ls = await lastRun(AccountManager, 'last-tip'), lsRel = await lastRun(Rel2AM, 'last-release');
  ok('B-e381 (2): a Codex pool\'s LAST member removed — the pool\'s own link is unlinked (honestly signed out), never left naming a wiped folder', ls.linkLeft === false, JSON.stringify(ls));
  ok('B-e381 (2) RED — the release leaves that pool\'s link dangling (it names the wiped folder)', lsRel.linkLeft === true && lsRel.linkLive === false, JSON.stringify(lsRel));
  // (ORDER) a heal that FAILS keeps the member's folder standing and the answer says so: the re-point refused (placed: EACCES) —
  // a CLAUDE pool, through today's module and through the release's removal
  const failRun = (AM, tag) => {
    const d = e381Tmp('vs-clrm-e381-' + tag + '-');
    const m = new AM({ dataDir: d });
    const sub = (name) => { const a = m.createSubscription({ name }); fs.writeFileSync(path.join(m.subDir(a.id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'fake-' + name, refreshToken: 'fake-rt', expiresAt: Date.now() + 3600e3, scopes: ['user:inference'] } })); return a.id; };
    const A = sub('ClF0'), B = sub('ClF1');
    const P = m.createPool({ name: 'ClFP', members: [A, B] }).id; m.setPoolTarget(P, A);
    const MAT = require(path.join(REPO, 'src/account-material.js')), realRepoint = MAT.repointPoolSymlink;
    MAT.repointPoolSymlink = () => { throw Object.assign(new Error('placed: the link could not be moved'), { code: 'EACCES' }); };
    let ans = null; try { ans = m.remove(A); } finally { MAT.repointPoolSymlink = realRepoint; }
    return { ans: JSON.stringify(ans ?? null), aKept: exists(m.subDir(A)), defLive: live(path.join(d, 'subs', P)) };
  };
  const fl = failRun(AccountManager, 'fail-tip'), flRel = failRun(Rel2AM, 'fail-release');
  ok('B-e381 (2) THE ORDER: a heal that FAILS (the re-point refused, placed) keeps the removed member\'s folder standing — the pool still reads a live sign-in — and the answer says so ({keptFolder: {pools, codes}})', fl.aKept && fl.defLive && fl.ans === JSON.stringify({ keptFolder: { pools: 1, codes: ['EACCES'] } }), JSON.stringify(fl));
  ok('B-e381 (2) RED — the release wipes the folder whatever the heal did, and answers nothing: the pool\'s link is left dead in silence', !flRel.aKept && !flRel.defLive && flRel.ans === 'null', JSON.stringify(flRel));
  // a CLAUDE removal is UNCHANGED, byte for byte: the default, a conversation's link and the wipe, through today's module and the release's removal
  const clRm = async (AM, tag) => {
    const d = e381Tmp('vs-clrm2-e381-' + tag + '-');
    const m = new AM({ dataDir: d });
    const sub = (name) => { const a = m.createSubscription({ name }); fs.writeFileSync(path.join(m.subDir(a.id), '.credentials.json'), JSON.stringify({ claudeAiOauth: { accessToken: 'fake-' + name, refreshToken: 'fake-rt', expiresAt: Date.now() + 3600e3, scopes: ['user:inference'] } })); return a.id; };
    const A = sub('ClR0'), B = sub('ClR1');
    const P = m.createPool({ name: 'ClRP', members: [A, B] }).id; m.setPoolTarget(P, A);
    const link = m.ensureSessionPoolLink(P, 'sess-c', A, { why: 'spawn' });
    await new Promise((r) => setImmediate(r));
    const role = (x) => String(x).split(d).join('<data>').split(A).join('<A>').split(B).join('<B>').split(P).join('<P>');
    m.remove(A);
    return { def: role(fs.readlinkSync(path.join(d, 'subs', P))), sess: role(fs.readlinkSync(link)), aWiped: !exists(m.subDir(A)) };
  };
  const cr = await clRm(AccountManager, 'tip'), crRel = await clRm(Rel2AM, 'release');
  ok('B-e381 (2): a CLAUDE removal is UNCHANGED, byte for byte — the default and the conversation\'s link move to <B>, the folder wiped, as the release\'s', JSON.stringify(cr) === JSON.stringify(crRel) && cr.def === '<data>/subs/<B>' && cr.sess === '<data>/subs/<B>' && cr.aWiped, JSON.stringify({ tip: cr, release: crRel }));
  // (c) THE PAYLOAD: the accounts answer's local verdict for a Codex pool, its link read through its own harness
  const AT = require(path.join(REPO, 'src/routes/account-tails.js'));
  const vOf = (AM, tag) => { const w = cxPool(AM, tag); const out = AT.accountsAnswer({ accounts: w.m }); return out.verdicts && out.verdicts[w.P]; };
  const v = vOf(AccountManager, 'v-tip'), vRel = vOf(Rel2AM, 'v-release');
  ok('B-e381 (2): the accounts answer\'s local verdict for a Codex pool reads its link through its own harness — usable, on this machine', !!v && v.usable === true && v.how === 'local-env' && v.reason === null, JSON.stringify(v));
  ok('B-e381 (2) RED — the release\'s verdict (the Claude reader) calls the signed-in Codex pool «pool-no-target»', !!vRel && vRel.usable === false && vRel.reason === 'pool-no-target', JSON.stringify(vRel));
}

// ── R-tree THE PATCHED COPIES NEVER TOUCH THE TREE ── measured here, while every copy this run made still exists
console.log('\nR-tree the patched copies never touch the tree');
for (const r of copiesCensus(MUTCP.files, MUTCP.dir, REPO, { minCopies: 3 })) ok('R-tree ' + r.name, r.pass, r.detail);

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
