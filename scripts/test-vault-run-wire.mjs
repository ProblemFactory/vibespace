#!/usr/bin/env node
'use strict';
/**
 * THE REAL-TOOL PARITY CENSUS (lane vault-use-grants round 4 item 1 — the BLOCKER's lasting gate; round 5 item 5 + the census
 * MINOR harden it). HEAVY: it starts a loopback listener and runs the REAL curl / wget / git over a pinned table of URL and
 * routing spellings, then asserts ROW BY ROW: where the tool ACTUALLY connected (the peer the listener saw) is EITHER a host
 * the READER names (src/vault-run.js planOf→shapeOf→destinationsOf) OR the reader said OPAQUE (the door draws the card — fail
 * closed). A spelling where the tool connected somewhere the reader did NOT name AND was not opaque = RED BY NAME (a grant for
 * host A would send the value to host B with no card).
 *
 * The law: a host is `by: grant` ONLY when the reader is CERTAIN the tool connects there. Round 5 added the ssh-family alias
 * (every spelling), the one-slash / bare `S:HOST` scheme token (BLIND), and the proxy authority cut at the first `/ ? #`.
 *
 * HARDENING (round 5 census MINOR): (a) the env is SCRUBBED — no *_proxy (a runner's http_proxy diverted the tools and the
 * base's BLOCKER rows went green), HOME to a scratch dir; (b) every CONTROL row ASSERTS it reached the listener (no vacuous
 * ok(true)); (c) the git rows run the REAL git against a loopback listener (http) and a fake GIT_SSH (the ssh family); (d) the
 * table carries the `-K`/--config row the header names; (e) curl is PINNED to 8.18 with a SKIP law (as the gh census), because
 * where the tool connects is version-dependent. Registered in scripts/ci.mjs (§43). Loopback only, a FAKE value only, -m 2.
 * The seam: vault-agent-own r23/r25's urlParse + cfgRouteHosts pass the SAME census after the merge (int-C).
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const VR = require(path.join(__dirname, '..', 'src', 'vault-run.js'));

const CURL = '/usr/bin/curl', WGET = '/usr/bin/wget', GIT = '/usr/bin/git';
const have = (p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } };
const PIN = '8.18';   // the box's curl (Protocols + the \@ / one-slash parse are this version's); a different curl SKIPs (as the gh census)

let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); if (extra !== undefined) console.log('      ' + JSON.stringify(extra)); } };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vug-wire-'));
const VALFILE = path.join(TMP, 'val'); fs.writeFileSync(VALFILE, 'FAKE-VAULT-VALUE-wire');
const HOME = path.join(TMP, 'home'); fs.mkdirSync(HOME, { recursive: true });
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });
// (b)(a): a SCRUBBED env — no inherited *_proxy (which would divert every tool and make a leaking base look clean), a scratch
// HOME (no ~/.curlrc, ~/.netrc, ~/.wgetrc, ~/.gitconfig, ~/.ssh/config), and curl/wget told to ignore any config.
const ENV = { PATH: '/usr/bin:/bin', HOME, LANG: 'C.UTF-8', CURL_HOME: HOME };   // a FRESH env (not process.env) ⇒ no inherited *_proxy diverts the tools; a scratch HOME ⇒ no ~/.curlrc / ~/.netrc / ~/.ssh/config
// ASYNC spawn (not spawnSync): spawnSync BLOCKS the event loop, so the loopback listener could not answer while the tool
// ran and every connecting tool waited the full `-m 2` (the census took ~40 s). An async child lets the listener respond.
const run = (tool, argv, extraEnv = {}) => new Promise((resolve) => {
  const ch = spawn(tool, argv, { stdio: 'ignore', env: { ...ENV, ...extraEnv } });
  const timer = setTimeout(() => { try { ch.kill('SIGKILL'); } catch { } }, 8000);
  ch.on('close', () => { clearTimeout(timer); resolve(); });
  ch.on('error', () => { clearTimeout(timer); resolve(); });
});

function curlVersion() { try { const o = spawnSync(CURL, ['--version'], { env: ENV }).stdout; const m = /curl (\d+\.\d+)/.exec(String(o || '')); return m ? m[1] : null; } catch { return null; } }

// THE READER: planOf + shapeOf + destinationsOf for a tool argv (the door's own path). → { hosts, opaque, noAlways }.
function readerDest(argv, env = []) {
  const name = VR.toolNameOf(argv[0]);
  const runShape = { argv, tool: argv[0], name, row: VR.knownToolOf(name), kind: VR.toolKindOf(name), refs: [], injection: new Set(), plainEnv: env.map(([n, v]) => ({ name: n, value: v, ref: null })), files: [], on: null, programWritable: false, argvExposed: false };
  const s = VR.shapeOf(runShape);
  const d = VR.destinationsOf(s);
  return { hosts: (d.hosts || []).map(String), opaque: !!d.opaque, noAlways: s.noAlways, always: s.always };
}
const LOOPBACK = new Set(['127.0.0.1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::1']);   // every loopback form (new URL compresses [::ffff:127.0.0.1] → ::ffff:7f00:1 — the SAME address)
const readerNames = (dest, port) => dest.hosts.some((h) => { const s = String(h); const p = (s.match(/\]?:(\d+)$/) || [])[1]; const b = s.replace(/^\[|\]$/g, '').replace(/\]?:\d+$/, '').replace(/^\[|\]$/g, ''); return LOOPBACK.has(b) && (!p || p === String(port)); });

async function listener() {
  const got = [];
  const onReq = (req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { got.push({ host: req.headers.host || '', leaked: /FAKE-VAULT-VALUE/.test(b) }); res.end('ok'); }); };
  const srv = http.createServer(onReq);
  srv.on('checkContinue', (req, res) => { res.writeContinue(); onReq(req, res); });   // answer curl's `Expect: 100-continue` at once (else each --data POST waits ~1 s)
  srv.keepAliveTimeout = 1;
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, port: srv.address().port, got, close: () => srv.close() };
}
const settle = () => new Promise((r) => setTimeout(r, 50));
// spawnSync BLOCKS the event loop, so the listener's handler cannot fire until AFTER it returns AND the loop ticks — run the
// tool, THEN settle, THEN read what the listener saw (checking L.got right after spawnSync always reads empty).
async function reached(L, fn) { const before = L.got.length; await fn(); await settle(); return L.got.length > before ? L.got[L.got.length - 1] : null; }

async function main() {
  if (!have(CURL)) { console.log('SKIP: no /usr/bin/curl'); process.exit(0); }
  const ver = curlVersion();
  if (ver !== PIN) { console.log(`SKIP: curl ${ver || '?'} is not the pinned ${PIN} (where the tool connects is version-dependent — the parity law is pinned to one curl, as the gh census)`); process.exit(0); }
  const L = await listener(); const P = L.port;

  console.log(`REAL-TOOL PARITY CENSUS (curl ${ver}) — the peer the tool reached is NAMED by the reader, or the reader is OPAQUE (fail closed)\n`);

  // kind (round 7 item 8): the REACH-GATED kinds assert the tool reached the listener (so the no-spawn mutant takes them RED) —
  // 'control' (a routine run — reaches AND the reader names it); 'named-or-opaque' (reaches AND the reader names-or-opaque);
  // 'reach-opaque' (an attack / a scheme token curl connects on — reaches AND the reader is OPAQUE, no silent leak); 'config'
  // (reaches via the config url, WITHHOLDS «always»). The READER-ONLY kinds are NAMED so and NOT reach-gated — 'reader-lan' (a
  // trailing-dot IP curl 8.18 may refuse), 'reader-opaque' (ftp:/ / http:HOST — curl reads the scheme word as the host and
  // reaches nothing here); each asserts only a reader property.
  const rows = [
    ['clean http (control)', CURL, (p) => ['-s', '-m', '2', '-q', '--data', '@' + VALFILE, `http://127.0.0.1:${p}/clean`], 'control'],
    ['#@ fragment (curl ignores after #; control — connects to 127.0.0.1)', CURL, (p) => ['-s', '-m', '2', '-q', '--data', '@' + VALFILE, `http://127.0.0.1:${p}/frag#@127.0.0.5:9`], 'control'],
    ['--resolve rebind granted→listener (control)', CURL, (p) => ['-s', '-m', '2', '-q', '--data', '@' + VALFILE, '--resolve', `granted.example:${p}:127.0.0.1`, `http://granted.example:${p}/res`], 'named-or-opaque'],
    ['--connect-to rebind granted→listener (control)', CURL, (p) => ['-s', '-m', '2', '-q', '--data', '@' + VALFILE, '--connect-to', `granted.example:${p}:127.0.0.1:${p}`, `http://granted.example:${p}/ct`], 'named-or-opaque'],
    ['-x proxy to listener (control)', CURL, (p) => ['-s', '-m', '2', '-q', '--data', '@' + VALFILE, '-x', `127.0.0.1:${p}`, 'http://granted.example/px'], 'named-or-opaque'],
    ['--url schemeless (control)', CURL, (p) => ['-s', '-m', '2', '-q', '--data', '@' + VALFILE, '--url', `127.0.0.1:${p}/u`], 'control'],
    ['[::ffff:127.0.0.1] mapped (control)', CURL, (p) => ['-s', '-m', '2', '-q', '-g', '--data', '@' + VALFILE, `http://[::ffff:127.0.0.1]:${p}/m`], 'control'],
    ['backslash before @ (round4 BLOCKER: granted\\@listener)', CURL, (p) => ['-s', '-m', '2', '-q', '--data', '@' + VALFILE, `http://127.0.0.5:9\\@127.0.0.1:${p}/bs`], 'reach-opaque'],
    // int361 (主开发's int-C ruling on the vault pair): the userinfo row falls to the ONE parser — urlParse reads the host past the
    // userinfo, the SAME host curl reaches (so the reader names it), and the door refuses the run url_userinfo (vault-agent-own r18);
    // a `\` before @ (the row above) stays blind/opaque
    ['userinfo @ (round4; int361: the ONE parser names the host, the door refuses url_userinfo)', CURL, (p) => ['-s', '-m', '2', '-q', '--data', '@' + VALFILE, `http://u:p@127.0.0.1:${p}/ui`], 'control'],
    ['trailing-dot host (round4)', CURL, (p) => ['-s', '-m', '2', '-q', '--data', '@' + VALFILE, `http://127.0.0.1.:${p}/dot`], 'reader-lan'],
    // round 5 item 5: a scheme-shaped token the bare reader would read as the SCHEME WORD
    ['one-slash http:/HOST (round5)', CURL, (p) => ['-s', '-m', '2', '-q', '--data', '@' + VALFILE, `http:/127.0.0.1:${p}/one`], 'reach-opaque'],
    ['one-slash ftp:/HOST (round5)', CURL, (p) => ['-s', '-m', '1', '-q', '-T', VALFILE, `ftp:/127.0.0.1:${p}/one`], 'reader-opaque'],
    ['bare scheme http:HOST (round5)', CURL, (p) => ['-s', '-m', '2', '-q', '--data', '@' + VALFILE, `http:127.0.0.1:${p}/bare`], 'reader-opaque'],
    // round 5 item 5: the proxy authority is cut at the first # / ? — curl connects to host:port, NOT the fragment/query host
    ['-x proxy#@other (round5: curl connects to the proxy host, not the # host)', CURL, (p) => ['-s', '-m', '2', '-q', '--data', '@' + VALFILE, '-x', `127.0.0.1:${p}#@granted.example:3128`, 'http://granted.example/x'], 'named-or-opaque'],
    ['-x proxy?@other (round5)', CURL, (p) => ['-s', '-m', '2', '-q', '--data', '@' + VALFILE, '-x', `127.0.0.1:${p}?@granted.example:3128`, 'http://granted.example/x'], 'named-or-opaque'],
  ];
  // (d) the -K/--config row the header names: a config file with a `url =` directive to the listener
  const KCFG = path.join(TMP, 'k.cfg'); fs.writeFileSync(KCFG, `url = "http://127.0.0.1:${P}/kcfg"\ndata = "@${VALFILE}"\n`);
  rows.push(['-K config with a url directive (round4/r23 seam)', CURL, () => ['-s', '-m', '2', '-q', '-K', KCFG], 'config']);

  if (have(WGET)) {
    const urls = path.join(TMP, 'urls.txt'); fs.writeFileSync(urls, `http://127.0.0.1:${P}/exfil\n`);
    rows.push(['wget clean (control)', WGET, (p) => ['-q', '-O', '/dev/null', '-T', '2', '-t', '1', '--no-config', '--method=POST', '--body-file=' + VALFILE, `http://127.0.0.1:${p}/w`], 'control']);
    rows.push(['wget -e input=FILE (round4: leaks to the file’s host)', WGET, () => ['-q', '-O', '/dev/null', '-T', '2', '-t', '1', '--no-config', '--method=POST', '--body-file=' + VALFILE, '-e', 'input=' + urls, 'http://127.0.0.5:9/x'], 'reach-opaque']);
  }

  // round 7 (MINOR item 8): ONE row-checking function, shared by the real loop AND the no-spawn mutant below. A REACH-GATED
  // row's verdict DEPENDS on `hit` (the tool reached the listener); the reader-only rows do not. r6's mutant re-implemented the
  // predicate inline (hit always null), so it stayed green even with r5's `!hit ||` restored — a tautology. Now the mutant runs
  // THIS function with no spawn, so every reach-gated row it checks takes RED, and a reverted predicate is caught.
  const REACH_GATED = new Set(['control', 'named-or-opaque', 'reach-opaque', 'config']);   // the tool MUST reach the listener in the real run
  const READER_ONLY = new Set(['reader-lan', 'reader-opaque']);   // named reader-only: the tool reaches nothing here (a trailing-dot IP curl refuses; a scheme word curl reads as the host)
  const checkRow = (kind, hit, reader, P) => {
    const named = hit ? readerNames(reader, P) : false;
    if (kind === 'control' || kind === 'named-or-opaque') return !!hit && (named || reader.opaque);
    if (kind === 'reach-opaque') return !!hit && reader.opaque;   // the tool REACHED the listener (an attack / a scheme-token that curl connects on) AND the reader is OPAQUE — no silent by: grant
    if (kind === 'reader-lan') return readerNames(reader, P) || reader.opaque;   // the reader names the LAN peer (trailing dot stripped) or is opaque
    if (kind === 'reader-opaque') return reader.opaque;   // the reader is OPAQUE (ftp:/ / http:HOST — curl reads the scheme word as the host, reaches nothing here)
    if (kind === 'config') return !!hit && !reader.always && !readerNames(reader, P);   // reached via the config url; WITHHOLDS «always», does not name that url (int-C / r23 cfgRouteHosts)
    return false;
  };
  const MSG = { control: 'the tool REACHED the listener AND the reader names it', 'named-or-opaque': 'the tool REACHED the listener AND the reader names it or is opaque', 'reach-opaque': 'the tool REACHED the listener AND the reader is OPAQUE (the card — no silent by: grant)', 'reader-lan': 'the reader names the LAN peer (trailing dot stripped) or is opaque (reader-only)', 'reader-opaque': 'the reader is OPAQUE (reader-only — curl reads the scheme word as the host, reaches nothing here)', config: 'reached via the config url; WITHHOLDS «always» and does not name that url (int-C / r23 cfgRouteHosts)' };
  for (const [label, tool, mk, kind] of rows) {
    const argv = mk(P);
    const hit = await reached(L, () => run(tool, argv));
    const reader = readerDest([path.basename(tool), ...argv]);
    ok(checkRow(kind, hit, reader, P), `${label}: ${MSG[kind] || kind}`, { reached: !!hit, readerHosts: reader.hosts, opaque: reader.opaque, noAlways: reader.noAlways });
  }

  // round 7 (MINOR item 8): THE NO-SPAWN MUTANT — run the SHARED checkRow with the tool NEVER spawned (hit=null). Every
  // reach-gated row must go RED; a vacuous pass (a row whose verdict does not depend on the reach) names itself. Restoring r5's
  // `!hit ||` into checkRow would make every reach-gated row pass here — RED, by name. (Reader-only rows are exempt by design.)
  {
    const vacuous = [];
    for (const [label, tool, mk, kind] of rows) {
      if (!REACH_GATED.has(kind)) { if (!READER_ONLY.has(kind)) vacuous.push(`${label} (unclassified kind «${kind}»)`); continue; }
      const reader = readerDest([path.basename(tool), ...mk(P)]);
      if (checkRow(kind, null, reader, P)) vacuous.push(label);   // no hit ⇒ the shared branch MUST be false
    }
    ok(vacuous.length === 0, 'NO-SPAWN MUTANT: the SHARED checkRow, run with the tool never spawned, takes every reach-gated row RED — a reverted `!hit ||` predicate is caught here (r5: 17/25 green)', { vacuous });
  }

  // (c) the REAL git over a loopback listener (http smart-transport) — a clean granted run is NAMED; the backslash/userinfo
  // authority is OPAQUE (git uses libcurl, so it routes as curl does).
  if (have(GIT)) {
    const GENV = { GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_HTTP_LOW_SPEED_LIMIT: '1', GIT_HTTP_LOW_SPEED_TIME: '3' };
    const gh = await reached(L, () => run(GIT, ["ls-remote", `http://127.0.0.1:${P}/r.git`], GENV));
    const gr = readerDest(['git', 'ls-remote', `http://127.0.0.1:${P}/r.git`]);
    ok(!!gh && (readerNames(gr, P) || gr.opaque), 'REAL git ls-remote http://127.0.0.1:P/r.git: reached the listener AND the reader names it (a routine granted run)', { reached: !!gh, hosts: gr.hosts });
    const gb = await reached(L, () => run(GIT, ['ls-remote', `http://127.0.0.5:9\\@127.0.0.1:${P}/r.git`], GENV));
    const gbr = readerDest(['git', 'ls-remote', `http://127.0.0.5:9\\@127.0.0.1:${P}/r.git`]);
    ok(!!gb && gbr.opaque, `REAL git ls-remote with a backslash authority: git REACHED 127.0.0.1:${P} AND the reader is OPAQUE — no silent by: grant (round 7: reach-gated, not a reader-only assert)`, { reached: !!gb, opaque: gbr.opaque });
    // the ssh family: a fake GIT_SSH records the host git hands to ssh — for `ssh://router` git passes the bare alias `router`
    // (which the real ssh resolves through ~/.ssh/config), and the reader is OPAQUE for that single-label alias.
    const FS = path.join(TMP, 'fakessh'); const ARGS = path.join(TMP, 'ssh-args');
    fs.writeFileSync(FS, `#!/bin/sh\nprintf '%s\\n' "$@" > "${ARGS}"\nexit 0\n`, { mode: 0o755 });
    await run(GIT, ['ls-remote', 'ssh://router/repo'], { GIT_SSH: FS, ...GENV });
    const sshArgs = fs.existsSync(ARGS) ? fs.readFileSync(ARGS, 'utf8') : '';
    const sr = readerDest(['git', 'clone', 'ssh://router/repo']);
    ok(/(^|\n)router(\n|$)/.test(sshArgs) && sr.opaque, 'REAL git over ssh://router: git hands the bare alias `router` to ssh (resolved via ~/.ssh/config) AND the reader is OPAQUE (round 5 BLOCKER)', { sshGot: sshArgs.split('\n').filter(Boolean), opaque: sr.opaque });
    // the counter-check (reader only): routine granted runs draw NO card (git-https names its host; scp names a dotted host)
    for (const argv of [['ls-remote', 'https://github.com/o/r'], ['clone', 'https://github.com/o/r'], ['push', 'https://github.com/o/r.git', 'HEAD:main']]) {
      const r = readerDest(['git', ...argv]);
      ok(!r.opaque && r.hosts.includes('github.com'), `git ${argv.join(' ')}: reader names github.com, NOT opaque (routine granted runs draw no card)`, { hosts: r.hosts, opaque: r.opaque });
    }
    const scp = readerDest(['scp', 'backup', 'root@192.168.1.1:/x']);
    ok(!scp.opaque && scp.hosts.includes('192.168.1.1'), 'scp backup root@192.168.1.1:/x: reader names 192.168.1.1, NOT opaque (a local file is not a host, a dotted host is not an alias)', { hosts: scp.hosts, opaque: scp.opaque });
  }

  L.close();
  console.log(fail ? `\n${pass} passed, ${fail} failed` : `\nALL PASS (${pass})`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
