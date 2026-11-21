#!/usr/bin/env node
// THE EXIT RUN — THE SOURCE-TEXT LEGS (fast, text only — lane lg-text-legs-3, B-94d3 part three). MOVED VERBATIM from the heavy
// scripts/test-exit-run.mjs, whose PURE shells / heads / secret shapes, the manager over fake daemons, the routes, the CLI, the
// real daemons and every patched-copy CONTROL (with its premise) stay there: §1b the daemon reports its platform, §2e R5's guard
// and R6's row spell ONE type group, §3 the audit ids + the command list's row key, §4 the dialog arms its listener before the
// GET, §8 (m) the transfer code calls no shell. Each reads the file it pins BY NAME, so ci.mjs's affected rule selects this
// suite on a change of that file.
// Run: node scripts/test-exit-run-pins.mjs
import './scratch.mjs';   // FIRST (B-ba47): a suite that reads a home or loads a module that does takes the re-home before any of its code (§113 THE ROW: a NEW one takes the import)
import fs from 'node:fs';
import path from 'node:path';
const REPO = path.resolve(new URL('..', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n, d) => { if (typeof n !== 'string') throw new TypeError(`ok(): the name is a ${typeof n} — swapped arguments (B-1747: a swap is a crash, never a green leg)`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); } };

const section = async (name, fn) => { console.log(name); try { await fn(); } catch (e) { fail++; console.error(`  ✗ ${name} threw: ${e.stack || e.message}`); } };

await section('§1b verify r2 W5: WIN_LINE_MAX counts UTF-16 units — cmd.exe\'s 8191 are WCHARs', async () => {

  ok(/platform: process\.platform, arch: process\.arch/.test(fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8')), 'the daemon\'s hello carries process.platform verbatim (W4)');
});

await section('§2e verify r5: the quote scanners, the differentials, the order, the work witness', async () => {

  { const src = fs.readFileSync(path.join(REPO, 'src/secret-shapes.js'), 'utf8'); const groups = [...src.matchAll(/REG_\(\?:[A-Z_|]+\)/g)].map((m) => m[0]); ok(groups.length === 2 && groups[0] === groups[1] && groups[0].includes('EXPAND_SZ'), `F2: R5's guard and R6's row regex spell ONE type group (${groups.length} spellings in the source, equal)`); }
});

await section('§3 the manager over fake daemons: the capability picks the form; a spawn failure, the heads, the broadcast, the history', async () => {

    const proxySrc = fs.readFileSync(path.join(REPO, 'src/exit-proxy.js'), 'utf8');
    const callers = proxySrc.match(/this\.audit\(\{[\s\S]*?\}\)/g) || [];
    ok(/id: crypto\.randomBytes\(6\)\.toString\('hex'\)/.test(proxySrc) && callers.length >= 8 && callers.every((c) => !/[{,]\s*(id|at):/.test(c)), `X5 held: the id is crypto.randomBytes(6) hex and none of the ${callers.length} audit callers passes id / at (the spread order would let one override the mint)`);

  const dlgSrc = fs.readFileSync(path.join(REPO, 'src/lib/exit-runs-dialog.js'), 'utf8');
  ok(/export const runKeyOf = \(r\) => \(r\.id \? `id:\$\{r\.id\}` :/.test(dlgSrc), 'the command list keys a row on the line\'s id first (the at + conversation + command key only for a line without one)');
});

await section('§4 the routes · §5 the CLI', async () => {

    // verify r1 F3: the dialog arms its exit-audit listener BEFORE the fresh GET and queues what lands during it
    const dlg = fs.readFileSync(path.join(REPO, 'src/lib/exit-runs-dialog.js'), 'utf8');
    const iOn = dlg.indexOf("app.ws.onGlobal("), iGet = dlg.indexOf('await fetch(`/api/hosts/'), iQ = dlg.indexOf('queued.push(r)'), iApply = dlg.indexOf('for (const r of queued.splice(0)) place(r);');
    ok(iOn > 0 && iGet > iOn && iQ > iOn && iQ < iGet && iApply > iGet, 'the command list arms its listener before the GET and applies the queued lines after it (pre-fix: armed after the list was drawn — a run landing during the GET was in no row until a reopen)', { iOn, iGet, iQ, iApply });
});

await section('§8 lane exit-transfer: pull / push over a fake device — windows, hashes, bounds, the fence, the ask, refusals by name', async () => {

  // (m) NEVER A SHELL: the transfer code calls no run / shell / stream op (static census over the manager's transfer and the agent's write-stream)
  const px = fs.readFileSync(path.join(REPO, 'src/exit-proxy.js'), 'utf8');
  const tx = px.slice(px.indexOf('  async _transfer('), px.indexOf('  /** The display-only card in the calling chat;'));
  const ax = fs.readFileSync(path.join(REPO, 'src/agentd/agentd.js'), 'utf8');
  const wsx = ax.slice(ax.indexOf('  const writeStreams = new Map();'), ax.indexOf('  const mux = new Mux(sock, {')) + ax.slice(ax.indexOf("  'part-open': (m) => {"), ax.indexOf('{\n  let wt = null; try { wt = require'));

  ok(tx.length > 3000 && !/runCmd\(|runShell\(|runStream\(|child_process|spawn\(|exec(File)?\(/.test(tx) && wsx.length > 3000 && !/child_process|spawn\(|exec(File)?\(|runCmd|shellPlan/.test(wsx), 'the transfer path never starts a process: the manager\'s _transfer and the agent\'s write-stream + part-* hold no run / shell / spawn call', { tx: tx.length, wsx: wsx.length });
});

await section('§9 lane win-run-codepage: a Windows run\'s bytes are decoded per the console\'s code page, before the cut', async () => {

  ok(/nodejs\.org\/dist/.test(fs.readFileSync(path.join(REPO, 'scripts/vibespace-agentd-install.ps1'), 'utf8')), '…and the Windows installer provisions node from nodejs.org/dist (the official full-icu build)');
});

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
