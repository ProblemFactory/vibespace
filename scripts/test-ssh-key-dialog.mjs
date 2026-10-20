#!/usr/bin/env node
/**
 * The "Private key" dialog (_askPrivateKey) in a REAL browser — self-driving:
 * esbuild bundles a throwaway entry that installs the real sidebar-mounts
 * mixin on a stub, drives the dialog programmatically, and prints its verdicts
 * into a <pre> that headless Chrome dumps back out. No CDP, no server.
 *
 * WHY this exists: the submit path resolved `null` (identical to Cancel)
 * because createModalShell's close() fires onClose on EVERY path — the
 * cancel-resolver won the race and the whole paste-a-key flow was dead. No
 * unit or HTTP test can see that; only the real DOM lifecycle can.
 *
 *   node scripts/test-ssh-key-dialog.mjs
 */
import { execFileSync, execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

const execFileP = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = ['google-chrome', 'chromium', 'chromium-browser', 'google-chrome-stable']
  .find((c) => { try { execFileSync('which', [c], { stdio: 'ignore' }); return true; } catch { return false; } });
if (!CHROME) { console.log('SKIP — no chrome/chromium on PATH'); process.exit(0); }

const D = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-keydlg-'));
const ENTRY = path.join(ROOT, `vs-keydlg-entry.${process.pid}.tmp.js`);
const cleanup = () => { try { fs.rmSync(D, { recursive: true, force: true }); } catch {} try { fs.unlinkSync(ENTRY); } catch {} };

try {
  execFileSync('ssh-keygen', ['-t', 'ed25519', '-N', 'pw with space ', '-f', path.join(D, 'enc'), '-q']);
  execFileSync('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', path.join(D, 'plain'), '-q']);
  const ENC = JSON.stringify(fs.readFileSync(path.join(D, 'enc'), 'utf-8'));
  const PLAIN = JSON.stringify(fs.readFileSync(path.join(D, 'plain'), 'utf-8'));

  fs.writeFileSync(ENTRY, `
import { installSidebarMounts } from ${JSON.stringify(path.join(ROOT, 'src/lib/sidebar-mounts.js'))};
import { createModalShell } from ${JSON.stringify(path.join(ROOT, 'src/lib/utils.js'))};
const ENC=${ENC}, PLAIN=${PLAIN};
const out=[]; const ok=(n,c,x="")=>out.push((c?"ok   ":"FAIL ")+n+(c?"":" -- "+x));
function S(){} installSidebarMounts(S); const s=new S();
const $=(q)=>document.querySelector(q);
const disp=(el)=>el?getComputedStyle(el).display:"(gone)";
const passWrap=()=>[...document.querySelectorAll("#mounts-dialog-overlay .dialog-body > div")].find(d=>d.querySelector("input[type=password]"));
const ta=()=>$("#mounts-key-paste");
const statusEl=()=>[...document.querySelectorAll("#mounts-dialog-overlay .mounts-field-hint")].find(e=>e.previousElementSibling&&e.previousElementSibling.type==="file");
const submitBtn=()=>$("#mounts-dialog-overlay .btn-create");
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 try{
  let p=s._askPrivateKey(); await sleep(0);
  ok("fresh open hides the passphrase row", disp(passWrap())==="none", disp(passWrap()));
  ok("manual toggle is always available", !!$("#mounts-dialog-overlay .mounts-btn"));
  ta().value=ENC; ta().dispatchEvent(new Event("input"));
  ok("encrypted key reveals the passphrase row", disp(passWrap())!=="none", disp(passWrap()));
  ok("…and says why", /passphrase/i.test(statusEl().textContent), statusEl().textContent);
  ok("toggle hides once revealed", disp($("#mounts-dialog-overlay .mounts-btn"))==="none");
  ta().value=PLAIN; ta().dispatchEvent(new Event("input"));
  ok("plain key clears the status", statusEl().textContent==="", statusEl().textContent);
  ok("row STAYS revealed (never yank a field being typed in)", disp(passWrap())!=="none");
  $("#mounts-dialog-overlay input[type=password]").value="pw with space ";
  submitBtn().click(); const r=await p;
  ok("submit resolves the VALUE, not null like Cancel", !!r, String(r));
  ok("passphrase read RAW — trailing space survives", r&&r.keyPassphrase==="pw with space ", JSON.stringify(r&&r.keyPassphrase));
  ok("key text returned", !!r&&r.privateKey.includes("OPENSSH PRIVATE KEY"));
  ok("dialog closed after submit", !$("#mounts-dialog-overlay"));
  p=s._askPrivateKey(); await sleep(0);
  $("#mounts-dialog-overlay .dialog-close").click();
  ok("X resolves null (awaiting caller never hangs)", (await p)===null);
  p=s._askPrivateKey(); await sleep(0);
  $("#mounts-dialog-overlay").dispatchEvent(new MouseEvent("mousedown",{bubbles:true}));
  ok("backdrop dismiss resolves null too", (await p)===null);
  p=s._askPrivateKey({text:ENC,error:"Wrong passphrase - the key could not be unlocked.",showPass:true}); await sleep(0);
  ok("retry re-opens PREFILLED (no re-paste)", ta().value===ENC);
  ok("retry reveals the passphrase row", disp(passWrap())!=="none");
  ok("retry shows the reason", /Wrong passphrase/.test($("#mounts-dialog-overlay .cfg-err").textContent), $("#mounts-dialog-overlay .cfg-err").textContent);
  ok("retry focuses the passphrase field", document.activeElement&&document.activeElement.type==="password");
  ta().value=""; ta().dispatchEvent(new Event("input"));
  submitBtn().click(); await sleep(20);
  ok("empty submit refuses inline", /Paste or upload/.test($("#mounts-dialog-overlay .cfg-err").textContent), $("#mounts-dialog-overlay .cfg-err").textContent);
  ok("…and stays open", !!$("#mounts-dialog-overlay"));
  ta().value="PuTTY-User-Key-File-3: ssh-ed25519\\nEncryption: aes256-cbc\\n"; ta().dispatchEvent(new Event("input"));
  ok("ppk gives the convert instruction", /puttygen/.test(statusEl().textContent), statusEl().textContent);
  ok("ppk does NOT disable submit (detection never blocks)", submitBtn().disabled===false);
  ta().value="hello"; ta().dispatchEvent(new Event("input"));
  ok("garbage hints BEGIN/END", /BEGIN/.test(statusEl().textContent), statusEl().textContent);
  ta().value=ENC.split("\\n").slice(1,-2).join("\\n"); ta().dispatchEvent(new Event("input"));
  ok("armor-stripped body hinted too", /BEGIN/.test(statusEl().textContent), statusEl().textContent);
  $("#mounts-dialog-overlay .dialog-close").click(); await p;
  ok("no overlay left behind", !$("#mounts-dialog-overlay"));
  // lane race-sweep (B-6b74, test-desktop-webrtc-chrome ⑪): createModalShell's ESCAPE WHILE NOTHING HOLDS THE FOCUS — a control
  // that replaced itself (the window picker's 「停止」 swaps its row) left the focus on <body>; Escape must still close the modal
  const esc = (t) => t.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  const m1 = createModalShell({ title: "esc", escapeToClose: true }); const b1 = document.createElement("button"); m1.body.appendChild(b1); b1.focus();
  ok("ESC setup: a control inside the modal holds the focus", document.activeElement === b1);
  b1.remove();
  ok("ESC setup: …it replaced itself — the focus fell to <body>", document.activeElement === document.body, String(document.activeElement && document.activeElement.tagName));
  esc(document.body);
  ok("ESC: Escape with nothing focused closes the modal (the picker after 「停止」)", !m1.overlay.isConnected);
  const lo = createModalShell({ title: "low", escapeToClose: true }), hi = createModalShell({ title: "high", escapeToClose: true });
  document.body.focus(); esc(document.body);
  ok("ESC: …only the TOPMOST one", !hi.overlay.isConnected && lo.overlay.isConnected);
  const inp = document.createElement("input"); document.body.appendChild(inp); inp.focus(); esc(inp);
  ok("ESC: an Escape that something else holds (an input outside the modal) is not the modal's", lo.overlay.isConnected);
  inp.remove(); lo.close();
  const pv = document.createElement("div"); pv.dataset.popover = "1"; document.body.appendChild(pv);
  const m3 = createModalShell({ title: "pv", escapeToClose: true });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.querySelector("[data-popover]")) { document.querySelectorAll("[data-popover]").forEach((x) => x.remove()); e.preventDefault(); } }, { once: true, capture: true });
  esc(document.body);
  ok("ESC: a popover the app's handler closed first (default prevented) leaves the modal open", m3.overlay.isConnected && !document.querySelector("[data-popover]"));
  m3.close();
 }catch(e){ out.push("FAIL threw: "+e.message+" | "+e.stack); }
 const pre=document.createElement("pre"); pre.id="res"; pre.textContent=out.join("\\n"); document.body.appendChild(pre);
})();
`);

  await execFileP('npx', ['esbuild', ENTRY, '--bundle', `--outfile=${path.join(D, 'b.js')}`,
    '--format=iife', '--platform=browser', '--target=es2020', '--loader:.css=css'], { cwd: ROOT });
  fs.writeFileSync(path.join(D, 't.html'),
    `<!doctype html><html><head><meta charset="utf-8">` +
    `<link rel="stylesheet" href="file://${path.join(ROOT, 'public/style.css')}"></head>` +
    `<body><script src="file://${path.join(D, 'b.js')}"></script></body></html>`);

  const { stdout } = await execFileP(CHROME, ['--headless', '--disable-gpu', '--no-sandbox',
    '--virtual-time-budget=8000', '--dump-dom', `file://${path.join(D, 't.html')}`], { maxBuffer: 1 << 26 });
  const m = /<pre id="res">([\s\S]*?)<\/pre>/.exec(stdout);
  if (!m) { console.log('FAIL — the dialog harness produced no result element'); cleanup(); process.exit(1); }
  const txt = m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  console.log(txt);
  const lines = txt.split('\n').filter(Boolean);
  // CONTROL (lane race-sweep): the same Escape on the PRE-FIX createModalShell (a bundle with the idle-Escape listener never
  // bound — utils.js patched at bundle time, never in the tree) leaves the modal open: the ESC leg above is the fix
  const { build } = await import(path.join(ROOT, 'node_modules/esbuild/lib/main.js'));
  const UTILS = path.join(ROOT, 'src/lib/utils.js');
  const BIND = "    document.addEventListener('keydown', onIdleEscape);\n";
  const usrc = fs.readFileSync(UTILS, 'utf8');
  const ctlEntry = `import { createModalShell } from ${JSON.stringify(UTILS)};
const m = createModalShell({ title: "esc", escapeToClose: true }); const b = document.createElement("button"); m.body.appendChild(b); b.focus(); b.remove();
document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
const pre = document.createElement("pre"); pre.id = "res"; pre.textContent = (document.activeElement === document.body ? "body " : "focus-elsewhere ") + (m.overlay.isConnected ? "STAYS" : "closed"); document.body.appendChild(pre);`;
  await build({ stdin: { contents: ctlEntry, resolveDir: ROOT, loader: 'js' }, bundle: true, format: 'iife', platform: 'browser', target: 'es2020', outfile: path.join(D, 'c.js'), loader: { '.css': 'empty' }, logLevel: 'error',
    plugins: [{ name: 'pre-fix', setup(b) { b.onLoad({ filter: /utils\.js$/ }, (a) => (a.path === UTILS ? { contents: usrc.replace(BIND, ''), loader: 'js', resolveDir: path.dirname(a.path) } : undefined)); } }] });
  fs.writeFileSync(path.join(D, 'c.html'), `<!doctype html><html><head><meta charset="utf-8"></head><body><script src="file://${path.join(D, 'c.js')}"></script></body></html>`);
  const ctl = (await execFileP(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--virtual-time-budget=4000', '--dump-dom', `file://${path.join(D, 'c.html')}`], { maxBuffer: 1 << 26 })).stdout;
  const cm = /<pre id="res">([\s\S]*?)<\/pre>/.exec(ctl);
  const ctlLine = usrc.split(BIND).length === 2 && cm && cm[1] === 'body STAYS'
    ? 'ok   CONTROL: the pre-fix createModalShell (its idle-Escape listener never bound) leaves the modal OPEN after the same Escape (body STAYS) — the ESC leg is the fix'
    : `FAIL CONTROL: the pre-fix bundle — anchor ${usrc.split(BIND).length === 2 ? 'once' : 'NOT once'}, got ${cm ? cm[1] : 'no result'}`;
  console.log(ctlLine); lines.push(ctlLine);
  const failed = lines.filter((l) => l.startsWith('FAIL'));
  console.log(`\n${failed.length ? 'FAIL' : 'PASS'} — ${lines.length - failed.length} passed, ${failed.length} failed`);
  cleanup();
  process.exit(failed.length ? 1 : 0);
} catch (e) {
  cleanup();
  console.log('FAIL — harness error: ' + e.message);
  process.exit(1);
}
