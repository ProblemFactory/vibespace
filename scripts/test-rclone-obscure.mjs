#!/usr/bin/env node
// RCLONE «OBSCURE» OFF ARGV (lane mount-password-off-argv, B-d752 — credential class). A storage mount's PASS-type
// credential (WebDAV / SFTP) is handed to rclone in its reversible "obscured" form. src/mounts.js used to produce it
// by shelling out `rclone obscure <plain>` — the password rode the child's ARGV, readable in /proc/<pid>/cmdline by
// every local user, on a SYNC exec that blocked the hub's loop. src/rclone-obscure.js now computes rclone's PUBLIC
// algorithm IN-PROCESS (AES-256-CTR under rclone's fixed key, a random 16-byte IV prefixed, base64url). THE LAW: a
// secret never rides argv; a public algorithm is computed in-process.
//   §1 PURE: reveal(obscure(p)) === p for a table; our reveal decrypts KNOWN rclone-produced samples; two obscurings
//      of one password differ (random IV) yet both reveal; a too-short token throws; the token is base64url.
//   §2 REAL BINARY (SKIP by name without rclone): `rclone reveal <ours>` === p, and reveal(`rclone obscure -` p) === p
//      for the table — equivalence proven by REVEAL (the IV differs, never by bytes); the rclone version printed.
//   §3 THE MANAGER WIRING: the real MountManager builds a webdav + sftp mount's rclone env — RCLONE_CONFIG_VS_PASS
//      reveals to the plaintext, is NOT the plaintext; no env value carries the cleartext; _obscure returns a string.
//   §4 CMDLINE CONTROL + MUTANT: building a PASS mount's rclone env invokes NO `rclone obscure` child (a runtime fake
//      rclone records its own /proc/self/cmdline). The pre-fix MUTANT (the sync `rclone obscure <plain>` restored)
//      puts the plaintext on that cmdline ⇒ RED.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { scratch } from './scratch.mjs';
import { mutantCopies } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? '\n    ' + e : '')); } };
const ROOT = scratch('rclone-obscure');
fs.rmSync(ROOT, { recursive: true, force: true }); fs.mkdirSync(ROOT, { recursive: true });
const { obscure, reveal } = require(path.join(REPO, 'src/rclone-obscure.js'));

const TABLE = { empty: '', ascii: 'hunter2', specials: 'p@ss w0rd! "q" $V `t`', unicode: '密码🔐Ünïcøde-Ω',
  oneKB: Array.from({ length: 1024 }, (_, i) => String.fromCharCode(33 + (i % 94))).join('') };
// KNOWN tokens the REAL rclone produced (v1.60.1; rclone's obscure key is unchanged since v1.39) — our reveal must decrypt them.
const RCLONE_SAMPLES = [
  ['hunter2', '6nhs6YhzVX1GmSvacGLCc0lr8FzLrHs'],
  ['', 'dpSU2n2fP2ZjNQ0_FaSrVg'],
  ['密码🔐Ω', 'oi0cCeGEXz4qKVKV5-PMtxjvzWrlJygglun6eg'],
  ['a b c!$x', 'CzrItzHfWyrmDL05ZjuWAuiYLopeIKQd'],
];

// ── §1 PURE ───────────────────────────────────────────────────────────────────
{
  const badRt = Object.entries(TABLE).filter(([, p]) => reveal(obscure(p)) !== p).map(([n]) => n);
  ok(!badRt.length, `§1 reveal(obscure(p)) === p for every sample (${Object.keys(TABLE).length}: ${Object.keys(TABLE).join(', ')})`, badRt.join(', '));
  const badS = RCLONE_SAMPLES.filter(([p, t]) => reveal(t) !== p).map(([p]) => JSON.stringify(p));
  ok(!badS.length, `§1 our reveal decrypts ${RCLONE_SAMPLES.length} KNOWN rclone-produced samples (the real binary's obscure output)`, badS.join(', '));
  ok(obscure('x') !== obscure('x') && reveal(obscure('x')) === 'x', '§1 two obscurings of one password differ (a random IV prefix) yet both reveal');
  const tok = obscure('a longer sample value');
  ok(!/[+/=]/.test(tok), '§1 the token is base64url — no +, /, or = padding', tok);
  let threw = false; try { reveal('AAA'); } catch { threw = true; }
  ok(threw, '§1 a token too short to hold a 16-byte IV throws (never a silent empty reveal)');
}

// ── §2 REAL BINARY (SKIP by name without rclone) ──────────────────────────────
{
  let ver = null;
  try { ver = execFileSync('rclone', ['version'], { encoding: 'utf8', timeout: 10000 }).split('\n')[0]; } catch { }
  if (!ver) console.log('  SKIP §2 the real-binary leg — rclone is not on PATH');
  else {
    console.log(`  · §2 measured against ${ver}`);
    const rc = (a, inp) => execFileSync('rclone', a, { input: inp !== undefined ? Buffer.from(inp, 'utf8') : undefined, encoding: 'utf8', timeout: 10000 }).replace(/\n$/, '');
    const badR = Object.entries(TABLE).filter(([, p]) => rc(['reveal', '--', obscure(p)]) !== p).map(([n]) => n);
    ok(!badR.length, `§2 the real rclone reveals OUR obscure to the plaintext for every sample (${Object.keys(TABLE).length})`, badR.join(', '));
    const badO = Object.entries(TABLE).filter(([, p]) => reveal(rc(['obscure', '-'], p)) !== p).map(([n]) => n);
    ok(!badO.length, '§2 our reveal decrypts the real rclone\'s obscure for every sample (equivalence proven by REVEAL — the IV differs, never by bytes)', badO.join(', '));
  }
}

// ── §3 THE MANAGER WIRING (the real MountManager over webdav + sftp) ──────────
{
  const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
  const dd = path.join(ROOT, 'mgr'); fs.mkdirSync(dd, { recursive: true });
  const mm = new MountManager({ dataDir: dd });
  const SECRET = 'S3cr3t-' + Math.random().toString(36).slice(2);
  const passOf = (rec) => mm._rcloneFor(mm._get(mm.add(rec))).env.RCLONE_CONFIG_VS_PASS;
  const dav = passOf({ type: 'webdav', name: 'dav', url: 'https://dav.example/', vendor: 'nextcloud', user: 'u', pass: SECRET });
  const sftp = passOf({ type: 'sftp', name: 'sftp', sshHost: 'h', sshUser: 'u', sshPort: '22', pass: SECRET });
  ok(dav && reveal(dav) === SECRET && dav !== SECRET, '§3 webdav: RCLONE_CONFIG_VS_PASS is the obscured form (reveals to the secret, is not the plaintext)', JSON.stringify(dav));
  ok(sftp && reveal(sftp) === SECRET && sftp !== SECRET, '§3 sftp: RCLONE_CONFIG_VS_PASS is the obscured form (reveals to the secret, is not the plaintext)', JSON.stringify(sftp));
  ok(typeof mm._obscure('z') === 'string', '§3 _obscure returns a string synchronously (no exec, no Promise — nothing blocks the loop)');
  const env = mm._rcloneFor(mm._get(mm.add({ type: 'webdav', name: 'dav2', url: 'https://d/', user: 'u', pass: SECRET }))).env;
  const leak = Object.entries(env).filter(([, v]) => String(v).includes(SECRET)).map(([k]) => k);
  ok(!leak.length, '§3 no value in the built rclone env carries the plaintext secret (only its obscured form)', JSON.stringify(leak));
}

// ── §4 THE CMDLINE CONTROL + THE ARGV MUTANT ──────────────────────────────────
{
  const MC = mutantCopies('rclone-obscure', REPO);
  const { MountManager } = require(path.join(REPO, 'src/mounts.js'));
  const cap = path.join(ROOT, 'cmdline-cap');
  // a runtime fake rclone: on ANY call it appends its own /proc/self/cmdline (exactly what another local user reads
  // from /proc/<pid>/cmdline) to $VS_CMDLINE_CAP, then prints a token so the caller does not error.
  const FAKE = '#!/bin/sh\ncat /proc/$$/cmdline >> "$VS_CMDLINE_CAP" 2>/dev/null; printf \'\\n\' >> "$VS_CMDLINE_CAP" 2>/dev/null; printf FAKE_TOKEN\n';  // /proc/$$ = THIS fake process (what another local user reads), not cat\'s
  const SENT = 'PLAINTEXT-SENTINEL-' + Math.random().toString(36).slice(2);
  const runPass = (MM, tag) => {
    const dd = path.join(ROOT, 'cap-' + tag); fs.mkdirSync(path.join(dd, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(dd, 'bin', 'rclone'), FAKE, { mode: 0o755 }); fs.chmodSync(path.join(dd, 'bin', 'rclone'), 0o755);
    const mm = new MM({ dataDir: dd });
    const id = mm.add({ type: 'webdav', name: 'c', url: 'https://d/', user: 'u', pass: SENT });
    const saved = process.env.VS_CMDLINE_CAP; process.env.VS_CMDLINE_CAP = cap;
    try { mm._rcloneFor(mm._get(id)); } catch { /* a mutant's token is junk; the capture already happened */ }
    finally { if (saved === undefined) delete process.env.VS_CMDLINE_CAP; else process.env.VS_CMDLINE_CAP = saved; }
  };
  // FIXED tree: building the PASS mount's rclone env invokes NO `rclone obscure` child → the cap holds no obscure call
  fs.writeFileSync(cap, '');
  runPass(MountManager, 'fixed');
  const capFixed = fs.readFileSync(cap, 'utf8');
  ok(!capFixed.includes(SENT) && !capFixed.includes('obscure'),
    '§4 CMDLINE CONTROL: building a PASS mount\'s rclone env invokes no `rclone obscure` child — no /proc cmdline carries the plaintext', JSON.stringify(capFixed.slice(0, 120)));
  // the MUTANT: the pre-fix _obscure (the sync `rclone obscure <plain>` child) restored ⇒ the fake runs ⇒ its /proc cmdline carries the plaintext
  const src = fs.readFileSync(path.join(REPO, 'src/mounts.js'), 'utf8');
  const NEW = '    return rcloneObscure(String(plain));';
  const OLD = "    return execFileSync(this.rcloneBin(), ['obscure', String(plain)], { encoding: 'utf-8', timeout: 5000 }).trim();";
  ok(src.split(NEW).length === 2, '§4 the mutant anchor exists once (the in-process _obscure body)');
  const MUT = MC.load('src/mounts.js', src.replace(NEW, OLD), 'argv-mutant').MountManager;
  fs.writeFileSync(cap, '');
  runPass(MUT, 'mutant');
  const capMut = fs.readFileSync(cap, 'utf8');
  ok(capMut.includes(SENT) && capMut.includes('obscure'),
    '§4 MUTANT: the pre-fix `rclone obscure <plain>` child puts the plaintext on its /proc cmdline ⇒ RED (the control catches it)', `sentinel on a cmdline: ${capMut.includes(SENT)}`);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
