#!/usr/bin/env node
// THE VNC VIEW — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM from the heavy
// scripts/test-vnc-view.mjs, whose fake-DOM component legs, the real Xvnc legs, the retired-file comparison (git history) and
// every patched-copy CONTROL (with its premise) stay there: §1 the ONE surface (the grep census over src/lib + the two windows'
// wiring), the server half's install pin, §9 the last-close route + the new words' zh / ja, §ARD the one subtle fallback. Each
// reads the file it pins BY NAME (§1 lists src/lib), so ci.mjs's affected rule selects this suite on a change of that file.
// UNCONDITIONAL HERE, ON PURPOSE (a stronger gate than the heavy's): in the heavy the server half's install pin sat in the
// `else` branch of `if (!fs.existsSync('/proc/self/stat'))`, so a host without procfs skipped it with the stop-rule legs. It
// reads only server.js, which every host has, so here it runs on every host.
// Run: node scripts/test-vnc-view-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const repo = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const read = (f) => fs.readFileSync(path.join(repo, f), 'utf8');
let pass = 0, fail = 0;
const ok = (c, name, extra) => { if (typeof name !== 'string') throw new TypeError(`ok(): the name is a ${typeof name} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log(`  ✓ ${name}`); } else { fail++; console.error(`  ✗ ${name}${extra !== undefined ? '\n    ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : ''}`); } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('§1 the ONE surface (grep census over src/lib)');
{
  const libDir = path.join(repo, 'src/lib');
  const files = fs.readdirSync(libDir).filter((f) => f.endsWith('.js'));
  // (chat-view/utils write style.zoom for the CHAT scale and the body DPI zoom — different rules; the census is for the COUNTER-zoom literal)
  const shapes = { novncImport: /import\(new URL\('\/novnc\.js'/, counterZoom: /calc\(1 \/ var\(--ui-scale/, newRfb: /new RFB\(/, scaleViewport: /\.scaleViewport\s*=/, resizeSession: /\.resizeSession\s*=/ };
  const where = {};
  for (const f of files) { const s = read(`src/lib/${f}`); for (const [k, re] of Object.entries(shapes)) if (re.test(s)) (where[k] ||= []).push(f); }
  // 2.369.118: the counter-zoom LITERAL moved to utils.js (COUNTER_ZOOM — the ONE
  // definition, shared with every xterm container); vnc-view.js re-exports the
  // name and no file spells the calc() twice.
  const home = { counterZoom: ['utils.js'] };
  for (const k of Object.keys(shapes)) ok(same(where[k], home[k] || ['vnc-view.js']), `${k} lives ONLY in ${(home[k] || ['vnc-view.js']).join('+')} (${(where[k] || []).join(', ') || 'nowhere'})`);
  ok(/export \{ COUNTER_ZOOM \}/.test(read('src/lib/vnc-view.js')) && /container\.style\.zoom = COUNTER_ZOOM/.test(read('src/lib/terminal.js')) && /import \{[^}]*COUNTER_ZOOM[^}]*\} from '\.\/utils\.js'/.test(read('src/lib/terminal.js')), 'vnc-view.js re-exports COUNTER_ZOOM from utils.js and terminal.js counter-zooms its container with the same name (net zoom 1 for xterm mouse mapping, 2.369.118)');

  const dw = read('src/lib/desktop-window.js'), daw = read('src/lib/desktop-app-window.js');
  ok(/import \{ createVncView, streamUrl \} from '\.\/vnc-view\.js'/.test(dw) && /createVncView\(winInfo\.content/.test(dw), 'desktop-window.js mounts through createVncView (no inline noVNC)');
  ok(/import \{ viewOf, STATUS_KIND \} from '\.\/stream-views\.js'/.test(daw) && /view = viewOf\(kind\)\(winInfo\.content/.test(daw) && /\{ kind: rfb\.STREAM_KIND, create: rfb\.createVncView \}/.test(read('src/lib/stream-views.js')), /* F-B4: through the views registry */ 'desktop-app-window.js mounts through createVncView too (its RFB records) — one component, two window types; its xpra records go through xpra-view.js on the same shell (P8-2 x2)');
  ok(/autoReconnect: true/.test(dw) && /autoReconnect: true/.test(daw), 'BOTH windows walk the bounded reconnect ladder (2.369.118: the singleton too — userW\'s Desktop sat on "Disconnected" until a click; the Reconnect button stays for the ladder\'s end)');
  ok(/streamUrl\('\/api\/vnc'\)/.test(dw) && /streamUrl\(`\/api\/desktop\/\$\{encodeURIComponent\(id\)\}\/stream`\)/.test(daw), 'both windows speak to the ONE bridge (/api/vnc and /api/desktop/<id>/stream)');
}

console.log('\nthe singleton\'s server half: a shutdown stops only the Xvnc this process started');
{
      ok(/new VncManager\(\{ dataDir: path\.join\(__dirname, 'data'\), stopOnShutdown: throwawayRoot \}\)/.test(read('server.js')) && /^\s*try \{ vnc\.shutdown\(\); \} catch \{\}/m.test(read('server.js').slice(read('server.js').indexOf('function shutdown()'))), 'WIRING: server.js builds the manager with stopOnShutdown = throwawayRoot and calls vnc.shutdown() in its SIGINT/SIGTERM shutdown()');
}

console.log('§9 lane desktop-keepalive K2/K3 (userW inc-muoshmqn-dect: two Paste presses, nothing visible, no toast in the ring) — every press is SAID; a press while the stream is down queues and pastes when it is back; the bar counts the ladder and words the close');
{
  const shellSrc = read('src/lib/picture-shell.js');

  ok(/router\.get\('\/api\/vnc\/last-close'/.test(read('src/routes/desktop-apps.js')) && /lastClose: async \(\) => \{ const r = await fetchJson\('\/api\/vnc\/last-close'\)/.test(read('src/lib/desktop-window.js')), 'K3: the singleton reads GET /api/vnc/last-close');
  // the new words have zh + ja entries
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const keys = [...new Set([...shellSrc.matchAll(/t\('((?:This page cannot|The browser refused clipboard access —|The browser is still asking|Your clipboard holds|Not pasted —|The desktop stream is reconnecting|Reconnecting \{n\}|the browser stopped|the desktop server closed|the connection dropped|the desktop session ended|another window is driving)[^']*)'/g), ...read('src/lib/vnc-view.js').matchAll(/t\('(This pane is watching[^']*)'/g)].map((m) => m[1]))];
  const shellKeys = ['This page cannot read your clipboard — paste into the box under the bar, then Send', 'The browser refused clipboard access — paste into the box under the bar, then Send', 'The browser is still asking for clipboard permission — answer it, or paste into the box under the bar', 'Your clipboard holds no text — paste into the box under the bar, then Send', 'the browser stopped answering', 'the desktop server closed the stream', 'the connection dropped', 'the desktop session ended', 'another window is driving it'];
  const all = [...new Set([...keys, ...shellKeys])];
  const missing = all.filter((k) => !(zh.includes(JSON.stringify(k) + ':') && ja.includes(JSON.stringify(k) + ':')));
  ok(all.length >= 14 && !missing.length, `the ${all.length} new words have zh + ja entries`, missing);
}

console.log('§ARD a sign-in handed to noVNC SAYS so: "Signing in…" at once; noVNC\'s auth rejecting, 20 s of silence or a close ⇒ "The sign-in could not be completed: …" with Reconnect, no ladder; the AES fallback only where crypto.subtle is absent');
{
    const vsrc = read('src/lib/vnc-view.js');
    ok((vsrc.match(/installSubtleFallback\(/g) || []).length === 1 && vsrc.indexOf('installSubtleFallback(') < vsrc.indexOf('new RFB('), 'vnc-view.js installs the fallback in ONE place, before new RFB');
    const libs = fs.readdirSync(path.join(repo, 'src/lib')).filter((x) => x.endsWith('.js') && x !== 'aes-fallback.js' && /defineProperty\([^)]*['"]subtle['"]/.test(read(`src/lib/${x}`)));
    ok(libs.length === 0, 'no other client file defines crypto.subtle', libs);
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
