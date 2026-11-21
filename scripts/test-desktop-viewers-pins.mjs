#!/usr/bin/env node
// THE DESKTOP VIEWERS — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM from
// the heavy scripts/test-desktop-viewers.mjs, whose PURE rule, keeper election, bridges and every patched-copy CONTROL stay
// there: §1 the rule imports nothing, §4 the wiring pins (window-live-wiring, the takeover route, the window's overlay) + its
// four strings' zh / ja, §5 the blocked pane's title and its predecessor, §6 the relaunch's seat carry. Each reads the file it
// pins BY NAME, so ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-desktop-viewers-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? ' — ' + JSON.stringify(e) : '')); } };

const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');

console.log('§1 the PURE rule (src/desktop-viewers.js)');
{
  const src = read('src/desktop-viewers.js');
  ok(!/require\(|import /.test(src.replace(/^\s*(\*|\/\/).*$/gm, '')), 'desktop-viewers.js imports nothing (PURE — bundled into the window too)');
}

console.log('§4 the route + the wiring pins');
{
  // WIRING PINS — code at the start of a line, never text after a mid-line // (the 2.369.134 lesson)
  const code = read('src/server/window-live-wiring.js').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).map((l) => l.replace(/\s\/\/.*$/, '')).join('\n');
  ok(/viewerSeats: \{/.test(code) && /state: \(id, viewerId\) => \(src\(id\)\.seat \? src\(id\)\.seat\(id, viewerId\) : governed\(id\) \? DV\.viewerState\(\{ active: keeper\.activeViewer\(id\) \}, viewerId, engine\.leaseInput\(id\)\) : 'free'\)/.test(code), 'WIRING PIN: the bridge\'s seat state IS the PURE rule over the keeper\'s election and the engine\'s lease');
  ok(/keeper\.onViewers\?\.\(\(id\) => stream\.refresh\(id\)\)/.test(code) && /m\.type === 'window-leases-updated'\) \{ try \{ streamRef\?\.refreshAll\(\)/.test(code), 'WIRING PIN: a viewer change and every lease broadcast re-apply the sockets (refresh / refreshAll)');
  const rsrc = read('src/routes/desktop-apps.js');
  ok(/const v = ctx\.keeper\.takeoverViewer \? ctx\.keeper\.takeoverViewer\(req\.params\.id, viewerId\) : null;/.test(rsrc), 'WIRING PIN: the lease takeover route makes the taker the active viewer too');
  const w = read('src/lib/desktop-app-window.js');
  ok(/blockedTitle\.textContent = /.test(w) && !/blockedTitle\.innerHTML/.test(w) && /t\('Active on another client'\)/.test(w) && /t\('Resume here'\)/.test(w), 'the overlay names the app as TEXT (a title is peer-controlled) with the two words through t()');
  ok(/optimistic = \{ state: 'active'/.test(w) && w.indexOf('renderSeat(); // the overlay goes NOW') < w.indexOf("/viewers/takeover`"), 'Resume here flips the pane BEFORE the request (never waits for the broadcast echo)');
  const zh = (await import('../src/lib/i18n-zh.js')).default, ja = (await import('../src/lib/i18n-ja.js')).default;
  const keys = ['Active on another client', 'Resume here', 'Make this window the active one — the other client is blocked until it resumes', 'Could not resume here'];
  ok(keys.every((k2) => zh[k2] && ja[k2]), 'the four new chrome strings have zh + ja entries');
}

console.log('§5 the grace, LOW-4, LOW-3, LOW-2 (2.369.156)');
{
  const w = read('src/lib/desktop-app-window.js');
  ok(/const titleText = \(\) => \(seatState\(\) === 'blocked' \? \(rec && rec\.appTitle\) \|\| appTitle : appTitle \|\| \(rec && rec\.appTitle\)\) \|\| \(rec && rec\.label\) \|\| t\('Desktop app'\);/.test(w), 'the window: a BLOCKED pane names the app by the record\'s title first (its own protocol title is the last one it saw before the cut), an active one by its live protocol title — the launch label only when neither exists');
  ok(/sessionStorage\.getItem\(prevKey\)/.test(w) && /&prev=\$\{encodeURIComponent\(prevPane\)\}/.test(w), 'the window names its predecessor pane (`prev`, per tab, sessionStorage) on its stream url — the grace\'s reload successor');
}

console.log('§6 (desktop A r1) a Scale ▸ relaunch CARRIES the active seat to the successor — the relaunching pane is never blocked on its own window');
{
  // LANE C1: ONE relaunch (src/desktop-serve.js), the hub keeper's seat carry passed as its `onSuccessor` hook
  const ksrc = fs.readFileSync(path.join(repo, 'src/server/desktop-app-keeper.js'), 'utf8');
  const msrc = fs.readFileSync(path.join(repo, 'src/desktop-serve.js'), 'utf8');
  ok(/machine\.relaunch\(id, body, \{ onSuccessor: \(nextId\) => carrySeat\(id, nextId\) \}\)/.test(ksrc)
    && /const armSeat = typeof onSuccessor === 'function' \? onSuccessor\(next\.id\) : null;\s*\n\s*rec\.replacedBy = next\.id;/.test(msrc)
    && /const armSeat = typeof onSuccessor === 'function' \? onSuccessor\(nextId\) : null;\s*\n\s*rec\.replacedBy = nextId;/.test(msrc)
    && (msrc.match(/finally \{ [^}]*if \(typeof armSeat === 'function'\) armSeat\(\); \}/g) || []).length === 2, 'WIRING PIN: relaunch() carries the seat BEFORE it commits replacedBy (the other clients retarget from that broadcast) and arms the hold after the old session\'s stop, even a failed one — both arms (a browser too) of the ONE machine relaunch, the carry the hub keeper\'s onSuccessor');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
