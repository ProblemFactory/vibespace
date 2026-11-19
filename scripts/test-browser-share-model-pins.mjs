#!/usr/bin/env node
// THE BROWSER SHARE MODEL — SOURCE PINS (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED VERBATIM from the heavy
// scripts/test-browser-share-model.mjs (its real keeper + routes, the late key, the lock verdict and every patched-copy CONTROL stay there):
// the WIRING PINs of the fork pin, the late key's ONE mint / ONE writer and the list (src/ws-create.js, src/routes/browser.js,
// src/routes/browser-trace.js, src/server/mounts-plugins-wiring.js, src/server/session-stdout.js, src/server/browser-keeper.js,
// src/browser-profiles.js, server.js), U4's schema pin (src/lib/settings-schema.js) and the src/ censuses (no pin authorizes, no native
// <select> in the panel, the note-line rule over src/lib) with their text-only controls (the 2.369.194 row read through git show), ④g T1 (b)
// the ladder's order in the keeper's source, ④g THE CENSUS OF SAID THINGS, and ④k r9 (⑤) the lineage ledger's one product reader (git grep).
// Each file is read BY NAME (a census walks src/ and src/lib), so ci.mjs's affected rule selects this suite on a change of any of them.
// Run: node scripts/test-browser-share-model-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = new URL('..', import.meta.url).pathname;
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };

console.log('②a the fork\'s pin (wiring pin)');
{
    const wsc = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8');
    ok(/data\.fork && forkParentKey && forkParentKey !== bk\.key(?: && !pin\.held)?\) \{[\s\S]{0,900}copyPin\(forkParentKey, bk\.key\)/.test(wsc), 'WIRING PIN: ws-create copies the parent\'s pin onto a fork\'s new key on the fork branch');
}

console.log('② U4 the schema\'s browser.maxRunning (source pin)');
{
    const ss = fs.readFileSync(path.join(REPO, 'src/lib/settings-schema.js'), 'utf8');
    ok(/'browser\.maxRunning': \{\s*type: 'number', default: 6, min: 1, max: 32,/.test(ss) && /category: t\('Agent browser'\), liveApply: true,\s*\},\s*'browser\.defaultPerConversationCap'/.test(ss) && /refused by name/.test(ss), 'U4: the schema declares browser.maxRunning (number, default 6, 1–32, Agent browser) and its words say what happens at the ceiling');
}

console.log('③b the binding\'s choke point (wiring pin)');
{
  ok(/const sid = b\.bindableIdOf\(meta\); if \(sid\) b\.record\(sid, meta\.browserKey\); else b\.noteUnbound\(meta, sockName\);/.test(fs.readFileSync(path.join(REPO, 'src/server/session-stdout.js'), 'utf8')),
    '③b WIRING PIN: the choke point this leg mirrors is session-stdout.writeSessionMeta\'s own binding line, unchanged');
}

console.log('③e ONE mint, ONE writer (wiring pins)');
{
  // (e) WIRING: ONE mint, ONE writer of the key's session fields (spawn + first use); every route asks the engine;
  //     the server hands it the record reader + THE integration switch; the payload publishes the keyless fact
  const wsc = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8');
  const rts = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
  const wir = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  const svr = fs.readFileSync(path.join(REPO, 'server.js'), 'utf8');
  ok(/mint: browserKeyMod\.mintKey,/.test(wsc) && /browserKeyMod\.applyKey\(session, \{ key: bk\.key, env: be, pin \}\);/.test(wsc) && !/mintBrowserKey\(/.test(wsc) && !/session\._browserKey = /.test(wsc),
    '③e WIRING PIN: ws-create\'s spawn mints through THE mint and writes the key\'s fields through THE writer (browser-key.js) — the late key calls the same two');
  ok(/r = typeof ctx\?\.ensureBrowserKey === 'function' \? ctx\.ensureBrowserKey\(f\.session, \{ sessionId: f\.sessionId \}\)/.test(rts) && !/— it cannot hold a profile'/.test(rts) && (rts.match(/needKey\(res, /g) || []).length >= 12,
    '③e WIRING PIN: needKey (every cookie route + agentFacts) asks ensureBrowserKey for a keyless session; the old dead-end sentence is gone');
  ok(/ensureBrowserKey: \(session, o\) => browserKeys\.ensureBrowserKey\(session, o\),/.test(wir) && /browserKeys = require\('\.\/browser-key'\)\.create\(\{/.test(wir) && /persistMeta: \(session, patch\) => \{ if \(persistSessionMeta && session\) persistSessionMeta\(session, patch\); \},/.test(wir)
    && /readSessionMetaOf: \(session\) => \(session\?\.sockName \? readSessionMeta\(session\.sockName\) : null\), integrationEnabled: \(\) => integrationEnabled\(\),/.test(svr),
    '③e WIRING PIN: the wiring builds the engine over the routes\' browser-env memo + the keeper, persists through persistSessionMeta (writeSessionMeta — THE choke point), and server.js hands it the record reader + THE integration switch');
}

console.log('— the list\'s wiring pins and the src/ censuses (pins, <select>, note lines)');
{
  const bsrc = fs.readFileSync(path.join(REPO, 'src/browser-profiles.js'), 'utf8');
  const ksrc = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  // the wiring pins
  ok(/const added = by !== 'agent' && origin === 'chosen' \? addConversation\(p, browserKey, facts, \{ remote \}\) : null;/.test(ksrc) && /if \(by === 'user'\) \{ added = addConversation\(p, browserKey, facts\); if \(added\) commit\(\); \}/.test(ksrc), 'WIRING: setPin (the user\'s explicit pick) and the UI\'s attach call the ONE add (addConversation)');
  const rsrc2 = fs.readFileSync(path.join(REPO, 'src/routes/browser.js'), 'utf8');
  ok(/return B\.agentDigestView\(k\.list\(\), agentFactsOf\(f\), \(id\) => k\.profile\(id\)\);/.test(rsrc2) && /agentProfileView\(profileOf\(row\.id\) \|\| row, facts/.test(bsrc) && /res\.json\(\{ \.\.\.agentDigest\(k, f\), me: k\.statusFor\(f\.browserKey\) \}\)/.test(rsrc2), 'WIRING: the agent\'s profiles route answers the ONE PURE agent view (every row through agentProfileView, other conversations\' rows reduced)');
  // identity verify r2 (2026-09-28): the remote fence's wiring — the keeper's dep, ws-create's flag, the agent answers' view
  const wsrc0 = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  const wscsrc = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8');
  ok(/remoteKeys: \(\) => new Set\(\[\.\.\.activeSessions\.values\(\)\]\.filter\(\(s\) => s && s\._browserKey && \(s\.hostId \|\| s\.host \|\| s\._browserVariant === 'H'\)\)/.test(wsrc0) && /setPin\(bk\.key, pin\.profileId, \{ origin: pin\.origin, remote: !!data\.hostId \}\)/.test(wscsrc), 'WIRING (identity verify r2): the wiring hands the keeper the remote sessions\' keys; ws-create\'s explicit pick names a remote spawn');
  ok((rsrc2.match(/attachAnswer\(r, \{ cdp: req\.body\?\.wrapper === true, agent: agentFactsOf\(f\) \}\)/g) || []).length === 3 && /async function resolveForJob\(req, res, k, f\) \{[\s\S]{0,1400}attachAnswer\(r, \{ cdp: req\.body\?\.wrapper === true, agent: agentFactsOf\(f\) \}\)/.test(rsrc2) && /if \(f\.remote\) \{ const rr = B\.remoteSessionRefusal/.test(rsrc2) && /const remote = !!\(s\.hostId \|\| s\.host \|\| s\._browserVariant === require\('\.\.\/browser-profiles\.js'\)\.VARIANTS\.H\);/.test(rsrc2), 'WIRING (identity verify r2): the agent\'s `use` and `resolve` answers ride attachAnswer with the asker\'s facts; pinAnswer refuses a remote session; sessionFacts names `remote`');
  const tsrc = fs.readFileSync(path.join(REPO, 'src/routes/browser-trace.js'), 'utf8');
  ok(/await ctx\.keyForPickedSession\(r\.session\)/.test(tsrc) && /k\.updateProfile\(req\.params\.id, patch, \{ knownKeys \}\)/.test(tsrc), 'WIRING: the PATCH resolves picked sessions through the ONE resolver and hands the keeper the keys it resolved');
  const wsrc = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(/if \(!hit\) return \{ ids: \[\], unreadable: false, live: false \};/.test(wsrc) && /live: r\.live !== false/.test(ksrc) && /live: !!u\.sessionId/.test(tsrc), 'WIRING (2026-09-28): the wiring\'s taskIdsForKey says `live: false` for a key no session carries, the keeper reads it, GET …/use carries `live` per holder');
  // THE CENSUS: no `pinned:` / `by:` admission input and no dated-pin reader is left in src/ (a pin never authorizes)
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.js') ? [path.join(d, e.name)] : []));
  const offenders = [];
  for (const f of walk(path.join(REPO, 'src'))) {
    const code = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const m of code.matchAll(/\b(?:mayAttach|decideAttach)\(([^)]{0,300})\)/g)) if (/\bpinned\s*:|\bby\s*:/.test(m[1])) offenders.push(path.relative(REPO, f) + ': ' + m[0].slice(0, 90));
    if (/\buserPinned\s*\(|\buserPinAuthorizes\s*\(|\blatePinAt\b/.test(code)) offenders.push(path.relative(REPO, f) + ': a dated-pin reader');
  }
  ok(!offenders.length, 'CENSUS: no `pinned:` / `by:` argument to mayAttach / decideAttach and no dated-pin reader (userPinned / userPinAuthorizes / latePinAt) anywhere in src/', offenders);
  // THE <select> CENSUS of the panel (the principal picker's rule, beside test-principal-picker's): no native select in the
  // Agent browser panel — the 2.369.194 row's `bprof-scope-select` is the pre-fix control
  const judgeSel = (src) => [...src.matchAll(/createElement\('select'\)[^\n]*|el\('select'[^\n]*/g)].map((m) => m[0].slice(0, 80));
  ok(!judgeSel(fs.readFileSync(path.join(REPO, 'src/lib/browser-trace-view.js'), 'utf8')).length && !judgeSel(fs.readFileSync(path.join(REPO, 'src/lib/browser-who-dialog.js'), 'utf8')).length, 'the panel and the dialog build NO native <select> — "who" is the principal picker');
  ok(judgeSel("const sel = document.createElement('select'); sel.className = 'bprof-scope-select';\n").length === 1, 'CONTROL: the 2.369.194 row\'s select (planted) IS flagged by the same judge');
  let pre = null;
  try { pre = (await new Promise((res) => execFile('git', ['show', '371642a4:src/lib/browser-trace-view.js'], { cwd: REPO, encoding: 'utf8', maxBuffer: 1 << 24 }, (err, out) => res(err ? null : out)))); } catch { pre = null; }
  if (pre) ok(judgeSel(pre).length >= 1 && /bprof-scope-select/.test(pre), 'CONTROL: the 2.369.194 browser-trace-view.js itself (git 371642a4) is flagged — the census has teeth on the real shape');
  else console.log('  SKIP (371642a4 is not reachable in this checkout — the planted control stands alone)');
  // THE NOTE-LINE CENSUS (the naive-user verifier, 2026-09-28): the who dialog wrote its "will lose it" and empty-list
  // sentences with `lose.querySelector('span')` — a WARNING note's first span is the alert glyph (line-height:0), so the
  // sentence became a 0 px line overlapping the next and running off the phone. Every noteLine() is re-worded through
  // noteText() (its own text span) — never through a bare span selector — in every file of src/lib.
  const judgeNotes = (src) => {
    const out = [];
    for (const m of src.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*noteLine\(/g)) {
      const v = m[1];
      if (new RegExp('\\b' + v + '\\.(?:querySelector|firstElementChild|firstChild|children\\[0\\]|childNodes\\[0\\])').test(src.replace(/\/\/.*$/gm, ''))) out.push(v); // stale-pins: kept — a word of this census's alternation (noteLine children), not a pin of a product line
    }
    return out;
  };
  const libDir = path.join(REPO, 'src/lib');
  const noteOffenders = fs.readdirSync(libDir).filter((f) => f.endsWith('.js')).flatMap((f) => judgeNotes(fs.readFileSync(path.join(libDir, f), 'utf8')).map((v) => f + ': ' + v));
  const wd = fs.readFileSync(path.join(libDir, 'browser-who-dialog.js'), 'utf8');
  ok(!noteOffenders.length && /noteText\(lose, /.test(wd) && (wd.match(/noteText\(refusal, /g) || []).length === 3, 'NOTE-LINE CENSUS: no noteLine() in src/lib is re-worded by reaching into its children — the who dialog writes both sentences through noteText()', noteOffenders);
  const preWho = wd.replace(/noteText\(lose, ([^;]*)\);/, "lose.querySelector('span').textContent = $1;");
  ok(preWho !== wd && judgeNotes(preWho).includes('lose'), 'CONTROL: the pre-fix write (`lose.querySelector(\'span\').textContent = …`) is flagged by the same judge');
  const CC = fs.readFileSync(path.join(libDir, 'channel-chrome.js'), 'utf8');
  ok(/s\.className = 'chan-note-text';/.test(CC) && /querySelector\(':scope > \.chan-note-text'\)/.test(CC), 'noteLine() names its text span and noteText() writes only there');
}

console.log('— ④g T1 (b) the keeper\'s source walks the ladder in that order (source pins)');
{
  // ── T1 (b) the keeper's source walks the ladder in that order (positions, grep-derived) ──
  const ksrcG = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
  const at = (re, from = 0) => { const i = ksrcG.slice(from).search(re); return i < 0 ? -1 : i + from; };
  const cpl = at(/async function clearProfileLock\(/), endAt = at(/const r = await endProcess\(v\.pid, facts\.holder\.starttime\);/, cpl), clrAt = at(/clearEndedOrphanLock\(p, p\.dir, v\.pid\)/, endAt);
  const startAt = at(/const lk = await clearProfileLock\(p, ns, prevRec\);/), launchAt = at(/const r = await rt\.launch\(ns, \{ dir: p\.dir/, startAt), postAt = at(/lockRefusalAfterLaunch\(p, prevRec\)/, launchAt);
  const healAt = at(/function healBrowser\(/), hEnd = at(/const e = await endProcess\(v\.pid, f\.holder\.starttime\);/, healAt), hClr = at(/clearEndedOrphanLock\(p, p\.dir, v\.pid\)/, hEnd), hFail = at(/if \(!c\.ok\) \{ setClosed\(rec, c\.refusal\); commit\(\); return null; \}/, hClr);
  ok(cpl > 0 && endAt > cpl && clrAt > endAt && startAt > 0 && launchAt > startAt && postAt > launchAt && healAt > 0 && hEnd > healAt && hClr > hEnd && hFail > hClr, '④g T1 the keeper walks the ladder in order at the start (verdict → end → clear → launch → post-launch) and at the heal (verdict → end → clear → a failed clear closes by name)', { cpl, endAt, clrAt, startAt, launchAt, postAt, healAt, hEnd, hClr, hFail });
  const ephStart = at(/const lk = await clearProfileLock\(p, ns, prev\);/), ephLaunch = at(/const r = await rt\.launch\(null, \{ idleMs: launchIdle/, ephStart), ephPost = at(/lockRefusalAfterLaunch\(p, prev\)/, ephLaunch);
  ok(ephStart > 0 && ephLaunch > ephStart && ephPost > ephLaunch, '④g T1 …and the ephemeral start walks the same order (verdict → launch → post-launch)', { ephStart, ephLaunch, ephPost });
}

console.log('— ④g THE CENSUS OF SAID THINGS (one wording per event, its sites counted)');
{
  // ── the CENSUS OF SAID THINGS: one wording per event, its sites counted (grep-derived over the four files) ──
  const srcOf = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
  const count = (f, needle) => srcOf(f).split(needle).length - 1;
  const SAID = [
    ['the takeover', 'src/server/browser-keeper.js', 'previous name ${v.host} — taken over (', 1],
    ['the takeover that could not remove', 'src/server/browser-keeper.js', 'previous name ${v.host} but could NOT be removed', 1],
    ['the ended orphan\'s lock removed', 'src/server/browser-keeper.js', '${v.why} — ${removed.length ? removed.join', 1],
    ['the ended orphan\'s lock that could not be removed (r3 F1)', 'src/server/browser-keeper.js', '${v.why} but could NOT be removed', 1],
    ['a lock that is no longer the orphan\'s (r3 F2)', 'src/server/browser-keeper.js', 'after ending its own orphaned browser pid ${endedPid}, ${v.why}', 1],
    ['the orphan ended before a launch', 'src/server/browser-keeper.js', 'ended its own orphaned browser pid ${v.pid} before launching', 1],
    ['the orphan ended before a heal', 'src/server/browser-keeper.js', 'ended its own orphaned browser pid ${v.pid} before healing', 1],
    ['the directory taken while launching (r2 F1; the named + the ephemeral start)', 'src/server/browser-keeper.js', 'the directory was taken while launching', 2],
    ['a previous name\'s lock reached the launch (r3 F3; the named start, its birth death, the ephemeral start)', 'src/server/browser-keeper.js', 'reached the launch (taken over now)', 3],
    ['the directory held at a birth death', 'src/server/browser-keeper.js', 'the directory is held by somebody else', 1],
    ['the queued wait (r2 F3)', 'src/server/browser-keeper.js', 'a tab bind waits for the one in flight', 1],
    ['detached while queued (r2 F2)', 'src/server/browser-keeper.js', 'detached while waiting to bind a tab', 1],
    ['the rebind: the only tab', 'src/server/browser-keeper.js', "bound to the browser's only tab", 1],
    ['the rebind: a new tab (plain + mediated)', 'src/server/browser-keeper.js', 'a new tab bound', 2],
    ['PURE: the ended orphan\'s lock (the clear\'s why)', 'src/browser-profiles.js', "the ended orphan's lock named this machine's previous name ${host}", 1],
    ['PURE: not the orphan ended', 'src/browser-profiles.js', 'not the orphan ended (pid ${endedPid})', 1],
    ['PURE: a lock at a pid alive here is not the ended orphan\'s (r4 census: printed through the leave line, uncounted)', 'src/browser-profiles.js', "that pid is alive here — not the ended orphan's lock", 1],
    ['PURE: a previous-name lock at an unreadable live pid (r4 census: printed through the refusal, uncounted — pre-r3)', 'src/browser-profiles.js', 'whose command line cannot be read (another user\'s process?) — not provably free', 1],
    ['r5 (S37): a directory\'s lineage forgotten — the directory is gone', 'src/server/browser-keeper.js', 'forgotten — the directory is gone', 1],
    ['r5 (S36): a directory\'s lineage KEPT through a read error (a flapping PVC)', 'src/server/browser-keeper.js', 'kept — the directory cannot be read right now', 1],
    ['r5 (S34): the bound\'s evictions said', 'src/server/browser-keeper.js', 'forgotten at the ${B.DIR_HOSTS_MAX} bound (the oldest remembered)', 1],
    ['r5 (S42b): a lineage re-keyed to the directory\'s real path', 'src/server/browser-keeper.js', 'is remembered under its real path', 1],
    ['PURE: the previous-host verdict', 'src/browser-profiles.js', "names this machine's previous name, ${lockHost}", 1],
    ['PURE refusal: another machine\'s name', 'src/browser-profiles.js', "is locked under another machine's name", 1],
    ['PURE refusal: could not remove (the takeover + the ended orphan\'s)', 'src/browser-profiles.js', 'and VibeSpace could not remove the lock', 2],
    ['PURE refusal: still locked, its own browser ended (r3 F1)', 'src/browser-profiles.js', 'is still locked under this machine', 1],
    ['PURE refusal: taken over now (r3 F3)', 'src/browser-profiles.js', 'VibeSpace took the lock over now; run the command again', 1],
    ['the agent\'s note (the restart)', 'src/browser-tabs.js', 'your tab from the previous run is gone', 1],
    ['the agent\'s note (a new tab)', 'src/browser-tabs.js', 'a new tab was opened and bound for', 1],
    ['the route puts an undelivered note back (r3 F4; `use` + `resolve`, the two routes that attach)', 'src/routes/browser.js', 'k.restoreRebound(', 2],
    ['zh: renamed from', 'src/lib/i18n-zh.js', '"renamed from {host}"', 1],
    ['ja: renamed from', 'src/lib/i18n-ja.js', '"renamed from {host}"', 1],
  ];
  const offs = SAID.map(([name, f, needle, n]) => ({ name, got: count(f, needle), n })).filter((x) => x.got !== x.n);
  ok(!offs.length, `④g THE CENSUS OF SAID THINGS: ${SAID.length} sentences, each ONE wording at its counted sites (grep-derived)`, offs);
}

console.log('— ④k verify r9 (⑤): the lineage ledger has no product reader');
{
    const ksrc8 = fs.readFileSync(path.join(REPO, 'src/server/browser-keeper.js'), 'utf8');
    // ── verify r9 (⑤): the ledger has NO product reader — a torn line can abort nothing (the keeper appends and rotates whole lines; the only parsers are suites) ──
    { let names = []; try { names = execFileSync('git', ['-C', REPO, 'grep', '-l', 'browser-lineage-journal', '--', 'src', 'data/bin', 'server.js'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean); } catch (e) { names = ['(git grep failed: ' + (e && e.message) + ')']; }
      const ledgerParse = /JSON\.parse\([^;\n]*(LINEAGE_LEDGER|lineage-journal)/.test(ksrc8);
      ok(names.length === 1 && names[0] === 'src/server/browser-keeper.js' && !ledgerParse, `④k verify r9 (⑤): the lineage ledger is named by exactly ONE product file (the keeper: append + whole-line rotation) and parsed by none — ${names.join(', ')}`); }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
