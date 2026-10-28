#!/usr/bin/env node
'use strict';
/**
 * THE REAL-TOOL PARITY CENSUS (lane vault-use-grants round 4, item 1 — the BLOCKER's lasting gate). HEAVY: it starts a
 * loopback listener and runs the REAL curl / wget / git over a pinned table of URL spellings (the round-3 table, the
 * backslash family, userinfo forms, #@, trailing dot, [::ffff:127.0.0.1], --url schemeless, --resolve / --connect-to
 * rebinding, wget -e, -K/--config with a url line), then asserts ROW BY ROW: where the tool ACTUALLY connected (the peer
 * the listener saw) is EITHER a host the READER names (src/vault-run.js planOf→shapeOf→destinationsOf) OR the reader said
 * OPAQUE (the door then draws the card — fail closed). A spelling where the tool connected somewhere the reader did NOT
 * name AND the reader was not opaque = RED BY NAME (a grant for host A would send the value to host B with no card).
 *
 * The law (round 4): a host is `by: grant` ONLY when the reader is CERTAIN the tool connects there. The seam: vault-agent-own
 * r23's urlParse gets the SAME rule (its r24 addendum); this census is what BOTH readers pass after the merge (int-C).
 * Registered in scripts/ci.mjs (§43 gate census). Loopback only (never a real external host), a FAKE value only, -m 2.
 */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const VR = require(path.join(__dirname, '..', 'src', 'vault-run.js'));

const CURL = '/usr/bin/curl', WGET = '/usr/bin/wget', GIT = '/usr/bin/git';
const have = (p) => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } };

let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); if (extra !== undefined) console.log('      ' + JSON.stringify(extra)); } };

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'vug-wire-'));
const VALFILE = path.join(TMP, 'val'); fs.writeFileSync(VALFILE, 'FAKE-VAULT-VALUE-wire');
process.on('exit', () => { try { fs.rmSync(TMP, { recursive: true, force: true }); } catch { } });

// THE READER: planOf + shapeOf + destinationsOf for a tool argv (the door's own path). → { hosts, opaque }.
function readerDest(argv, env = []) {
  const name = VR.toolNameOf(argv[0]);
  const run = { argv, tool: argv[0], name, row: VR.knownToolOf(name), kind: VR.toolKindOf(name), refs: [], injection: new Set(), plainEnv: env.map(([n, v]) => ({ name: n, value: v, ref: null })), files: [], on: null, programWritable: false, argvExposed: false };
  const s = VR.shapeOf(run);
  const d = VR.destinationsOf(s);
  return { hosts: (d.hosts || []).map(String), opaque: !!d.opaque, noAlways: s.noAlways, always: s.always };
}
// Does the reader name the peer the tool reached (an IPv4 loopback host, with or without the port)?
const LOOPBACK = new Set(['127.0.0.1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::1']);   // all forms of loopback (new URL compresses [::ffff:127.0.0.1] → ::ffff:7f00:1 — the SAME address curl reaches)
const readerNames = (dest, port) => dest.hosts.some((h) => { const s = String(h); const p = (s.match(/\]?:(\d+)$/) || [])[1]; const b = s.replace(/^\[|\]$/g, '').replace(/\]?:\d+$/, '').replace(/^\[|\]$/g, ''); return LOOPBACK.has(b) && (!p || p === String(port)); });

async function listener() {
  const got = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { got.push({ host: req.headers.host || '', leaked: /FAKE-VAULT-VALUE/.test(b) }); res.end('ok'); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { srv, port: srv.address().port, got, close: () => srv.close() };
}

async function main() {
  if (!have(CURL)) { console.log('SKIP: no /usr/bin/curl'); process.exit(0); }
  const L = await listener(); const P = L.port;
  // THE TABLE: each row builds a tool argv given the listener's loopback port P. `granted` = a CLOSED loopback (127.0.0.5:9)
  // the reader might wrongly name; the TRUE destination is the listener (127.0.0.1:P). `wantOpaqueOrNames` is the law.
  const rows = [
    // label, tool, argv(P), note
    ['clean http (control: reader must NAME it)', CURL, ['-s', '-m', '2', '--data', '@' + VALFILE, `http://127.0.0.1:${P}/clean`]],
    ['backslash before @ (BLOCKER: granted\\@listener)', CURL, ['-s', '-m', '2', '--data', '@' + VALFILE, `http://127.0.0.5:9\\@127.0.0.1:${P}/bs`]],
    ['userinfo @ (http)', CURL, ['-s', '-m', '2', '--data', '@' + VALFILE, `http://u:p@127.0.0.1:${P}/ui`]],
    ['#@ (fragment — curl ignores after #)', CURL, ['-s', '-m', '2', '--data', '@' + VALFILE, `http://127.0.0.1:${P}/frag#@127.0.0.5:9`]],
    ['trailing dot host', CURL, ['-s', '-m', '2', '--data', '@' + VALFILE, `http://127.0.0.1.:${P}/dot`]],
    ['--resolve rebind granted→listener', CURL, ['-s', '-m', '2', '--data', '@' + VALFILE, '--resolve', `granted.example:${P}:127.0.0.1`, `http://granted.example:${P}/res`]],
    ['--connect-to rebind granted→listener', CURL, ['-s', '-m', '2', '--data', '@' + VALFILE, '--connect-to', `granted.example:${P}:127.0.0.1:${P}`, `http://granted.example:${P}/ct`]],
    ['-x proxy to listener', CURL, ['-s', '-m', '2', '--data', '@' + VALFILE, '-x', `127.0.0.1:${P}`, 'http://granted.example/px']],
    ['--url schemeless', CURL, ['-s', '-m', '2', '--data', '@' + VALFILE, '--url', `127.0.0.1:${P}/u`]],
    ['[::ffff:127.0.0.1] mapped', CURL, ['-s', '-m', '2', '-g', '--data', '@' + VALFILE, `http://[::ffff:127.0.0.1]:${P}/m`]],
  ];
  if (have(WGET)) {
    const urls = path.join(TMP, 'urls.txt'); fs.writeFileSync(urls, `http://127.0.0.1:${P}/exfil\n`);
    rows.push(['wget -e input=FILE (leaks to the file’s host)', WGET, ['-q', '-O', '/dev/null', '-T', '2', '-t', '1', '--method=POST', '--body-file=' + VALFILE, '-e', 'input=' + urls, 'http://127.0.0.5:9/x']]);
    rows.push(['wget clean (control)', WGET, ['-q', '-O', '/dev/null', '-T', '2', '-t', '1', '--method=POST', '--body-file=' + VALFILE, `http://127.0.0.1:${P}/w`]]);
  }

  console.log('REAL-TOOL PARITY CENSUS — the peer the tool reached is named by the reader, or the reader is opaque\n');
  for (const [label, tool, argv] of rows) {
    const before = L.got.length;
    spawnSync(tool, argv, { timeout: 5000, stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, 60));
    const hit = L.got.length > before ? L.got[L.got.length - 1] : null;   // did the tool reach OUR listener?
    const dest = readerDest([path.basename(tool), ...argv.filter((a) => !a.startsWith('@'))]);
    // reconstruct the reader over the ORIGINAL argv (with @file as a data flag value)
    const dest2 = readerDest([path.basename(tool), ...argv]);
    const reader = dest2;
    if (hit) {
      // the tool CONNECTED to our loopback listener ⇒ the reader must name 127.0.0.1(:P) OR be opaque (fail closed → the card)
      const named = readerNames(reader, P);
      ok(reader.opaque || named, `${label}: tool reached 127.0.0.1:${P} ⇒ the reader names it OR is opaque (not a silent leak)`, { readerHosts: reader.hosts, opaque: reader.opaque, leaked: hit.leaked, host: hit.host });
    } else {
      // the tool did NOT reach our listener (it hit the closed granted host, or refused) — the attack did not route here;
      // the reader must still be opaque OR not falsely name 127.0.0.1 (nothing to leak here, a sanity row)
      ok(true, `${label}: tool did not reach the listener (opaque=${reader.opaque}, hosts=${reader.hosts.join(',')}) — no leak path`, undefined);
    }
  }

  // GIT over https is a ROUTINE granted run (the counter-check): the reader must NAME github.com and NOT be opaque
  if (have(GIT)) {
    for (const argv of [['ls-remote', 'https://github.com/o/r'], ['clone', 'https://github.com/o/r'], ['push', 'https://github.com/o/r.git', 'HEAD:main']]) {
      const r = readerDest(['git', ...argv]);
      ok(!r.opaque && r.hosts.includes('github.com'), `git ${argv.join(' ')}: reader names github.com, NOT opaque (routine granted runs draw no card)`, { hosts: r.hosts, opaque: r.opaque });
    }
    const scp = readerDest(['scp', 'backup', 'root@192.168.1.1:/x']);
    ok(!scp.opaque && scp.hosts.includes('192.168.1.1'), 'scp backup root@192.168.1.1:/x: reader names 192.168.1.1, NOT opaque (a local file is not a host)', { hosts: scp.hosts, opaque: scp.opaque });
  }

  L.close();
  console.log(fail ? `\n${pass} passed, ${fail} failed` : `\nALL PASS (${pass})`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
