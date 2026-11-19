#!/usr/bin/env node
// THE PERMISSION RULES (read-only) — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED
// VERBATIM from the heavy scripts/test-permission-rules.mjs, whose PURE records, the real oracles, the consumers' drives and the
// headless-chrome legs stay there: READ-ONLY structurally (both wrappers, the server module, the PURE module), the oracle runner's
// source pins, the codex consumer's comment, «comments state what the code does» (round 3, with its control), the resolver's one
// reader. Each reads the file it pins BY NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-permission-rules-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gitEnvFrom } from './git-env.mjs';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let passed = 0, failed = 0;
const check = (name, cond, extra) => { if (typeof name !== 'string') throw new TypeError(`check(): the name is a ${typeof name} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.error('  ✗ ' + name + (extra ? '\n    ' + extra : '')); } };

console.log('— Part 1: the PURE model + renderer');

// ── READ-ONLY, structurally ──
{
  const wrapper = fs.readFileSync(path.join(REPO, 'data/bin/codex-chat-wrapper.js'), 'utf8');
  // the CONSTRUCTION, not the word: the module comments name the write twins
  // deliberately (so the next reader knows they exist and why they are not
  // used), so the assert is that no `request(...)` ever carries one.
  check('the codex wrapper NEVER sends codex\'s config WRITE twins (§4.5: expectedVersion turns a careless write into data loss)',
    !/request\(\s*'config\/(value\/write|batchWrite)'/.test(wrapper) && /request\(\s*'config\/read'/.test(wrapper));
  check('the codex wrapper serves the read verb and asks for layers+origins',
    /'read-permission-rules'/.test(wrapper) && /request\('config\/read', \{ cwd: cwd \|\| null, includeLayers: true \}/.test(wrapper));
  const acp = fs.readFileSync(path.join(REPO, 'data/bin/acp-wrapper.js'), 'utf8');
  check('BOTH wrappers serve the new stdin verb in the SAME batch (design §6 landing discipline)', /case 'read-permission-rules'/.test(acp));
  check('the ACP wrapper answers with a TYPED refusal (ACP v1 has no config-read method), never silence',
    /reason: 'unsupported-by-protocol'/.test(acp));
  check('the ACP wrapper\'s unknown-verb path NAMES the new verb (data/bin/acp-wrapper.js is the loud template)',
    /Unknown stdin verb[\s\S]{0,240}read-permission-rules/.test(acp));
  const routes = fs.readFileSync(path.join(REPO, 'src/server/permission-rules.js'), 'utf8');
  check('the server module registers exactly ONE GET (the read) and ONE POST (the human-triggered oracle) — no write route',
    (routes.match(/app\.(get|post|put|patch|delete)\(/g) || []).join(',') === 'app.get(,app.post(');
  const pure = fs.readFileSync(path.join(REPO, 'src/permission-rules.js'), 'utf8');
  check('the PURE module imports nothing at all (PURE tier)', !/require\(|^import /m.test(pure));
}

console.log('— Part 2: the server reader + the oracle runner');
{
  const src = fs.readFileSync(path.join(REPO, 'src/server/permission-rules.js'), 'utf8');
  check('oracle: the runner takes NO argv from its caller — it spawns `o.argv` from the frozen registry',
    /spawn\(cmd, o\.argv\.slice\(\)/.test(src) && !/spawn\(cmd, *\(?(opts|req|body|params)/.test(src));
  check('oracle: the route is a POST (a GET would be pre-fetchable — "never on a timer" must not lose by accident)',
    /app\.post\('\/api\/local-oracle\/:id'/.test(src) && !/app\.get\('\/api\/local-oracle/.test(src));
  check('oracle: nothing in the module schedules one (no setInterval / boot call)', !/setInterval/.test(src));
}
{
  // the comment that promised a client broadcast the client never had
  const ce = fs.readFileSync(path.join(REPO, 'src/server/stdout/codex-events.js'), 'utf8');
  check('the codex stdout consumer no longer promises a live broadcast to other windows (nothing on the client reads this record)',
    /permission_rules/.test(ce) && !/second window watching the same session sees the same tree/.test(ce));
  // B-94d3 cure (the 03:53Z verdict): this was `grep -rl … || true`, which passed when grep was missing or the path was
  // wrong (no output either way). Now a walk over the tracked src/lib files, said non-empty, with its own control: the
  // same search finds the record name in the one file above that carries it.
  const libFiles = execFileSync('git', ['-C', REPO, 'ls-files', '--', 'src/lib'], { env: gitEnvFrom(process.env), encoding: 'utf8' }).split('\n').filter(Boolean);
  const carriers = (files) => files.filter((f) => fs.readFileSync(path.join(REPO, f), 'utf8').includes('permission_rules'));
  const libCarriers = carriers(libFiles);
  check(`…and no client module consumes a permission_rules record, which is why that promise had to go (${libFiles.length} tracked src/lib files read)`,
    libFiles.length > 0 && libCarriers.length === 0, libCarriers.join(', '));
  check('…CONTROL: the same search finds the record name where it is (src/server/stdout/codex-events.js)', carriers(['src/server/stdout/codex-events.js']).length === 1);
}
{
  // ⑤ STANDING SWEEP: every module that builds mk() refs, not just this one.
  // The two offenders were copies of each other in src/server/stdout/, but the
  // PROPERTY that makes them wrong ("an mk() ref is a Proxy over `{}`, so a call
  // is always a TypeError") belongs to src/server/lazy.js and holds in every
  // module that uses it. Enumerating the directory I had just been looking at is
  // the tool this class of bug has already beaten twice, so the file set is
  // DERIVED (every .js under src/ + server.js that REQUIRES src/server/lazy.js
  // and binds an mk() ref) and PRINTED. Per file, the names are the ones THAT
  // file binds: `hosts` in session-stdout is a lazy ref, `hosts` elsewhere may
  // be an ordinary object.
  {
    // The set a commit of this tree would contain (TRACKED + untracked-not-
    // ignored), never a directory walk: other suites write gitignored PATCHED
    // COPIES beside the real modules (test-restore-liveness's
    // src/server/session-stdout.__prefix_control.js is a PRE-FIX copy) and
    // unlink them — a walk running in a parallel heavy lane read one that had
    // just vanished (ENOENT, 2026-09-24) and could equally sweep a pre-fix
    // copy's retired spelling as an offender.
    let listed = null;
    try {
      const ls = (args) => execFileSync('git', ['-C', REPO, 'ls-files', '-z', ...args, '--', 'src', 'server.js'], { env: gitEnvFrom(process.env), encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 })
        .toString('utf8').split('\0').filter(Boolean);
      listed = [...new Set([...ls([]), ...ls(['--others', '--exclude-standard'])])].filter((f) => f.endsWith('.js') && fs.existsSync(path.join(REPO, f)));
    } catch (e) { console.log('    (no git listing — ' + String(e.message).slice(0, 100) + ' — falling back to a directory walk)'); }
    if (listed) console.log(`    sweep scope = git listing (${listed.length} .js files under src/ + server.js; gitignored patched copies excluded)`);
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(dir, e.name);
      return e.isDirectory() ? walk(full) : (e.name.endsWith('.js') ? [full] : []);
    });
    const candidates = listed ? listed.map((f) => path.join(REPO, f)) : [...walk(path.join(REPO, 'src')), path.join(REPO, 'server.js')];
    const builders = [];       // [relPath, [lazy names it binds]]
    const offenders = [];
    for (const full of candidates) {
      const src = fs.readFileSync(full, 'utf8');
      // `mk` must be THE lazy bridge, not a name collision: src/lib/terminal.js
      // has a local `const mk = (cls) => …` DOM helper, and sweeping its
      // `badge` binding would some day fail a legitimate call. Over-inclusion
      // is cheap, but not when it can turn an unrelated line red.
      if (!/require\((['"])[.\/]*lazy\.js\1\)/.test(src)) continue;
      const names = [...new Set([...src.matchAll(/const\s+(\w+)\s*=\s*mk\(/g)].map((m) => m[1]))];
      if (!names.length) continue;
      const rel = path.relative(REPO, full);
      builders.push([rel, names]);
      src.split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line)) return;                     // comments may NAME the retired spelling
        // `ref(` or `ref?.(` — a CALL. `ref?.method?.(` and `ref.method(` do
        // not match, because the `(` must follow the name (with at most an
        // optional-chain punctuator between), never a property name.
        for (const n of names) {
          if (new RegExp(`\\b${n}\\s*(\\?\\.)?\\s*\\(`).test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 110)}`);
        }
      });
    }
    // The consumers do not BUILD their refs (session-stdout hands them in), so
    // they are swept with the names their engine binds — the seam the bug used.
    const engine = builders.find(([rel]) => rel === 'src/server/session-stdout.js');
    if (engine) {
      const stdoutFiles = listed ? listed.filter((f) => /^src\/server\/stdout\/[^/]+\.js$/.test(f)).map((f) => path.basename(f))
        : fs.readdirSync(path.join(REPO, 'src/server/stdout')).filter((n) => n.endsWith('.js'));
      for (const f of stdoutFiles) {
        const rel = path.join('src/server/stdout', f);
        fs.readFileSync(path.join(REPO, rel), 'utf8').split('\n').forEach((line, i) => {
          if (/^\s*(\/\/|\*)/.test(line)) return;
          for (const n of engine[1]) {
            if (new RegExp(`\\b${n}\\s*(\\?\\.)?\\s*\\(`).test(line)) offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 110)}`);
          }
        });
      }
    }
    console.log('    swept for mk()-ref CALLS: ' + builders.map(([rel, n]) => `${rel}(${n.length})`).join(', ') + ' + src/server/stdout/*');
    check('standing sweep: the derived file set is non-empty, is every real importer of src/server/lazy.js, and includes the engine that hands the refs to the stdout consumers',
      builders.length >= 5 && !!engine && engine[1].length >= 4
      && !builders.some(([r]) => r === 'src/lib/terminal.js'), JSON.stringify(builders.map(([r]) => r)));
    check('standing sweep: NOTHING calls a lazy mk() ref as a function (its Proxy target is `{}` — the call is always a TypeError)',
      offenders.length === 0, offenders.join('\n    '));
    // NEGATIVE CONTROL: the detector really matches the two lines that shipped,
    // and does NOT match the two that replaced them — otherwise the zero above
    // is a broken regex rather than a clean tree.
    const bad = ['try { permissionRulesRef?.()?.onWrapperRecord?.(id, msg.payload); } catch (e) {}',
      'try { if (cid) deliverRef()?.stashFor(cid, { source: \'agent\' }); } catch {}'];
    const good = ['try { permissionRulesRef?.onWrapperRecord?.(id, msg.payload); } catch (e) {}',
      'try { if (cid) deliverRef?.stashFor?.(cid, { source: \'agent\' }); } catch (e) {}',
      'const r = hosts.device(hostId); usageHistory.record(ev);'];
    const hits = (s) => ['permissionRulesRef', 'deliverRef', 'hosts', 'usageHistory'].some((n) => new RegExp(`\\b${n}\\s*(\\?\\.)?\\s*\\(`).test(s));
    check('NEGATIVE CONTROL: the sweep matches BOTH lines that shipped, and neither of the two that replaced them (nor an ordinary `ref.method()`)',
      bad.every(hits) && good.every((s) => !hits(s)), JSON.stringify({ bad: bad.map(hits), good: good.map(hits) }));
  }
}

// ── COMMENTS STATE WHAT THE CODE DOES (round 3) ──
// This batch's own stated value is that a comment describing a mechanism that
// was deleted (or never existed) is a defect — it is what shipped the
// "second window sees the same tree" promise in round 2. Two more were found
// in round 3, so both are pinned the same way, each with a control that fails
// if the pin is checking a string nobody would write anyway.
{
  const view = fs.readFileSync(path.join(REPO, 'src/lib/permission-rules-view.js'), 'utf8');
  check('the view no longer justifies its human-trigger rule with the codex INSTANCE rung — round 2 DELETED that rung (`permissionRules.instance:false`)',
    !/instance rung spawns a bounded app-server child/.test(view));
  check('…and it states the reason that is actually true today: the codex SESSION rung is a round trip to that session\'s own app-server',
    /session rung is a full round trip/.test(view) && /would-connect/.test(view));
  const base = fs.readFileSync(path.join(REPO, 'src/adapters/base.js'), 'utf8');
  const prDoc = base.slice(Math.max(0, base.indexOf('READ-ONLY PERMISSION-RULE READ')), base.indexOf('formatReadPermissionRules ='));
  check('the adapter doc for the read verb no longer names ws-handler as its gate — there is no ws message for this verb at all',
    prDoc.length > 100 && !/ws-handler/.test(prDoc), prDoc.slice(0, 240));
  check('…and it names the REAL gates: src/server/permission-rules.js read() (caps row) + readViaSession() (the wrapper advert)',
    /server\/permission-rules\.js/.test(prDoc) && /readViaSession/.test(prDoc) && /wrapperCaps/.test(prDoc), prDoc.slice(0, 400));
  // the FACT the comment now asserts, measured rather than believed
  const wsSrc = fs.readFileSync(path.join(REPO, 'src/ws-handler.js'), 'utf8');
  const createSrc = fs.readFileSync(path.join(REPO, 'src/ws-create.js'), 'utf8');
  check('MEASURED: no ws layer calls formatReadPermissionRules — the ONLY caller is the HTTP reader',
    !/formatReadPermissionRules/.test(wsSrc) && !/formatReadPermissionRules/.test(createSrc)
    && /formatReadPermissionRules/.test(fs.readFileSync(path.join(REPO, 'src/server/permission-rules.js'), 'utf8')));
  check('NEGATIVE CONTROL: its two SIBLING verbs really are ws-gated, so "no ws-handler" is a distinction this file draws and not a blanket that would pass anywhere',
    /formatSetResponseStyle/.test(wsSrc) && /formatQueueOp/.test(wsSrc));
}
{
  const src = fs.readFileSync(path.join(REPO, 'src/server/permission-rules.js'), 'utf8');
  check('resolveDefaultMode reads the hierarchy through the ONE reader (readClaudeRules) and resolves through the PURE claudeDefaultMode — no second parser, no process', /defaultModeReader\.readClaudeRules\(/.test(src) && /PR\.claudeDefaultMode\(/.test(src) && (src.match(/child = spawn\(cmd, o\.argv\.slice\(\)/g) || []).length === 1 && !/JSON\.parse/.test(src.slice(src.indexOf('let defaultModeReader'))));
}

console.log(failed ? `\n${failed} FAILED (${passed} passed)` : `\nALL PASS (${passed})`);
process.exit(failed ? 1 : 0);
