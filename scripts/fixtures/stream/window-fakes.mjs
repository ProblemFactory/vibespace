// lane stream-p2w-build: THE FAKES of the window source's suite (test-stream-window) — a Windows machine's window helper and
// C# compiler on a Linux box, from shapes (Node scripts, `#!<this node>`, never `env node`; cfg is re-read at every start):
//   writeFakeWgc(dir, cfg)   `vibespace-wgc.exe`: `facts [--hwnd H]` prints cfg.windows as the helper's JSON lines (an unknown
//                            H = {"ev":"gone"}, exit 3); `restore --hwnd H` prints that row, not minimized; `capture` prints
//                            the helper's stderr events (open, window) and writes frames at --fps — the helper's 16-byte head
//                            ("VSWF", w, h, flags 1 = a new picture, 4 bytes a pixel) + w × h × 4 bytes — then plays
//                            cfg.capture.script: { at, size: {w, h} } (a `size` line, frames of the new size), { at, fresh }
//                            (false = the last picture again, as a minimized window), { at, ev } (one stderr line),
//                            { at, exit, stderr } (dies). Every argv → cfg.log. Lane stream-window-fixes: stdin closed ⇒ the
//                            real helper's `end` line ({"ev":"end","why":"stdin","code":0}) and exit 0 — unless
//                            cfg.capture.ignoreStdin (a helper that never notices: the agent's grace kill); its pid →
//                            cfg.capture.pidFile. Lane fast-debt-clear: cfg.capture.pace = frames a second the fake WRITES
//                            (the `open` line still says --fps): a leg that only counts units gets them sooner
//   writeFakeCsc(file, cfg)  the in-box csc.exe: writes its /out: file (cfg.helper = a script copied there, runnable — the
//                            agent then spawns THAT as its helper), or refuses the first define set when cfg.refuse names it
//                            (a Windows without MinUpdateInterval); every argv → cfg.log
import fs from 'node:fs';
import path from 'node:path';

export function writeFakeWgc(dir, cfg) {
  fs.mkdirSync(dir, { recursive: true });
  const cfgFile = path.join(dir, 'fake-wgc.json');
  fs.writeFileSync(cfgFile, JSON.stringify(cfg));
  const exe = path.join(dir, 'vibespace-wgc.exe');
  fs.writeFileSync(exe, `#!${process.execPath}
'use strict';
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(${JSON.stringify(cfgFile)}, 'utf8'));
const argv = process.argv.slice(2);
if (cfg.log) fs.appendFileSync(cfg.log, JSON.stringify(argv) + '\\n');
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const ascii = (o) => JSON.stringify(o).replace(/[\\u007f-\\uffff]/g, (c) => '\\\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')); // the real helper's JSON is ASCII (lane stream-window-fixes)
const say = (o) => process.stdout.write(ascii(o) + '\\n');
const err = (o) => process.stderr.write(ascii(o) + '\\n');
const rows = cfg.windows || [];
const mode = argv[0], hwnd = arg('--hwnd');
if (mode === 'facts') {
  const list = hwnd ? rows.filter((r) => r.hwnd === hwnd) : rows;
  if (hwnd && !list.length) { say({ ev: 'gone', hwnd }); process.exit(3); }
  for (const r of list) say({ ev: 'window', ...r });
  say({ ev: 'facts', n: list.length, ms: 3 });
  process.exit(0);
}
if (mode === 'restore') { const r = rows.find((x) => x.hwnd === hwnd); if (!r) { say({ ev: 'gone', hwnd }); process.exit(3); } say({ ev: 'window', ...r, min: false, did: 'restore' }); process.exit(0); }
if (mode !== 'capture') { process.stderr.write('usage\\n'); process.exit(2); }
const c = cfg.capture || {};
const fps = Number(arg('--fps')) || 30;
let w = c.w, h = c.h, fresh = true;
err({ ev: 'open', hwnd, w, h, bpp: 4, fps, cls: c.cls || 'WindowsForms10.Window.8.app.0.1', border: false });
err({ ev: 'window', min: false, frame: c.frame, display: c.display || '\\\\\\\\.\\\\DISPLAY1', dpi: c.dpi || 96, covered: false });
process.stdout.on('error', () => process.exit(0));
if (c.pidFile) fs.writeFileSync(c.pidFile, String(process.pid));
process.stdin.on('end', () => { if (c.ignoreStdin) return; err({ ev: 'end', why: 'stdin', code: 0 }); process.exit(0); }); process.stdin.resume();
const head = (fr) => { const b = Buffer.alloc(16); b.write('VSWF', 0, 'latin1'); b.writeUInt32LE(w, 4); b.writeUInt32LE(h, 8); b.writeUInt16LE(fr ? 1 : 0, 12); b[14] = 4; return b; };
setInterval(() => { if (process.stdout.writableNeedDrain) return; process.stdout.write(Buffer.concat([head(fresh), Buffer.alloc(w * h * 4, 0x80)])); }, 1000 / (Number(c.pace) || fps));
for (const s of c.script || []) setTimeout(() => {
  if (s.size) { w = s.size.w; h = s.size.h; err({ ev: 'size', w, h, bpp: 4 }); }
  if (s.fresh !== undefined) fresh = !!s.fresh;
  if (s.ev) err(s.ev);
  if (s.exit !== undefined) { if (s.stderr) process.stderr.write(s.stderr + '\\n'); process.exit(s.exit); }
}, s.at);
`, { mode: 0o755 });
  return { exe, cfgFile, set: (patch) => fs.writeFileSync(cfgFile, JSON.stringify(Object.assign(JSON.parse(fs.readFileSync(cfgFile, 'utf8')), patch))) };
}

export function writeFakeCsc(file, cfg) {
  const cfgFile = file + '.json';
  fs.writeFileSync(cfgFile, JSON.stringify(cfg));
  fs.writeFileSync(file, `#!${process.execPath}
'use strict';
const fs = require('fs');
const cfg = JSON.parse(fs.readFileSync(${JSON.stringify(cfgFile)}, 'utf8'));
const argv = process.argv.slice(2);
if (cfg.log) fs.appendFileSync(cfg.log, JSON.stringify(argv) + '\\n');
const def = (argv.find((a) => a.startsWith('/define:')) || '/define:').slice(8);
if (cfg.refuse != null && def === cfg.refuse) { process.stdout.write("vibespace-wgc.cs(1,1): error CS0117: 'GraphicsCaptureSession' does not contain a definition for 'MinUpdateInterval'\\n"); process.exit(1); }
const out = (argv.find((a) => a.startsWith('/out:')) || '').slice(5);
if (cfg.helper) { fs.copyFileSync(cfg.helper, out); fs.chmodSync(out, 0o755); } else fs.writeFileSync(out, 'MZ fake helper ' + def);
process.exit(0);
`, { mode: 0o755 });
  return { file, cfgFile };
}
