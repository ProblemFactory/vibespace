#!/usr/bin/env node
// THE STOCK X KEYMAP, CAPTURED (lane xpra-ime-mac, inc-mvaddc4m-6m0t): a fresh private Xvfb (-noreset, its own display
// number from -displayfd — never the owner's), `setxkbmap -rules evdev -model pc105 -layout us`, then `xmodmap -pke` —
// what every xpra display starts with (xpra's own set_keymap runs the same setxkbmap before it programs a client's map)
// and so what an app started BEFORE a viewer's keymap arrives has seen. Written to scripts/fixtures/evdev-us-pke.txt;
// the xpra keymap census (test-xpra-client §1) reads it: the keycodes xpra-proto.js publishes must carry the same
// keysyms there, and the IME slots must sit on keycodes that are NoSymbol there. Re-run when the box's xkb data moves.
// Run: node scripts/capture-evdev-keymap.mjs
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'evdev-us-pke.txt');
const xv = spawn('Xvfb', ['-displayfd', '3', '-screen', '0', '640x480x24', '-nolisten', 'tcp', '-noreset'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe'] });
const display = await new Promise((resolve, reject) => {
  let buf = '';
  const t = setTimeout(() => reject(new Error('Xvfb did not report a display within 10 s')), 10000);
  xv.stdio[3].on('data', (b) => { buf += b; const m = /^(\d+)\n/.exec(buf); if (m) { clearTimeout(t); resolve(`:${m[1]}`); } });
  xv.once('exit', (c) => { clearTimeout(t); reject(new Error(`Xvfb exited (${c})`)); });
});
try {
  const env = { ...process.env, DISPLAY: display };
  execFileSync('setxkbmap', ['-rules', 'evdev', '-model', 'pc105', '-layout', 'us'], { env });
  const query = execFileSync('setxkbmap', ['-query'], { env, encoding: 'utf8' }).trim().split('\n').map((l) => l.replace(/\s+/g, ' ')).join('; ');
  const pke = execFileSync('xmodmap', ['-pke'], { env, encoding: 'utf8' });
  const xvfb = (() => { try { return execFileSync('dpkg-query', ['-W', '-f', '${Version}', 'xvfb'], { encoding: 'utf8' }); } catch { return '?'; } })();
  const xkb = (() => { try { return execFileSync('dpkg-query', ['-W', '-f', '${Version}', 'xkb-data'], { encoding: 'utf8' }); } catch { return '?'; } })();
  fs.writeFileSync(out, `! xmodmap -pke of a fresh Xvfb after setxkbmap -rules evdev -model pc105 -layout us (${query})\n! captured by scripts/capture-evdev-keymap.mjs — xvfb ${xvfb}, xkb-data ${xkb}; never hand-edited\n${pke}`);
  console.log(`wrote ${out}: ${pke.trim().split('\n').length} keycodes (${query})`);
} finally { xv.kill('SIGTERM'); }
