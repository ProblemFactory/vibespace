#!/usr/bin/env node
// THE ONE BROWSER CLI (docs/design-browser-takeover.zh.md §3 T1 + §4 T2, §10's
// test-browser-verbs row). FAST tier: no real browser, no port claimed by name
// (the fake server listens on 0), scratch dirs only, ~3 s.
//
//   ① the PURE router (src/browser-verbs.js): the 12 OURS words; the collision
//      set COMPUTED from the checked-in --help census (+ the `skills get core
//      --full` extras) == {profiles}; every census word is classified; each
//      page verb → page, each refused verb → its code + a non-empty remedy;
//      the identity / launch flag sets; --enable/--init-script pass beside
//      `open` only; batch judged per line (one refusal refuses the whole batch
//      and names the line); the same rules after `--`; resolveRealBinary skips
//      the shim dirs and the shim by content, absent ⇒ binary_absent.
//   ② the SHIM (data/bin/agent-browser): exit 2, exactly one stderr line naming
//      the `vibespace-browser` command to run; no args ⇒ … `help`; CONTROL: a
//      copy that exits 0 is caught.
//   ③ the CLI over a FAKE server: `click @e1` and `-- click @e1` post the SAME
//      /resolve body and run the fake REAL binary found on PATH behind a shim;
//      raw CDP / identity flags are refused with ZERO server calls; `use
//      --print` ⇒ not_offered; `new-child` prints only VIBESPACE_BROWSER; a
//      refused batch line refuses the batch locally; the binary absent ⇒
//      binary_absent before any server call; the audit line follows a page verb.
//   r1: every flag-ordered spelling of `get cdp-url` (pure + the CLI, zero server
//      calls; the real-binary control is test-browser-mediation-chrome ③) and
//      the ENV TWINS — a fake real binary that dumps its AGENT_BROWSER_* env,
//      run with the refused flags' twins in the shell on every /resolve kind
//      (shared, unmanaged with its own pairs, rung H's host-decided dir,
//      ephemeral, attachment, an older server's answer): none reaches it, the
//      output keys do, the drop is said by name; a patched copy with the
//      pre-fix `{ ...process.env }` line is the control.
//   r2: only the NOUN decides (`get attr @e cdp-url` / `get text cdp-url` are
//      reads; a boolean flag's optional `true`/`false` is skipped, so `get --json
//      true cdp-url` is refused), the --help GLOBAL-option census over
//      VALUE_FLAGS, and the SOCKET ROOT as identity (the answer's socketDir /
//      runtimeDir win over a decoy SOCKET_DIR / XDG_RUNTIME_DIR; rung H keeps only
//      `<base>/vs-ab-<uid>`) — each with a patched-copy control.
//   r3: the global-flag tables EQUAL the measured census (scripts/fixtures/
//      browser-verbs/global-flags-0.32.0.json; `--idle-timeout` was the gap),
//      `get` passes only a noun it reads, a flag of unknown arity is judged
//      under every reading; the CONFIG FILE — the one rule (sanctionedConfig:
//      a project file only narrows, no raw-debugging switch from any file), the
//      answer's `config` set last, and where none is named the CLI composes and
//      names one (never a search); patched copies as controls.
//   r4: a navigation goes to the web only (`localSchemeOf`: every spelling of
//      file: / chrome: / about:version / view-source: / … refused, scheme-less
//      hosts and about:blank / data: pass; `state load` of a crafted file); the
//      stdin batch in the binary's own JSON form (the fake binary, like the real
//      one, reads ONLY a JSON array of string arrays); the ACCOUNT's passwd home
//      (a `--require` preload injects it; a disagreeing $HOME is refused, once
//      with the real passwd entry); the older-server config; the version gate;
//      the census CLI. A patched r3 copy is the control for each.
//   lane L r2 (the verifier's upload finding): with VibeSpace's own tools
//      pre-approved a page verb runs with no card, so an UPLOAD from a
//      credential store is refused by the CLI BY NAME (`upload_secret_refused`):
//      the router names every positional word after `upload` (any reading, every
//      batch line), the PURE `uploadPathVerdict` judges it against ~/.claude,
//      ~/.ssh, ~/.vibespace, ~/.codex and the data dir's account stores, and the
//      shipped CLI refuses before the binary or /resolve (a literal `~`, a
//      relative path, a symlink into a store); a normal file uploads; a patched
//      pre-r2 copy is the control.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execFile, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const V = require('../src/browser-verbs.js');

let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + extra : '')); } return !!c; };
const REPO = new URL('..', import.meta.url).pathname;
const FIX = path.join(REPO, 'scripts/fixtures/browser-verbs');

// ═══ ① the PURE router ═══
console.log('① the PURE router');
{
  ok(V.OURS.length === 12 && ['profiles', 'new', 'providers', 'use', 'detach', 'status', 'pin', 'watch', 'backend', 'blocked', 'new-child', 'help'].every((w) => V.OURS.includes(w)), 'OURS is exactly the 12 VibeSpace words');
  for (const w of V.OURS) ok(V.classify([w, 'x']).kind === 'ours', `\`${w}\` is ours`);
  ok(V.classify([]).kind === 'ours' && V.classify([]).verb === 'help' && V.classify(['--help']).verb === 'help', 'no args / --help ⇒ help');

  // the census: the browser CLI's --help top-level words (sections whose header
  // spells `<cli> <word> <…>` list SUB-words, skipped) + the core --full extras.
  // FLAG ORDER (0.32.0, measured r1 in test-browser-mediation-chrome ③): global
  // flags are read ANYWHERE — `get --json cdp-url`, `get -c cdp-url` and
  // `get cdp-url --json` all answer — so a verb's NOUN is the first non-flag
  // word after it (value flags skip their value), never simply argv[verb + 1]
  // the census reads the fixtures of the version the tables CLAIM (lane H: re-measured on 0.38.1; 0.32.0's stay as r3's evidence)
  const TV = V.TABLE_VERSION;
  const help = fs.readFileSync(path.join(FIX, `help-${TV}.txt`), 'utf8');
  const head = help.split(/\nSnapshot Options:/)[0];
  const words = [];
  let subSection = false;
  for (const line of head.split('\n')) {
    if (/^\S/.test(line)) { subSection = new RegExp(V.REAL_BINARY + ' \\w+ <').test(line); continue; }
    const m = /^ {2}([a-z][a-z0-9-]*)(?=[\s[]|$)(?:.*\S)? {2,}\S/.exec(line); // a listing row: `  <word> <args>   <description>` (prose wraps with single spaces)
    if (!m || subSection || m[1] === V.REAL_BINARY) continue;
    words.push(m[1]);
  }
  for (const line of head.split('\n')) { const m = new RegExp('^[A-Z][A-Za-z ]+:\\s+' + V.REAL_BINARY + ' (\\w+) <').exec(line); if (m) words.push(m[1]); }
  const extra = JSON.parse(fs.readFileSync(path.join(FIX, `core-full-extra-${TV}.json`), 'utf8')).verbs;
  const census = [...new Set([...words, ...extra])].sort();
  ok(census.length >= 65, `the census is non-vacuous (${census.length} top-level words)`, census.join(' '));
  ok(['open', 'snapshot', 'get', 'network', 'batch', 'profiles', 'connect', 'mcp', 'window', 'state'].every((w) => census.includes(w)), 'the census reads both listings (core, header-spelled families, the extras)');
  ok(JSON.stringify(V.collisions(census)) === JSON.stringify(['profiles']), `the collision set COMPUTED from the census is exactly {profiles} (${V.collisions(census).join(',')})`);
  const unknown = census.filter((w) => !V.known(w));
  ok(unknown.length === 0, `every census word is classified by the table — page or refused by name (${unknown.join(', ') || 'none left over'})`);
  ok(V.classify(['--', 'profiles']).kind === 'page', 'the collided word is reachable as `-- profiles` (the browser CLI\'s, harmless)');
  // lane H (2026-09-25): the 0.38.1 re-measure's NEW surface, each decided by name
  {
    ok(census.includes('a11y') && census.includes('webmcp'), '0.38.1: the census carries its two new top-level words (a11y from `skills get core --full`, webmcp from the help)', census.join(' '));
    const a = V.classify(['a11y']), au = V.classify(['a11y', 'https://example.com', '--tags', 'wcag2a']), af = V.classify(['a11y', 'file:///etc/passwd']), ac = V.classify(['a11y', 'chrome://version']);
    ok(a.kind === 'page' && au.kind === 'page' && af.code === 'local_scheme_refused' && ac.code === 'local_scheme_refused' && V.NAV_VERBS.includes('a11y'), '0.38.1: `a11y [url]` is a page verb that NAVIGATES — a web url passes, a file:/chrome: one is refused like `open`\'s', JSON.stringify([a.kind, au.kind, af.code, ac.code]));
    const w = V.classify(['webmcp', 'invoke', 'x']);
    ok(w.kind === 'refused' && w.code === 'verb_not_offered' && /action trace/.test(w.error) && /snapshot/.test(w.remedy), '0.38.1: `webmcp` (page-declared tools, experimental) is refused BY NAME — neither mediated nor traced — with the page-UI way out', JSON.stringify(w));
    ok(V.classify(['snapshot', '--no-pin-tab']).code === 'identity_flag_refused' && V.classify(['open', 'https://x', '--pin-tab']).kind === 'page', '0.38.1: `--no-pin-tab` (drops the sticky tab binding) is the lease\'s decision — refused; `--pin-tab` only tightens it and passes');
    ok(['--ca-cert', '--no-ca-cert', '--no-webmcp'].every((f) => V.classify(['snapshot', f, ...(f === '--ca-cert' ? ['/tmp/x.pem'] : [])]).code === 'launch_flag_refused'), '0.38.1: `--ca-cert` / `--no-ca-cert` (which CAs the browser TRUSTS) and `--no-webmcp` are launch decisions — refused');
    ok(V.classify(['click', '@e1', '--input-mode', 'human']).kind === 'page' && V.classify(['get', '--input-mode', 'human', 'cdp-url']).code === 'raw_cdp_refused' && V.classify(['get', '--ca-cert', 'x', 'text']).code === 'launch_flag_refused', '0.38.1: the new VALUE flags skip their value (`--input-mode human` never becomes the noun)');
  }

  const PAGE = ['open', 'read', 'click', 'dblclick', 'type', 'fill', 'press', 'keyboard', 'keydown', 'keyup', 'hover', 'focus', 'check', 'uncheck', 'select', 'drag', 'upload', 'download', 'scroll', 'scrollintoview', 'wait', 'screenshot', 'pdf', 'snapshot', 'eval', 'back', 'forward', 'reload', 'pushstate', 'highlight', 'clipboard', 'frame', 'dialog', 'window', 'tab', 'get', 'is', 'find', 'mouse', 'set', 'network', 'cookies', 'storage', 'state', 'diff', 'console', 'errors', 'vitals', 'react', 'trace', 'profiler', 'record', 'addinitscript', 'removeinitscript', 'close'];
  // (r3: `get` passes only with a noun it reads — `get text @e1`, never `get @e1`)
  const pageBad = PAGE.filter((w) => { const c = V.classify(w === 'get' ? [w, 'text', '@e1'] : [w, '@e1']); return c.kind !== 'page' || c.verb !== w; });
  ok(pageBad.length === 0, `each page verb → page (${PAGE.length}; wrong: ${pageBad.join(', ') || 'none'})`);
  const c1 = V.classify(['click', '@e1']), c2 = V.classify(['--', 'click', '@e1']);
  ok(c1.kind === 'page' && c2.kind === 'page' && JSON.stringify(c1.argv) === JSON.stringify(c2.argv) && c2.escape === true, '`click @e1` and `-- click @e1` classify to the same page argv');
  ok(V.classify(['get', 'text', '@e1']).sub === 'text' && V.classify(['close', '--all']).kind === 'page', 'sub-words ride (get text); `close --all` is a page verb (the server/CLI restrict it)');

  const REFUSED = { connect: 'raw_cdp_refused', session: 'verb_not_offered', stream: 'verb_not_offered', confirm: 'confirmation_is_human', deny: 'confirmation_is_human', inspect: 'verb_not_offered', auth: 'verb_not_offered', plugin: 'verb_not_offered', install: 'verb_not_offered', upgrade: 'verb_not_offered', doctor: 'verb_not_offered', mcp: 'verb_not_offered', dashboard: 'verb_not_offered', chat: 'verb_not_offered', skills: 'verb_not_offered' };
  for (const [w, code] of Object.entries(REFUSED)) {
    const c = V.classify([w, 'x']);
    ok(c.kind === 'refused' && c.code === code && c.remedy && c.remedy.length > 10 && c.error, `\`${w}\` ⇒ ${code} with a remedy`);
  }
  const cdp = V.classify(['get', 'cdp-url']);
  ok(cdp.kind === 'refused' && cdp.code === 'raw_cdp_refused', '`get cdp-url` ⇒ raw_cdp_refused (the sub-word decides)');
  // r1 (browser finding 1): the real 0.32.0 binary takes global flags BETWEEN the verb and its noun
  // (`get --json cdp-url` and `get cdp-url --json` both answer — measured in test-browser-mediation-chrome
  // ③), so the noun is the first NON-flag word after the verb, value flags skipped — in every spelling
  for (const argv of [['get', '--json', 'cdp-url'], ['get', '-c', 'cdp-url'], ['get', 'cdp-url', '--json'], ['get', '--max-output', '400', 'cdp-url'], ['--', 'get', '--json', 'cdp-url'], ['--json', 'get', 'cdp-url']]) {
    const c = V.classify(argv);
    ok(c.kind === 'refused' && c.code === 'raw_cdp_refused', `\`${argv.join(' ')}\` ⇒ raw_cdp_refused (flags between the verb and its noun do not hide it)`, JSON.stringify([c.kind, c.code, c.sub]));
  }
  const bcdp = V.classify(['batch', 'open https://x', 'get --json cdp-url']);
  ok(bcdp.kind === 'refused' && bcdp.code === 'batch_line_refused' && bcdp.lineCode === 'raw_cdp_refused' && bcdp.line === 2, '…and the same line inside a batch refuses the batch', JSON.stringify(bcdp));
  const gt = V.classify(['get', '--json', 'text', '@e1']);
  ok(gt.kind === 'page' && gt.sub === 'text', 'CONTROL: `get --json text @e1` stays a page verb whose noun is `text` (the flag skipped, not the noun)', JSON.stringify(gt));
  // r2 (browser finding 1): the NOUN decides, never a later word — `cdp-url` as an attribute NAME
  // (`get attr @e cdp-url`) or a SELECTOR (`get text cdp-url` = a <cdp-url> element) is a legitimate
  // read (measured on 0.32.0: 'zzz' / the element's text, no endpoint — test-browser-mediation-chrome ③)
  for (const argv of [['get', 'attr', '@e1', 'cdp-url'], ['get', 'attr', '#e', 'cdp-url'], ['get', 'text', 'cdp-url'], ['get', 'value', 'cdp-url'], ['get', 'count', 'cdp-url'], ['get', 'styles', 'cdp-url'], ['get', 'box', 'cdp-url'], ['get', 'html', 'cdp-url'], ['get', 'attr', 'cdp-url', 'cdp-url'], ['get', 'attr', '#e', '--json', 'cdp-url'], ['--', 'get', 'attr', '@e1', 'cdp-url']]) {
    const c = V.classify(argv);
    ok(c.kind === 'page' && c.sub === argv[argv.indexOf('get') + 1], `r2: \`${argv.join(' ')}\` is a PAGE read (noun \`${argv[argv.indexOf('get') + 1]}\`) — cdp-url there is an attribute name / a selector`, JSON.stringify([c.kind, c.code, c.sub]));
  }
  ok(V.classify(['batch', 'get attr #e cdp-url', 'get text cdp-url']).kind === 'page', 'r2: …and the same reads inside a batch pass');
  // r2: a BOOLEAN global flag takes an optional `true` / `false` (the help's "Boolean flags accept an
  // optional true/false value"; measured: `get --json true cdp-url` IS the raw endpoint, `get --json TRUE
  // cdp-url` is `Unknown subcommand`) — so `true`/`false` after a flag is never the noun
  for (const argv of [['get', '--json', 'true', 'cdp-url'], ['get', '--json', 'false', 'cdp-url'], ['get', '-v', 'true', 'cdp-url'], ['get', '--debug', 'false', 'cdp-url'], ['get', '--max-output', '5', '--json', 'true', 'cdp-url'], ['--json', 'true', 'get', 'cdp-url'], ['--', 'get', '--json', 'true', 'cdp-url']]) {
    const c = V.classify(argv);
    ok(c.kind === 'refused' && c.code === 'raw_cdp_refused', `r2: \`${argv.join(' ')}\` ⇒ raw_cdp_refused (a boolean flag's true/false is its value, not the noun)`, JSON.stringify([c.kind, c.code, c.sub]));
  }
  ok(V.classify(['batch', 'open https://x', 'get --json true cdp-url']).lineCode === 'raw_cdp_refused', 'r2: …in a batch line too');
  ok(V.classify(['--json', 'true', 'snapshot']).kind === 'page' && V.classify(['--json', 'true', 'snapshot']).verb === 'snapshot' && V.classify(['get', 'text', 'true']).sub === 'text', 'r2 CONTROL: `--json true snapshot` finds its verb; `get text true` (a <true> element) keeps its noun');
  // r2: THE CENSUS the noun rule stands on — every GLOBAL option of the --help (Authentication + Options
  // sections) that takes a VALUE is in VALUE_FLAGS or refused outright; no boolean one is in VALUE_FLAGS
  // (a boolean read as a value flag would swallow the noun: `get --json cdp-url` would pass)
  {
    const sec = (name) => { const i = help.indexOf('\n' + name + ':\n'); if (i < 0) return ''; const rest = help.slice(i + name.length + 3); const j = rest.search(/\n[A-Z][A-Za-z ]+:\n/); return j < 0 ? rest : rest.slice(0, j); };
    const globalText = sec('Authentication') + '\n' + sec('Options');
    const valueFlags = [], boolFlags = [];
    for (const line of globalText.split('\n')) {
      const m = /^ {2}((?:-[A-Za-z], )?--[a-z][a-z0-9-]*(?:, -[A-Za-z])?)(?: (<[^>]+>|\[[^\]]+\]))?(?= {2,}|$)/.exec(line);
      if (!m) continue;
      const names = m[1].split(', ');
      if (m[2] && m[2][0] === '<') valueFlags.push(...names); else if (!m[2]) boolFlags.push(...names);
    }
    const VF = new Set(V.VALUE_FLAGS);
    const refusedFlag = (f) => V.IDENTITY_FLAGS.includes(f) || V.LAUNCH_FLAGS.includes(f) || V.RAW_CDP_FLAGS.includes(f);
    ok(valueFlags.length >= 30 && boolFlags.length >= 12 && valueFlags.includes('--max-output') && boolFlags.includes('--json'), `r2: the global-option census is non-vacuous (${valueFlags.length} value flags, ${boolFlags.length} boolean)`, JSON.stringify({ valueFlags, boolFlags }));
    const missing = valueFlags.filter((f) => !VF.has(f) && !refusedFlag(f));
    ok(missing.length === 0, `r2: every global VALUE flag is in VALUE_FLAGS or refused (missing: ${missing.join(', ') || 'none'})`);
    const swallow = boolFlags.filter((f) => VF.has(f));
    ok(swallow.length === 0, `r2: no BOOLEAN global flag is in VALUE_FLAGS (it would swallow the noun: ${swallow.join(', ') || 'none'})`);
  }
  // r2 NEGATIVE CONTROLS on patched copies of the router: the r1 any-word disjunct refuses the attribute
  // read; a flag skipper without the true/false value lets `get --json true cdp-url` through
  {
    const src = fs.readFileSync(path.join(REPO, 'src/browser-verbs.js'), 'utf8');
    const load = (code) => { const m = { exports: {} }; new Function('module', 'exports', 'require', code)(m, m.exports, require); return m.exports; };
    const r1 = src.replace("if (verb === 'get' && sub === 'cdp-url') return", "if (verb === 'get' && (sub === 'cdp-url' || body.slice(vi + 1).some((t) => !isFlag(t) && t === 'cdp-url'))) return");
    // (r3: the allow-list now refuses `true` as a noun too — the control removes it so it measures the skipper alone)
    const noBool = src.replace("return body[i + 1] === 'true' || body[i + 1] === 'false' ? i + 2 : i + 1;", 'return i + 1;').replace("if (verb === 'get' && !GET_NOUN_SET.has(sub)) {", 'if (false) {');
    ok(r1 !== src && load(r1).classify(['get', 'attr', '@e1', 'cdp-url']).code === 'raw_cdp_refused', 'r2 NEGATIVE CONTROL: the r1 any-word rule (patched copy) refuses `get attr @e1 cdp-url` — the leg above can go red');
    ok(noBool !== src && load(noBool).classify(['get', '--json', 'true', 'cdp-url']).kind === 'page', 'r2 NEGATIVE CONTROL: a skipper without the optional true/false (patched copy) lets `get --json true cdp-url` through');
  }
  // r3 (browser finding 1, MAJOR): `get --idle-timeout 5m cdp-url` printed the raw endpoint — `--idle-timeout`
  // is a GLOBAL value flag the binary strips anywhere, documented only as an ENVIRONMENT variable, so the r2
  // census over the help's option sections never saw it and the router took its value `5m` for the noun. The
  // flag tables are now MEASURED off the binary (scripts/browser-flag-census.mjs → the checked-in fixture;
  // test-browser-mediation-chrome re-measures the installed binary), `get` passes only a noun it READS, and a
  // flag the table does not know is read BOTH ways.
  {
    const GF = JSON.parse(fs.readFileSync(path.join(FIX, `global-flags-${TV}.json`), 'utf8'));
    const GF0 = JSON.parse(fs.readFileSync(path.join(FIX, 'global-flags-0.32.0.json'), 'utf8'));   // r3's evidence (the finding was measured on 0.32.0)
    const help0 = fs.readFileSync(path.join(FIX, 'help-0.32.0.txt'), 'utf8');
    const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
    ok(GF.version === TV && GF.candidates >= 500 && GF.value.length >= 30 && GF.bool.length >= 15 && GF.localCount >= 500, `r3: the measured census is non-vacuous (${GF.candidates} flag-shaped strings probed: ${GF.value.length} value, ${GF.bool.length} boolean, ${GF.localCount} non-global)`);
    const cfgOther = (GF.other || []).find((o) => o.flag === '--config');
    ok(same(V.VALUE_FLAGS, [...GF.value, ...(cfgOther && /config file not found: zzq9/.test(cfgOther.said) ? ['--config'] : [])]), 'r3: VALUE_FLAGS IS the measured value set (+ `--config`, which checks its file before anything — `config file not found: zzq9` is the value swallowed)', JSON.stringify({ missing: GF.value.filter((f) => !V.VALUE_FLAGS.includes(f)), extra: V.VALUE_FLAGS.filter((f) => !GF.value.includes(f) && f !== '--config') }));
    ok(same(V.BOOL_FLAGS, GF.bool), 'r3: BOOL_FLAGS IS the measured boolean set', JSON.stringify({ missing: GF.bool.filter((f) => !V.BOOL_FLAGS.includes(f)), extra: V.BOOL_FLAGS.filter((f) => !GF.bool.includes(f)) }));
    ok(GF0.value.includes('--idle-timeout') && GF.value.includes('--idle-timeout') && !/--idle-timeout/.test((help0.split('\nOptions:')[1] || '').split('\nConfiguration:')[0]) && /AGENT_BROWSER_IDLE_TIMEOUT_MS/.test(help0), 'r3: the finding\'s flag is a measured VALUE flag the 0.32.0 help listed only as an environment variable — why a census of the help\'s option sections was blind to it (still measured a value flag on the table\'s version)');
    ok(V.LAUNCH_FLAGS.includes('--idle-timeout') && !V.ENV_PASS.includes('AGENT_BROWSER_IDLE_TIMEOUT_MS'), 'r3: `--idle-timeout` is also REFUSED (launch_flag_refused): how long the browser lives is the keeper\'s decision, like its env twin (dropped)');
    // the closed `get` noun set IS the help's `Get Info` row minus the endpoint
    const row = (/\nGet Info:[^\n]*\n\s+([^\n]+)/.exec(help) || [])[1] || '';
    const helpNouns = row.split(',').map((x) => x.trim().split(/\s+/)[0]).filter(Boolean);
    ok(helpNouns.includes('cdp-url') && same(V.GET_NOUNS, helpNouns.filter((x) => x !== 'cdp-url')), `r3: GET_NOUNS is the help's \`Get Info\` row minus cdp-url (${helpNouns.join(' ')})`);
    for (const argv of [['get', '--idle-timeout', '5m', 'cdp-url'], ['get', '--idle-timeout=5m', 'cdp-url'], ['--idle-timeout', '5m', 'get', 'cdp-url'], ['get', '--headers', '{}', 'cdp-url'], ['get', '--model', 'x', 'cdp-url'], ['get', '--device', 'x', 'cdp-url'], ['get', '--screenshot-format', 'png', 'cdp-url'], ['get', '--fix', 'cdp-url'], ['get', '--offline', 'true', 'cdp-url'], ['get', '--quick', 'cdp-url']]) {
      const c = V.classify(argv);
      ok(c.kind === 'refused' && ['raw_cdp_refused', 'launch_flag_refused'].includes(c.code), `r3: \`${argv.join(' ')}\` is refused (${c.code}) — a measured flag's value is never the noun`, JSON.stringify([c.kind, c.code, c.sub]));
    }
    // unknown arity ⇒ both readings: a value-reading that reaches the endpoint (or a refused verb) refuses
    for (const argv of [['get', '--newglobal', 'text', 'cdp-url'], ['get', '--newglobal', '5m', 'cdp-url'], ['--newglobal', 'open', 'get', 'cdp-url'], ['--newglobal', 'open', 'connect', '9222'], ['--newglobal', 'open', 'session', 'list'], ['--newglobal', 'open', 'batch', 'get cdp-url']]) {
      const c = V.classify(argv);
      ok(c.kind === 'refused' && c.code !== 'unknown_verb' && /read as taking a value/.test(c.error), `r3: \`${argv.join(' ')}\` — a flag of unknown arity read as taking a value reaches ${c.code}; refused and SAID`, JSON.stringify([c.kind, c.code, c.error]));
    }
    ok(V.classify(['batch', 'open https://x', 'get --newglobal text cdp-url']).lineCode === 'raw_cdp_refused', 'r3: …inside a batch line too');
    for (const argv of [['get', 'attr', '@e1', 'cdp-url'], ['get', 'text', 'cdp-url'], ['get', '--json', 'title'], ['snapshot', '-i', '-c', '-d', '3'], ['wait', '--url', 'https://x/**'], ['network', 'route', 'https://x', '--abort'], ['get', 'text', '@e1', '--newglobal'], ['--newglobal', 'open', 'https://x'], ['click', '@e3', '--new-tab'], ['open', 'https://x', '--enable', 'react-devtools']]) {
      const c = V.classify(argv);
      ok(c.kind === 'page', `r3 CONTROL: \`${argv.join(' ')}\` stays a page verb (an alternate reading the binary would itself reject is not a refusal)`, JSON.stringify([c.kind, c.code, c.error]));
    }
    for (const argv of [['get', 'ws-url'], ['get', 'devtools-url'], ['get'], ['--', 'get', 'cdp_url'], ['batch', 'get endpoint']]) {
      const c = V.classify(argv);
      ok(c.kind === 'refused' && (c.code === 'unknown_verb' || c.lineCode === 'unknown_verb') && /is not a read this VibeSpace knows/.test(c.error + (c.code === 'batch_line_refused' ? '' : '')) || (c.code === 'batch_line_refused' && c.lineCode === 'unknown_verb'), `r3: \`${argv.join(' ')}\` — a noun \`get\` does not READ is refused (the allow-list; after \`--\` too)`, JSON.stringify([c.kind, c.code, c.lineCode, c.error]));
    }
    // NEGATIVE CONTROLS on patched copies: each r3 piece is load-bearing
    const src = fs.readFileSync(path.join(REPO, 'src/browser-verbs.js'), 'utf8');
    const load = (code) => { const m = { exports: {} }; new Function('module', 'exports', 'require', code)(m, m.exports, require); return m.exports; };
    const noAllow = src.replace("if (verb === 'get' && !GET_NOUN_SET.has(sub)) {", "if (false) {");
    const noReadings = src.replace('if (!body.some(ua)) return primary;', 'return primary;');
    const r2Table = noAllow.replace('if (!body.some(ua)) return primary;', 'return primary;').replace("'--headers', '--idle-timeout', '--init-script'", "'--headers', '--init-script'").replace(", '--hide-scrollbars', '--idle-timeout', ", ", '--hide-scrollbars', "); // (lane H: LAUNCH_FLAGS gained 0.38.1's three after it)
    ok(r2Table !== noAllow && load(r2Table).classify(['get', '--idle-timeout', '5m', 'cdp-url']).kind === 'page', 'r3 NEGATIVE CONTROL: the r2 shape (no `--idle-timeout` in the tables, the blocklist noun rule) passes the finding\'s spelling — the legs above can go red');
    ok(noAllow !== src && load(noAllow).classify(['get', 'ws-url']).kind === 'page', 'r3 NEGATIVE CONTROL: without the allow-list an endpoint-shaped noun passes as a read');
    ok(noReadings !== src && load(noReadings).classify(['get', '--newglobal', 'text', 'cdp-url']).kind === 'page' && load(noReadings).classify(['--newglobal', 'open', 'connect', '9222']).kind === 'page', 'r3 NEGATIVE CONTROL: without every-reading judgement a flag of unknown arity smuggles the endpoint noun (and a refused verb) past');
  }
  const unk = V.classify(['frobnicate']);
  ok(unk.kind === 'refused' && unk.code === 'unknown_verb' && /vibespace-browser -- <verb>/.test(unk.remedy), 'an unknown verb ⇒ unknown_verb pointing at the `--` valve');
  const esc = V.classify(['--', 'frobnicate', 'x']);
  ok(esc.kind === 'escape' && esc.verb === 'frobnicate', '…and after `--` it passes as escape');
  ok(V.classify(['--', 'connect', '9222']).code === 'raw_cdp_refused' && V.classify(['--', 'frobnicate', '--session', 'x']).code === 'identity_flag_refused', 'the SAME rules after `--` (a refused verb, a refused flag on an escape)');

  for (const f of V.IDENTITY_FLAGS) ok(V.classify([f, 'x', 'snapshot']).code === 'identity_flag_refused' && V.classify(['snapshot', f + '=x']).code === 'identity_flag_refused', `${f} ⇒ identity_flag_refused (before the verb, and as --flag=value after it)`);
  for (const f of V.RAW_CDP_FLAGS) ok(V.classify([f, '9222', 'snapshot']).code === 'raw_cdp_refused', `${f} ⇒ raw_cdp_refused`);
  for (const f of V.LAUNCH_FLAGS) {
    const c = V.classify(['snapshot', f, 'x']);
    ok(c.kind === 'refused' && c.code === 'launch_flag_refused' && /Settings → Agent browser/.test(c.remedy), `${f} beside a page verb ⇒ launch_flag_refused`);
  }
  ok(V.classify(['open', 'https://x', '--enable', 'react-devtools']).kind === 'page' && V.classify(['--init-script', './a.js', 'open', 'https://x']).kind === 'page', '--enable / --init-script PASS beside `open` (per-page, D12)');
  ok(V.classify(['snapshot', '--enable', 'react-devtools']).code === 'launch_flag_refused', '…and only beside `open`');
  ok(['--json', '--annotate', '-i', '-c', '--full', '--max-output'].every((f) => V.classify(['snapshot', f, ...(f === '--max-output' ? ['400'] : [])]).kind === 'page'), 'output flags pass through');
  const pr = V.classify(['--profile', 'work', 'click', '@e1']), pr2 = V.classify(['click', '@e1', '--profile=work']), pr3 = V.classify(['--', 'click', '--profile', 'work', '@e1']);
  ok(pr.profile === 'work' && pr2.profile === 'work' && pr3.profile === 'work' && !pr.argv.includes('--profile') && !pr3.argv.includes('--profile') && pr3.kind === 'page', '`--profile <h>` is OURS anywhere (before, after, past `--`) and never reaches the page argv');
  ok(V.classify(['--profile', 'work', 'detach']).kind === 'ours', '…and an OURS verb behind it is still ours');

  const b1 = V.classify(['batch', 'open https://x', 'snapshot -i', 'click @e3']);
  ok(b1.kind === 'page' && b1.verb === 'batch' && b1.lines === 3, 'a clean batch is a page verb');
  const b2 = V.classify(['batch', '--bail', 'open https://x', 'get cdp-url', 'click @e1']);
  ok(b2.kind === 'refused' && b2.code === 'batch_line_refused' && b2.line === 2 && b2.lineCode === 'raw_cdp_refused' && /batch line 2/.test(b2.error) && /nothing in the batch ran/.test(b2.error), 'ONE refused line refuses the whole batch and names it (line 2, raw_cdp_refused)');
  ok(V.classify(['batch', 'open "https://x"', 'snapshot --session other']).lineCode === 'identity_flag_refused', 'a line\'s flags are judged too');
  ok(V.classify(['batch', 'open x', 'fill @e1 "a b" --profile /tmp/p']).lineCode === 'identity_flag_refused', 'inside a batch `--profile` is the browser CLI\'s directory flag ⇒ refused');
  ok(V.classify(['batch', 'status']).lineCode === 'unknown_verb' && V.classify(['batch', 'batch "x"']).code === 'batch_line_refused', 'an OURS word or a nested batch in a line is refused');
  const bs = V.classify(['batch']);
  ok(bs.kind === 'page' && bs.needsStdin === true, 'a batch with no line arguments asks for stdin');
  ok(V.classify(['batch'], { stdin: 'open https://x\n\n# note\nconnect 9222\n' }).line === 4, '…and judges the stdin lines it is handed (blank/comment lines skipped, numbering kept)');
  ok(V.classify(['--', 'batch', 'open x', 'deny 3']).lineCode === 'confirmation_is_human', 'the same batch rule after `--`');
  ok(JSON.stringify(V.splitWords(`fill @e1 "a \\"b\\" c" 'd e'`)) === JSON.stringify(['fill', '@e1', 'a "b" c', 'd e']), 'batch lines split like a POSIX shell (quotes, escapes)');

  // r2 (browser finding 2): childEnv — the socket root is IDENTITY (PURE; the CLI legs in ③ run it end to end)
  {
    const B = require('../src/browser-profiles.js');
    const shell = { PATH: '/usr/bin', HOME: '/h', AGENT_BROWSER_SOCKET_DIR: '/tmp/mine', XDG_RUNTIME_DIR: '/tmp/mine' };
    const own = ['AGENT_BROWSER_SESSION=vs-x', 'AGENT_BROWSER_NAMESPACE=vs-x'];
    const e1 = V.childEnv(shell, { spawnEnv: own, env: own, socketDir: '/run/user/7/agent-browser', runtimeDir: '/run/user/7' });
    ok(e1.env.AGENT_BROWSER_SOCKET_DIR === '/run/user/7/agent-browser' && e1.env.XDG_RUNTIME_DIR === '/run/user/7' && e1.dropped.includes('AGENT_BROWSER_SOCKET_DIR') && e1.dropped.includes('XDG_RUNTIME_DIR'), 'r2 PURE: the answer\'s socketDir / runtimeDir replace the shell\'s, and both replacements are reported', JSON.stringify(e1));
    const e2 = V.childEnv(shell, { spawnEnv: own, env: own, unset: ['AGENT_BROWSER_SOCKET_DIR'], socketDir: '/k/ab', runtimeDir: null });
    ok(e2.env.AGENT_BROWSER_SOCKET_DIR === '/k/ab' && !('XDG_RUNTIME_DIR' in e2.env), 'r2 PURE: applied LAST (an `unset` cannot remove it); runtimeDir null removes XDG_RUNTIME_DIR', JSON.stringify(e2.env));
    const e3 = V.childEnv(shell, { spawnEnv: own, env: own });
    ok(!('AGENT_BROWSER_SOCKET_DIR' in e3.env) && e3.env.XDG_RUNTIME_DIR === '/tmp/mine', 'r2 PURE: no socket root in the answer ⇒ the shell\'s SOCKET_DIR is not an output key any more (dropped); XDG untouched', JSON.stringify(e3.env));
    ok(!V.ENV_PASS.includes('AGENT_BROWSER_SOCKET_DIR'), 'r2 PURE: AGENT_BROWSER_SOCKET_DIR is not in ENV_PASS');
    ok(V.hostSocketDirPath('/tmp', 1000) === B.socketDirDecision({ browserKey: 'bk-0000000a', home: '/h', uid: 1000, base: '/tmp' }).dir && B.remoteBrowserPrelude({ browserKey: 'bk-0000000a', socketDirBase: '/tmp' }).includes('vs_ab_s="/tmp/vs-ab-$(id -u)"'), 'r2 PURE: the rung-H shape `<base>/vs-ab-<uid>` is spelled the same as browser-profiles\' decision and the prelude\'s shell text');
    // PURE values, never touched on disk — a base outside /tmp so no literal here reads as a machine-global fixture (test-ci-gate §6)
    const e4 = V.childEnv({ ...shell, AGENT_BROWSER_SOCKET_DIR: '/var/tmp/vs-ab-7' }, { spawnEnv: own, env: [], hostSocketBase: '/var/tmp' }, { uid: 7 });
    const e5 = V.childEnv({ ...shell, AGENT_BROWSER_SOCKET_DIR: '/var/tmp/vs-ab-7' }, { spawnEnv: own, env: [], hostSocketBase: '/var/tmp' }, { uid: 8 });
    ok(e4.env.AGENT_BROWSER_SOCKET_DIR === '/var/tmp/vs-ab-7' && !('AGENT_BROWSER_SOCKET_DIR' in e5.env), 'r2 PURE: rung H keeps only its own uid\'s prelude directory');
  }
  // r3 (takeover finding 2): THE CONFIG FILE — the one rule (sanctionedConfig) and the child env's `config`
  {
    ok(V.sanitizeArgs('--no-sandbox,--ozone-platform=wayland').value === '--no-sandbox,--ozone-platform=wayland' && V.sanitizeArgs('--no-sandbox,--ozone-platform=wayland').dropped.length === 0, 'r3 PURE: args with no raw switch come back byte for byte');
    const sa = V.sanitizeArgs('--no-sandbox,--remote-debugging-port=41999\n--user-data-dir=/x/stolen, --proxy-server=http://p,--remote-debugging-pipe,--remote-allow-origins=*,--profile-directory=Default,--remote-debugging-address=0.0.0.0');
    ok(sa.value === '--no-sandbox,--proxy-server=http://p' && sa.dropped.length === 6, 'r3 PURE: every raw-debugging / user-data-dir / profile-directory switch is dropped (comma or newline separated, the binary\'s own split), the rest kept', JSON.stringify(sa));
    ok(JSON.stringify(V.sanitizeArgs(['--no-sandbox', '--remote-debugging-port=1']).value) === '["--no-sandbox"]' && V.sanitizeArgs(undefined).value === undefined, 'r3 PURE: a list form too; no args ⇒ untouched');
    const sc = V.sanctionedConfig({ user: { args: '--no-sandbox,--remote-debugging-port=9', proxy: 'http://p', executablePath: '/opt/c', extensions: ['/e/a'], cdp: '9222', autoConnect: true, profile: 'Default', allowedDomains: ['a.com'], headed: true },
      project: { args: '--remote-debugging-port=42945', executablePath: '/x/dump', userAgent: 'U', proxy: 'http://evil', extensions: ['/e/b'], plugins: [{ name: 'p', command: 'x' }], cdp: '1', allowedDomains: ['b.com'], confirmActions: 'navigate', actionPolicy: './p.json', maxOutput: 400 },
      deny: ['profile'] });
    ok(sc.config.args === '--no-sandbox' && sc.config.proxy === 'http://p' && sc.config.executablePath === '/opt/c' && JSON.stringify(sc.config.extensions) === '["/e/a"]' && sc.config.headed === true && !('cdp' in sc.config) && !('autoConnect' in sc.config) && !('profile' in sc.config),
      'r3 PURE: the USER file is carried (the machine\'s own args / proxy / executable / extensions) minus the raw CDP keys, the denied keys and the raw switch', JSON.stringify(sc.config));
    ok(JSON.stringify(sc.config.allowedDomains) === '["a.com"]' && sc.config.confirmActions === 'navigate' && sc.config.actionPolicy === './p.json' && sc.config.maxOutput === 400 && !('userAgent' in sc.config) && !('plugins' in sc.config),
      'r3 PURE: the PROJECT file only ADDS restrictions the machine\'s file does not set (confirmActions / actionPolicy / maxOutput); the machine\'s own fence stands; its launch keys, plugins and CDP never land', JSON.stringify(sc.config));
    ok(JSON.stringify(sc.dropped.project.sort()) === JSON.stringify(['allowedDomains', 'args', 'cdp', 'executablePath', 'extensions', 'plugins', 'proxy', 'userAgent']) && JSON.stringify(sc.dropped.keys.sort()) === '["autoConnect","cdp","profile"]' && JSON.stringify(sc.dropped.args) === '["--remote-debugging-port=9"]', 'r3 PURE: …and it says what it dropped, by layer', JSON.stringify(sc.dropped));
    const wide = V.sanctionedConfig({ user: { allowedDomains: ['bank.example'], confirmActions: 'navigate,download' }, project: { allowedDomains: ['*'], confirmActions: '', contentBoundaries: true } });
    ok(JSON.stringify(wide.config.allowedDomains) === '["bank.example"]' && wide.config.confirmActions === 'navigate,download' && wide.config.contentBoundaries === true, 'r3 PURE: a project file cannot WIDEN the machine\'s restrictions (`allowedDomains: ["*"]` / an empty confirmation list do not replace the owner\'s) — it only adds one the machine does not set', JSON.stringify(wide));
    ok(JSON.stringify(V.PROJECT_CONFIG_KEYS) === JSON.stringify(['allowedDomains', 'actionPolicy', 'confirmActions', 'confirmInteractive', 'contentBoundaries', 'maxOutput']), 'r3 PURE: the project allow-list is exactly the narrowing keys');
    const own = ['AGENT_BROWSER_SESSION=vs-x', 'AGENT_BROWSER_NAMESPACE=vs-x', 'AGENT_BROWSER_CONFIG=/data/gen.json'];
    const shell = { PATH: '/usr/bin', HOME: '/h', AGENT_BROWSER_CONFIG: '/tmp/mine.json' };
    const c1 = V.childEnv(shell, { spawnEnv: own, env: own, config: '/data/machine.json', unset: ['AGENT_BROWSER_CONFIG'] });
    ok(c1.env.AGENT_BROWSER_CONFIG === '/data/machine.json' && c1.needsConfig === false && c1.dropped.includes('AGENT_BROWSER_CONFIG'), 'r3 PURE: the answer\'s `config` is set LAST (over the pairs, over an `unset`), and the shell\'s own is reported replaced', JSON.stringify(c1));
    const c2 = V.childEnv(shell, { spawnEnv: own, env: own });
    ok(c2.env.AGENT_BROWSER_CONFIG === '/data/gen.json' && c2.needsConfig === false, 'r3 PURE: no `config` named ⇒ the server\'s own pair (a rung-D generated config) stands');
    const c3 = V.childEnv(shell, { spawnEnv: [], env: [] });
    ok(!('AGENT_BROWSER_CONFIG' in c3.env) && c3.needsConfig === true, 'r3 PURE: neither ⇒ `needsConfig` (the CLI composes one) — the shell\'s file is never kept', JSON.stringify(c3));
  }
  // r4 (takeover finding 1, MAJOR): a verb that NAVIGATES goes to the web only. Measured on 0.32.0 + Chrome
  // 153 (every launch carries --remote-debugging-port=0): `open chrome://version` printed the browser's
  // command line and profile directory, `open file://<that dir>/DevToolsActivePort` its random port and
  // browser GUID — together what `get cdp-url` is refused for; the binary lower-cases `FILE:`, turns
  // `file:/x` and `file:x` into file:///, and navigates `about:version`; a scheme-less word becomes https://
  {
    const LOCAL = [['open', 'chrome://version'], ['open', 'file:///tmp/agent-browser-chrome-x/DevToolsActivePort'], ['open', 'FILE:///etc/hostname'], ['open', 'file:/etc/hostname'], ['open', 'file:etc/hostname'],
      ['open', 'Chrome://version/'], ['open', 'about:version'], ['open', 'ABOUT:Version'], ['open', 'about://version'], ['open', 'view-source:https://x'], ['open', 'javascript:alert(1)'], ['open', 'devtools://devtools/bundled/inspector.html'],
      ['open', 'blob:https://x/1'], ['open', 'filesystem:http://x/temporary/y'], ['open', 'chrome-extension://abc/'], ['open', 'chrome-untrusted://x/'], ['open', 'edge://version'], ['open', 'brave://version'], ['open', 'ws://127.0.0.1:1/'], ['open', 'ftp://x/'],
      ['open', ' file:///etc/hostname'], ['open', 'fi\tle:///etc/hostname'], ['open', 'chrome:\n//version'], ['--json', 'open', 'file:///x'], ['open', '--headers', '{}', 'file:///x'], ['--newglobal', 'open', 'chrome://version'],
      ['tab', 'new', 'file:///x'], ['tab', 'new', 'chrome://version'], ['window', 'new', 'chrome://version'], ['pushstate', 'file:///x'], ['diff', 'url', 'https://a', 'file:///b'], ['read', 'file:///x'], ['vitals', 'chrome://version'],
      ['record', 'start', 'o.webm', 'file:///x'], ['--', 'goto', 'file:///x'], ['--', 'navigate', 'chrome://version'], ['--', 'open', 'file:///x'], ['--', 'frobnicate', 'chrome://version']];
    for (const argv of LOCAL) {
      const c = V.classify(argv);
      ok(c.kind === 'refused' && c.code === 'local_scheme_refused' && /not a page of the web/.test(c.error) && /http\(s\)/.test(c.remedy), `r4: \`${argv.join(' ').replace(/\s/g, (m) => (m === ' ' ? ' ' : JSON.stringify(m).slice(1, -1)))}\` ⇒ local_scheme_refused`, JSON.stringify([c.kind, c.code, c.error]));
    }
    ok(V.classify(['batch', 'open https://x', 'open file:///x']).lineCode === 'local_scheme_refused' && V.classify(['batch'], { stdin: '[["open","https://x"],["open","chrome://version"]]' }).lineCode === 'local_scheme_refused', 'r4: …and a batch line / a stdin batch element that does it refuses the batch');
    const WEB = [['open', 'https://example.com'], ['open', 'http://127.0.0.1:3000/app'], ['open', 'localhost:3000'], ['open', 'example.com/path'], ['open', 'HTTPS://x'], ['open', 'about:blank'], ['open', 'about:blank#x'], ['open', 'about:blank?q'], ['open', 'about:blank/'],
      ['open', 'data:text/html,<title>t</title>'], ['open', 'user:pass@host.example'], ['open', 'mailto:x@y'], ['tab', 'new'], ['tab', 'new', 'https://x'], ['tab', 'close', '2'], ['record', 'start', 'out.webm'], ['diff', 'snapshot'], ['read'], ['vitals', '--json'],
      ['fill', '@e1', 'file:///typed/into/a/field'], ['type', '@e1', 'chrome://settings'], ['get', 'text', '@e1'], ['eval', "document.title"], ['state', 'save', 'x.json']];
    for (const argv of WEB) { const c = V.classify(argv); ok(c.kind === 'page', `r4 CONTROL: \`${argv.join(' ')}\` stays a page verb (the web, a scheme-less host the binary makes https://, or a verb that does not navigate)`, JSON.stringify([c.kind, c.code, c.error])); }
    for (const [u, want] of [['chrome://version', 'chrome'], ['FILE:/x', 'file'], ['localhost:3000', null], ['about:blank', null], ['about:config', 'about'], ['data:,x', null], ['vivaldi://x', 'vivaldi'], ['x-custom://y', 'x-custom'], ['x-custom:y', null], ['', null]]) {
      const h = V.localSchemeOf(u);
      ok((h ? h.scheme : null) === want, `r4 PURE: localSchemeOf(${JSON.stringify(u)}) → ${want || 'the web / scheme-less'}`, JSON.stringify(h));
    }
    // `state load <file>` navigates to every origin the file lists (measured: a crafted file left the page ON
    // chrome://version / file:///etc/ / about:version) — the judge names the file(s), the CLI reads and asks
    const sl = V.classify(['state', 'load', './s.json']);
    ok(sl.kind === 'page' && JSON.stringify(sl.stateFiles) === '["./s.json"]' && JSON.stringify(V.classify(['batch', 'open https://x', 'state load a.json', 'state load --json b.json']).stateFiles) === '["a.json","b.json"]', 'r4: `state load <file>` names the file(s) it loads — in a batch too', JSON.stringify(sl));
    const sv = V.stateFileVerdict({ cookies: [], origins: [{ origin: 'https://ok.example', localStorage: [] }, { origin: 'chrome://version', localStorage: [{ name: 'a', value: 'b' }] }] });
    ok(sv && sv.code === 'local_scheme_refused' && V.stateFileVerdict({ cookies: [{ name: 'a', domain: 'x' }], origins: [{ origin: 'https://ok.example' }] }) === null && V.stateFileVerdict({ sessionStorage: [{ origin: 'FILE:///etc' }] }).code === 'local_scheme_refused', 'r4 PURE: stateFileVerdict refuses a state file naming a local origin anywhere (an `origin` key at any depth), passes the web');
    // NEGATIVE CONTROL: the r3 router (no ⑦) passes the finding's spellings
    const src = fs.readFileSync(path.join(REPO, 'src/browser-verbs.js'), 'utf8');
    const load = (code) => { const m = { exports: {} }; new Function('module', 'exports', 'require', code)(m, m.exports, require); return m.exports; };
    const noNav = src.replace('if (NAV_SET.has(verb) || (escape && !PAGE_SET.has(verb))) {', 'if (false) {');
    ok(noNav !== src && load(noNav).classify(['open', 'chrome://version']).kind === 'page' && load(noNav).classify(['open', 'file:///tmp/x/DevToolsActivePort']).kind === 'page', 'r4 NEGATIVE CONTROL: the r3 router (patched copy, no navigation rule) passes `open chrome://version` and `open file://…/DevToolsActivePort` — the legs above can go red');
  }
  // r4 (takeover finding 3): the stdin form of `batch` — the binary reads ONLY a JSON array of string arrays
  {
    const J = '[["open","https://x"],["get","title"]]';
    const bj = V.classify(['batch'], { stdin: J });
    ok(bj.kind === 'page' && bj.stdinJson === J && bj.lines === 2, 'r4: a JSON stdin batch is judged element by element and handed to the binary VERBATIM', JSON.stringify(bj));
    const pretty = JSON.stringify([['open', 'https://x'], ['snapshot', '-i']], null, 2);
    ok(V.classify(['batch'], { stdin: pretty }).stdinJson === pretty, 'r4: …pretty-printed JSON too (r3 read its first line `[` as a verb)');
    const bl = V.classify(['batch'], { stdin: 'open "https://x/a b"\r\n# c\n\nsnapshot -i\n' });
    ok(bl.kind === 'page' && bl.stdinJson === JSON.stringify([['open', 'https://x/a b'], ['snapshot', '-i']]), 'r4: plain stdin lines are split like a shell and handed over as the JSON of EXACTLY the words judged (CRLF, blank and # lines dropped)', JSON.stringify(bl));
    const be = V.classify(['batch'], { stdin: '[["open","https://x"],["get","cdp-url"]]' });
    ok(be.kind === 'refused' && be.code === 'batch_line_refused' && be.line === 2 && be.lineCode === 'raw_cdp_refused' && /batch command 2/.test(be.error), 'r4: ONE refused element refuses the batch and names its index', JSON.stringify(be));
    ok(V.classify(['batch'], { stdin: '[["get url"]]' }).lineCode === 'unknown_verb', 'r4: an element is ONE word (`["get url"]` is the binary\'s unknown command too — never split)');
    for (const [txt, why] of [['[1]', 'not an array of string arrays'], ['[["open",1]]', 'not an array of string arrays'], ['[["open"', 'does not parse'], ['', 'is empty'], ['\n# only a note\n', 'is empty']]) {
      const c = V.classify(['batch'], { stdin: txt });
      ok(c.kind === 'refused' && c.code === 'batch_stdin_refused' && c.error.includes(why) && /JSON array of string arrays/.test(c.remedy), `r4: stdin ${JSON.stringify(txt)} ⇒ batch_stdin_refused (${why})`, JSON.stringify(c));
    }
  }
  // r4 (takeover finding 6): the flag table is a measurement of ONE version — another build ⇒ every flag read
  // both ways (the CLI reads the version off the binary it runs; the ③ legs drive it end to end)
  {
    const GF = JSON.parse(fs.readFileSync(path.join(FIX, `global-flags-${V.TABLE_VERSION}.json`), 'utf8'));
    ok(V.TABLE_VERSION === GF.version, `r4: TABLE_VERSION is the measured fixture's version (${V.TABLE_VERSION})`);
    ok(V.versionDrift(`agent-browser ${V.TABLE_VERSION}\n`) === null && V.versionDrift('agent-browser 0.33.1') === '0.33.1' && V.versionDrift('') === 'unknown' && V.versionDrift(null) === 'unknown', 'r4 PURE: versionDrift — the table\'s version ⇒ none; another ⇒ it; unreadable ⇒ "unknown" (never trusted)');
    const d = V.classify(['get', '--json', 'text', 'cdp-url'], { drift: '0.33.0' });
    ok(V.classify(['get', '--json', 'text', 'cdp-url']).kind === 'page' && d.kind === 'refused' && d.code === 'raw_cdp_refused' && /0\.33\.0/.test(d.error) && d.error.includes('measured on ' + V.TABLE_VERSION), 'r4: `get --json text cdp-url` is a read on the measured table (a <cdp-url> element\'s text) — under a drift `--json` may take a value, the other reading is the endpoint: refused and SAID', JSON.stringify(d));
    ok(V.classify(['batch', 'get --json text cdp-url'], { drift: '0.33.0' }).lineCode === 'raw_cdp_refused', 'r4: …inside a batch line too');
    for (const argv of [['get', '--json', 'text', '@e1'], ['snapshot', '-i', '-c'], ['--max-output', '400', 'snapshot'], ['open', 'https://x'], ['click', '@e3']]) {
      const c = V.classify(argv, { drift: '0.33.0' });
      ok(c.kind === 'page', `r4 CONTROL: under a drift \`${argv.join(' ')}\` stays a page verb (a reading the binary would itself reject refuses nothing)`, JSON.stringify([c.kind, c.code, c.error]));
    }
  }
  // r4 (takeover finding 4): the legacy keep never kept the shell's config — an answer with neither spawn
  // pairs nor a config composes one
  {
    const lg = V.childEnv({ AGENT_BROWSER_CONFIG: '/tmp/mine.json', AGENT_BROWSER_SESSION: 'vs-x' }, { ok: true, kind: 'none', env: [] });
    ok(!('AGENT_BROWSER_CONFIG' in lg.env) && lg.needsConfig === true && lg.dropped.includes('AGENT_BROWSER_CONFIG') && lg.env.AGENT_BROWSER_SESSION === 'vs-x' && !V.ENV_LEGACY_KEEP.includes('AGENT_BROWSER_CONFIG'), 'r4: an answer with no spawnEnv and no config drops the shell\'s AGENT_BROWSER_CONFIG, says so, and asks for a composed one (SESSION still kept, as before)', JSON.stringify(lg));
    const src = fs.readFileSync(path.join(REPO, 'src/browser-verbs.js'), 'utf8');
    const load = (code) => { const m = { exports: {} }; new Function('module', 'exports', 'require', code)(m, m.exports, require); return m.exports; };
    const r3 = src.replace("const ENV_LEGACY_KEEP = Object.freeze(['AGENT_BROWSER_SESSION', 'AGENT_BROWSER_NAMESPACE', 'AGENT_BROWSER_PROFILE',", "const ENV_LEGACY_KEEP = Object.freeze(['AGENT_BROWSER_SESSION', 'AGENT_BROWSER_NAMESPACE', 'AGENT_BROWSER_CONFIG', 'AGENT_BROWSER_PROFILE',");
    const lc = r3 !== src && load(r3).childEnv({ AGENT_BROWSER_CONFIG: '/tmp/mine.json' }, { ok: true, kind: 'none', env: [] });
    ok(lc && lc.env.AGENT_BROWSER_CONFIG === '/tmp/mine.json' && lc.needsConfig === false, 'r4 NEGATIVE CONTROL: the r3 legacy keep (patched copy) hands the binary the agent\'s decoy file and composes nothing', JSON.stringify(lc));
  }
  // lane L r2: an upload NAMES its files, and a credential store is refused by name
  {
    const u = V.classify(['upload', '@e1', '~/.ssh/id_rsa']);
    ok(u.kind === 'page' && JSON.stringify(u.uploadFiles) === '["@e1","~/.ssh/id_rsa"]', 'lane L r2 PURE: `upload @e1 <file>` names every positional word after `upload` (the selector too — over-naming never refuses a non-path)', JSON.stringify(u));
    ok(JSON.stringify(V.classify(['batch', 'open https://x', 'upload @e1 a.txt b.txt']).uploadFiles) === '["@e1","a.txt","b.txt"]' && JSON.stringify(V.classify(['--', 'upload', '--json', '@e1', 'k']).uploadFiles) === '["@e1","k"]' && JSON.stringify(V.classify(['--newglobal', 'upload', '@e1', 'k']).uploadFiles) === '["@e1","k"]', 'lane L r2 PURE: …in a batch line, after `--`, and past a flag of unknown arity (reading-independent)');
    ok(V.classify(['click', '@e1']).uploadFiles === undefined && V.classify(['upload', '@e1', 'x', '--cdp', '1']).kind === 'refused', 'lane L r2 PURE: a verb that uploads nothing names nothing; a refused command stays refused');
    const roots = V.secretUploadRoots({ homes: ['/home/u', '/home/u/'], dataDir: '/srv/vs/data' });
    ok(JSON.stringify(roots.map((r) => r.dir)) === JSON.stringify(['/home/u/.claude', '/home/u/.ssh', '/home/u/.vibespace', '/home/u/.codex', '/srv/vs/data/subs', '/srv/vs/data/codex-subs']), 'lane L r2 PURE: the roots — ~/.claude ~/.ssh ~/.vibespace ~/.codex per home (deduped) + the data dir\'s account stores', JSON.stringify(roots));
    const v = V.uploadPathVerdict([{ file: '~/.ssh/id_rsa', paths: ['/home/u/.ssh/id_rsa'] }], roots);
    ok(v && v.code === 'upload_secret_refused' && /under ~\/\.ssh/.test(v.error) && /nothing ran/.test(v.error) && v.remedy, 'lane L r2 PURE: an upload of ~/.ssh/id_rsa ⇒ refused BY NAME (upload_secret_refused, the store named, a remedy)', JSON.stringify(v));
    ok(V.uploadPathVerdict([{ file: 'x.txt', paths: ['/tmp/x.txt', '/home/u/.claude/.credentials.json'] }], roots)?.code === 'upload_secret_refused' && /<VibeSpace data>\/subs/.test(V.uploadPathVerdict([{ file: 'c', paths: ['/srv/vs/data/subs/a/.credentials.json'] }], roots)?.error || ''), 'lane L r2 PURE: a realpath into a store is the store; the account stores are named');
    ok(V.uploadPathVerdict([{ file: 'report.pdf', paths: ['/home/u/work/report.pdf'] }, { file: '@e1', paths: ['/home/u/work/@e1'] }], roots) === null && V.uploadPathVerdict([{ file: 'x', paths: ['/home/u/.sshx/k', '/home/u/.claude-notes/a', '/srv/vs/data/subsidies.txt'] }], roots) === null, 'lane L r2 CONTROL: a normal path passes; a sibling that only SHARES a prefix (~/.sshx, ~/.claude-notes, data/subsidies.txt) is not a store');
  }
  // lane L r4 (the verifier's WRITE finding): a WRITE names its output path, and a path outside the project /
  // /tmp / ~/Downloads (or into a store) is refused by name — the write-direction twin of the upload guard
  {
    // ── the CENSUS: every TOP-LEVEL command row of the --help whose signature names a `<path>`/`[path]` is
    // a writer this table must classify (WRITE_VERBS), so a writer a newer build adds cannot slip in
    // unclassified. Sub-section rows (`network …`, `record …` families spelled `<cli> <verb> <`) are skipped,
    // exactly as the verb census above does; `har <start|stop> [path]` lives under the Network family, so its
    // writer is the top-level `network`. `<path.webm…>` counts; a `[url]` never does.
    const help = fs.readFileSync(path.join(FIX, 'help-0.32.0.txt'), 'utf8');
    const head = help.split(/\nSnapshot Options:/)[0];
    const helpWriters = new Set();
    let sub = false;
    for (const line of head.split('\n')) {
      if (/^\S/.test(line)) { sub = new RegExp(V.REAL_BINARY + ' \\w+ <').test(line); continue; }
      const m = /^ {2}([a-z][a-z0-9-]*)(?=[\s[]|$)/.exec(line);
      if (!m || sub) continue;
      if (/<path[^>]*>|\[path\]/.test(line)) helpWriters.add(m[1]);
    }
    const registered = new Set(Object.keys(V.WRITE_VERBS));
    const missing = [...helpWriters].filter((w) => !registered.has(w));
    ok(helpWriters.size >= 5 && missing.length === 0, `lane L r4 CENSUS: every top-level help <path> writer is in WRITE_VERBS (${[...helpWriters].sort().join(' ')}; missing: ${missing.join(', ') || 'none'})`, JSON.stringify([...helpWriters]));
    ok(['download', 'pdf', 'screenshot', 'record', 'trace', 'profiler'].every((w) => registered.has(w)) && ['state', 'network'].every((w) => registered.has(w)), 'lane L r4 CENSUS: the positional writers, the sub writers (state save) and the har writer (network) are all registered');
    // a FAKE new writer NOT in WRITE_VERBS names no target — the census (above) is what must list it
    ok(!('exfil' in V.WRITE_VERBS) && V.classify(['exfil', '@e1', '/etc/x']).writeFiles === undefined && !V.known('exfil'), 'lane L r4 CENSUS: an UNregistered verb names no write target — a new writer only becomes classified by being added to WRITE_VERBS (and the census reddens if the help lists it and the table does not)');
    // ── writeTargetsAt through classify: every writer names its path; a reader / non-writer names nothing
    const wf = (a) => { const c = V.classify(a); return c.writeFiles; };
    ok(JSON.stringify(wf(['download', '#k', '/x/y'])) === '["#k","/x/y"]', 'lane L r4 PURE: `download <sel> <path>` names both positionals (the selector too — over-naming never refuses a non-path)');
    ok(JSON.stringify(wf(['pdf', '/x/y.pdf'])) === '["/x/y.pdf"]' && JSON.stringify(wf(['screenshot', '@e1', 'shot.png'])) === '["@e1","shot.png"]' && wf(['screenshot']) === undefined, 'lane L r4 PURE: pdf / screenshot name the path; a screenshot with none (temp dir) names nothing');
    ok(JSON.stringify(wf(['state', 'save', '/x.json'])) === '["/x.json"]' && wf(['state', 'load', '/x.json']) === undefined && wf(['state', 'list']) === undefined, 'lane L r4 PURE: `state save` names its path; `state load` (a READ) and `state list` name nothing');
    ok(JSON.stringify(wf(['record', 'start', '/x.webm', 'https://y'])) === '["/x.webm","https://y"]' && wf(['record', 'stop']) === undefined, 'lane L r4 PURE: `record start <path> [url]` names both; `record stop` names nothing');
    ok(JSON.stringify(wf(['trace', 'stop', '/x.json'])) === '["/x.json"]' && JSON.stringify(wf(['profiler', 'stop', '/x.json'])) === '["/x.json"]' && wf(['trace', 'start']) === undefined, 'lane L r4 PURE: `trace stop` / `profiler stop` name the path; `trace start` names nothing');
    ok(JSON.stringify(wf(['network', 'har', 'stop', '/x.har'])) === '["/x.har"]' && wf(['network', 'har', 'start']) === undefined, 'lane L r4 PURE: `network har stop [path]` names the path; `har start` names nothing');
    ok(JSON.stringify(wf(['screenshot', '--screenshot-dir', '/z'])) === '["/z"]' && JSON.stringify(wf(['diff', 'screenshot', '--baseline', 'b.png', '-o', '/x/out.png'])) === '["/x/out.png"]', 'lane L r4 PURE: the write-target FLAGS — `--screenshot-dir <dir>`, `diff … -o <file>` — name their value (baseline is a read, not named)');
    ok(JSON.stringify(V.classify(['batch', 'open https://x', 'pdf /a.pdf', 'download #k /b']).writeFiles) === '["/a.pdf","#k","/b"]' && JSON.stringify(V.classify(['--', 'download', '#k', '/c']).writeFiles) === '["#k","/c"]', 'lane L r4 PURE: a batch collects write targets from every line; `-- <writer>` (the escape) too');
    ok(wf(['click', '@e1']) === undefined && wf(['type', '@e1', '/etc/passwd']) === undefined && wf(['read', 'https://x']) === undefined, 'lane L r4 PURE: a non-writer names nothing — `type @e1 /etc/passwd` (a path typed into a field) is not a write');
    // ── writePathVerdict: containment + the store deny (on the RESOLVED path)
    const opt = { allow: ['/home/u/proj', '/tmp', '/home/u/Downloads'], homes: ['/home/u', '/root'], dataDir: '/srv/vs/data' };
    const pv = (paths) => V.writePathVerdict([{ file: paths[0], paths }], opt);
    ok(pv(['/home/u/proj/out.pdf']) === null && pv(['/tmp/x.pdf']) === null && pv(['/home/u/Downloads/x.pdf']) === null, 'lane L r4 PURE: the project cwd, /tmp and ~/Downloads are ALLOWED');
    for (const [p, why] of [[['/home/u/.ssh/authorized_keys'], '~/.ssh'], [['/home/u/.claude/settings.json'], '~/.claude'], [['/home/u/.bashrc'], '~/.bashrc'], [['/home/u/.config/foo'], '~/.config'], [['/root/.ssh/k'], '~/.ssh'], [['/srv/vs/data/subs/a'], '<VibeSpace data>/subs'], [['/srv/vs/data/codex-subs/a'], '<VibeSpace data>/codex-subs']]) {
      const v = pv(p);
      ok(v && v.code === 'write_path_refused' && v.error.includes(`under ${why}`) && /nothing ran/.test(v.error) && v.remedy, `lane L r4 PURE: a write to ${p[0]} ⇒ write_path_refused (under ${why})`, JSON.stringify(v));
    }
    ok(pv(['/etc/passwd'])?.code === 'write_path_refused' && /outside the places/.test(pv(['/etc/passwd']).error), 'lane L r4 PURE: a path in no allowed root (/etc) ⇒ write_path_refused with the containment sentence');
    ok(pv(['/home/u/proj/link', '/home/u/.ssh/k'])?.code === 'write_path_refused' && pv(['/home/u/proj/link', '/home/u/.ssh/k']).error.includes('~/.ssh'), 'lane L r4 PURE: a symlink from the project into ~/.ssh (abs in the project, realpath in the store) is refused BY THE STORE — the RESOLVED path is judged');
    // project cwd IS $HOME: containment would allow ~/.ssh, the store deny still refuses it
    const opth = { allow: ['/home/u', '/tmp'], homes: ['/home/u'], dataDir: '/srv/vs/data' };
    ok(V.writePathVerdict([{ file: 'k', paths: ['/home/u/.ssh/authorized_keys'] }], opth)?.code === 'write_path_refused' && V.writePathVerdict([{ file: 'n', paths: ['/home/u/notes.txt'] }], opth) === null, 'lane L r4 PURE: with the project cwd = $HOME, ~/.ssh is still refused (the store deny is unconditional) while ~/notes.txt is allowed');
    ok(V.writePathVerdict([], opt) === null && V.writePathVerdict([{ file: 'x', paths: [] }], opt) === null, 'lane L r4 CONTROL: no candidates / no paths ⇒ nothing to refuse');
  }
  // lane L r5 (verify r3 F1–F6): THE FRAME RULE — a path is judged and written in the SAME frame
  {
    const sl = (a) => V.pathSlots(a).map((x) => `${x.kind}:${a[x.i]}`).join(' ');
    // the measured table (real 0.38.1, daemon started in A, commands from B)
    ok(sl(['download', '#k', './d1', './d2']) === 'write:./d1 write:./d2', 'lane L r5 PURE: `download <sel> <path> [more]` — every word after the selector is a slot (measured: `download #k d1 d2` SAVED d1 — "the last positional" would have left d1 relative); the selector never', sl(['download', '#k', './d1', './d2']));
    ok(sl(['screenshot', '@e1', 'o.png']) === 'write:o.png' && sl(['screenshot', '#b', 'c1.png', 'c2.png']) === 'write:c1.png write:c2.png', 'lane L r5 PURE: `screenshot <sel> <path>` — two words ⇒ the second (measured: `#b c1.png c2.png` saved c1.png) and any after it');
    const lone = ['noext', '.btn', 'a.b', 'x.gif', 'x.pdf', '@e1', '#b', '~'];
    ok(lone.every((w) => sl(['screenshot', w]) === ''), `lane L r5 PURE: ONE screenshot word that the binary reads as a SELECTOR is never rewritten (measured "Element not found" for ${lone.join(' ')})`);
    const paths = ['x.png', 'x.jpg', 'x.jpeg', 'x.webp', './noext', 'sub/noext', '/abs/noext', '~x.png', 'X.PNG'];
    ok(paths.every((w) => sl(['screenshot', w]) === `write:${w}`), `lane L r5 PURE: ONE screenshot word is a path when it holds a \`/\` or ends .png/.jpg/.jpeg/.webp (measured on 0.38.1; X.PNG case-insensitively — a superset) (${paths.join(' ')})`);
    ok(sl(['screenshot', '--threshold', '0.2', '@e1', 'o.png']) === 'write:o.png' && sl(['screenshot', '--full', 'z.png']) === 'write:z.png' && sl(['screenshot', 'o.png', '--threshold', '0.2']) === 'write:o.png', 'lane L r5 PURE: a verb\'s own value flag (`--threshold <n>`) takes its value, never a slot; a boolean (`--full`) takes nothing');
    ok(sl(['record', 'start', './v.webm', 'https://x', '--fps', '30']) === 'write:./v.webm' && sl(['record', 'restart', 'v.mp4']) === 'write:v.mp4' && sl(['record', 'stop']) === '', 'lane L r5 PURE: `record start|restart <path> [url]` — the FIRST word after the sub only (a URL is never rewritten)');
    ok(sl(['pdf', './p.pdf']) === 'write:./p.pdf' && sl(['state', 'save', './s.json']) === 'write:./s.json' && sl(['state', 'load', 's.json']) === 'read:s.json' && sl(['state', 'list']) === '' && sl(['trace', 'stop', './t.json']) === 'write:./t.json' && sl(['profiler', 'stop', 'p.json']) === 'write:p.json' && sl(['trace', 'start']) === '' && sl(['network', 'har', 'stop', 'h.har']) === 'write:h.har' && sl(['network', 'har', 'start']) === '', 'lane L r5 PURE: pdf / state save / trace·profiler stop / network har stop are write slots; `state load` a READ slot');
    ok(sl(['upload', '@e1', 'a.png', './b.png']) === 'read:a.png read:./b.png', 'lane L r5 PURE: `upload <sel> <files…>` — every file is a READ slot (the upload guard\'s twin frame), the selector never');
    ok(sl(['screenshot', '--screenshot-dir', './shots']) === 'write:./shots' && sl(['diff', 'screenshot', '--baseline', 'b.png', '-o', 'o.png']) === 'read:b.png write:o.png' && sl(['diff', 'snapshot', '-b', 'snap.txt']) === 'read:snap.txt' && sl(['open', 'https://x', '--init-script', './i.js']) === 'read:./i.js' && sl(['cookies', 'set', '--curl', './c.txt']) === 'read:./c.txt', 'lane L r5 PURE: the flag slots — `--screenshot-dir` / `-o` (write), diff\'s `-b/--baseline`, open\'s `--init-script`, cookies\' `--curl` (read)');
    ok(sl(['click', '@e1']) === '' && sl(['type', '@e1', './x']) === '' && sl(['open', 'https://x']) === '' && sl(['batch', 'pdf ./x']) === '' && sl(['cookies', 'set', 'n', 'v', '--path', '/api']) === '' && sl(['batch', '-b', 'open https://x']) === '', 'lane L r5 PURE: a word that is not a path is never a slot (a typed value, a URL, a batch line — its own command is framed —, a cookie\'s --path, batch\'s -b)');
    const w1 = ['screenshot', '--screenshot-dir=./shots', '@e1', 'o.png'];
    ok(JSON.stringify(V.rewriteSlots(w1, V.pathSlots(w1), (x) => '/abs/' + x.word)) === JSON.stringify(['screenshot', '--screenshot-dir=/abs/./shots', '@e1', '/abs/o.png']), 'lane L r5 PURE: rewriteSlots keeps a `--flag=value` form\'s prefix and touches nothing else');
    const judged = [['download', '#k', './d1', './d2'], ['screenshot', '@e1', 'o.png'], ['screenshot', 'x.png'], ['record', 'start', 'v.webm', 'https://x'], ['state', 'save', 's.json'], ['trace', 'stop', 't.json'], ['network', 'har', 'stop', 'h.har'], ['screenshot', '--screenshot-dir=./d'], ['diff', 'screenshot', '--baseline', 'b.png', '-o', 'o.png'], ['--', 'pdf', 'e.pdf'], ['wait', '--download', './w.pdf'], ['wait', '--download=./w.pdf']];
    const unjudged = judged.filter((a) => { const c = V.classify(a); const body = a[0] === '--' ? a.slice(1) : a; const wf = c.writeFiles || []; return !V.pathSlots(body).filter((x) => x.kind === 'write').every((x) => wf.includes(x.word)); });
    ok(unjudged.length === 0, `lane L r5 PURE: every WRITE slot is also a word the router names for judging (over-naming ⊇ exact) (${JSON.stringify(unjudged)})`);
    // physicalPath over a FAKE filesystem (lstat / readlink injected)
    const FSX = { '/h': 'd', '/h/.ssh': 'd', '/p': 'd', '/p/sub': 'd', '/p/l': '/h/.ssh', '/p/r': '../h', '/p/loop': '/p/loop', '/p/dang': '/h/.ssh/newkey', '/p/e': '/etc', '/etc': 'd' };
    const lstat = (q) => { if (!Object.prototype.hasOwnProperty.call(FSX, q)) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; } const v = FSX[q]; return { isSymbolicLink: () => v !== 'd', isDirectory: () => v === 'd' }; };
    const readlink = (q) => FSX[q];
    const pp = (w, base = '/p') => V.physicalPath(w, { base, home: '/h', lstat, readlink });
    ok(pp('l/../.ssh/authorized_keys').path === '/h/.ssh/authorized_keys' && path.posix.resolve('/p', 'l/../.ssh/authorized_keys') === '/p/.ssh/authorized_keys', 'lane L r5 F2 PURE: `l/../.ssh/authorized_keys` with l -> ~/.ssh is ~/.ssh/authorized_keys — the `..` steps up from where l POINTS (the lexical r4 rule said <cwd>/.ssh/authorized_keys)', JSON.stringify(pp('l/../.ssh/authorized_keys')));
    ok(pp('e/../etc/cron.d/x').path === '/etc/cron.d/x' && pp('r/.ssh/k').path === '/h/.ssh/k', 'lane L r5 F2 PURE: the verifier\'s `e -> /etc` spelling, and a RELATIVE link target resolved from the link\'s own directory');
    ok(pp('dang').path === '/h/.ssh/newkey', 'lane L r5 F2 PURE: a DANGLING final link is followed (a write through it creates its target — open(O_CREAT) follows it)');
    ok(pp('loop/x').ok === false && /symbolic links/.test(pp('loop/x').error) && pp('a\0b').ok === false, 'lane L r5 F2 PURE: a link loop and a NUL are errors, never a path');
    ok(pp('~/x').path === '/h/x' && pp('~').path === '/h' && pp('~root/x').path === '/p/~root/x' && pp('/abs/../etc/./x').path === '/etc/x' && pp('sub/../x').path === '/p/x' && pp('nope/../sub/y').path === '/p/sub/y', 'lane L r5 PURE: `~` / `~/…` are the home (the binary never expands them — F4), `~user` literal (the binary\'s reading too), `.`/`..` without a link are plain');
    // writePathVerdict: F3 the fence is the SESSION's, F6 a root inside a dot-dir wins, the named stores anywhere
    const H = '/home/u';
    const wv = (q, root) => V.writePathVerdict([{ file: q, paths: [q] }], { allow: ['/tmp', `${H}/Downloads`], homes: [H], dataDir: '/srv/vs/data', sessionRoot: root });
    ok(wv(`${H}/proj/x.pdf`, null)?.code === 'write_path_refused' && /no session directory is known/.test(wv(`${H}/proj/x.pdf`, null).error) && wv('/tmp/x.pdf', null) === null && wv(`${H}/Downloads/x.pdf`, null) === null, 'lane L r5 F3 PURE: no session root ⇒ only /tmp and ~/Downloads — never "wherever the shell stands"');
    ok(wv(`${H}/proj/x.pdf`, `${H}/proj`) === null && /the project directory \(\/home\/u\/proj\)/.test(wv('/etc/cron.d/x', `${H}/proj`)?.error || '') && /no session directory/.test(wv('/x.pdf', '/')?.error || ''), 'lane L r5 F3 PURE: with the root the project writes; a path beside it is refused naming it; a root of `/` is no root');
    ok(wv(`${H}/.config/nvim/init.lua`, `${H}/.config/nvim`) === null && wv(`${H}/.local/share/proj/x`, `${H}/.local/share/proj`) === null, 'lane L r5 F6 PURE: a project under a dot-directory (~/.config/nvim, ~/.local/share/proj) writes under its own root');
    ok(/~\/\.config/.test(wv(`${H}/.config/autostart/x.desktop`, `${H}/.config/nvim`)?.error || '') && /~\/\.bashrc/.test(wv(`${H}/.bashrc`, H)?.error || ''), 'lane L r5 F6 PURE: …never beside it (~/.config/autostart), and a root of $HOME never opens ~/.bashrc');
    const inRoot = [`${H}/.config/nvim/.ssh/k`, `${H}/.config/nvim/.git/hooks/pre-commit`, `${H}/.config/nvim/.claude/settings.json`, `${H}/.config/nvim/.codex/auth.json`, `${H}/.config/nvim/.vibespace/x`];
    ok(inRoot.every((q) => wv(q, `${H}/.config/nvim`)?.code === 'write_path_refused') && wv(`${H}/.ssh/k`, `${H}/.ssh`)?.code === 'write_path_refused', 'lane L r5 F6 PURE: the named stores stay refused INSIDE a winning root (and a root that IS ~/.ssh opens nothing)');
    ok(/a \.git directory/.test(wv(`${H}/proj/.git/hooks/pre-commit`, `${H}/proj`)?.error || '') && /a \.claude directory/.test(wv(`${H}/proj/.claude/settings.json`, `${H}/proj`)?.error || ''), 'lane L r5 PURE: a project\'s .git (hooks git runs) and .claude (settings whose hooks run commands) are stores wherever they stand');
    ok(/<VibeSpace data>/.test(wv('/srv/vs/data/bin/vibespace-hook.mjs', '/srv/vs')?.error || '') && /<VibeSpace data>/.test(wv('/srv/vs/data/auth.json', '/srv/vs')?.error || '') && wv('/srv/vs/src/x.js', '/srv/vs') === null, 'lane L r5 PURE: VibeSpace\'s whole data dir is refused even when the project IS the checkout (data/bin/vibespace-hook.mjs runs in every session); the checkout\'s source is the project\'s');
    ok(wv(`${H}/proj/.gitignore`, `${H}/proj`) === null && wv(`${H}/proj/x.git/y`, `${H}/proj`) === null && wv('/srv/vs/database/x', '/srv/vs') === null && wv(`${H}/proj/.btn`, `${H}/proj`) === null, 'lane L r5 CONTROL: a name that only SHARES a prefix (.gitignore, x.git, database) or another dot name (.btn — a class selector a screenshot names) is not a store');
    ok(V.writePathVerdict([{ file: 'x', paths: [`${H}/.config/nvim/x`] }], { allow: ['/tmp', `${H}/.config/nvim`], homes: [H] })?.code === 'write_path_refused', 'lane L r5 F6 CONTROL: the same write with the root only on the allow list (the r4 shape — no `sessionRoot`) is refused by the dot rule: the exemption is what admits it');
    // daemonCwdVerdict: a daemon never runs in the checkout
    const dv = (d) => V.daemonCwdVerdict(d, { checkout: '/srv/vs', serverCwd: '/srv/run' });
    ok(['/srv/vs', '/srv/vs/data', '/srv', '/', '/srv/run', 'rel'].every((d) => dv(d)?.code === 'daemon_cwd_refused') && dv('/tmp/vibespace-browser-cwd-1000') === null && /inside the VibeSpace checkout/.test(dv('/srv/vs/data').error) && /ancestor/.test(dv('/srv').error), 'lane L r5 F1(b) PURE: a daemon cwd that is the checkout, inside it, an ancestor of it, `/`, the server\'s cwd or relative is refused; a private tmp dir passes');
    ok(!V.ENV_PASS.includes('AGENT_BROWSER_SCREENSHOT_DIR') && V.childEnv({ AGENT_BROWSER_SCREENSHOT_DIR: '/etc' }, { spawnEnv: [] }).dropped.includes('AGENT_BROWSER_SCREENSHOT_DIR'), 'lane L r5 F5 PURE: AGENT_BROWSER_SCREENSHOT_DIR is a write target, not output shape — not passed, and said by name');
  }
  {
    // lane L r6 (verify r4 F-A, MAJOR): THE OPTION CENSUS. `wait --download [path]` ("Wait for a download to complete
    // (optionally save to path)", 0.38.1) is a WRITE option the r4 census never read — it read only the help's COMMAND
    // signatures — so `wait --download /etc/cron.d/x` was judged nowhere and a relative path was handed relative. The
    // census now reads OPTION lines too: every option line of every verb's own `--help` (checked in, one file per verb:
    // scripts/fixtures/agent-browser-0.38.1/<verb>.txt; the verbs whose `--help` prints the top-level help are read from
    // its command rows) and every flag with a placeholder in the top-level help's rows and option sections. An option
    // whose placeholder names a path/file/dir, or whose description says save/write/path/file/dir/output, must be a
    // WRITE slot (WRITE_FLAGS, WRITE_VERBS[verb].flags), a READ slot (READ_FLAGS[verb]), refused wholesale (its verb
    // refused by name, an identity / raw-CDP / launch flag — a launch flag `open` lets through must be open's read slot),
    // or on PATH_OPTION_ALLOW with its reason.
    const AB = path.join(REPO, 'scripts/fixtures/agent-browser-0.38.1');
    const AB_INDEX = JSON.parse(fs.readFileSync(path.join(AB, 'index.json'), 'utf8'));
    const PATHY_PH = /path|file|dir/i;
    const PATHY_DESC = /\b(?:save[sd]?|saving|writes?|writing|written|paths?|files?|filename|dirs?|director(?:y|ies)|outputs?)\b/i;
    const OPT = /^(\s+)(-{1,2}[A-Za-z][\w-]*(?:,\s*-{1,2}[A-Za-z][\w-]*)*)(?:[ =](<[^>]*>|\[[^\]]*\]))?(?:\s+(.*))?$/;
    const optionLines = (text, verb) => {
      const out = []; let prev = null;
      for (const line of text.split('\n')) {
        const m = OPT.exec(line);
        if (m) { prev = { verb, names: m[2].split(/,\s*/), ph: m[3] || '', desc: m[4] || '', indent: m[1].length, line: line.trim() }; out.push(prev); continue; }
        // a wrapped description line (deeper, not itself an option) belongs to the option above it
        if (prev && line.trim() && /^\s*/.exec(line)[0].length > prev.indent + 3 && !/^\s*-/.test(line)) { prev.desc += ' ' + line.trim(); continue; }
        prev = null;
      }
      return out;
    };
    const optionRows = (() => {
      const rows = [];
      const files = fs.readdirSync(AB).filter((n) => n.endsWith('.txt') && n !== '_top.txt');
      for (const f of files) for (const o of optionLines(fs.readFileSync(path.join(AB, f), 'utf8'), f.slice(0, -4))) rows.push({ ...o, src: f, pathy: PATHY_PH.test(o.ph) || PATHY_DESC.test(o.desc) });
      const top = fs.readFileSync(path.join(AB, '_top.txt'), 'utf8').split('\nConfiguration:')[0];
      const [cmdPart, optPart] = top.split('\nSnapshot Options:');
      for (const o of optionLines(optPart || '', '*')) rows.push({ ...o, src: '_top.txt options', pathy: PATHY_PH.test(o.ph) || PATHY_DESC.test(o.desc) });
      // the command rows: a flag WITH a placeholder anywhere in a row (`cookies set --curl <file>`, `webmcp invoke
      // <tool> … --params <json|@file>`) belongs to the row's verb — or the section's, when its header spells one
      let secVerb = null; let rowVerb = null;
      for (const line of cmdPart.split('\n')) {
        if (/^\S/.test(line)) { const h = new RegExp(V.REAL_BINARY + ' ([a-z][\\w-]*) ').exec(line); secVerb = h ? h[1] : null; rowVerb = null; continue; }
        const r = /^ {2}([a-z][\w-]*)/.exec(line);
        if (r && !secVerb) rowVerb = r[1];
        for (const m of line.matchAll(/(-{1,2}[A-Za-z][\w-]*)[ =](<[^>]*>|\[[^\]]*\])/g)) rows.push({ verb: secVerb || rowVerb, names: [m[1]], ph: m[2], desc: '', line: line.trim(), src: '_top.txt rows', pathy: PATHY_PH.test(m[2]) });
      }
      return rows;
    })();
    const optionCensus = (Vx) => {
      const allowSeen = new Set(); const missing = []; const covered = [];
      for (const r of optionRows.filter((x) => x.pathy)) {
        const key = r.names.map((n) => [`${r.verb} ${n}`, `* ${n}`]).flat().find((k) => Object.prototype.hasOwnProperty.call(Vx.PATH_OPTION_ALLOW || {}, k));
        if (key) { allowSeen.add(key); covered.push(`${r.verb} ${r.names.join(',')} ⇒ allow`); continue; }
        if (r.verb !== '*' && Object.prototype.hasOwnProperty.call(Vx.REFUSED_VERBS, r.verb)) { covered.push(`${r.verb} ⇒ verb refused`); continue; }
        const one = (n) => {
          if (Vx.WRITE_FLAGS.includes(n)) return 'write';
          const ws = r.verb !== '*' && Object.prototype.hasOwnProperty.call(Vx.WRITE_VERBS, r.verb) ? Vx.WRITE_VERBS[r.verb] : null;
          if (ws && (ws.flags || []).includes(n)) return 'write';
          const rf = r.verb !== '*' && Vx.READ_FLAGS && Object.prototype.hasOwnProperty.call(Vx.READ_FLAGS, r.verb) ? Vx.READ_FLAGS[r.verb] : [];
          if (rf.includes(n)) return 'read';
          if (Vx.IDENTITY_FLAGS.includes(n) || Vx.RAW_CDP_FLAGS.includes(n)) return 'refused';
          if (Vx.LAUNCH_FLAGS.includes(n)) return !Vx.OPEN_FLAGS.includes(n) || ((Vx.READ_FLAGS || {}).open || []).includes(n) ? 'refused' : null;
          return null;
        };
        const hows = r.names.map(one);
        if (hows.every(Boolean)) covered.push(`${r.verb} ${r.names.join(',')} ⇒ ${hows.join('/')}`);
        else missing.push(`${r.verb} ${r.names.join(',')} ${r.ph}`.trim());
      }
      return { missing: [...new Set(missing)], covered, allowSeen, dead: Object.keys(Vx.PATH_OPTION_ALLOW || {}).filter((k) => !allowSeen.has(k)) };
    };
    {
      const verbFiles = fs.readdirSync(AB).filter((n) => n.endsWith('.txt') && n !== '_top.txt').map((n) => n.slice(0, -4));
      ok(AB_INDEX.version === '0.38.1' && verbFiles.length >= 45 && fs.readFileSync(path.join(AB, 'wait.txt'), 'utf8').includes('--download [path]'), `lane L r6 CENSUS: the 0.38.1 help fixtures are non-vacuous (${verbFiles.length} verb helps + the top-level help; wait's documents \`--download [path]\`)`);
      const noHelp = V.PAGE_VERBS.filter((v) => !verbFiles.includes(v) && !AB_INDEX.generic.includes(v));
      ok(noHelp.length === 0 && AB_INDEX.generic.every((v) => !verbFiles.includes(v)), `lane L r6 CENSUS: every page verb has its own help fixture or is named in index.json's \`generic\` (read from the top-level rows) — missing: ${noHelp.join(', ') || 'none'}`);
      const pathy = optionRows.filter((x) => x.pathy);
      ok(pathy.length >= 60 && ['wait --download', 'diff -o', 'diff --baseline', 'open --init-script', 'cookies --curl', 'screenshot --screenshot-dir', '* --ca-cert', 'webmcp --params'].every((s) => { const [v, f] = s.split(' '); return pathy.some((x) => x.verb === v && x.names.includes(f)); }), `lane L r6 CENSUS: the option census is non-vacuous (${optionRows.length} options read, ${pathy.length} path-shaped — option lines, the top-level rows' inline flags and its option sections all counted)`);
      const cz = optionCensus(V);
      ok(cz.missing.length === 0, `lane L r6 CENSUS: every path-shaped OPTION of the 0.38.1 help is a write slot, a read slot, refused wholesale, or on PATH_OPTION_ALLOW with a reason (missing: ${cz.missing.join('; ') || 'none'})`, cz.missing.join('\n    '));
      ok(cz.dead.length === 0 && Object.values(V.PATH_OPTION_ALLOW || {}).every((why) => typeof why === 'string' && why.length >= 20), `lane L r6 CENSUS: every PATH_OPTION_ALLOW row names a reason and is an option the help really documents (dead rows: ${cz.dead.join(', ') || 'none'})`);
      // the pins (the verifier's): judged, and one exact write slot handed absolute
      const sl = (a) => V.pathSlots(a).map((x) => `${x.kind}:${x.prefix}${x.word}`).join(' ');
      ok(V.writeTargetsAt(['wait', '--download', '/etc/x'], 0).includes('/etc/x') && JSON.stringify(V.classify(['wait', '--download', '/etc/cron.d/x']).writeFiles) === '["/etc/cron.d/x"]', 'lane L r6 F-A PURE: `wait --download /etc/x` NAMES its path for judging (writeTargetsAt + classify.writeFiles)', JSON.stringify(V.classify(['wait', '--download', '/etc/cron.d/x'])));
      ok(sl(['wait', '--download', './w']) === 'write:./w' && sl(['wait', '--download=./w']) === 'write:--download=./w' && sl(['wait', '--download', './f.pdf', '--timeout', '5000']) === 'write:./f.pdf', 'lane L r6 F-A PURE: `wait --download <path>` is ONE write slot (the `=` form keeps its prefix; `--timeout <ms>` is not a slot)', sl(['wait', '--download', './f.pdf', '--timeout', '5000']));
      ok(sl(['wait', '--download']) === '' && sl(['wait', '--download', '--timeout', '30000']) === '' && sl(['wait', '#spinner']) === '' && sl(['wait', '--text', 'a/b']) === '' && sl(['wait', '--url', '**/dashboard']) === '' && V.classify(['wait', '--download']).writeFiles === undefined, 'lane L r6 F-A PURE: `wait --download` with no path (an optional value) names nothing and is no slot; a selector / text / URL pattern never is');
      ok(['constructor', 'toString', '__proto__', 'hasOwnProperty'].every((w) => { try { return V.pathSlots([w, 'x', '--output', 'o']).length === 1 && V.writeTargetsAt([w, 'x'], 0).length === 0; } catch { return false; } }), 'lane L r6 PURE: a verb word that names an inherited property (`constructor`, `toString`, …) is looked up as an OWN key — no throw, no phantom slot');
      ok(JSON.stringify(V.classify(['batch', 'open https://x', 'wait --download /etc/x']).writeFiles) === '["/etc/x"]', 'lane L r6 F-A PURE: a batch line `wait --download /etc/x` names its path like every other writer');
      // NEGATIVE CONTROL: the table WITHOUT `wait` (a patched copy) — the census reddens naming the option, and the pins go red
      const src = fs.readFileSync(path.join(REPO, 'src/browser-verbs.js'), 'utf8');
      const load = (code) => { const m = { exports: {} }; new Function('module', 'exports', 'require', code)(m, m.exports, require); return m.exports; };
      const noWaitSrc = src.replace(/\n\s*wait: \{ flags: \['--download'\] \},/, '');
      const NW = noWaitSrc !== src ? load(noWaitSrc) : null;
      const czc = NW ? optionCensus(NW) : null;
      ok(NW && JSON.stringify(czc.missing) === '["wait --download [path]"]', 'lane L r6 NEGATIVE CONTROL: the table without `wait` (patched copy) — the option census names exactly `wait --download [path]` missing', JSON.stringify(czc && czc.missing));
      ok(NW && NW.classify(['wait', '--download', '/etc/x']).writeFiles === undefined && NW.pathSlots(['wait', '--download', './w']).length === 0, 'lane L r6 NEGATIVE CONTROL: …and names nothing for judging, rewrites nothing — the pins above can go red');
      // ── F-B (MINOR): a lone screenshot word starting with `#`, `@` or `.` (not `./` / `../`) and without an image
      // extension is a SELECTOR on the binary even with a `/` inside (measured on 0.38.1 by the verifier) — never rewritten
      const sel = ['.x[href="/login"]', '.x/y', '@e1/x', '#d/y', '.nope/zz'];
      ok(sel.every((w) => sl(['screenshot', w]) === ''), `lane L r6 F-B PURE: a lone selector with a \`/\` inside is never rewritten (${sel.join('  ')})`, JSON.stringify(sel.map((w) => sl(['screenshot', w]))));
      const pth = ['[href="/login"]', 'a[href="/login"]', './c.png', 'shots/a.png', '../up/x', '.shots/a.png', 'sub/noext'];
      ok(pth.every((w) => sl(['screenshot', w]) === `write:${w}`), `lane L r6 F-B PURE: a lone path is still a slot, handed absolute (${pth.join('  ')} — \`.shots/a.png\` too: an image name, which the binary would read as a selector and silently save to its temp dir; handed absolute it lands where the agent named it)`, JSON.stringify(pth.map((w) => sl(['screenshot', w]))));
      ok(sl(['screenshot', '.x[href="/login"]', './out.png']) === 'write:./out.png', 'lane L r6 F-B PURE: the two-word form is unchanged — the selector is positional 0, the path the slot');
      const oldHeur = src.replace(/if \(pos\.length >= 2\) all\(1, 'write'\); else if \(pos\.length === 1 && [^\n]*\n/, "if (pos.length >= 2) all(1, 'write'); else if (pos.length === 1 && (w(0).includes('/') || IMAGE_PATH_RE.test(w(0)))) add(pos[0], 'write'); }\n");
      ok(oldHeur !== src && load(oldHeur).pathSlots(['screenshot', '.x[href="/login"]']).length === 1, 'lane L r6 F-B NEGATIVE CONTROL: the r5 heuristic (patched copy: "holds a `/` or an image extension") rewrites `.x[href="/login"]` — the leg above can go red');
    }
  }
  // resolveRealBinary
  const files = new Set(['/shim/agent-browser', '/home/u/.vibespace/bin/agent-browser', '/prod/data/bin/agent-browser', '/nvm/bin/agent-browser']);
  const exists = (p) => files.has(p);
  const isShim = (p) => p === '/prod/data/bin/agent-browser';
  let r = V.resolveRealBinary({ PATH: '/shim:/home/u/.vibespace/bin/:/prod/data/bin:/nvm/bin:/usr/bin', shimDirs: ['/shim', '/home/u/.vibespace/bin'], exists, isShim });
  ok(r.ok && r.path === '/nvm/bin/agent-browser', 'resolveRealBinary skips the shim dirs (trailing slash normalised) and a shim recognised by CONTENT', JSON.stringify(r));
  r = V.resolveRealBinary({ PATH: ':relative:/shim', shimDirs: ['/shim'], exists: () => true });
  ok(!r.ok && r.code === 'binary_absent' && r.remedy && !new RegExp(V.REAL_BINARY).test(r.error + r.remedy), 'empty/relative PATH entries are never a binary; absent ⇒ binary_absent (its words never name the binary)');
  r = V.resolveRealBinary({ PATH: '/shim:/nvm/bin', shimDirs: [], exists });
  ok(r.ok && r.path === '/shim/agent-browser', 'CONTROL: without the shim dirs the first hit wins (the skip is what the leg above measured)');
}

// ═══ ② the SHIM ═══
console.log('② the shim');
const SHIM = path.join(REPO, 'data/bin/agent-browser');
const run = (cmd, args, opts = {}) => new Promise((resolve) => {
  const ch = execFile(cmd, args, { encoding: 'utf8', timeout: 30000, ...opts }, (err, stdout, stderr) => resolve({ status: err ? (typeof err.code === 'number' ? err.code : null) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') }));
  if (opts.input != null) { ch.stdin.end(opts.input); }
});
const shimLeg = async (file, label) => {
  const a = await run(process.execPath, [file, 'open', 'https://x']);
  const lines = a.stderr.split('\n').filter(Boolean);
  const good1 = a.status === 2 && lines.length === 1 && lines[0].includes('vibespace-browser open https://x') && a.stdout === '';
  const b = await run(process.execPath, [file]);
  const good2 = b.status === 2 && b.stderr.split('\n').filter(Boolean).length === 1 && /vibespace-browser help/.test(b.stderr);
  const c = await run(process.execPath, [file, 'fill', '@e1', "it's here"]);
  const good3 = c.status === 2 && c.stderr.includes(`vibespace-browser fill @e1 'it'\\''s here'`);
  return { good1, good2, good3, a, b, c, label };
};
{
  ok(fs.existsSync(SHIM) && (fs.statSync(SHIM).mode & 0o111) !== 0, 'data/bin/agent-browser exists and is executable');
  const src = fs.existsSync(SHIM) ? fs.readFileSync(SHIM, 'utf8') : '';
  ok(src.startsWith('#!/usr/bin/env node') && src.includes(V.SHIM_MARKER), 'the shim is a node script carrying the marker resolvers skip it by');
  ok(!/process\.env|require\(['"](?:https?|net|child_process|fs)['"]\)/.test(src), 'the shim reads no env, opens no network, spawns nothing');
  const s = await shimLeg(SHIM, 'shim');
  ok(s.good1, 'the shim exits 2 with exactly one stderr line naming `vibespace-browser open https://x`', JSON.stringify([s.a.status, s.a.stderr]));
  ok(s.good2, 'no args ⇒ the same sentence + `vibespace-browser help`', JSON.stringify([s.b.status, s.b.stderr]));
  ok(s.good3, 'arguments are shell-quoted so the line can be copied and run', s.c.stderr);
  // CONTROL: a copy that forwards (exits 0) must be caught by the same leg
  const ctlDir = scratch('browser-verbs-shimctl'); fs.rmSync(ctlDir, { recursive: true, force: true }); fs.mkdirSync(ctlDir, { recursive: true });
  const ctl = path.join(ctlDir, 'agent-browser');
  fs.writeFileSync(ctl, src.replace(/process\.exit\(2\)/g, 'process.exit(0)'), { mode: 0o755 });
  const sc = await shimLeg(ctl, 'control');
  ok(!sc.good1 && !sc.good2, 'CONTROL: a shim copy that exits 0 fails the same leg');
  fs.rmSync(ctlDir, { recursive: true, force: true });
}

// ═══ ③ the CLI over a fake server ═══
console.log('③ the CLI over a fake server');
const ROOT = scratch('browser-verbs'); fs.rmSync(ROOT, { recursive: true, force: true });
const SHIMDIR = path.join(ROOT, 'shimdir'); const REALDIR = path.join(ROOT, 'real'); const HOME = path.join(ROOT, 'home');
for (const d of [SHIMDIR, REALDIR, HOME]) fs.mkdirSync(d, { recursive: true });
const LOG = path.join(ROOT, 'real.log');
fs.copyFileSync(SHIM, path.join(SHIMDIR, 'agent-browser')); fs.chmodSync(path.join(SHIMDIR, 'agent-browser'), 0o755);
// r4: the fake answers `--version` from a file (the CLI reads the version off the binary it runs — the
// drift legs flip it) WITHOUT logging a call, and — like the real 0.32.0 binary (measured) — reads a stdin
// batch ONLY as a JSON array of string arrays: plain lines are "Invalid JSON input", exit 1 (r3's fake took
// plain lines, so nothing noticed the CLI handing the binary a form it cannot read)
const FAKE_VERSION = path.join(ROOT, 'fake-version');
fs.writeFileSync(path.join(REALDIR, 'agent-browser'), `#!${process.execPath}
const fs = require('fs');
if (process.argv[2] === '--version') { let v = ${JSON.stringify(V.TABLE_VERSION)}; try { v = fs.readFileSync(${JSON.stringify(FAKE_VERSION)}, 'utf8').trim() || v; } catch {} console.log('agent-browser ' + v); process.exit(0); }
let input = ''; try { if (process.argv.includes('batch') && !process.stdin.isTTY) input = fs.readFileSync(0, 'utf8'); } catch {}
let batchJson = null;
if (process.argv.includes('batch') && !process.argv.slice(process.argv.indexOf('batch') + 1).some((a) => !a.startsWith('-'))) {
  try { batchJson = JSON.parse(input); if (!Array.isArray(batchJson) || !batchJson.every((c) => Array.isArray(c) && c.every((w) => typeof w === 'string'))) throw new Error('Expected an array of string arrays.'); }
  catch (e) { console.error('✗ Invalid JSON input: ' + e.message + ' Expected an array of string arrays.'); fs.appendFileSync(${JSON.stringify(LOG)}, JSON.stringify({ argv: process.argv.slice(2), invalidStdin: true, input }) + '\\n'); process.exit(1); }
}
const ab = Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('AGENT_BROWSER_')));
fs.appendFileSync(${JSON.stringify(LOG)}, JSON.stringify({ argv: process.argv.slice(2), session: process.env.AGENT_BROWSER_SESSION || null, env: ab, xdg: Object.prototype.hasOwnProperty.call(process.env, 'XDG_RUNTIME_DIR') ? process.env.XDG_RUNTIME_DIR : null, input, batchJson, cwd: process.cwd() }) + '\\n');
if (process.argv[2] === 'open') console.log('✓ opened ' + process.argv[3]);
process.exit(0);
`, { mode: 0o755 });
const realCalls = () => { try { return fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };

const calls = [];
let resolveAnswer = { ok: true, kind: 'none', handle: null, env: [], handles: [], pinTab: false };
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    let j = null; try { j = body ? JSON.parse(body) : null; } catch { j = null; }
    calls.push({ method: req.method, path: req.url, body: j, auth: req.headers.authorization || '' });
    const send = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/api/agent/browser/resolve') return send(resolveAnswer._status || 200, resolveAnswer);
    if (req.url === '/api/agent/browser/audit') return send(200, { ok: true });
    if (req.url === '/api/agent/browser/new-child') return send(200, { handle: 'bk-0000000a.1', env: ['AGENT_BROWSER_SESSION=vs-bk-0000000a.1', 'AGENT_BROWSER_NAMESPACE=vs-bk-0000000a.1'], unset: [], handles: [] });
    if (req.url === '/api/agent/browser/use') return send(200, { profile: { id: 'bp-00000001', label: 'Work' }, lease: { since: Date.now() }, others: 0, alias: 'work', created: true, env: ['AGENT_BROWSER_SESSION=vs-bk-0000000a'], attachments: [{}] });
    send(404, { error: 'no such route', code: 'not-found' });
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const API = `http://127.0.0.1:${server.address().port}`;
const CLI = path.join(REPO, 'data/bin/vibespace-browser');
const NODE_DIR = path.dirname(process.execPath);
const baseEnv = { HOME, PATH: `${SHIMDIR}:${REALDIR}:${NODE_DIR}:/usr/bin:/bin`, VIBESPACE_API: API, VIBESPACE_SESSION_TOKEN: 'vsst_fake', AGENT_BROWSER_SESSION: 'vs-bk-0000000a' };
// r4 (takeover finding 2): the CLI reads the ACCOUNT's home off its passwd entry (os.userInfo), never $HOME —
// so a suite that must not touch the real home INJECTS the passwd answer: every CLI run below is started with
// `--require` of a preload that makes os.userInfo().homedir this scratch HOME (baked into the file, read from
// no environment). The legs that prove the fix run with a $HOME that DISAGREES with it, and once without the
// preload at all (the real passwd entry — refused before any file is read or written)
const PASSWD_PRELOAD = path.join(ROOT, 'passwd-home.cjs');
fs.writeFileSync(PASSWD_PRELOAD, `const os = require('os'); const real = os.userInfo; os.userInfo = (o) => ({ ...real(o), homedir: ${JSON.stringify(HOME)} });\n`);
const nodeCli = (file, args, opts = {}) => run(process.execPath, ['--require', PASSWD_PRELOAD, file, ...args], opts);
const cli = (args, env = baseEnv, input) => nodeCli(CLI, args, { env, ...(input != null ? { input } : {}) });
const resolves = () => calls.filter((c) => c.path === '/api/agent/browser/resolve');
try {
  let c = await cli(['click', '@e1']);
  let rc = realCalls();
  ok(c.status === 0 && rc.length === 1 && JSON.stringify(rc[0].argv) === JSON.stringify(['click', '@e1']), '`vibespace-browser click @e1` runs the REAL binary found on PATH behind a shim (the shim dir comes first)', JSON.stringify([c, rc]));
  ok(/^profile: \(ephemeral\)/.test(c.stderr.split('\n')[0]), 'the first stderr line names the browser it acted on (ephemeral)', c.stderr);
  const bodyA = JSON.stringify(resolves()[0] && resolves()[0].body);
  c = await cli(['--', 'click', '@e1']);
  rc = realCalls();
  const bodyB = JSON.stringify(resolves()[1] && resolves()[1].body);
  ok(c.status === 0 && resolves().length === 2 && bodyA === bodyB && JSON.stringify(rc[1].argv) === JSON.stringify(['click', '@e1']), '`-- click @e1` posts the IDENTICAL /resolve body and runs the same argv', bodyA + ' vs ' + bodyB);
  ok(calls.filter((x) => x.path === '/api/agent/browser/audit').length === 2 && calls.filter((x) => x.path === '/api/agent/browser/audit').every((x) => x.body && x.body.verb === 'click' && x.body.profile == null), 'every page verb is audited — the ephemeral browser too (verb only)');

  const before = calls.length;
  for (const argv of [['connect', '9222'], ['get', 'cdp-url'], ['--cdp', '1', 'snapshot'], ['--session', 'x', 'snapshot'], ['snapshot', '--proxy', 'http://p'], ['auth', 'save', 'x', '--password', 'hunter2'], ['batch', 'open https://x', 'get cdp-url']]) {
    const r2 = await cli(argv);
    const code = { connect: 'raw_cdp_refused', get: 'raw_cdp_refused', '--cdp': 'raw_cdp_refused', '--session': 'identity_flag_refused', snapshot: 'launch_flag_refused', auth: 'verb_not_offered', batch: 'batch_line_refused' }[argv[0]];
    ok(r2.status === 1 && r2.stderr.includes(`[${code}]`) && /remedy: /.test(r2.stderr) && !/hunter2/.test(r2.stderr), `\`${argv.join(' ')}\` is refused LOCALLY [${code}] with a remedy`, r2.stderr);
  }
  // r1 (finding 1): the flag-ordered spellings of `get cdp-url` — refused by the shipped CLI too
  for (const argv of [['get', '--json', 'cdp-url'], ['get', '-c', 'cdp-url'], ['get', 'cdp-url', '--json'], ['--', 'get', '--json', 'cdp-url'], ['batch', 'get --json cdp-url']]) {
    const r2 = await cli(argv);
    const code = argv[0] === 'batch' ? 'batch_line_refused' : 'raw_cdp_refused';
    ok(r2.status === 1 && r2.stderr.includes(`[${code}]`) && /remedy: /.test(r2.stderr) && !/cdpUrl|ws:\/\//.test(r2.stdout), `\`vibespace-browser ${argv.join(' ')}\` is refused LOCALLY [${code}]`, JSON.stringify(r2));
  }
  // r3 (finding 1): the verifier's spelling through the shipped CLI, and a flag of unknown arity
  for (const [argv, code] of [[['get', '--idle-timeout', '5m', 'cdp-url'], 'launch_flag_refused'], [['get', '--newglobal', 'text', 'cdp-url'], 'raw_cdp_refused'], [['get', 'ws-url'], 'unknown_verb']]) {
    const r2 = await cli(argv);
    ok(r2.status === (code === 'unknown_verb' ? 2 : 1) && r2.stderr.includes(`[${code}]`) && !/ws:\/\//.test(r2.stdout), `r3: \`vibespace-browser ${argv.join(' ')}\` is refused LOCALLY [${code}]`, JSON.stringify(r2));
  }
  ok(calls.length === before && realCalls().length === 2, '…with ZERO server calls and nothing run');
  c = await cli(['frobnicate']);
  ok(c.status === 2 && /\[unknown_verb\]/.test(c.stderr) && calls.length === before, 'an unknown verb exits 2 (usage) with no server call');

  c = await cli(['use', 'Work', '--print']);
  ok(c.status === 1 && /\[not_offered\]/.test(c.stderr) && !calls.some((x) => x.path === '/api/agent/browser/use'), '`use --print` ⇒ not_offered (nothing to export), no attach made');
  c = await cli(['use', 'Work']);
  ok(c.status === 0 && calls.some((x) => x.path === '/api/agent/browser/use') && /profile: Work \(bp-00000001\)/.test(c.stdout) && !/export /.test(c.stdout) && /vibespace-browser <verb>/.test(c.stdout), '`use` only attaches (no subshell, no env) and says how to go on');

  c = await cli(['new-child']);
  const out = c.stdout.split('\n').filter(Boolean);
  ok(c.status === 0 && out.length === 1 && /^export VIBESPACE_BROWSER='?bk-0000000a\.1'?$/.test(out[0]), '`new-child` prints ONLY `export VIBESPACE_BROWSER=<child>` on stdout', JSON.stringify(c.stdout));

  // stdin batch: a refused line refuses before the server hears anything
  const n0 = calls.length;
  c = await cli(['batch'], baseEnv, 'open https://x\nsnapshot\nstream enable\n');
  ok(c.status === 1 && /\[batch_line_refused\]/.test(c.stderr) && /batch line 3/.test(c.stderr) && calls.length === n0, 'a stdin batch is judged line by line before anything runs');
  c = await cli(['batch'], baseEnv, 'open https://x\nsnapshot -i\n');
  rc = realCalls();
  ok(c.status === 0 && rc[rc.length - 1].argv[0] === 'batch' && rc[rc.length - 1].input === '[["open","https://x"],["snapshot","-i"]]', 'r4: a clean plain-line stdin batch reaches the real binary as the JSON array of string arrays it reads (exactly the words judged)', JSON.stringify(rc[rc.length - 1]));
  // r4 (takeover finding 3): the binary's OWN stdin form — JSON — is judged element by element and handed over verbatim
  {
    const J = '[["open","https://x"],\n ["get","title"]]';
    c = await cli(['batch', '--bail'], baseEnv, J);
    rc = realCalls();
    ok(c.status === 0 && rc[rc.length - 1].input === J && JSON.stringify(rc[rc.length - 1].batchJson) === '[["open","https://x"],["get","title"]]' && JSON.stringify(rc[rc.length - 1].argv) === '["batch","--bail"]', 'r4: a JSON stdin batch runs (r3 refused it as `batch line 1 ("[[…]]") … unknown_verb`) — the binary gets the JSON verbatim', JSON.stringify([c.status, c.stderr, rc[rc.length - 1]]));
    const nb = calls.length; const nr = realCalls().length;
    c = await cli(['batch'], baseEnv, '[["open","https://x"],["get","cdp-url"]]');
    ok(c.status === 1 && /\[batch_line_refused\]/.test(c.stderr) && /batch command 2/.test(c.stderr) && calls.length === nb && realCalls().length === nr, 'r4: …a refused ELEMENT refuses the batch locally and names its index — no server call, nothing run', c.stderr);
    c = await cli(['batch'], baseEnv, '[["open", 1]]');
    ok(c.status === 1 && /\[batch_stdin_refused\]/.test(c.stderr) && calls.length === nb && realCalls().length === nr, 'r4: …a stdin that is not the binary\'s form is refused by name before anything runs', c.stderr);
    // NEGATIVE CONTROL: the r3 CLI's hand-over (the raw stdin) in a patched copy — the fake, like the real binary, cannot read plain lines
    const src = fs.readFileSync(CLI, 'utf8');
    const r3 = src.replace('if (stdinJson != null) child.stdin.end(stdinJson);', 'if (stdinJson != null) child.stdin.end(stdinBuf);');
    const D5 = path.join(ROOT, 'r3-stdinctl'); fs.mkdirSync(D5, { recursive: true });
    fs.writeFileSync(path.join(D5, 'vibespace-browser'), r3); fs.copyFileSync(path.join(REPO, 'src/browser-verbs.js'), path.join(D5, 'vibespace-browser-verbs.js'));
    c = await nodeCli(path.join(D5, 'vibespace-browser'), ['batch'], { env: baseEnv, input: 'open https://x\nsnapshot -i\n' });
    rc = realCalls();
    ok(r3 !== src && c.status === 1 && rc[rc.length - 1].invalidStdin === true && /Invalid JSON input/.test(c.stderr), 'r4 NEGATIVE CONTROL: the r3 hand-over (patched copy: the raw lines) is the binary\'s `Invalid JSON input` — the fake reads stdin as the real binary does', JSON.stringify([c.status, c.stderr.slice(0, 200)]));
  }

  // the shared rung: the server refuses close --all by name
  resolveAnswer = { error: 'this session shares the machine\'s browser — `close --all` would close every agent\'s browser', code: 'shared_browser', _status: 409 };
  c = await cli(['close', '--all']);
  ok(c.status === 1 && /\[shared_browser\]/.test(c.stderr), 'on the shared rung the server\'s `shared_browser` refusal is printed by name');
  resolveAnswer = { ok: true, kind: 'none', shared: true, handle: null, env: [], handles: [], pinTab: false };
  c = await cli(['snapshot']);
  ok(c.status === 0 && /^profile: \(shared\)/.test(c.stderr), '…and a shared-rung page verb says it acted on the SHARED browser');

  // r1 (finding 2): the ENV TWINS of every refused launch / identity / CDP flag never reach the real
  // binary — the child env is process.env minus every AGENT_BROWSER_* key, then the output keys the
  // agent may set (JSON, DEBUG, …, SOCKET_DIR), then /resolve's pairs verbatim, then `unset`. The
  // real 0.32.0 binary HONOURS these twins (test-browser-mediation-chrome ③ is the control).
  {
    const TWINS = { AGENT_BROWSER_CDP: '1', AGENT_BROWSER_AUTO_CONNECT: '1', AGENT_BROWSER_PROXY: 'http://127.0.0.1:1', AGENT_BROWSER_ARGS: '--remote-debugging-port=9', AGENT_BROWSER_EXECUTABLE_PATH: '/tmp/evil-chrome', AGENT_BROWSER_HEADED: '1', AGENT_BROWSER_STATE: '/tmp/s.json', AGENT_BROWSER_PROFILE: '/home/u/.config/google-chrome', AGENT_BROWSER_PROVIDER: 'browserbase', AGENT_BROWSER_CONFIG: '/tmp/c.json', AGENT_BROWSER_SESSION: 'vfy-e', AGENT_BROWSER_NAMESPACE: 'vfy-e', AGENT_BROWSER_RESTORE: '1', AGENT_BROWSER_SESSION_NAME: 'x', AGENT_BROWSER_INIT_SCRIPTS: '/tmp/i.js', AGENT_BROWSER_ENCRYPTION_KEY: 'k' };
    const OUT = { AGENT_BROWSER_JSON: '1', AGENT_BROWSER_MAX_OUTPUT: '400' };
    // r2: the agent's own socket roots — a decoy SOCKET_DIR and XDG_RUNTIME_DIR in its shell
    const DECOY = { AGENT_BROWSER_SOCKET_DIR: path.join(ROOT, 'mine'), XDG_RUNTIME_DIR: path.join(ROOT, 'mine-xdg') };
    const KEEPER = { socketDir: path.join(ROOT, 'keeper-xdg', 'agent-browser'), runtimeDir: path.join(ROOT, 'keeper-xdg') };
    const twinEnv = { ...baseEnv, ...TWINS, ...OUT, ...DECOY };
    const last = () => { const rc2 = realCalls(); return rc2[rc2.length - 1]; };
    const leaked = (e) => Object.keys(TWINS).filter((k) => e && e[k] === TWINS[k]);
    // the shared rung (nothing the server names): every twin dropped, and SAID once on stderr
    resolveAnswer = { ok: true, kind: 'none', shared: true, handle: null, env: [], spawnEnv: [], ...KEEPER, handles: [], pinTab: false };
    let r3 = await cli(['snapshot'], twinEnv);
    let lc = last();
    ok(r3.status === 0 && lc && leaked(lc.env).length === 0, `shared rung: no twin reaches the real binary (leaked: ${leaked(lc && lc.env).join(', ') || 'none'})`, JSON.stringify(lc && lc.env));
    ok(lc && OUT.AGENT_BROWSER_JSON === lc.env.AGENT_BROWSER_JSON && lc.env.AGENT_BROWSER_MAX_OUTPUT === '400', '…while the output keys (JSON / MAX_OUTPUT) pass through', JSON.stringify(lc && lc.env));
    // r2 (browser finding 2): the SOCKET ROOT is identity — the answer's (the keeper's) wins over the shell's
    ok(lc && lc.env.AGENT_BROWSER_SOCKET_DIR === KEEPER.socketDir && lc.xdg === KEEPER.runtimeDir, 'r2: the socket root is the ANSWER\'s (the keeper\'s SOCKET_DIR + its XDG_RUNTIME_DIR) — never the decoy the agent exported', JSON.stringify(lc && { sd: lc.env.AGENT_BROWSER_SOCKET_DIR, xdg: lc.xdg }));
    ok(/\[env_twin_dropped\]/.test(r3.stderr) && /AGENT_BROWSER_SOCKET_DIR/.test(r3.stderr) && /XDG_RUNTIME_DIR/.test(r3.stderr) && !r3.stderr.includes(DECOY.AGENT_BROWSER_SOCKET_DIR), 'r2: …and the replaced socket root is SAID by name (never its value)', r3.stderr);
    resolveAnswer = { ok: true, kind: 'none', shared: true, handle: null, env: [], spawnEnv: [], socketDir: KEEPER.socketDir, runtimeDir: null, handles: [], pinTab: false };
    await cli(['snapshot'], twinEnv);
    lc = last();
    ok(lc.env.AGENT_BROWSER_SOCKET_DIR === KEEPER.socketDir && lc.xdg === null, 'r2: a keeper with NO XDG_RUNTIME_DIR ⇒ the child has none either (the shell\'s is removed, not kept)', JSON.stringify({ sd: lc.env.AGENT_BROWSER_SOCKET_DIR, xdg: lc.xdg }));
    ok(/\[env_twin_dropped\]/.test(r3.stderr) && /AGENT_BROWSER_CDP/.test(r3.stderr) && /AGENT_BROWSER_PROXY/.test(r3.stderr) && !/\bk\b|evil-chrome/.test(r3.stderr.replace(/AGENT_BROWSER_\w+/g, '')), '…and the drop is SAID (the key names, never their values) — no silent change', r3.stderr);
    // the unmanaged rung of a session with its OWN pairs (a remote session): the server names them
    const HOST_BASE = path.join(ROOT, 'hb');
    const UID = process.getuid();
    resolveAnswer = { ok: true, kind: 'none', shared: false, handle: null, env: [], spawnEnv: ['AGENT_BROWSER_SESSION=vs-bk-0000000a', 'AGENT_BROWSER_NAMESPACE=vs-bk-0000000a', 'AGENT_BROWSER_IDLE_TIMEOUT_MS=900000'], hostProfile: 'vs-bk-0000000a', hostSocketBase: HOST_BASE, handles: [], pinTab: false };
    r3 = await cli(['snapshot'], twinEnv);
    lc = last();
    ok(r3.status === 0 && lc.env.AGENT_BROWSER_SESSION === 'vs-bk-0000000a' && lc.env.AGENT_BROWSER_NAMESPACE === 'vs-bk-0000000a' && leaked(lc.env).length === 0, 'unmanaged rung: SESSION / NAMESPACE are the ones /resolve names, never the shell\'s (vfy-e)', JSON.stringify(lc.env));
    // r2: rung H (unmanaged, D8) — the host prelude's short socket dir `<base>/vs-ab-<uid>` is kept, nothing else is
    ok(!('AGENT_BROWSER_SOCKET_DIR' in lc.env) && lc.xdg === DECOY.XDG_RUNTIME_DIR, 'r2: rung H — a SOCKET_DIR the prelude could not have exported is dropped; XDG_RUNTIME_DIR stays the host shell\'s (no keeper there; the prelude decided on it)', JSON.stringify({ sd: lc.env.AGENT_BROWSER_SOCKET_DIR, xdg: lc.xdg }));
    fs.mkdirSync(`${HOST_BASE}/vs-ab-${UID}`, { recursive: true, mode: 0o700 }); // what the prelude made before it exported it
    await cli(['snapshot'], { ...twinEnv, AGENT_BROWSER_SOCKET_DIR: `${HOST_BASE}/vs-ab-${UID}` });
    ok(last().env.AGENT_BROWSER_SOCKET_DIR === `${HOST_BASE}/vs-ab-${UID}`, 'r2: rung H — the prelude-shaped `<base>/vs-ab-<this uid>` IS kept (the long-home remedy the host exported)', JSON.stringify(last().env));
    // r3 (browser finding 5): the prelude exports it only after `[ -d ] && [ ! -L ] && [ -O ]`; the keep asks the same —
    // a SYMLINK pre-planted at the predictable name (or a name nothing made) is dropped
    {
      const HB2 = path.join(ROOT, 'hb2'); fs.mkdirSync(HB2, { recursive: true });
      const elsewhere = path.join(ROOT, 'elsewhere'); fs.mkdirSync(elsewhere, { recursive: true });
      fs.symlinkSync(elsewhere, `${HB2}/vs-ab-${UID}`);
      const prevAns = resolveAnswer;
      resolveAnswer = { ...prevAns, hostSocketBase: HB2 };
      await cli(['snapshot'], { ...twinEnv, AGENT_BROWSER_SOCKET_DIR: `${HB2}/vs-ab-${UID}` });
      ok(!('AGENT_BROWSER_SOCKET_DIR' in last().env), 'r3: rung H — a SYMLINK at the prelude-shaped name is not kept (lstat, as the prelude checks)', JSON.stringify(last().env));
      const HB3 = path.join(ROOT, 'hb3');
      resolveAnswer = { ...prevAns, hostSocketBase: HB3 };
      await cli(['snapshot'], { ...twinEnv, AGENT_BROWSER_SOCKET_DIR: `${HB3}/vs-ab-${UID}` });
      ok(!('AGENT_BROWSER_SOCKET_DIR' in last().env), 'r3: rung H — …nor a name no directory answers to');
      ok(V.childEnv({ AGENT_BROWSER_SOCKET_DIR: `${HB2}/vs-ab-${UID}` }, { spawnEnv: [], env: [], hostSocketBase: HB2 }, { uid: UID }).env.AGENT_BROWSER_SOCKET_DIR === `${HB2}/vs-ab-${UID}`, 'r3 CONTROL: without the injected check (the r2 keep) the planted link IS kept — string equality alone');
      resolveAnswer = prevAns;
    }
    await cli(['snapshot'], { ...twinEnv, AGENT_BROWSER_SOCKET_DIR: `${HOST_BASE}/vs-ab-${UID + 1}` });
    ok(!('AGENT_BROWSER_SOCKET_DIR' in last().env), 'r2: …another uid\'s directory is not');
    // rung H: the host decided a scratch user-data-dir for THIS conversation — kept; any other PROFILE is not
    const hostDir = `${HOME}/.vibespace/browser-profiles/vs-bk-0000000a`;
    r3 = await cli(['snapshot'], { ...twinEnv, AGENT_BROWSER_PROFILE: hostDir });
    lc = last();
    ok(lc.env.AGENT_BROWSER_PROFILE === hostDir, 'rung H: the host-decided scratch dir of THIS conversation (~/.vibespace/browser-profiles/vs-<key>) is kept', JSON.stringify(lc.env));
    r3 = await cli(['snapshot'], { ...twinEnv, AGENT_BROWSER_PROFILE: `${HOME}/.vibespace/browser-profiles/vs-bk-0000000b` });
    ok(!('AGENT_BROWSER_PROFILE' in last().env), '…another conversation\'s scratch dir is not');
    // a managed ephemeral browser: the pairs are the server's, and a twin it does not name stays out
    const SPAWN_SOCK = path.join(ROOT, 'vs-ab-short');
    const EPH = ['AGENT_BROWSER_SESSION=vs-bk-0000000a', 'AGENT_BROWSER_NAMESPACE=vs-bk-0000000a', 'AGENT_BROWSER_CONFIG=/data/cfg.json', `AGENT_BROWSER_SOCKET_DIR=${SPAWN_SOCK}`];
    resolveAnswer = { ok: true, kind: 'ephemeral', shared: false, handle: null, env: EPH, spawnEnv: EPH, socketDir: SPAWN_SOCK, runtimeDir: KEEPER.runtimeDir, profile: { id: 'eph-bk-0000000a' }, handles: [], pinTab: false };
    r3 = await cli(['snapshot'], twinEnv);
    lc = last();
    ok(lc.env.AGENT_BROWSER_CONFIG === '/data/cfg.json' && lc.env.AGENT_BROWSER_SESSION === 'vs-bk-0000000a' && !('AGENT_BROWSER_CDP' in lc.env) && !('AGENT_BROWSER_PROXY' in lc.env) && !('AGENT_BROWSER_ARGS' in lc.env) && !('AGENT_BROWSER_EXECUTABLE_PATH' in lc.env), 'ephemeral: the server\'s pairs verbatim (its CONFIG over the shell\'s), no CDP / PROXY / ARGS / EXECUTABLE_PATH twin', JSON.stringify(lc.env));
    ok(lc.env.AGENT_BROWSER_SOCKET_DIR === SPAWN_SOCK && lc.xdg === KEEPER.runtimeDir, 'r2: ephemeral — the command lands under the root the keeper launched it in (the spawn pair\'s short dir), not the agent\'s decoy', JSON.stringify({ sd: lc.env.AGENT_BROWSER_SOCKET_DIR, xdg: lc.xdg }));
    // an attachment: the keeper's CDP pair is the ONE that reaches the binary
    resolveAnswer = { ok: true, kind: 'attachment', handle: 'work', env: ['AGENT_BROWSER_SESSION=vs-bk-0000000a', 'AGENT_BROWSER_NAMESPACE=vs-bp-00000001', 'AGENT_BROWSER_CDP=ws://127.0.0.1:4444/m/tok/devtools/browser'], spawnEnv: ['AGENT_BROWSER_SESSION=vs-bk-0000000a', 'AGENT_BROWSER_NAMESPACE=vs-bk-0000000a', 'AGENT_BROWSER_CONFIG=/data/cfg.json', `AGENT_BROWSER_SOCKET_DIR=${SPAWN_SOCK}`], ...KEEPER, profile: { id: 'bp-00000001', label: 'Work' }, lease: { since: Date.now() }, others: 0, handles: [], isDefault: true, pinTab: false };
    const ownShell = { ...twinEnv, AGENT_BROWSER_SESSION: 'vs-bk-0000000a', AGENT_BROWSER_NAMESPACE: 'vs-bk-0000000a', AGENT_BROWSER_CONFIG: '/data/cfg.json', AGENT_BROWSER_SOCKET_DIR: SPAWN_SOCK, XDG_RUNTIME_DIR: KEEPER.runtimeDir };
    const TW2 = Object.keys(TWINS).filter((k) => !['AGENT_BROWSER_SESSION', 'AGENT_BROWSER_NAMESPACE', 'AGENT_BROWSER_CONFIG'].includes(k));
    r3 = await cli(['snapshot'], ownShell);
    lc = last();
    ok(lc.env.AGENT_BROWSER_CDP === 'ws://127.0.0.1:4444/m/tok/devtools/browser' && lc.env.AGENT_BROWSER_NAMESPACE === 'vs-bp-00000001' && lc.env.AGENT_BROWSER_CONFIG === '/data/cfg.json' && TW2.filter((k) => lc.env[k] === TWINS[k]).length === 0, 'attachment: the keeper\'s (mediated) CDP pair wins over the spawn pairs underneath (CONFIG kept, as before); the shell\'s twins are gone', JSON.stringify(lc.env));
    ok(!/AGENT_BROWSER_(SESSION|NAMESPACE|CONFIG|SOCKET_DIR)\b|XDG_RUNTIME_DIR/.test((/.*\[env_twin_dropped\].*/.exec(r3.stderr) || [''])[0]), '…and the session\'s OWN spawn pairs replaced by the lease are never reported as dropped', r3.stderr);
    ok(lc.env.AGENT_BROWSER_SOCKET_DIR === KEEPER.socketDir, 'r2: attachment — the lease\'s daemon lives under the KEEPER\'s root, even over a spawn pair naming another (the long-home short dir)', JSON.stringify({ sd: lc.env.AGENT_BROWSER_SOCKET_DIR }));
    // an r1 server's answer (spawnEnv, no socket root): the shell's SOCKET_DIR is not a spawn pair ⇒ dropped
    resolveAnswer = { ok: true, kind: 'none', shared: false, handle: null, env: [], spawnEnv: ['AGENT_BROWSER_SESSION=vs-bk-0000000a', 'AGENT_BROWSER_NAMESPACE=vs-bk-0000000a'], handles: [], pinTab: false };
    await cli(['snapshot'], twinEnv);
    ok(!('AGENT_BROWSER_SOCKET_DIR' in last().env), 'r2: an answer naming no socket root keeps only a SOCKET_DIR that is the session\'s own spawn pair (the decoy is dropped)', JSON.stringify(last().env));
    // an older server (no spawnEnv): the session's own identity pairs are kept as before, launch / CDP twins still dropped
    resolveAnswer = { ok: true, kind: 'none', handle: null, env: [], handles: [], pinTab: false };
    r3 = await cli(['snapshot'], twinEnv);
    lc = last();
    ok(lc.env.AGENT_BROWSER_SESSION === 'vfy-e' && !('AGENT_BROWSER_CDP' in lc.env) && !('AGENT_BROWSER_PROXY' in lc.env) && !('AGENT_BROWSER_ARGS' in lc.env) && !('AGENT_BROWSER_STATE' in lc.env), 'an older server\'s answer (no spawnEnv): identity pairs kept as the shell has them, every launch / CDP / state twin still dropped', JSON.stringify(lc.env));
    // r2 CONTROL: the r1 verb table (SOCKET_DIR an output key, no socket root in the answer honoured) beside a
    // copy of the CLI lets the agent's decoy root through — the socket legs above can go red
    {
      const vsrc = fs.readFileSync(path.join(REPO, 'src/browser-verbs.js'), 'utf8');
      const r1v = vsrc.replace("'AGENT_BROWSER_DEFAULT_TIMEOUT']);", "'AGENT_BROWSER_DEFAULT_TIMEOUT', 'AGENT_BROWSER_SOCKET_DIR']);").replace('if (absPath(a.socketDir)) {', 'if (false) {');
      const D2 = path.join(ROOT, 'r1-sockctl'); fs.mkdirSync(D2, { recursive: true });
      fs.copyFileSync(CLI, path.join(D2, 'vibespace-browser')); fs.writeFileSync(path.join(D2, 'vibespace-browser-verbs.js'), r1v);
      resolveAnswer = { ok: true, kind: 'none', shared: true, handle: null, env: [], spawnEnv: [], ...KEEPER, handles: [], pinTab: false };
      const rc2 = await nodeCli(path.join(D2, 'vibespace-browser'), ['snapshot'], { env: twinEnv });
      ok(r1v !== vsrc && r1v.includes('if (false) {') && rc2.status === 0 && last().env.AGENT_BROWSER_SOCKET_DIR === DECOY.AGENT_BROWSER_SOCKET_DIR && last().xdg === DECOY.XDG_RUNTIME_DIR, 'r2 CONTROL: the r1 table in a patched copy hands the agent\'s decoy root to the binary', JSON.stringify({ sd: last().env.AGENT_BROWSER_SOCKET_DIR, xdg: last().xdg, st: rc2.status, err: rc2.stderr.slice(0, 200) }));
    }
    // CONTROL: a CLI copy with the pre-fix env line (`{ ...process.env }`) lets them through — the leg can go red
    const src = fs.readFileSync(CLI, 'utf8');
    const CTL = path.join(ROOT, 'vibespace-browser-prefix');
    const patched = src.replace(/const built = V\.childEnv\([^\n]*\n/, 'const built = { env: { ...process.env, ...Object.fromEntries((r.env || []).map((kv) => [kv.slice(0, kv.indexOf(\'=\')), kv.slice(kv.indexOf(\'=\') + 1)])) }, dropped: [] };\n');
    fs.writeFileSync(CTL, patched, { mode: 0o755 });
    fs.copyFileSync(path.join(REPO, 'src/browser-verbs.js'), path.join(ROOT, 'vibespace-browser-verbs.js'));
    resolveAnswer = { ok: true, kind: 'none', shared: true, handle: null, env: [], spawnEnv: [], handles: [], pinTab: false };
    const rctl = await nodeCli(CTL, ['snapshot'], { env: twinEnv });
    ok(patched !== src && rctl.status === 0 && leaked(last().env).length > 5, `CONTROL: the pre-fix env line in a patched copy leaks the twins (${leaked(last().env).length})`, rctl.stderr);
  }
  // r3 (takeover finding 2): THE CONFIG FILE is named, never searched. A shared-rung answer names none, so the
  // CLI composes one from this machine's two files by the one rule — the agent's directory holds an
  // agent-browser.json with launch keys and a raw port, the user file a raw port and `cdp`
  {
    const DIRTY = path.join(ROOT, 'dirty'); fs.mkdirSync(DIRTY, { recursive: true });
    fs.mkdirSync(path.join(HOME, '.agent-browser'), { recursive: true });
    const UCFG = path.join(HOME, '.agent-browser', 'config.json');
    fs.writeFileSync(UCFG, JSON.stringify({ args: '--no-sandbox,--remote-debugging-port=41999', cdp: '9222', proxy: 'http://127.0.0.1:3128' }));
    fs.writeFileSync(path.join(DIRTY, 'agent-browser.json'), JSON.stringify({ args: '--remote-debugging-port=42945', executablePath: '/x/dumpchrome', userAgent: 'R3-UA', allowedDomains: ['example.com'] }));
    const last = () => { const rc2 = realCalls(); return rc2[rc2.length - 1]; };
    resolveAnswer = { ok: true, kind: 'none', shared: true, handle: null, env: [], spawnEnv: [], handles: [], pinTab: false };
    const n0c = realCalls().length;
    let r4 = await nodeCli(CLI, ['snapshot'], { env: { ...baseEnv, AGENT_BROWSER_CONFIG: '/tmp/agent-own.json' }, cwd: DIRTY });
    let lc = last();
    const cfgPath = lc && lc.env.AGENT_BROWSER_CONFIG;
    const cfgDir = path.join(HOME, '.vibespace', 'browser-config');
    ok(r4.status === 0 && realCalls().length === n0c + 1 && typeof cfgPath === 'string' && path.dirname(cfgPath) === cfgDir && /^[0-9a-f]{16}\.json$/.test(path.basename(cfgPath)), 'r3: no config named ⇒ the CLI composes one and NAMES it (~/.vibespace/browser-config/<content hash>.json) — never the shell\'s, never a search', JSON.stringify({ st: r4.status, cfgPath, err: r4.stderr.slice(0, 300) }));
    const cc = cfgPath && fs.existsSync(cfgPath) ? JSON.parse(fs.readFileSync(cfgPath, 'utf8')) : {};
    ok(cc.args === '--no-sandbox' && cc.proxy === 'http://127.0.0.1:3128' && JSON.stringify(cc.allowedDomains) === '["example.com"]' && !('cdp' in cc) && !('executablePath' in cc) && !('userAgent' in cc) && (fs.statSync(cfgPath).mode & 0o777) === 0o600 && (fs.statSync(cfgDir).mode & 0o777) === 0o700,
      'r3: its content is the one rule — the user\'s args (raw port gone) and proxy, the directory\'s FENCE; the directory\'s executable / user agent / raw port and the user\'s `cdp` gone; 0600 in a 0700 dir', JSON.stringify(cc));
    ok(/\[config_keys_dropped\]/.test(r4.stderr) && /args, executablePath, userAgent/.test(r4.stderr) && /--remote-debugging-port=41999/.test(r4.stderr) && /\bcdp\b/.test(r4.stderr), 'r3: …and what did not apply is SAID (the directory\'s keys, the user file\'s raw switch and `cdp`)', r4.stderr);
    ok(/AGENT_BROWSER_CONFIG/.test((/.*\[env_twin_dropped\].*/.exec(r4.stderr) || [''])[0]), 'r3: the agent\'s own exported AGENT_BROWSER_CONFIG is reported as not passed', r4.stderr);
    await nodeCli(CLI, ['snapshot'], { env: baseEnv, cwd: DIRTY });
    const before2 = fs.readdirSync(cfgDir).length;
    await nodeCli(CLI, ['snapshot'], { env: baseEnv, cwd: DIRTY });
    ok(last().env.AGENT_BROWSER_CONFIG === cfgPath && fs.readdirSync(cfgDir).length === before2, 'r3: the same two files ⇒ the same file, no new one (content-addressed; a later command does not differ from the launch)');
    // a named config wins: the keeper's file, over the pairs' and the shell's — nothing composed
    resolveAnswer = { ok: true, kind: 'ephemeral', shared: false, handle: null, env: ['AGENT_BROWSER_SESSION=vs-bk-0000000a', 'AGENT_BROWSER_NAMESPACE=vs-bk-0000000a'], spawnEnv: ['AGENT_BROWSER_SESSION=vs-bk-0000000a', 'AGENT_BROWSER_NAMESPACE=vs-bk-0000000a'], config: '/k/data/browser-env/machine-ephemeral.json', profile: { id: 'bp-000000e1' }, handles: [], pinTab: false };
    r4 = await nodeCli(CLI, ['snapshot'], { env: { ...baseEnv, AGENT_BROWSER_CONFIG: '/tmp/agent-own.json' }, cwd: DIRTY });
    lc = last();
    ok(r4.status === 0 && lc.env.AGENT_BROWSER_CONFIG === '/k/data/browser-env/machine-ephemeral.json' && !/config_keys_dropped/.test(r4.stderr), 'r3: a `config` the server names is the child\'s (the keeper\'s own file) — nothing composed, the directory not read', JSON.stringify({ env: lc.env, err: r4.stderr.slice(0, 200) }));
    // a file that does not parse is refused by name, nothing runs (the binary would refuse it too)
    resolveAnswer = { ok: true, kind: 'none', shared: true, handle: null, env: [], spawnEnv: [], handles: [], pinTab: false };
    const BAD = path.join(ROOT, 'bad'); fs.mkdirSync(BAD, { recursive: true }); fs.writeFileSync(path.join(BAD, 'agent-browser.json'), '{ torn');
    const n2c = realCalls().length;
    r4 = await nodeCli(CLI, ['snapshot'], { env: baseEnv, cwd: BAD });
    ok(r4.status === 1 && /\[config_unavailable\]/.test(r4.stderr) && r4.stderr.includes(path.join(BAD, 'agent-browser.json')) && realCalls().length === n2c, 'r3: an agent-browser.json that does not parse ⇒ config_unavailable naming it, nothing run', r4.stderr);
    // NEGATIVE CONTROL: the r2 CLI (no compose) in a patched copy hands the binary NO config — it would search the directory
    const csrc = fs.readFileSync(CLI, 'utf8');
    const cpre = csrc.replace('  if (built.needsConfig) {', '  if (false) {');
    const D3 = path.join(ROOT, 'r2-cfgctl'); fs.mkdirSync(D3, { recursive: true });
    fs.writeFileSync(path.join(D3, 'vibespace-browser'), cpre); fs.copyFileSync(path.join(REPO, 'src/browser-verbs.js'), path.join(D3, 'vibespace-browser-verbs.js'));
    r4 = await nodeCli(path.join(D3, 'vibespace-browser'), ['snapshot'], { env: baseEnv, cwd: DIRTY });
    ok(cpre !== csrc && r4.status === 0 && !('AGENT_BROWSER_CONFIG' in last().env), 'r3 NEGATIVE CONTROL: the r2 CLI (patched copy) runs the binary with NO config named — the search that lands ./agent-browser.json', JSON.stringify(last().env));
    fs.rmSync(UCFG, { force: true });
  }
  // r4 (takeover finding 1): a navigation off the web is refused by the shipped CLI, locally; `state load`
  // of a file that names a local origin too (the CLI reads the file the binary would)
  {
    resolveAnswer = { ok: true, kind: 'none', shared: true, handle: null, env: [], spawnEnv: [], handles: [], pinTab: false };
    const nb = calls.length; const nr = realCalls().length;
    for (const argv of [['open', 'chrome://version'], ['open', 'file:///tmp/agent-browser-chrome-x/DevToolsActivePort'], ['tab', 'new', 'FILE:/etc/hostname'], ['--', 'goto', 'about:version'], ['batch', 'open https://x', 'open chrome://version']]) {
      const r5 = await cli(argv);
      ok(r5.status === 1 && /\[(local_scheme_refused|batch_line_refused)\]/.test(r5.stderr) && /not a page of the web/.test(r5.stderr) && /remedy: /.test(r5.stderr), `r4: \`vibespace-browser ${argv.join(' ')}\` is refused LOCALLY`, r5.stderr);
    }
    const SD = path.join(ROOT, 'state-cwd'); fs.mkdirSync(SD, { recursive: true });
    fs.writeFileSync(path.join(SD, 'evil.json'), JSON.stringify({ cookies: [], origins: [{ origin: 'chrome://version', localStorage: [{ name: 'a', value: 'b' }] }] }));
    fs.writeFileSync(path.join(SD, 'good.json'), JSON.stringify({ cookies: [], origins: [{ origin: 'https://ok.example', localStorage: [{ name: 'a', value: 'b' }] }] }));
    let r5 = await nodeCli(CLI, ['state', 'load', 'evil.json'], { env: baseEnv, cwd: SD });
    ok(r5.status === 1 && /\[local_scheme_refused\]/.test(r5.stderr) && /chrome:\/\/version/.test(r5.stderr), 'r4: `state load evil.json` (an origin of chrome://version, read relative to the cwd as the binary does) is refused locally', r5.stderr);
    r5 = await nodeCli(CLI, ['batch', 'state load evil.json'], { env: baseEnv, cwd: SD });
    ok(r5.status === 1 && /\[local_scheme_refused\]/.test(r5.stderr), 'r4: …inside a batch too', r5.stderr);
    ok(calls.length === nb && realCalls().length === nr, 'r4: …every one with ZERO server calls and nothing run');
    r5 = await nodeCli(CLI, ['state', 'load', 'good.json'], { env: baseEnv, cwd: SD });
    ok(r5.status === 0 && JSON.stringify(realCalls().pop().argv) === JSON.stringify(['state', 'load', path.join(SD, 'good.json')]), 'r4 CONTROL: a state file of web origins loads (the fake binary ran it) — lane L r5: handed as the ABSOLUTE path that was read', r5.stderr);
    r5 = await cli(['open', 'https://example.com']);
    ok(r5.status === 0 && realCalls().pop().argv[1] === 'https://example.com', 'r4 CONTROL: `open https://example.com` runs');
  }
  // lane L r2 (the verifier's upload finding): an upload never takes a file from a credential store —
  // refused LOCALLY by name, before the binary is looked up or /resolve is called
  {
    resolveAnswer = { ok: true, kind: 'none', shared: true, handle: null, env: [], spawnEnv: [], handles: [], pinTab: false };
    const UD = path.join(ROOT, 'upload-cwd'); fs.mkdirSync(UD, { recursive: true });
    fs.mkdirSync(path.join(HOME, '.ssh'), { recursive: true }); fs.writeFileSync(path.join(HOME, '.ssh', 'id_rsa'), 'KEY');
    fs.writeFileSync(path.join(UD, 'report.pdf'), 'pdf');
    fs.symlinkSync(path.join(HOME, '.ssh', 'id_rsa'), path.join(UD, 'innocent.txt'));
    const nb = calls.length; const nr = realCalls().length;
    for (const [argv, shown] of [
      [['upload', '@e1', path.join(HOME, '.ssh', 'id_rsa')], '~/.ssh'],
      [['upload', '@e1', '~/.ssh/id_rsa'], '~/.ssh'],
      [['upload', '@e1', 'innocent.txt'], '~/.ssh'],
      [['upload', '@e1', `../${path.basename(HOME)}/.ssh/id_rsa`], '~/.ssh'],
      [['upload', '@e1', 'report.pdf', path.join(HOME, '.claude', '.credentials.json')], '~/.claude'],
      [['upload', '@e1', path.join(REPO, 'data', 'subs', 'a', '.credentials.json')], '<VibeSpace data>/subs'],
      [['batch', 'open https://x', `upload @e1 ${path.join(HOME, '.vibespace', 'x')}`], '~/.vibespace'],
      [['--', 'upload', '@e1', path.join(HOME, '.codex', 'auth.json')], '~/.codex'],
    ]) {
      const r6 = await nodeCli(CLI, argv, { env: baseEnv, cwd: UD });
      ok(r6.status === 1 && /\[upload_secret_refused\]/.test(r6.stderr) && r6.stderr.includes(`is under ${shown}`) && /remedy: /.test(r6.stderr), `lane L r2: \`vibespace-browser ${argv.join(' ')}\` is refused LOCALLY by name (${shown})`, r6.stderr);
    }
    ok(calls.length === nb && realCalls().length === nr, 'lane L r2: …every one with ZERO server calls and nothing run');
    let r6 = await nodeCli(CLI, ['upload', '@e1', 'report.pdf'], { env: baseEnv, cwd: UD });
    ok(r6.status === 0 && JSON.stringify(realCalls().pop().argv) === JSON.stringify(['upload', '@e1', path.join(UD, 'report.pdf')]), 'lane L r2 CONTROL: a normal file uploads (the fake binary ran it) — lane L r5: handed as the ABSOLUTE path that was judged, the selector untouched', r6.stderr);
    // NEGATIVE CONTROL: the pre-r2 CLI (no upload check) in a patched copy hands the key to the binary
    const src = fs.readFileSync(CLI, 'utf8');
    const pre = src.replace('  if (cls.uploadFiles && cls.uploadFiles.length) {', '  if (false) {');
    const D6 = path.join(ROOT, 'r2-uploadctl'); fs.mkdirSync(D6, { recursive: true });
    fs.writeFileSync(path.join(D6, 'vibespace-browser'), pre); fs.copyFileSync(path.join(REPO, 'src/browser-verbs.js'), path.join(D6, 'vibespace-browser-verbs.js'));
    r6 = await nodeCli(path.join(D6, 'vibespace-browser'), ['upload', '@e1', path.join(HOME, '.ssh', 'id_rsa')], { env: baseEnv, cwd: UD });
    ok(pre !== src && r6.status === 0 && JSON.stringify(realCalls().pop().argv) === JSON.stringify(['upload', '@e1', path.join(HOME, '.ssh', 'id_rsa')]), 'lane L r2 NEGATIVE CONTROL: the pre-r2 CLI (patched copy, no upload check) hands ~/.ssh/id_rsa to the binary — the legs above can go red', r6.stderr);
  }
  // lane L r4 (the verifier's WRITE finding): a WRITE outside the project / /tmp / ~/Downloads (or into a
  // credential store) is refused LOCALLY by name, before the binary is looked up (no `--version` spawn) or
  // /resolve is called — the write-direction twin of the upload guard. Measured on the real 0.38.1: `download`
  // wrote a clicked `data:` payload to an arbitrary abs path, `pdf` a %PDF; `open data:text/html,<a download>`
  // is not refused, so no external server is needed.
  {
    resolveAnswer = { ok: true, kind: 'none', shared: true, handle: null, env: [], spawnEnv: [], handles: [], pinTab: false };
    const WD = path.join(ROOT, 'write-cwd'); fs.mkdirSync(WD, { recursive: true });
    for (const d of ['.ssh', '.claude', '.codex', '.vibespace', '.config', 'Downloads']) fs.mkdirSync(path.join(HOME, d), { recursive: true });
    fs.writeFileSync(path.join(WD, 'base.png'), 'png');                              // a baseline for `diff`
    fs.symlinkSync(path.join(HOME, '.ssh', 'id_rsa'), path.join(WD, 'evil.txt'));    // a symlink from the cwd into a store
    const nb = calls.length; const nr = realCalls().length;
    // lane L r5 F3: a VibeSpace session exports its directory — the fence is VIBESPACE_SESSION_CWD, never the shell's cwd
    const wenv = { ...baseEnv, VIBESPACE_SESSION_CWD: WD };
    for (const [argv, shown] of [
      [['download', '#k', path.join(HOME, '.ssh', 'authorized_keys')], '~/.ssh'],
      [['pdf', path.join(HOME, '.claude', 'settings.json')], '~/.claude'],
      [['state', 'save', path.join(HOME, '.ssh', 'x')], '~/.ssh'],
      [['screenshot', '@e1', path.join(HOME, '.codex', 'shot.png')], '~/.codex'],
      [['record', 'start', path.join(HOME, '.vibespace', 'x.webm')], '~/.vibespace'],
      [['trace', 'stop', path.join(HOME, '.config', 'x.json')], '~/.config'],
      [['screenshot', '--screenshot-dir', path.join(HOME, '.ssh')], '~/.ssh'],
      [['diff', 'screenshot', '--baseline', 'base.png', '-o', path.join(HOME, '.ssh', 'o.png')], '~/.ssh'],
      [['download', '#k', '~/.ssh/authorized_keys'], '~/.ssh'],                       // a literal ~
      [['download', '#k', `../${path.basename(HOME)}/.ssh/k`], '~/.ssh'],             // a relative path into the store
      [['download', '#k', path.join(HOME, '.ssh') + '/'], '~/.ssh'],                  // a trailing slash
      [['download', '#k', 'evil.txt'], '~/.ssh'],                                     // a symlink from the cwd into the store
      [['--', 'pdf', path.join(HOME, '.claude', 'y.pdf')], '~/.claude'],              // the `--` escape valve
      [['batch', 'open https://x', `pdf ${path.join(HOME, '.codex', 'z.pdf')}`], '~/.codex'],  // a batch line
      [['pdf', path.join(REPO, 'data', 'subs', 'a', 'x.pdf')], '<VibeSpace data>/subs'],       // an account store
    ]) {
      const r7 = await nodeCli(CLI, argv, { env: wenv, cwd: WD });
      ok(r7.status === 1 && /\[write_path_refused\]/.test(r7.stderr) && r7.stderr.includes(`is under ${shown}`) && /remedy: /.test(r7.stderr), `lane L r4: \`vibespace-browser ${argv.join(' ')}\` is refused LOCALLY by name (${shown})`, r7.stderr);
    }
    // a path in no allowed root (not a store either) — the containment sentence
    let r7 = await nodeCli(CLI, ['pdf', '/etc/x.pdf'], { env: wenv, cwd: WD });
    ok(r7.status === 1 && /\[write_path_refused\]/.test(r7.stderr) && /outside the places a browser command may write/.test(r7.stderr), 'lane L r4: `pdf /etc/x.pdf` (in no allowed root) is refused with the containment sentence', r7.stderr);
    ok(calls.length === nb && realCalls().length === nr, 'lane L r4: …every one with ZERO server calls and nothing run (not even `--version`)');
    // CONTROL: the project cwd, /tmp and ~/Downloads all WRITE (the fake binary ran)
    r7 = await nodeCli(CLI, ['pdf', 'report.pdf'], { env: wenv, cwd: WD });
    ok(r7.status === 0 && JSON.stringify(realCalls().pop().argv) === JSON.stringify(['pdf', path.join(WD, 'report.pdf')]), 'lane L r4 CONTROL: a path in the session\'s project writes (the fake binary ran it) — r5: handed ABSOLUTE', r7.stderr);
    // the CLI runs with an env carrying no TMPDIR, so its OS temp dir is /tmp (the scratch ROOT is under it)
    r7 = await nodeCli(CLI, ['download', '#k', '/tmp/vs-r4-dl.bin'], { env: wenv, cwd: WD });
    ok(r7.status === 0 && realCalls().pop().argv[2] === '/tmp/vs-r4-dl.bin', 'lane L r4 CONTROL: a path in the OS temp dir (/tmp) writes', r7.stderr);
    r7 = await nodeCli(CLI, ['screenshot', '~/Downloads/x.png'], { env: wenv, cwd: WD });
    ok(r7.status === 0 && JSON.stringify(realCalls().pop().argv) === JSON.stringify(['screenshot', path.join(HOME, 'Downloads', 'x.png')]), 'lane L r5 F4: a path in ~/Downloads is ALLOWED and the binary is handed the EXPANDED absolute word (the binary never expands `~` — measured: `pdf \'~/x.pdf\'` looked for a directory named ~; r4 pinned the word as given)', r7.stderr);
    // NEGATIVE CONTROL: the pre-r4 CLI (no write check) in a patched copy hands the store path to the binary
    const src = fs.readFileSync(CLI, 'utf8');
    const pre = src.replace('  if (cls.writeFiles && cls.writeFiles.length) {', '  if (false) {')
      .replace('{ const wr = framed.writes.length ? writeRefusal(framed.writes) : null; if (wr) refuseLocally(wr); }', '{ }');
    const D7 = path.join(ROOT, 'ctl', 'r4-writectl', 'bin'); fs.mkdirSync(D7, { recursive: true });
    fs.writeFileSync(path.join(D7, 'vibespace-browser'), pre); fs.copyFileSync(path.join(REPO, 'src/browser-verbs.js'), path.join(D7, 'vibespace-browser-verbs.js'));
    r7 = await nodeCli(path.join(D7, 'vibespace-browser'), ['download', '#k', path.join(HOME, '.ssh', 'authorized_keys')], { env: wenv, cwd: WD });
    ok(pre !== src && r7.status === 0 && JSON.stringify(realCalls().pop().argv) === JSON.stringify(['download', '#k', path.join(HOME, '.ssh', 'authorized_keys')]), 'lane L r4 NEGATIVE CONTROL: the pre-r4 CLI (patched copy, no write check) hands ~/.ssh/authorized_keys to the binary — the legs above can go red', r7.stderr);
    fs.rmSync(path.join(WD, 'evil.txt'), { force: true });
  }
  // lane L r5 (verify r3 F1–F6): THE FRAME, end to end over the fake binary (it records its argv AND its cwd)
  {
    resolveAnswer = { ok: true, kind: 'none', shared: true, handle: null, env: [], spawnEnv: [], handles: [], pinTab: false };
    const os = require('os');
    const P = path.join(ROOT, 'r5-proj'); const ELSE = path.join(ROOT, 'r5-elsewhere'); const TMPD = path.join(ROOT, 'r5-tmp');
    for (const d of [P, path.join(P, 'sub'), ELSE, TMPD, path.join(HOME, '.ssh'), path.join(HOME, 'Downloads')]) fs.mkdirSync(d, { recursive: true });
    // the scratch ROOT itself sits under /tmp — an allowed root — so these legs name their OWN temp dir (TMPDIR), or
    // every "outside" target would pass as a temp file
    const benv = { ...baseEnv, TMPDIR: TMPD };
    const penv = { ...benv, VIBESPACE_SESSION_CWD: P };
    const last = () => realCalls().pop();
    const DC = V.ensureDaemonCwd({ fs, tmpdirs: [TMPD, '/tmp'], uid: process.getuid(), checkout: REPO });   // what the CLI (TMPDIR = TMPD) must run the binary in
    const ctlCopy = (name, cliSrc, verbsSrc) => { const d = path.join(ROOT, 'ctl', name, 'bin'); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, 'vibespace-browser'), cliSrc); fs.writeFileSync(path.join(d, 'vibespace-browser-verbs.js'), verbsSrc || fs.readFileSync(path.join(REPO, 'src/browser-verbs.js'), 'utf8')); return path.join(d, 'vibespace-browser'); };
    const src = fs.readFileSync(CLI, 'utf8');
    ok(DC.ok && DC.dir === path.join(fs.realpathSync(TMPD), `vibespace-browser-cwd-${process.getuid()}`) && (fs.statSync(DC.dir).mode & 0o777) === 0o700, `lane L r5 F1(b): the private daemon directory is <TMPDIR>/vibespace-browser-cwd-<uid>, 0700 (${DC.dir})`, JSON.stringify(DC));
    // ── F1 (CRITICAL): the binary is handed the ABSOLUTE path that was judged, and runs in the private directory
    let r = await nodeCli(CLI, ['pdf', './out.pdf'], { env: penv, cwd: P });
    let lc = last();
    ok(r.status === 0 && JSON.stringify(lc.argv) === JSON.stringify(['pdf', path.join(P, 'out.pdf')]), 'lane L r5 F1: `pdf ./out.pdf` reaches the binary as the ABSOLUTE path it was judged as — the daemon\'s own cwd can no longer move it', JSON.stringify([r.status, r.stderr.slice(0, 300), lc && lc.argv]));
    ok(lc.cwd === DC.dir && lc.cwd !== P && !lc.cwd.startsWith(REPO), `lane L r5 F1(b): the binary (and any daemon it starts) runs in the private directory, never the agent's (${lc.cwd})`);
    r = await nodeCli(CLI, ['pdf', 'x.pdf'], { env: penv, cwd: path.join(P, 'sub') }); lc = last();
    ok(r.status === 0 && lc.argv[1] === path.join(P, 'sub', 'x.pdf'), 'lane L r5 F1: a relative word means "from where the agent stands" (P/sub/x.pdf), then is fenced to the session\'s root');
    const handed = async (argv, want, what) => { const rr = await nodeCli(CLI, argv, { env: penv, cwd: P }); const l2 = last(); ok(rr.status === 0 && l2 && JSON.stringify(l2.argv) === JSON.stringify(want), `lane L r5 F1: ${what}`, JSON.stringify([rr.status, rr.stderr.slice(0, 300), l2 && l2.argv])); };
    await handed(['download', '#k', './d1', 'd2'], ['download', '#k', path.join(P, 'd1'), path.join(P, 'd2')], '`download #k ./d1 d2` — every word after the selector absolute (the binary saves the FIRST: measured), the selector untouched');
    await handed(['screenshot', '.btn'], ['screenshot', '.btn'], 'a lone selector (`screenshot .btn`) is handed as typed — it is not a path');
    await handed(['screenshot', 'o.png'], ['screenshot', path.join(P, 'o.png')], 'a lone path-like word (`screenshot o.png`) is handed absolute');
    await handed(['screenshot', '--screenshot-dir=./shots', '@e1'], ['screenshot', `--screenshot-dir=${path.join(P, 'shots')}`, '@e1'], 'a `--screenshot-dir=` value is handed absolute, the selector kept');
    await handed(['record', 'start', './v.webm', 'https://example.com'], ['record', 'start', path.join(P, 'v.webm'), 'https://example.com'], '`record start ./v.webm <url>` — the path absolute, the URL untouched');
    await handed(['state', 'save', 's.json'], ['state', 'save', path.join(P, 's.json')], '`state save s.json` absolute');
    await handed(['pdf', '~/Downloads/r.pdf'], ['pdf', path.join(HOME, 'Downloads', 'r.pdf')], 'F4: `~/Downloads/r.pdf` is handed EXPANDED (the binary does not expand `~`)');
    // a batch: its lines are framed too — an argument-form batch whose lines carry a path goes over in the binary's own stdin JSON
    r = await nodeCli(CLI, ['batch', 'open https://x', 'pdf ./b.pdf'], { env: penv, cwd: P }); lc = last();
    ok(r.status === 0 && JSON.stringify(lc.argv) === '["batch"]' && JSON.stringify(lc.batchJson) === JSON.stringify([['open', 'https://x'], ['pdf', path.join(P, 'b.pdf')]]), 'lane L r5 F1: an argument-form batch line `pdf ./b.pdf` reaches the binary absolute — handed in its own stdin JSON form (exactly the judged words, never re-quoted)', JSON.stringify([r.status, r.stderr.slice(0, 300), lc && { argv: lc.argv, b: lc.batchJson }]));
    r = await nodeCli(CLI, ['batch'], { env: penv, cwd: P, input: '[["pdf","./c.pdf"]]' }); lc = last();
    ok(r.status === 0 && JSON.stringify(lc.batchJson) === JSON.stringify([['pdf', path.join(P, 'c.pdf')]]), 'lane L r5 F1: a stdin JSON batch element `pdf ./c.pdf` is handed absolute', JSON.stringify([r.status, r.stderr.slice(0, 200), lc && lc.batchJson]));
    r = await nodeCli(CLI, ['batch', 'open https://x', 'snapshot'], { env: penv, cwd: P }); lc = last();
    ok(r.status === 0 && JSON.stringify(lc.argv) === '["batch","open https://x","snapshot"]' && lc.input === '', 'lane L r5 CONTROL: a batch with no path is handed exactly as typed');
    // NEGATIVE CONTROLS: the r4 hand-over (the words as typed) and the r4 spawn (the agent's cwd)
    let c1 = ctlCopy('r5-framectl', src.replace("const argv = closeAllScoped ? framed.argv.filter((x) => x !== '--all') : [...framed.argv];", "const argv = closeAllScoped ? rest.filter((x) => x !== '--all') : [...rest];")); // the hand-over line since the 2.369.182 integration (lane H's close --all filter over the in-frame argv)
    r = await nodeCli(c1, ['pdf', './out.pdf'], { env: penv, cwd: P }); lc = last();
    ok(fs.readFileSync(c1, 'utf8') !== src && r.status === 0 && lc.argv[1] === './out.pdf', 'lane L r5 F1 NEGATIVE CONTROL: the r4 hand-over (patched copy) gives the binary `./out.pdf` — a word its DAEMON resolves in its own frame', JSON.stringify(lc && lc.argv));
    c1 = ctlCopy('r5-cwdctl', src.replace('const child = spawn(bin.path, argv, { stdio, env, cwd: runCwd.dir });', 'const child = spawn(bin.path, argv, { stdio, env });'));
    r = await nodeCli(c1, ['snapshot'], { env: penv, cwd: P }); lc = last();
    ok(fs.readFileSync(c1, 'utf8') !== src && r.status === 0 && lc.cwd === P, 'lane L r5 F1(b) NEGATIVE CONTROL: without the spawn cwd (patched copy) the binary runs in the agent\'s directory — a daemon it starts would keep it', JSON.stringify(lc && lc.cwd));
    // ── lane L r6 F-A (verify r4 MAJOR): `wait --download <path>` is judged like every writer and handed ABSOLUTE
    {
      const n0 = calls.length; const n1 = realCalls().length;
      r = await nodeCli(CLI, ['wait', '--download', '/etc/cron.d/x'], { env: penv, cwd: P });
      ok(r.status === 1 && /\[write_path_refused\]/.test(r.stderr) && /outside the places/.test(r.stderr) && calls.length === n0 && realCalls().length === n1, 'lane L r6 F-A: `wait --download /etc/cron.d/x` ⇒ write_path_refused — zero server calls, nothing run', r.stderr);
      r = await nodeCli(CLI, ['wait', '--download', path.join(HOME, '.ssh', 'zz'), '--timeout', '5000'], { env: penv, cwd: P });
      ok(r.status === 1 && /\[write_path_refused\]/.test(r.stderr) && r.stderr.includes('is under ~/.ssh'), 'lane L r6 F-A: `wait --download ~/.ssh/zz --timeout 5000` ⇒ refused (under ~/.ssh)', r.stderr);
      r = await nodeCli(CLI, ['wait', '--download', './f.pdf', '--timeout', '30000'], { env: penv, cwd: P }); lc = last();
      ok(r.status === 0 && JSON.stringify(lc.argv) === JSON.stringify(['wait', '--download', path.join(P, 'f.pdf'), '--timeout', '30000']), 'lane L r6 F-A: `wait --download ./f.pdf --timeout 30000` reaches the binary with the path ABSOLUTE under the session root (the timeout untouched)', JSON.stringify([r.status, r.stderr.slice(0, 300), lc && lc.argv]));
      r = await nodeCli(CLI, ['wait', '--download'], { env: penv, cwd: P }); lc = last();
      ok(r.status === 0 && JSON.stringify(lc.argv) === '["wait","--download"]', 'lane L r6 F-A: `wait --download` with no path is handed as typed (the value is optional)', JSON.stringify([r.status, r.stderr.slice(0, 200), lc && lc.argv]));
      r = await nodeCli(CLI, ['batch', 'open https://x', 'wait --download ./g.pdf'], { env: penv, cwd: P }); lc = last();
      ok(r.status === 0 && JSON.stringify(lc.batchJson) === JSON.stringify([['open', 'https://x'], ['wait', '--download', path.join(P, 'g.pdf')]]), 'lane L r6 F-A: a batch line `wait --download ./g.pdf` is handed absolute', JSON.stringify([r.status, r.stderr.slice(0, 200), lc && lc.batchJson]));
      // NEGATIVE CONTROL: the r5 table (a verbs copy without `wait`) passes the store path and hands a relative one relative
      const vsrc = fs.readFileSync(path.join(REPO, 'src/browser-verbs.js'), 'utf8');
      const noWait = vsrc.replace(/\n\s*wait: \{ flags: \['--download'\] \},/, '');
      const cw = ctlCopy('r6-nowait', src, noWait);
      r = await nodeCli(cw, ['wait', '--download', '/etc/cron.d/x'], { env: penv, cwd: P }); lc = last();
      const r2 = await nodeCli(cw, ['wait', '--download', './f.pdf'], { env: penv, cwd: P }); const lc2 = last();
      ok(noWait !== vsrc && r.status === 0 && lc.argv[2] === '/etc/cron.d/x' && r2.status === 0 && lc2.argv[2] === './f.pdf', 'lane L r6 F-A NEGATIVE CONTROL: the table without `wait` (a verbs copy) runs `wait --download /etc/cron.d/x` and hands `./f.pdf` relative — the legs above can go red', JSON.stringify([r.status, lc && lc.argv, r2.status, lc2 && lc2.argv]));
      // ── F-B (verify r4 MINOR): a lone selector holding a `/` is handed as typed, a lone path absolute
      r = await nodeCli(CLI, ['screenshot', '.x[href="/login"]'], { env: penv, cwd: P }); lc = last();
      ok(r.status === 0 && JSON.stringify(lc.argv) === JSON.stringify(['screenshot', '.x[href="/login"]']), 'lane L r6 F-B: `screenshot .x[href="/login"]` (a class selector whose attribute holds a URL path) is handed as typed — an element screenshot, not a save to <cwd>/.x[href=…', JSON.stringify([r.status, r.stderr.slice(0, 200), lc && lc.argv]));
      r = await nodeCli(CLI, ['screenshot', 'a[href="/login"]'], { env: penv, cwd: P }); lc = last();
      ok(r.status === 0 && lc.argv[1] === path.join(P, 'a[href="/login"]'), 'lane L r6 F-B: `screenshot a[href="/login"]` — a path to the binary (measured) — is handed absolute', JSON.stringify(lc && lc.argv));
      const oldHeur = vsrc.replace(/if \(pos\.length >= 2\) all\(1, 'write'\); else if \(pos\.length === 1 && [^\n]*\n/, "if (pos.length >= 2) all(1, 'write'); else if (pos.length === 1 && (w(0).includes('/') || IMAGE_PATH_RE.test(w(0)))) add(pos[0], 'write'); }\n");
      const ch = ctlCopy('r6-oldheur', src, oldHeur);
      r = await nodeCli(ch, ['screenshot', '.x[href="/login"]'], { env: penv, cwd: P }); lc = last();
      ok(oldHeur !== vsrc && r.status === 0 && lc.argv[1] === path.join(P, '.x[href="/login"]'), 'lane L r6 F-B NEGATIVE CONTROL: the r5 heuristic (a verbs copy) rewrites the selector into <P>/.x[href="/login"] — the leg above can go red', JSON.stringify([r.status, lc && lc.argv]));
    }
    // ── F2 (MAJOR): `..` after a symlink is resolved PHYSICALLY
    fs.writeFileSync(path.join(HOME, '.ssh', 'id_rsa'), 'KEY');
    fs.symlinkSync(path.join(HOME, '.ssh'), path.join(P, 'l'));
    fs.symlinkSync(ELSE, path.join(P, 'e'));
    const nb = calls.length; const nr = realCalls().length;
    r = await nodeCli(CLI, ['pdf', 'l/../.ssh/authorized_keys'], { env: penv, cwd: P });
    ok(r.status === 1 && /\[write_path_refused\]/.test(r.stderr) && r.stderr.includes('is under ~/.ssh'), 'lane L r5 F2: with l -> ~/.ssh, `pdf l/../.ssh/authorized_keys` is refused (under ~/.ssh — the kernel follows l before the `..`)', r.stderr);
    r = await nodeCli(CLI, ['upload', '#f', 'l/../.ssh/id_rsa'], { env: penv, cwd: P });
    ok(r.status === 1 && /\[upload_secret_refused\]/.test(r.stderr) && r.stderr.includes('is under ~/.ssh'), 'lane L r5 F2: …the upload guard\'s twin: `upload #f l/../.ssh/id_rsa` is refused', r.stderr);
    r = await nodeCli(CLI, ['pdf', 'e/../r5-elsewhere/x.pdf'], { env: penv, cwd: P });
    ok(r.status === 1 && /\[write_path_refused\]/.test(r.stderr) && /outside the places/.test(r.stderr), 'lane L r5 F2: with e -> a directory outside the project, `pdf e/../r5-elsewhere/x.pdf` is refused (it names <scratch>/r5-elsewhere/x.pdf, not P/r5-elsewhere/x.pdf)', r.stderr);
    ok(calls.length === nb && realCalls().length === nr, 'lane L r5 F2: …each with ZERO server calls and nothing run');
    // NEGATIVE CONTROL: the r4 LEXICAL rule (patched copy: path.resolve, then the realpath of the deepest existing ancestor)
    const lex = "const r = (() => { const exp = s === '~' ? HOMES.home : (s.startsWith('~/') ? path.join(HOMES.home, s.slice(2)) : s); const abs = path.resolve(base || '/', exp); let anc = abs; const rem = []; for (;;) { try { const rp = fs.realpathSync(anc); return { ok: true, path: rem.length ? path.join(rp, ...rem) : rp }; } catch { } const par = path.dirname(anc); if (par === anc) return { ok: true, path: abs }; rem.unshift(path.basename(anc)); anc = par; } })();";
    c1 = ctlCopy('r5-lexctl', src.replace("const r = V.physicalPath(s, { base: base || '/', home: HOMES.home, ...FSOPS });", lex));
    r = await nodeCli(c1, ['pdf', 'e/../r5-elsewhere/x.pdf'], { env: penv, cwd: P }); lc = last();
    ok(fs.readFileSync(c1, 'utf8') !== src && r.status === 0 && lc.argv[1] === path.join(P, 'r5-elsewhere', 'x.pdf'), 'lane L r5 F2 NEGATIVE CONTROL: the r4 lexical rule (patched copy) passes `e/../r5-elsewhere/x.pdf` as P/r5-elsewhere/x.pdf — the leg above can go red', JSON.stringify([r.status, r.stderr.slice(0, 200), lc && lc.argv]));
    // ── F3 (MAJOR): the fence is the SESSION's directory — VIBESPACE_SESSION_CWD — never the shell's
    r = await nodeCli(CLI, ['pdf', './x.pdf'], { env: benv, cwd: P });
    ok(r.status === 1 && /\[write_path_refused\]/.test(r.stderr) && /no session directory is known/.test(r.stderr), 'lane L r5 F3: VIBESPACE_SESSION_CWD unset ⇒ `pdf ./x.pdf` is refused (no session directory) — the shell\'s cwd is not a fence', r.stderr);
    r = await nodeCli(CLI, ['pdf', path.join(TMPD, 'x.pdf')], { env: benv, cwd: P });
    ok(r.status === 0 && last().argv[1] === path.join(TMPD, 'x.pdf'), 'lane L r5 F3: …unset, the OS temp dir still writes', r.stderr);
    r = await nodeCli(CLI, ['pdf', './x.pdf'], { env: penv, cwd: ELSE });
    ok(r.status === 1 && /\[write_path_refused\]/.test(r.stderr) && r.stderr.includes(`the project directory (${fs.realpathSync(P)}`), 'lane L r5 F3: set ⇒ a `./x.pdf` typed from a directory outside it (the verifier\'s `cd /etc`) is refused, naming the project', r.stderr);
    r = await nodeCli(CLI, ['pdf', path.join(P, 'y.pdf')], { env: penv, cwd: ELSE });
    ok(r.status === 0 && last().argv[1] === path.join(P, 'y.pdf'), 'lane L r5 F3: set ⇒ a path under it writes, wherever the shell stands');
    r = await nodeCli(CLI, ['pdf', './x.pdf'], { env: { ...benv, VIBESPACE_SESSION_CWD: 'r5-proj' }, cwd: ROOT });
    ok(r.status === 1 && /no session directory is known/.test(r.stderr), 'lane L r5 F3: a RELATIVE VIBESPACE_SESSION_CWD is no root', r.stderr);
    c1 = ctlCopy('r5-fencectl', src.replace('  const v = process.env.VIBESPACE_SESSION_CWD;\n', '  const v = process.env.VIBESPACE_SESSION_CWD || process.cwd();\n'));
    r = await nodeCli(c1, ['pdf', './x.pdf'], { env: benv, cwd: ELSE });
    ok(fs.readFileSync(c1, 'utf8') !== src && r.status === 0, 'lane L r5 F3 NEGATIVE CONTROL: the r4 fence (patched copy: the shell\'s cwd when nothing is exported) writes from anywhere the shell stands', r.stderr);
    // ── F5 (LOW): AGENT_BROWSER_SCREENSHOT_DIR never reaches the binary
    r = await nodeCli(CLI, ['snapshot'], { env: { ...penv, AGENT_BROWSER_SCREENSHOT_DIR: '/etc' }, cwd: P }); lc = last();
    ok(r.status === 0 && !('AGENT_BROWSER_SCREENSHOT_DIR' in lc.env) && /AGENT_BROWSER_SCREENSHOT_DIR/.test((/.*\[env_twin_dropped\].*/.exec(r.stderr) || [''])[0]), 'lane L r5 F5: AGENT_BROWSER_SCREENSHOT_DIR in the shell is not passed to the binary, and the drop is said by name', JSON.stringify([lc && lc.env, r.stderr.slice(0, 300)]));
    c1 = ctlCopy('r5-envctl', src, fs.readFileSync(path.join(REPO, 'src/browser-verbs.js'), 'utf8').replace("'AGENT_BROWSER_CONTENT_BOUNDARIES', 'AGENT_BROWSER_SCREENSHOT_FORMAT'", "'AGENT_BROWSER_CONTENT_BOUNDARIES', 'AGENT_BROWSER_SCREENSHOT_DIR', 'AGENT_BROWSER_SCREENSHOT_FORMAT'"));
    r = await nodeCli(c1, ['snapshot'], { env: { ...penv, AGENT_BROWSER_SCREENSHOT_DIR: '/etc' }, cwd: P }); lc = last();
    ok(r.status === 0 && lc.env.AGENT_BROWSER_SCREENSHOT_DIR === '/etc', 'lane L r5 F5 NEGATIVE CONTROL: the r4 table (a verbs copy with it in ENV_PASS) hands the binary an unjudged write directory', JSON.stringify(lc && lc.env));
    // ── F6 (MINOR): a project under a dot-directory writes under its own root; the stores stay refused
    const DOT = path.join(HOME, '.config', 'r5proj'); fs.mkdirSync(DOT, { recursive: true });
    const denv = { ...benv, VIBESPACE_SESSION_CWD: DOT };
    r = await nodeCli(CLI, ['pdf', './x.pdf'], { env: denv, cwd: DOT });
    ok(r.status === 0 && last().argv[1] === path.join(DOT, 'x.pdf'), 'lane L r5 F6: a session in ~/.config/<proj> writes `./x.pdf` there', r.stderr);
    for (const [argv, shown] of [[['pdf', '../autostart/x.desktop'], '~/.config'], [['pdf', './.git/hooks/pre-commit'], 'a .git directory'], [['pdf', './.claude/settings.json'], 'a .claude directory'], [['pdf', '~/.ssh/k'], '~/.ssh']]) {
      r = await nodeCli(CLI, argv, { env: denv, cwd: DOT });
      ok(r.status === 1 && /\[write_path_refused\]/.test(r.stderr) && r.stderr.includes(`is under ${shown}`), `lane L r5 F6: …but \`${argv.join(' ')}\` is refused (under ${shown})`, r.stderr);
    }
    // ── F1 (b): the keeper's RUNTIME (src/browser-facts.js) runs every call in the private directory, never the checkout
    const F = require('../src/browser-facts.js');
    const RTD = path.join(ROOT, 'r5-rt'); fs.mkdirSync(RTD, { recursive: true });
    const RTLOG = path.join(RTD, 'rt.log'); const RTFAKE = path.join(RTD, 'fake-daemon-cli');
    fs.writeFileSync(RTFAKE, `#!${process.execPath}\nrequire('fs').appendFileSync(${JSON.stringify(RTLOG)}, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() }) + '\\n'); console.log(JSON.stringify({ success: true, data: {} }));\n`, { mode: 0o755 });
    const rtCalls = () => { try { return fs.readFileSync(RTLOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; } };
    const opts = []; const viaFake = (bin, args, o, cb) => { opts.push(o && o.cwd); return execFile(RTFAKE, args, o, cb); };
    const rt = F.createBrowserRuntime({ env: { PATH: process.env.PATH }, execFileImpl: viaFake });
    const lr = await rt.launch(null, { extraEnv: {} });
    const rc0 = rtCalls().pop();
    ok(lr.ok && rc0 && JSON.stringify(rc0.argv) === '["open","about:blank"]' && rc0.cwd === F.runDir().dir && /\/vibespace-browser-cwd-\d+$/.test(rc0.cwd) && !rc0.cwd.startsWith(REPO) && rc0.cwd !== process.cwd() && F.CHECKOUT === REPO.replace(/\/$/, ''), `lane L r5 F1(b): the keeper's runtime launches the daemon in ${rc0 && rc0.cwd} — not the checkout (${F.CHECKOUT}), not this process's cwd`, JSON.stringify([lr, rc0]));
    const nrt = rtCalls().length;
    for (const bad of [REPO, path.join(REPO, 'data'), path.dirname(REPO.replace(/\/$/, ''))]) {
      const rtBad = F.createBrowserRuntime({ env: { PATH: process.env.PATH }, execFileImpl: viaFake, daemonCwd: () => ({ ok: true, dir: bad }) });
      const b = await rtBad.launch(null, {});
      ok(!b.ok && b.code === 'daemon_cwd_refused' && rtCalls().length === nrt, `lane L r5 F1(b): an injected daemon directory ${bad} (the checkout / inside / its ancestor) is REFUSED by the runtime — nothing launched`, JSON.stringify(b).slice(0, 300));
    }
    // NEGATIVE CONTROL: the pre-r5 runtime (a patched copy through mutant-copy: no cwd) launches in THIS process's cwd —
    // the keeper's is the server's WorkingDirectory, the checkout (run it from the checkout to show the very frame)
    const { mutantCopies } = await import('./mutant-copy.mjs');
    const M = mutantCopies('browser-verbs-r5', REPO);
    const fsrc = fs.readFileSync(path.join(REPO, 'src/browser-facts.js'), 'utf8');
    const fpre = fsrc.replace('maxBuffer: 4 * 1024 * 1024, cwd: dc.dir }', 'maxBuffer: 4 * 1024 * 1024 }');
    const Fpre = M.load('src/browser-facts.js', fpre, 'nocwd');
    const here = process.cwd(); process.chdir(REPO);
    try { await Fpre.createBrowserRuntime({ env: { PATH: process.env.PATH }, execFileImpl: viaFake }).launch(null, {}); } finally { process.chdir(here); }
    const rc1 = rtCalls().pop();
    ok(fpre !== fsrc && rc1 && rc1.cwd === fs.realpathSync(REPO), 'lane L r5 F1(b) NEGATIVE CONTROL: the pre-r5 runtime (patched copy, no cwd) starts the daemon in the launcher\'s cwd — here the checkout, exactly the keeper\'s frame', JSON.stringify(rc1));
  }
  // r4 (takeover finding 2): the configuration is the ACCOUNT's — its passwd home, never $HOME
  {
    resolveAnswer = { ok: true, kind: 'none', handle: null, env: [], spawnEnv: [], hostProfile: 'vs-bk-deadbeef', hostSocketBase: path.join(ROOT, 'sockbase'), handles: [], pinTab: false }; // the rung-H shape: no config
    const FAKEHOME = path.join(ROOT, 'fakehome'); fs.mkdirSync(path.join(FAKEHOME, '.agent-browser'), { recursive: true });
    fs.writeFileSync(path.join(FAKEHOME, '.agent-browser', 'config.json'), JSON.stringify({ executablePath: path.join(ROOT, 'dumpH.sh'), args: '--hometrick' }));
    const nr = realCalls().length;
    let r6 = await cli(['open', 'about:blank'], { ...baseEnv, HOME: FAKEHOME });
    ok(r6.status === 1 && /\[config_unavailable\]/.test(r6.stderr) && r6.stderr.includes(FAKEHOME) && r6.stderr.includes(HOME) && realCalls().length === nr && !fs.existsSync(path.join(FAKEHOME, '.vibespace')), 'r4: $HOME ≠ the account\'s passwd home ⇒ config_unavailable naming BOTH — nothing composed from the agent\'s file, nothing run', r6.stderr);
    // the verifier's shape with NO injection: the real passwd entry (read-only; refused before any file is read or written)
    const r7 = await run(process.execPath, [CLI, 'open', 'about:blank'], { env: { ...baseEnv, HOME: FAKEHOME } });
    ok(r7.status === 1 && /\[config_unavailable\]/.test(r7.stderr) && r7.stderr.includes(FAKEHOME) && realCalls().length === nr, 'r4: …and with the REAL passwd entry (no preload) the same refusal', r7.stderr);
    // CONTROL: $HOME = the account's home ⇒ composed from THAT home's file (the r3 legs above ran this way)
    r6 = await cli(['open', 'about:blank']);
    const lc = realCalls().pop();
    ok(r6.status === 0 && lc && typeof lc.env.AGENT_BROWSER_CONFIG === 'string' && lc.env.AGENT_BROWSER_CONFIG.startsWith(path.join(HOME, '.vibespace', 'browser-config') + '/') && !JSON.stringify(JSON.parse(fs.readFileSync(lc.env.AGENT_BROWSER_CONFIG, 'utf8'))).includes('hometrick'), 'r4 CONTROL: $HOME equal to the passwd home composes from the account\'s own file', JSON.stringify({ st: r6.status, err: r6.stderr.slice(0, 300), cfg: lc && lc.env.AGENT_BROWSER_CONFIG }));
    // NEGATIVE CONTROL: the r3 home (os.homedir(), i.e. $HOME) in a patched copy composes the agent's file
    const src = fs.readFileSync(CLI, 'utf8');
    const r3 = src.replace('  if (!pw) return { home: os.homedir(), pw: null, env, agrees: true };', '  pw = null;\n  if (!pw) return { home: os.homedir(), pw: null, env, agrees: true };');
    const D6 = path.join(ROOT, 'r3-homectl'); fs.mkdirSync(D6, { recursive: true });
    fs.writeFileSync(path.join(D6, 'vibespace-browser'), r3); fs.copyFileSync(path.join(REPO, 'src/browser-verbs.js'), path.join(D6, 'vibespace-browser-verbs.js'));
    r6 = await nodeCli(path.join(D6, 'vibespace-browser'), ['open', 'about:blank'], { env: { ...baseEnv, HOME: FAKEHOME } });
    const lc2 = realCalls().pop();
    const composed = lc2 && lc2.env.AGENT_BROWSER_CONFIG && fs.existsSync(lc2.env.AGENT_BROWSER_CONFIG) ? fs.readFileSync(lc2.env.AGENT_BROWSER_CONFIG, 'utf8') : '';
    ok(r3 !== src && r6.status === 0 && /hometrick/.test(composed) && /dumpH\.sh/.test(composed), 'r4 NEGATIVE CONTROL: the r3 home rule (patched copy) composes the agent-written file — its executablePath and args ride the sanctioned road', JSON.stringify({ st: r6.status, composed, err: r6.stderr.slice(0, 200) }));
    fs.rmSync(FAKEHOME, { recursive: true, force: true });
  }
  // r4 (takeover finding 4) end to end: an OLDER server's answer (no spawnEnv, no config) — the shell's config is
  // not the child's; the CLI composes one
  {
    resolveAnswer = { ok: true, kind: 'none', handle: null, env: [], handles: [], pinTab: false };
    const DECOY_CFG = path.join(ROOT, 'agent-decoy.json');   // a name the shell exports; never created
    const r8 = await cli(['snapshot'], { ...baseEnv, AGENT_BROWSER_CONFIG: DECOY_CFG });
    const lc = realCalls().pop();
    ok(r8.status === 0 && lc.env.AGENT_BROWSER_CONFIG !== DECOY_CFG && String(lc.env.AGENT_BROWSER_CONFIG).startsWith(path.join(HOME, '.vibespace', 'browser-config') + '/') && /AGENT_BROWSER_CONFIG/.test((/.*\[env_twin_dropped\].*/.exec(r8.stderr) || [''])[0]), 'r4: an older server\'s answer runs the binary on a COMPOSED config, never the shell\'s decoy — and says the decoy was not passed', JSON.stringify({ env: lc.env, err: r8.stderr.slice(0, 300) }));
  }
  // r4 (takeover finding 6): the version gate, end to end — the CLI reads the version off the binary it runs
  {
    resolveAnswer = { ok: true, kind: 'none', shared: true, handle: null, env: [], spawnEnv: [], handles: [], pinTab: false };
    fs.writeFileSync(FAKE_VERSION, '0.33.0');
    const nb = resolves().length; const nr = realCalls().length;
    let r9 = await cli(['get', '--json', 'text', 'cdp-url']);
    ok(r9.status === 1 && /\[raw_cdp_refused\]/.test(r9.stderr) && /\[flag_table_drift\]/.test(r9.stderr) && /0\.33\.0/.test(r9.stderr) && resolves().length === nb && realCalls().length === nr, 'r4: the binary answers 0.33.0 ⇒ the drift is SAID and `get --json text cdp-url` (a read on 0.32.0) is refused — before /resolve, nothing run', r9.stderr);
    r9 = await cli(['get', '--json', 'text', '@e1']);
    ok(r9.status === 0 && /\[flag_table_drift\]/.test(r9.stderr) && (r9.stderr.match(/flag_table_drift/g) || []).length === 1 && JSON.stringify(realCalls().pop().argv) === '["get","--json","text","@e1"]', 'r4: …a read no reading turns into anything else still runs, the drift said ONCE', r9.stderr);
    fs.writeFileSync(FAKE_VERSION, V.TABLE_VERSION);
    r9 = await cli(['get', '--json', 'text', 'cdp-url']);
    ok(r9.status === 0 && !/flag_table_drift/.test(r9.stderr) && JSON.stringify(realCalls().pop().argv) === '["get","--json","text","cdp-url"]', 'r4 CONTROL: on the measured version the same read runs (the <cdp-url> element\'s text) and nothing is said', r9.stderr);
    fs.writeFileSync(FAKE_VERSION, '0.33.0');
    const src = fs.readFileSync(CLI, 'utf8');
    const r3 = src.replace('const drift = V.versionDrift(installedVersion(bin.path));', 'const drift = null;');
    const D7 = path.join(ROOT, 'r3-driftctl'); fs.mkdirSync(D7, { recursive: true });
    fs.writeFileSync(path.join(D7, 'vibespace-browser'), r3); fs.copyFileSync(path.join(REPO, 'src/browser-verbs.js'), path.join(D7, 'vibespace-browser-verbs.js'));
    r9 = await nodeCli(path.join(D7, 'vibespace-browser'), ['get', '--json', 'text', 'cdp-url'], { env: baseEnv });
    ok(r3 !== src && r9.status === 0 && JSON.stringify(realCalls().pop().argv) === '["get","--json","text","cdp-url"]', 'r4 NEGATIVE CONTROL: without the gate (patched copy) the 0.32.0 table runs silently on a 0.33.0 binary', r9.stderr);
    fs.writeFileSync(FAKE_VERSION, V.TABLE_VERSION);
  }
  // r4 (takeover finding 5): scripts/browser-flag-census.mjs runs as documented — `[<binary>]` with or without
  // `--write`, a bare name through PATH with the shim skipped (r3: the positional was dropped without --write
  // and a bare name was realpath'd against the cwd)
  {
    const CD = path.join(ROOT, 'census'); const FB = path.join(CD, 'bin'); fs.mkdirSync(FB, { recursive: true });
    const fake = path.join(FB, 'agent-browser');
    fs.writeFileSync(fake, `#!/bin/sh\n# flags: --alpha --beta\n[ "$1" = --version ] && { echo "agent-browser 9.9.9"; exit 0; }\n[ "$1" = --alpha ] && { echo "No active sessions"; exit 0; }\n[ "$1" = --beta ] && { echo "Unknown command: zzq9"; exit 1; }\necho "Unknown command: $1"; exit 1\n`, { mode: 0o755 });
    const CENSUS = path.join(REPO, 'scripts/browser-flag-census.mjs');
    const cenv = { PATH: `${SHIMDIR}:${FB}:${NODE_DIR}:/usr/bin:/bin`, HOME };
    const parse = (r) => { try { return JSON.parse(r.stdout); } catch { return null; } };
    const a = await run(process.execPath, [CENSUS, fake], { env: cenv, cwd: CD });
    const ja = parse(a);
    ok(a.status === 0 && ja && ja.version === '9.9.9' && JSON.stringify(ja.value) === '["--alpha"]' && JSON.stringify(ja.bool) === '["--beta"]', 'r4: `node scripts/browser-flag-census.mjs <binary>` (no --write) measures THAT binary', JSON.stringify([a.status, a.stderr.slice(0, 300), ja && { v: ja.version, value: ja.value, bool: ja.bool }]));
    const out = path.join(CD, 'o.json');
    const b = await run(process.execPath, [CENSUS, '--write', out, fake], { env: cenv, cwd: CD });
    const c2 = await run(process.execPath, [CENSUS, fake, '--write', out + '2'], { env: cenv, cwd: CD });
    ok(b.status === 0 && c2.status === 0 && JSON.parse(fs.readFileSync(out, 'utf8')).version === '9.9.9' && JSON.parse(fs.readFileSync(out + '2', 'utf8')).version === '9.9.9', 'r4: …`--write <f> <binary>` and `<binary> --write <f>` both write the fixture');
    const d = await run(process.execPath, [CENSUS], { env: cenv, cwd: CD });
    const jd = parse(d);
    ok(d.status === 0 && jd && jd.version === '9.9.9', 'r4: …no binary named ⇒ the bare name through PATH, the shim dir ahead of it skipped', JSON.stringify([d.status, d.stderr.slice(0, 300)]));
    const e = await run(process.execPath, [CENSUS], { env: { ...cenv, PATH: `${SHIMDIR}:${NODE_DIR}:/usr/bin:/bin`.split(':').filter((x) => x === SHIMDIR || !fs.existsSync(path.join(x, 'agent-browser'))).join(':') }, cwd: CD });
    ok(e.status === 2 && /on PATH/.test(e.stderr), 'r4: …and with only the shim on PATH it says so (exit 2), never an ENOENT stack', e.stderr);
  }
  // the binary absent: refused before any server call
  const n1 = calls.length;
  c = await cli(['snapshot'], { ...baseEnv, PATH: `${SHIMDIR}:${NODE_DIR}:/usr/bin:/bin`.split(':').filter((d) => !fs.existsSync(path.join(d, 'agent-browser')) || d === SHIMDIR).join(':') });
  ok(c.status === 1 && /\[binary_absent\]/.test(c.stderr) && calls.length === n1, 'with only the shim on PATH ⇒ binary_absent, no server call (the shim is never "the binary")', c.stderr);

  // not in a session
  c = await cli(['snapshot'], { HOME, PATH: baseEnv.PATH });
  ok(c.status === 2 && /not inside a VibeSpace session/.test(c.stderr), 'outside a session ⇒ exit 2');
  c = await cli(['help'], { HOME, PATH: baseEnv.PATH });
  ok(c.status === 0 && /vibespace-browser/.test(c.stdout) && !new RegExp('(?<![.\\w/-])' + V.REAL_BINARY + '(?!\\.json|[\\w-])').test(c.stdout), '`help` works anywhere and never names the hidden binary');
} finally {
  server.close();
  fs.rmSync(ROOT, { recursive: true, force: true });
}

console.log(fail ? `FAIL (${fail} failed, ${pass} passed)` : `ALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
