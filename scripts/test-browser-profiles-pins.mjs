#!/usr/bin/env node
// THE PER-SESSION BROWSER PROFILES — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED
// VERBATIM from the heavy scripts/test-browser-profiles.mjs, whose resolver / ladder / sweep / installed-binary legs and every
// patched-copy CONTROL stay there: ② the setting's enum row, ⑦ the ws-create wiring + the tools intro + boot-restore + schema,
// ⑬ the cwd wiring + the docs, ⑭ the named browser slot + the five remote sites, ⑳ (a) the floor notice's wiring, (b) the meta
// choke point, the fork-origin pin + the meta-writer census, (c) the two delivery sites, ㉓ the form's admission wiring. Each
// reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-browser-profiles-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
let pass = 0, fail = 0, skipped = 0;
const ok = (c, n) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n); } return !!c; };

const REPO = new URL('..', import.meta.url).pathname;
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');

const readCreate = () => ['src/ws-create.js', 'src/spawn/local.js', 'src/spawn/ssh.js', 'src/spawn/dial.js'].map(read).join('\n');

console.log('\n② the RESOLVED user-data-dir (§9: assert the directory, not the strings)');
{
  const sch = read('src/lib/settings-schema.js');
  ok(/'browser\.headed':[\s\S]{0,500}type: 'enum'/.test(sch), 'and the SETTING is an enum, so the UI can render "inherit" as itself');
}

console.log('\n⑤ the version floor (D1)');
{
  const pkg = JSON.parse(read('package.json'));

  ok(!(pkg.dependencies?.['agent-browser'] || pkg.optionalDependencies?.['agent-browser'] || pkg.devDependencies?.['agent-browser']),
    'and it is NOT an npm dependency — a local copy would shadow the global binary agents actually run, for `npm run` only');
}

console.log('\n⑦ wiring (a pure function nobody calls is a feature nobody has)');
{
  const src = readCreate();
  ok(/\.envFor\(\{\s*\n?\s*browserKey/.test(src), 'ws-create calls the resolver');
  // LAZY BY CONSTRUCTION: registering the ws handler must cost nothing. An
  // EAGER construction here took the whole release gate down with a TypeError,
  // because test-contributions registers the handler with a minimal ctx that
  // carries no `path` and no `BUFFERS_DIR` — and an instance where nobody ever
  // creates a session should never touch the filesystem for this at all.
  ok(/const browserEnvOf = \(\) => \{/.test(src) && !/^\s*const browserEnv = require\(/m.test(src),
    'the resolver is built LAZILY on first use, never at handler registration');
  ok(/console\.warn\('\[browser\] per-session browser environment unavailable/.test(src),
    '…and a construction failure degrades with the message printed VERBATIM (a catch that swallows its own bug is how this class survives)');
  ok(/spawnEnvPairs\.push\(\.\.\.be\.pairs\)/.test(src), 'and pushes the pairs into spawnEnvPairs');
  // ORDERING IS THE WHOLE POINT: the remote branches consume spawnEnvPairs and
  // then EMPTY it, so a push below them reaches only local sessions. Round-1 of
  // several past whitelist-drift bugs in this file is exactly this shape.
  const iPush = src.indexOf('spawnEnvPairs.push(...be.pairs)');
  const iFirstRemote = src.indexOf('buildRemoteExec({');
  const iLocal = src.indexOf('const r6Pairs = ['); // lane antigravity-spawn-argv: the local line's names (its env)
  ok(iPush > 0 && iFirstRemote > 0 && iLocal > 0, 'setup: all three anchors exist');
  ok(iPush < iFirstRemote, 'the push happens ABOVE the first remote builder (which consumes spawnEnvPairs and then empties it)');
  ok(iPush < iLocal, 'and above the local r6Pairs');
  // …and the local composition really SPREADS the array it was pushed into.
  const r6 = src.slice(iLocal, src.indexOf('];', iLocal));
  ok(/\.\.\.spawnEnvPairs/.test(r6), 'the local r6Pairs spreads spawnEnvPairs (the push has to land somewhere — the line\'s env)');
  const clears = (src.match(/spawnEnvPairs = \[\];/g) || []).length;
  ok(clears >= 5, `each remote branch clears the array after consuming it (${clears} sites) — the reason ordering is load-bearing`);
  ok(/browserKey: session\._browserKey \|\| undefined/.test(src), 'the key is recorded in session-meta (without it, every resume mints a new one)');
  ok(/priorKeyFor\(data\.resumeId\)/.test(src), 'and a resume asks for the CONVERSATION\'s key');
  ok(/fork: !!data\.fork/.test(src), 'the fork flag reaches the ladder (D15)');

  // the tools intro + the manual are the agent's only two pointers at this
  const ar = read('src/agent-routes.js');

  ok(fs.existsSync(path.join(REPO, 'docs/agent/browser-manual.md')), '…and that manual exists in this checkout (the route serves it off disk)');
  ok(/Browsing: `vibespace-browser <verb>`/.test(ar) && /vibespace-docs browser/.test(ar),
    'the budgeted tools intro carries ONE line about it — the one tool (takeover C2) — pointing at the manual');

  const restore = read('src/server/boot-restore.js');
  ok(((s, r) => (s.match(new RegExp(r.source, 'g')) || []).length === 1 && r.test((s.match(/\nfunction sessionFromMeta\(meta, transportFacts\) \{[\s\S]*?\n\}\n/) || [''])[0]) && (s.match(/= sessionFromMeta\(meta, \{/g) || []).length === 3)(restore, /_browserKey: meta\.browserKey/),
    'ALL THREE boot-restore paths carry the key back (a whitelist that covers two of three is this file\'s recurring bug)');
  const schema = read('src/session-schema.js');
  ok(/_browserKey:/.test(schema) && /_browserVariant:/.test(schema), 'both session fields have owner rows');

}

const beSrc0 = read('src/server/browser-env.js');

console.log('\n⑬ the project-level agent-browser.json is layered the way the CLI does (r3)');
{
  // wiring: ws-create hands the resolver the session's cwd
  const src = readCreate();
  ok(/remote: !!data\.hostId, cwd,/.test(src), 'ws-create passes the session\'s `cwd` to envFor (the file is read from the directory the CLI would read it from)');
  // the two documents that told the agent and the user the opposite
  ok(/agent-browser\.json/.test(read('docs/agent/browser-manual.md')) && /agent-browser\.json/.test(read('docs/kb-features.md')),
    'the manual and the kb both name `./agent-browser.json` (round 2 asserted "keeps everything in ~/.agent-browser/config.json" and said nothing about the file it dropped whole)');
}

console.log('\n⑭ the remote rung: a shell fragment the host runs (r3)');
{
  // wiring: the ONE composition carries it, at every remote site
  const rs2 = read('src/remote-shell.js');
  ok(/browser = ''/.test(rs2) && /\+ pre \+ browser \+ resolve \+/.test(rs2), 'buildRemoteExec has a NAMED `browser` slot placed after `pre` and before `resolve`');

  const ws = readCreate();
  const sites = (ws.match(/buildRemoteExec\(\{/g) || []).length;
  const wired = (ws.match(/browser: spawnBrowserPre/g) || []).length;
  ok(sites === 5 && wired === sites, `ALL ${sites} buildRemoteExec sites pass \`browser: spawnBrowserPre\` (${wired}) — a site that forgets is a remote transport with the round-2 collision`);
  ok(/spawnBrowserPre = be\.remotePrelude \|\| ''/.test(ws), 'and the fragment comes from the resolver\'s answer, never re-spelled in ws-create');
  const schema = read('src/session-schema.js');
  ok(/_browserVariant:[^\n]*\bH \(REMOTE/.test(schema) && /_browserVariant:[^\n]*none \(nothing emitted/.test(schema), 'the schema row spells the new rungs (H, N, none)');
}

console.log('\n⑯ modes: the generated config is 0600 in a 0700 directory (r3)');
{
  const wsrc = readCreate();
  ok((wsrc.match(/\{ mode: 0o600 \}/g) || []).length >= 3, 'and match the mode the token-bearing files beside it in ws-create already use');
}

console.log('\n⑳ r5: the floor notice latches on DELIVERY · the conversation key outlives its webui session · the intro never lies about the rung');
{
  // wiring: the channel reports, the hook exists, the handler calls it
  const srvSrc = read('server.js');
  const fnStart = srvSrc.indexOf('function serverNotice(');
  const fn = srvSrc.slice(fnStart, srvSrc.indexOf('\n}\n', fnStart));
  ok(/return delivered;/.test(fn) && /_sentNotices\.get\(key\)/.test(fn), 'server.js `serverNotice` RETURNS the delivery count (and, once burned, the count it reached)');
  const wc = readCreate();
  ok(/const onClientConnected = \(\) => \{ try \{ browserEnvOf\(\)\?\.checkFloor\(\)/.test(wc) && /\}, \{ onClientConnected \}\);/.test(wc), 'ws-create exposes `onClientConnected` on the handler, and it asks checkFloor()');
  ok(/checkFloor\(\{ reprobe: true \}\)[^\n]*6 \* 3600e3/.test(wc), 'and re-probes on the 6 h cadence the other health probes use');
  const wh = read('src/ws-handler.js');
  const cAt = wh.indexOf("wss.on('connection'");
  const conn = wh.slice(cAt, wh.indexOf("ws.on('message'", cAt));
  ok(/handleCreate\.onClientConnected\?\.\(\)/.test(conn), 'ws-handler calls it on EVERY client connection, before the first message');
}
{
  // wiring: the ONE meta choke point records; the two deleters still unlink (the reason the store exists)
  const ss = read('src/server/session-stdout.js');
  const wsm = ss.slice(ss.indexOf('function writeSessionMeta('), ss.indexOf('function deleteSessionMeta('));
  ok(/fs\.renameSync\(tmp, fp\);[\s\S]*b\.record\(sid, meta\.browserKey\)/.test(wsm), 'session-stdout.writeSessionMeta records the binding AFTER the meta write');
  ok(/const sid = b\.bindableIdOf\(meta\); if \(sid\) b\.record\(sid, meta\.browserKey\)/.test(wsm) && !/b\.conversationIdOf\(meta\)/.test(wsm), 'r6: through the store\'s own bindableIdOf (the id a record may BIND), never conversationIdOf (the id it NAMES) — the round-5 shape');
  ok(/browserBindings\(\)/.test(wsm) && /require\('\.\/browser-bindings\.js'\)\.create\(\{ dataDir: path\.dirname\(META_DIR\) \}\)/.test(ss), 'lazily, against the same data dir');
  // .396 seam (lane hub-loop-stalls, commit 2 — the store writer): the body grew past any fixed length (it names the file
  // once, drops the pending copies, has the writer FORGET the file, then unlinks it) — sliced by its END, not by 400 chars
  const dAt = ss.indexOf('function deleteSessionMeta(');
  const dEnd = dAt < 0 ? -1 : ss.indexOf('\n}\n', dAt);
  const del = dAt >= 0 && dEnd > dAt ? ss.slice(dAt, dEnd + 2) : '';
  const fpName = (/const (\w+) = path\.join\(META_DIR, sockName \+ '\.json'\);/.exec(del) || [])[1] || null;
  const unlinkAt = fpName ? del.search(new RegExp(`fs\\.unlinkSync\\(${fpName}\\)`)) : del.search(/fs\.unlinkSync\(path\.join\(META_DIR, sockName \+ '\.json'\)\)/);
  const forgetAt = fpName ? del.search(new RegExp(`storeWriter\\(\\)\\.forget\\(${fpName}\\)`)) : -1;
  // item 9 (store-writer follow-up): NO binding BY ANY SPELLING — the word case-blind (browserBindings(), the module's own
  // require('./browser-bindings.js')) and every MODULE-LEVEL name whose value reaches the store (an alias of an alias too)
  const reachNames = new Set();
  const decls = [...ss.matchAll(/^(?:const|let|var)\s+(\w+)\s*=\s*([^\n]*)/gm)].map((m) => [m[1], m[2]]);
  for (const [n, v] of decls) if (/bindings/i.test(n) || /bindings/i.test(v)) reachNames.add(n);
  for (let more = true; more;) { more = false; for (const [n, v] of decls) if (!reachNames.has(n) && [...reachNames].some((r) => new RegExp(`\\b${r}\\b`).test(v))) { reachNames.add(n); more = true; } }
  const reachesBindings = (body) => /bindings/i.test(body) || [...reachNames].some((r) => new RegExp(`\\b${r}\\b`).test(body));
  ok(!!del && unlinkAt >= 0 && !reachesBindings(del), `deleteSessionMeta still unlinks THAT socket\'s meta file and touches NO binding by any spelling (a kill is not the end of the conversation; names that reach the store: ${[...reachNames].join(', ') || 'none'})`);
  ok(forgetAt >= 0 && unlinkAt > forgetAt, '…and the STORE WRITER forgets the file BEFORE the unlink (.396, commit 2): a paced write still owed for it is dropped first, so none lands after the delete and resurrects it');
  ok(/if \(session\.sockName\) deleteSessionMeta\(session\.sockName\);/.test(read('src/ws-handler.js')), 'the ws kill path still deletes the meta — so rung 2 alone can never serve a Terminate → Resume, which is why rung 1 exists');
  ok(/const bound = bindings\.lookup\(String\(conversationId\)\);\s*\n\s*if \(bound\) return bound;/.test(beSrc0), 'browser-env.priorKeyFor asks the store FIRST');
}
{
  // WIRING: the record says which conversation it was forked from, at the ONE
  // origin write, and every other producer spreads the previous record so the
  // statement survives to the adoption write that finally binds the fork.
  const wc = readCreate();
  ok(/forkSourceId: \(data\.fork && \(data\.forkedFromId \|\| data\.resumeId\)\) \? String\(data\.forkedFromId \|\| data\.resumeId\) : undefined,/.test(wc), 'ws-create\'s first meta write states forkSourceId = the id the fork was asked to resume (forkedFromId when the store minted the fork before the spawn, else resumeId), only under data.fork');
  // A census reads CODE: whole-line comments are blanked first (the origin
  // write's own comments spell parentheses and semicolons), and each site is
  // judged on ITS OWN argument text — up to the call's `);` — never on a
  // fixed window that would bleed into the next producer's spread.
  const classifySites = (raw, file) => {
    const src = raw.replace(/^[ \t]*(\/\/|\*).*$/gm, (m) => ' '.repeat(m.length));
    const out = []; let i = 0;
    while ((i = src.indexOf('writeSessionMeta(', i)) !== -1) {
      const ls = src.lastIndexOf('\n', i) + 1, le = src.indexOf('\n', i);
      const line = src.slice(ls, le < 0 ? src.length : le);
      const at = i; i += 'writeSessionMeta('.length;
      if (/function writeSessionMeta\(/.test(line)) continue;
      const end = src.indexOf(');', at);
      const arg = src.slice(at, end < 0 ? at + 6000 : Math.min(end + 2, at + 6000));
      out.push({ file, line: src.slice(0, at).split('\n').length, spreads: /\.\.\./.test(arg), origin: /forkSourceId:/.test(arg) });
    }
    return out;
  };
  // no name-based exclusion: no suite writes a patched copy under src/ any more (test-architecture §51)
  const files = ['server.js', ...fs.readdirSync(path.join(REPO, 'src'), { recursive: true }).filter((f) => f.endsWith('.js')).map((f) => path.join('src', f))];
  const sites = files.flatMap((f) => classifySites(read(f), f));
  const nonSpread = sites.filter((x) => !x.spreads);
  console.log(`    meta-writer census: ${sites.length} call sites over ${files.length} files; non-spreading: ${nonSpread.map((x) => x.file + ':' + x.line).join(', ') || 'none'}`);
  ok(sites.length >= 20, `the census walked the real producers (${sites.length} writeSessionMeta call sites)`);
  ok(nonSpread.length === 1 && nonSpread[0].file === 'src/ws-create.js' && nonSpread[0].origin, `exactly ONE producer rebuilds the record from scratch — ws-create\'s origin write, the one that states forkSourceId (${nonSpread.map((x) => x.file + ':' + x.line).join(', ')}); every other writer spreads the previous record, so the statement reaches the adoption write`);
  const synth = "writeSessionMeta(sock, { name: 'x', cwd: '/y' });\nwriteSessionMeta(sock, { ...(readSessionMeta(sock) || {}), name: 'x' });\n// writeSessionMeta(sock, {})\n";
  const cs = classifySites(synth, 'synthetic.js');
  ok(cs.length === 2 && cs[0].spreads === false && cs[1].spreads === true, 'the census can SEE a non-spreading writer and ignores a commented one (its own positive control)');
}
{
  const arSrc = read('src/agent-routes.js');
  const sites = arSrc.match(/sessionToolsIntro\((?:enabledTools\(\)|toolFlags), \{ browserVariant: s\._browserVariant(?:, browserSet: browserSetFacts\(s\))?(?:, browserDisplay: browserDisplayFacts\(s\))?(?:, fileTools: fileToolsOf\(s\))? \}\)/g) || []; // P1b added the set beside the variant, lane browser-recipes the display fact, lane artifacts-prompt-hint the file tools; the pin follows the shipped call shape
  ok(sites.length === 2, `both delivery sites (task-context + prompt-context) hand it \`s._browserVariant\` (${sites.length})`);
  ok(!/sessionToolsIntro\((?:enabledTools\(\)|toolFlags)\)/.test(arSrc), 'and no site calls it without the session\'s facts (the round-4 shape)');
  ok(((s, r) => (s.match(new RegExp(r.source, 'g')) || []).length === 1 && r.test((s.match(/\nfunction sessionFromMeta\(meta, transportFacts\) \{[\s\S]*?\n\}\n/) || [''])[0]) && (s.match(/= sessionFromMeta\(meta, \{/g) || []).length === 3)(read('src/server/boot-restore.js'), /_browserVariant: meta\.browserVariant/), 'the rung is restored with the session at all three boot-restore sites, so a restored session\'s re-delivered intro is about ITS rung');
  ok(!arSrc.includes("L.push(\n    'Browsing: the `agent-browser` CLI works as usual and THIS session already has its own browser"), 'the unconditional round-4 push is gone (the control names the retired bytes)');
}

console.log('\n㉓ lane new-session-form: mayAttach at create (the form\'s profile list + the create\'s judge)');
{
  const wc = read('src/ws-create.js');
  // the B-f276 remainder, its read r2 (S2): the form's verdict lives in the keeper's ONE create verdict (`pinVerdictForCreate` — the
  // same for a create judged now and one the held registry owes to its read); ws-create hands it the groups the form sends
  const kp = read('src/server/browser-keeper.js');
  ok(wc.includes('const formGroups = Array.isArray(data.taskIds) ? spawnGroups : null;') && wc.includes('kp.pinVerdictForCreate({ facts: pinFacts, hint, formGroups })')
    && /if \(pin\.origin === 'chosen' && pin\.profileId && Array\.isArray\(formGroups\)\) \{\s*\n\s*const may = mayAttachAtCreate\(pin\.profileId, \{ taskIds: formGroups \}\);\s*\n\s*if \(!may\.ok\) pin = \{ profileId: '', dir: null, origin: 'harness', refused: may\.code, formRefused: pin\.profileId \};/.test(kp)
    && wc.indexOf('kp.pinVerdictForCreate(') < wc.indexOf("keeper()?.setPin(bk.key, pin.profileId"), 'WIRING: ws-create judges the form\'s explicit pick (it sends taskIds) by the same verdict BEFORE the pin is written — a pick its groups do not admit starts without it, never added to the list');
  const routes = read('src/routes/browser.js');
  ok(/router\.get\('\/api\/browser\/admits', \(req, res\) => \{[\s\S]{0,400}k\.admitsAtCreate\(\{ taskIds \}\)/.test(routes), 'WIRING: GET /api/browser/admits answers the keeper\'s admitsAtCreate (the form\'s list)');
  const picker = read('src/lib/browser-profile-picker.js');
  ok(/fetchJson\('\/api\/browser\/admits\?taskIds=' \+ encodeURIComponent\(key\)\)/.test(picker) && /const listed = d\.profiles\.filter\(\(p\) => admitted\.has\(p\.id\)\);/.test(picker) && /p\.scope !== 'only'/.test(picker), 'the New Session row lists ONLY the admitted profiles (until the answer lands: those every conversation may use — the server\'s own scope word)');
}

console.log(`\n${fail ? fail + ' FAILED (' + pass + ' passed' + (skipped ? ', ' + skipped + ' skipped' : '') + ')' : 'ALL PASS (' + pass + (skipped ? ', ' + skipped + ' skipped' : '') + ')'}`);
process.exit(fail ? 1 : 0);
