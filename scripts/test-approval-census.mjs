#!/usr/bin/env node
// test-approval-census — verify-r6 (lane-pairing, 2026-09-28) THE APPROVAL CENSUS: "what you approve is what runs".
// Three verify rounds in a row found a HIGH in ONE class — the thing the owner APPROVES (a command above Allow, an
// address he sends to a device) differing from the thing that RUNS (r3 the pairing sheet's default, r4 the relay's
// Host header, r5 an agent's re-file rewriting the command above Allow, a reopened item answering the next ask, bidi
// controls). r5 fixed the instances; this suite is the CLASS GATE. Every place the product performs an ACTION on the
// strength of a human's click on a surface that DISPLAYS what will happen is found by grep and claimed by a row, and
// each row proves, or declares with a reason, four things:
//   (a) SAME RECORD — the displayed and the executed content come from one immutable record (an id + a version, a
//       hash, or one value captured once and used for both);
//   (b) RE-CHECK — the action route re-checks that record at execution (still open · still this action's · unchanged);
//   (c) NO OTHER WRITER — nothing but the producer changes the record between display and execution (an agent
//       filing, a peer message, a broadcast, another client);
//   (d) FORMAT — direction / format controls that can make the display differ from the execution are refused at the
//       door (or shown visibly).
// Sections:
//   §1 THE CAPTURE RULE (verify-r6 E1) — every client dialog that gates an action (`await showConfirmDialog(` /
//      `await showInputDialog(`, found by grep over the tracked src/lib files): after the await, the action reads no
//      LIVE state another client or a broadcast moves while the dialog is open (the explorer's folder / machine, the
//      sidebar's machine list, the system panel's machine) — the values are captured before the dialog opens.
//      Exemptions carry a reason. CONTROL: the pre-fix explorer delete (the folder read after the confirm) ⇒ red.
//   §1b THE CONFIRM SHOWS WHAT IT CONFIRMS (verify-r6 D1) — every showConfirmDialog call passes one options object
//      (a positional (title, message) rendered a blank "Confirm / OK"); the function reads a string first argument as
//      that pair. CONTROL (d1): the pre-fix plugins-ui Stop confirm ⇒ red.
//   §2 AGENT HTML NEVER RESTYLES AN APPROVAL (verify-r6) — every DOMPurify use and markdown parse in src/ goes through
//      src/lib/safe-html.js (census); its config (no <style>/style=, no forms / controls / top layer, class only
//      language-* on pre/code, id/name namespaced, no data-*, HTML only), its two hooks, its fail-closed door.
//      CONTROLS: the default config, a list one tag short, a keep-all class hook, no isSupported check, no setConfig,
//      the pre-fix renderMarkdown ⇒ red.
//   §1c A PRESS COUNTS ONLY ON WHAT SAT STILL (verify-r6 V1) — PURE src/lib/press-arm.js: an Allow counts once it stayed
//      put ARM_MS since it appeared or moved (the popup's resolved row shrinking, the window's advance); wiring pins;
//      CONTROL (v1): a verdict letting every press through ⇒ red.
//   §1d THE ONE HIDDEN-CHARACTER DOOR (verify-r6 Z2) — src/hidden-chars.js is the set; every approval surface asks it
//      and spells none of its own; no tracked product file carries such a character raw. CONTROLS (z2a) a surface's own
//      set, (z2b) a raw RLO ⇒ red.
//   §3 THE APPROVAL ROWS — every answer call / answer route / permission frame / producer action type (grep) claimed by
//      one row; each row's (a)–(d) a pin or a declaration with its reason; its gate exists by its words.
//   §3b THE MERGE CELL (the For-you store never lets another filer change a producer's item) + THE RE-CHECK CELL (the
//      exit ask's Allow on a changed item runs nothing). CONTROLS (α) text-keyed merge re-enabled for one producer,
//      (β) the route without its re-check ⇒ red.
// Run: node scripts/test-approval-census.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import { gitEnvFrom } from './git-env.mjs';
import { scratch } from './scratch.mjs';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, d) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (d !== undefined ? '\n    ' + (typeof d === 'string' ? d : JSON.stringify(d)) : '')); } };
const tracked = (...globs) => execFileSync('git', ['ls-files', ...globs], { cwd: REPO, encoding: 'utf8', env: gitEnvFrom(process.env) }).trim().split('\n').filter(Boolean);
const readRepo = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
// comment lines blanked (line numbers kept), a trailing ` // …` dropped — a pin never matches words in a comment
const stripLines = (t) => t.split('\n').map((l) => (/^\s*(\/\/|\*|\/\*)/.test(l) ? '' : l.replace(/\s\/\/\s.*$/, '')));

// ── §1 THE CAPTURE RULE ─────────────────────────────────────────────────────────────────────────────────────────────
// verify-r6 E1: the file explorer's Delete / Delete Folder / Overwrite? / Rename / Compress / Extract / New File built
// the path and the machine from `this.currentPath` / `this._hp()` / `this._hb()` AFTER the dialog's await — and a
// layout sync from another client (layout.js: `setHost` + `navigate`) moves the window while the dialog is open, so
// "Delete "build"?" deleted a "build" in another folder, or on another machine. The rule: in the function that awaits
// a dialog, no LIVE read after the await. LIVE = the state a broadcast or another client moves under an open dialog.
const DIALOG_AWAIT = /await\s+show(Confirm|Input)Dialog\(/;
const LIVE = /this\.currentPath\b|this\._hp\(|this\._hb\(|this\._host\b|this\._hostsData\b|\bgetHostId\(/g;
// the enclosing function: the nearest line above that ENDS with an async function opener (a method, an arrow, a
// function); its indentation's closing brace ends the region. A one-line handler (`= async () => { if (await …) … }`)
// is its own region.
const HEADER = /(async\s*\([^)]*\)\s*=>\s*\{|async\s+[\w$]+\s*\([^)]*\)\s*\{|async\s+function\s*[\w$]*\s*\([^)]*\)\s*\{)\s*$/;
const CAPTURE_EXEMPT = [
  // [file, the await line's context, the LIVE tokens allowed, the reason]
  ['src/lib/code-editor.js', /title: t\('Reload from disk'\)/, ['this._host'], 'the editor\'s own file on its own machine — an editor window never changes machine (no layout sync moves it); the reload re-reads the file it shows'],
];
function captureCensus(read, files) {
  const sites = [], hits = [], used = new Set();
  for (const f of files) {
    const raw = read(f).split('\n');
    const lines = stripLines(raw.join('\n'));
    lines.forEach((l, i) => {
      if (!DIALOG_AWAIT.test(l)) return;
      let h = i;
      const oneLine = /async\s*\([^)]*\)\s*=>\s*\{\s*if\s*\(\s*await\s+show/.test(l) || /async\s*\([^)]*\)\s*=>\s*\{[^}]*await\s+show/.test(l);
      if (!oneLine) while (h >= 0 && !HEADER.test(lines[h])) h--;
      if (h < 0) { hits.push(`${f}:${i + 1}: no enclosing async function found — the census cannot read this dialog`); return; }
      let e = i;
      // the region ends at the first closing brace at or left of the header's indentation (a mixin method may open at
      // four spaces and close at two)
      if (!oneLine) { const ind = /^(\s*)/.exec(raw[h])[1].length; const close = new RegExp('^\\s{0,' + ind + '}\\}'); e = i + 1; while (e < lines.length && !close.test(raw[e])) e++; }
      const region = lines.slice(i, e + 1).join('\n');
      const live = [...new Set(region.match(LIVE) || [])];
      sites.push({ f, line: i + 1, span: e - i });
      if (!live.length) return;
      const ctx = raw.slice(i, i + 3).join(' '); // the await line and the two after it (a title on its own line)
      const ex = CAPTURE_EXEMPT.filter((x) => x[0] === f && x[1].test(ctx));
      if (ex.length === 1 && live.every((t) => ex[0][2].includes(t))) { used.add(ex[0]); return; }
      hits.push(`${f}:${i + 1}: reads ${live.join(', ')} after the dialog — ${raw[i].trim().slice(0, 90)}`);
    });
  }
  const dead = CAPTURE_EXEMPT.filter((x) => !used.has(x)).map((x) => `${x[0]}: exemption ${x[1]} names no live read (stale — remove it)`);
  return { sites, hits, dead };
}
console.log('§1 THE CAPTURE RULE — a dialog gates the action it displayed, never the live state after it (verify-r6 E1)');
const LIB = tracked('src/lib').filter((f) => f.endsWith('.js') && !/\/i18n-[a-z]+\.js$/.test(f));
{
  const c = captureCensus(readRepo, LIB);
  ok(c.sites.length >= 80, `the grep finds every dialog that gates an action (${c.sites.length} awaits of showConfirmDialog / showInputDialog over ${LIB.length} tracked client files)`, c.sites.length);
  ok(c.hits.length === 0, 'CAPTURE: no dialog-gated action reads the explorer\'s folder / machine, the sidebar\'s machine list or the system panel\'s machine AFTER the dialog — each is captured before it opens', c.hits);
  ok(c.dead.length === 0, `CAPTURE: every exemption (${CAPTURE_EXEMPT.length}) still names a live read it excuses — a stale exemption is a hole`, c.dead);
  const rail = readRepo('src/lib/sidebar-rail.js');
  ok(/const host = dataHost, pid = p\.pid;\s*if \(sig === 'TERM' \|\| sig === 'KILL'\) \{/.test(rail) && /body: JSON\.stringify\(\{ host, pid, sig \}\)/.test(rail) && /data = r \|\| \{ error: tr\('Machine unreachable'\) \};\s*dataHost = hostId;/.test(rail), 'S1: a process row\'s Terminate / Force kill goes to the machine THAT listing came from and the pid it shows, both captured before the confirm');
  const ex = readRepo('src/lib/file-explorer.js');
  ok(/_here\(\) \{\s*const dir = this\.currentPath, host = this\._host \|\| '';/.test(ex), 'E1: the explorer has ONE snapshot of where an op acts (`_here()` — the folder and the machine, frozen)');
  const ops = readRepo('src/lib/file-explorer-ops.js');
  const opsHere = ['async createFile()', 'async createDir()', 'async _paste()', 'async _compressSelection(names)', 'async _extractArchive(name, here)', 'async _deleteSelection()', 'async _rename(oldName)', 'async _delete(name, isDir)'];
  const missing = opsHere.filter((sig) => { const i = ops.indexOf(sig); if (i < 0) return true; const body = ops.slice(i, ops.indexOf('\n  },', i)); const a = body.search(/await\s+show(Confirm|Input)Dialog\(/); const h = body.indexOf('this._here()'); return !(h >= 0 && (a < 0 || h < a)); });
  ok(missing.length === 0, 'E1: every explorer op that awaits a dialog takes `this._here()` BEFORE the dialog (create file / folder, paste, compress, extract, delete selection, rename, delete)', missing);
}

// ── §1b THE CONFIRM SHOWS WHAT IT CONFIRMS (verify-r6 D1) ────────────────────────────────────────────────────────
// showConfirmDialog takes ONE options object; a call passing (title, message) as strings rendered a blank
// "Confirm / OK" — twice (setup-flows' layout restore, fixed with a comment; then plugins-ui's Stop frp / Tailscale,
// whose OK stopped the public URLs / the tailnet with nothing said). Every call site passes an object literal (or a
// ternary of two); the function itself reads a string first argument as the (title, message) pair.
const CONFIRM_CALL = /showConfirmDialog\(\s*/g;
function confirmShapeCensus(read, files) {
  const bad = [];
  let n = 0;
  for (const f of files) {
    if (f === 'src/lib/utils.js') continue; // the definition
    const text = stripLines(read(f)).join('\n');
    for (const m of text.matchAll(CONFIRM_CALL)) {
      n++;
      const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 200);
      if (/^\{/.test(rest) || /^[\w$.]+\s*\?\s*\{/.test(rest)) continue;
      bad.push(`${f}:${text.slice(0, m.index).split('\n').length}: showConfirmDialog(${rest.slice(0, 60).replace(/\s+/g, ' ')}…`);
    }
  }
  return { n, bad };
}
console.log('§1b THE CONFIRM SHOWS WHAT IT CONFIRMS — one options object at every call (verify-r6 D1)');
{
  const c = confirmShapeCensus(readRepo, LIB);
  ok(c.n >= 50 && c.bad.length === 0, `every showConfirmDialog call (${c.n}) passes its title / message / button as ONE options object — never positional strings (the blank "Confirm / OK" dialog)`, c.bad);
  const u = readRepo('src/lib/utils.js');
  ok(/export function showConfirmDialog\(opts = \{\}, legacyMessage\) \{\s*(\/\/[^\n]*\n\s*)*if \(typeof opts === 'string'\) opts = \{ title: opts, message: typeof legacyMessage === 'string' \? legacyMessage : '' \};/.test(u), 'D1: the function reads a string first argument as the (title, message) pair — a missed call still shows what OK does');
}

// ── §1c A PRESS COUNTS ONLY ON WHAT SAT STILL WHERE IT WAS READ (verify-r6 V1) ──────────────────────────────────────
// The popup's resolved exit row drops its command and buttons and the next ask's Allow slides up under the pointer (a
// double-click, or the first ask's 60 s expiry); the For-you window's Allow advances to the next item, whose pane shows
// Allow in the same place. PURE src/lib/press-arm.js: an Allow counts only once it has stayed put ARM_MS since it
// appeared or moved; the popup re-stamps every Allow after each row pass, the window stamps the pane when its item changes.
async function armCells(mod) {
  const P = await import(pathToFileURL(mod).href);
  const v = (since, now) => P.pressVerdict({ since, now }).ok;
  return {
    table: [v(null, 5000), v(1000, 1100), v(1000, 1699), v(1000, 1700), v(1000, 9000)],
    layout: [P.armAfterLayout({ prevTop: null, top: 10, prevSince: null, now: 50 }), P.armAfterLayout({ prevTop: 10, top: 10.5, prevSince: 7, now: 50 }), P.armAfterLayout({ prevTop: 10, top: 90, prevSince: 7, now: 50 })],
    armMs: P.ARM_MS,
  };
}
console.log('§1c A PRESS COUNTS ONLY ON WHAT SAT STILL WHERE IT WAS READ (verify-r6 V1)');
{
  const c = await armCells(path.join(REPO, 'src/lib/press-arm.js'));
  ok(JSON.stringify(c.table) === JSON.stringify([false, false, false, true, true]) && c.armMs === 700, 'V1 pressVerdict: never stamped ⇒ refused; 100 / 699 ms after it appeared or moved ⇒ refused; 700 ms and later ⇒ counts', c.table);
  ok(JSON.stringify(c.layout) === JSON.stringify([50, 7, 50]), 'V1 armAfterLayout: appeared ⇒ now; still (sub-pixel) ⇒ the old instant; moved ⇒ now', c.layout);
  const panel = readRepo('src/lib/user-todos-panel.js'), win = readRepo('src/lib/inbox-window.js');
  ok(/reconcileKeyed\(container, entries, \{[\s\S]{0,260}\}\);\s*armExitButtons\(\);/.test(panel) && /for \(const b of document\.querySelectorAll\('\.ut-action-exit\.ut-exit-allow(, \.ut-action-proposal\.ut-proposal-approve)?'\)\)/.test(panel) && /if \(exitBtn && exitBtn\.dataset\.answer === 'allow'\) \{[\s\S]{0,300}const pv = pressVerdict\(\{ since: exitBtn\._armSince \?\? null, now: performance\.now\(\) \}\);\s*if \(!pv\.ok\) \{/.test(panel), 'V1 WIRING (popup + mini inbox): every Allow re-stamped after each row pass; a press on one that appeared or moved within ARM_MS does nothing and says so');
  ok(/anchorFixedPopup\(popup, anchor\);\s*(\/\/[^\n]*\n\s*)*if \(!popup\.classList\.contains\('hidden'\)\) armExitButtons\(\);/.test(panel), 'V1 WIRING (lane browser-propose verify r1): the popup samples its Allow / Approve buttons AGAIN after the anchor placed it — sampled before, the first press after every open read as "moved under the pointer" (reproduced in chrome; gate test-browser-propose-chrome ⑦)');
  ok(/if \(st\.selected !== st\.armId\) \{ st\.armId = st\.selected; st\.armAt = performance\.now\(\); \}/.test(win) && /if \(a === 'exit-allow'\) \{ const pv = pressVerdict\(\{ since: st\.armId === id \? st\.armAt : null, now: performance\.now\(\) \}\); if \(!pv\.ok\)/.test(win), 'V1 WIRING (the For-you window): the pane is stamped when its item changes; an Allow pressed within ARM_MS of the advance does nothing and says so');
}

// ── §1d THE ONE HIDDEN-CHARACTER DOOR (verify-r6 Z2) ──────────────────────────────────────────────────────────────────
// A character that reorders a line or is not drawn makes what a person reads differ from what runs. r6 found four
// approval surfaces each spelling its OWN set (the exit door, the outbox, the permission card, the confirmation card)
// — none the same — and three of them written as RAW characters in the source, invisible to a reviewer too. The set is
// src/hidden-chars.js; every approval surface asks it and spells none of its own; no tracked product file carries such
// a character raw (the test suites' fixtures deliberately do — scripts/ is not product code).
const HC = createRequire(import.meta.url)(path.join(REPO, 'src/hidden-chars.js'));
const HIDDEN_SURFACES = ['src/exit-reach.js', 'src/channel-policy.js', 'src/helper-ask.js', 'src/browser-takeover.js'];
const OWN_SET = /\\u(20[0-6][0-9a-f]|061c|feff|00ad)|\\p\{Cf\}/i; // an escape of a hidden code point, spelled in the SOURCE
function hiddenDoorCensus(read) {
  const raw = [], own = [], unwired = [];
  for (const f of tracked('src', 'server.js', 'data/bin')) {
    if (!/\.(m?js|cjs|css|html)$/.test(f) && !f.startsWith('data/bin/')) continue;
    let t; try { t = read(f); } catch { continue; }
    const h = HC.hiddenCharsOf(t, { allowCR: true });
    if (h.length) raw.push(`${f}: ${h.slice(0, 6).join(' ')}`);
  }
  for (const f of HIDDEN_SURFACES) {
    const t = stripLines(read(f)).join('\n');
    if (!/require\('\.\/hidden-chars\.js'\)/.test(t)) unwired.push(f);
    const m = t.match(OWN_SET);
    if (m) own.push(`${f}: spells its own set (${m[0]})`);
  }
  return { raw, own, unwired };
}
console.log('§1d THE ONE HIDDEN-CHARACTER DOOR — one set, asked by every surface, never raw in the source (verify-r6 Z2)');
{
  const c = hiddenDoorCensus(readRepo);
  ok(c.raw.length === 0, 'Z2: no tracked product file (src/, server.js, data/bin/) carries a RAW reordering / invisible character — a reviewer cannot see one either; spell it as an escape', c.raw);
  ok(c.unwired.length === 0 && c.own.length === 0, `Z2: every approval surface (${HIDDEN_SURFACES.map((f) => f.replace('src/', '')).join(', ')}) asks src/hidden-chars.js and spells no set of its own`, { unwired: c.unwired, own: c.own });
  const cases = ['a\u202eb', 'x\u200by', 'c\u00adf', 'n\u3164m', 'l\u2028m', 'z\u0000', 'q\u200dq', 'r\rs'];
  const got = cases.map((x) => HC.hiddenCharsOf(x).join());
  ok(JSON.stringify(got) === JSON.stringify(['U+202E', 'U+200B', 'U+00AD', 'U+3164', 'U+2028', 'U+0000', 'U+200D', 'U+000D']) && HC.hiddenCharsOf('q\u200dq\rs', { allowJoiners: true, allowCR: true }).length === 0 && HC.hiddenCharsOf('tab\there\nline \ufe0f 你好 مرحبا').length === 0, 'Z2 THE SET: direction controls, zero-width, soft hyphen, Hangul filler, line separator, NUL, joiners and CR are hidden (joiners / CR allowed only where a surface says so); tab, line feed, a variation selector and letters of any script are what they look like', got);
}

// ── §3 THE APPROVAL ROWS (verify-r6 — the round's deliverable) ───────────────────────────────────────────────────────
// Every place the product performs an ACTION on a human's click on a surface that DISPLAYS what will happen, found by
// grep — the client's answer calls, the server's answer routes, the ws permission frames, the For-you producers'
// action types — and claimed by exactly one row; a hit no row claims (a NEW approval surface) is red until a row names
// its (a) SAME RECORD, (b) RE-CHECK at execution, (c) NO OTHER WRITER, (d) FORMAT — each a pin (a regex that must match
// the named file, comments stripped) or a declaration with its reason — and the GATE (an assertion that must exist, by
// its words, in the named suite). A row with a missing pin, a dead row, or a gate that does not exist is red.
// the .197 integration adds the other lanes' approve-then-act verbs: BROWSE YOURSELF's Close / Quit, browser-stuck's
// Restart, pool-pin's gather (a pin was already a verb)
const VERB = /(\/quit\b|\/close\b|\/restart\b|\/gather\b|\/asks\/|\/answer\b|\/approve\b|\/reject\b|reset-credit|handback|takeover|dial-pair|\/install(-xpra|-plan)?\b|\/uninstall\b|open-with|\/pin\b|\/allow\b|\/withdraw\b|\/send\b|\/confirm\b|\/:act\b|\/:verdict\b|\/open\b|resolve-many)/;
const CLIENT_CALL = /\b(fetchJson|fetch|api|post)\(\s*(?:[\w.]+\s*\?\s*)?[`'"](\/api\/[^`'"]*)/g;
const SERVER_ROUTE = /\b(app|router|r)\.(post|put|patch|delete)\(\s*\[?\s*[`'"](\/api\/[^`'"]*)/g;
const WS_FRAME = /type:\s*'permission-response'/;
const ACTION_TYPE = /action:\s*\{\s*type:\s*'([a-z-]+)'/;
function doorHits(read) {
  const hits = [];
  for (const f of tracked('src', 'server.js')) {
    if (!/\.m?js$/.test(f) || /\/i18n-[a-z]+\.js$/.test(f)) continue;
    const lines = stripLines(read(f));
    const client = f.startsWith('src/lib/');
    lines.forEach((l, i) => {
      for (const m of l.matchAll(client ? CLIENT_CALL : SERVER_ROUTE)) { const u = m[m.length - 1]; if (VERB.test(u)) hits.push({ kind: client ? 'C' : 'S', f, line: i + 1, key: u }); }
      if (WS_FRAME.test(l)) hits.push({ kind: 'W', f, line: i + 1, key: 'permission-response' });
      const a = !client && l.match(ACTION_TYPE); if (a) hits.push({ kind: 'A', f, line: i + 1, key: a[1] });
    });
  }
  return hits;
}
const pin = (f, re, words) => ({ f, re, words });
const decl = (why) => ({ declared: why });
const ROWS = [
  { id: 'exit-ask', surface: 'the exit ask — "Allow … to run a command on <machine>?" (Allow / Deny in For you)',
    doors: [['C', 'src/lib/user-todos-actions.js', /^\/api\/exits\/asks\//], ['S', 'src/server/exit-routes.js', /^\/api\/exits\/asks\/:askId$/], ['A', 'src/exit-proxy.js', /^exit-run-ask$/]],
    a: [pin('src/exit-proxy.js', /text, detail: cmd,/, 'the item\'s detail IS the command; the row / window draw detail verbatim')],
    b: [pin('src/exit-proxy.js', /it\.status === 'open' && it\.action && it\.action\.type === 'exit-run-ask' && it\.action\.askId === k\.askId && String\(it\.detail \|\| ''\) === String\(k\.cmd\)\.trim\(\)/, 'the belt: open · this askId · detail === the command, else ask_changed')],
    c: [pin('src/user-todos.js', /const ACTION_IDENTITY = Object\.freeze\(\{ 'exit-run-ask': 'askId'(, 'browser-proposal': 'id')?(, 'app-install': 'id')? \}\)/, 'a producer\'s item merges only with the same type + askId'), pin('src/user-todos.js', /if \(hit && hit\.action\) throw/, 'an agent cannot resolve it'), pin('src/lib/user-todos-panel.js', /const pv = pressVerdict\(/, 'an Allow that moved under the pointer does not count (V1)')],
    d: [pin('src/exit-proxy.js', /const hidden = E\.hiddenOrderOf\(cmd\);\s*if \(hidden\.length\) throw/, 'a command carrying a hidden / reordering character is refused at the door (X2, Z1, Z2)')],
    gate: [['scripts/test-exit-reach.mjs', 'X1 belt: an item whose shown command no longer IS the ask'], ['scripts/test-approval-census.mjs', 'THE MERGE CELL']] },
  { id: 'browser-proposal', surface: 'the agent browser\'s proposal — "The agent proposes switching its browser to CloakBrowser" (Approve / Reject on the chat card and in For you; lane browser-propose)',
    doors: [['A', 'src/browser-switch.js', /^browser-proposal$/], ['C', 'src/lib/browser-proposal-card.js', /^\/api\/browser\/proposals\//], ['C', 'src/lib/user-todos-actions.js', /^\/api\/browser\/proposals\//], ['S', 'src/routes/browser.js', /^\/api\/browser\/proposals\/:id\/(approve|reject)$/]],
    a: [pin('src/browser-switch.js', /action: \{ type: 'browser-proposal', id: String\(entry\.id\), shown: p\.digest \}/, 'the item\'s Approve names the proposal AND the digest of the card it shows; its words are the card\'s lines (proposalLines)'), pin('src/lib/browser-proposal-card.js', /body: JSON\.stringify\(\{ shown: b\.digest \}\)/, 'the chat card\'s Approve sends the digest of the card it was pressed on')],
    b: [pin('src/browser-switch.js', /if \(shown !== p\.digest\) return refuse\('proposal_changed'/, 'the proposal as it stands must BE the card pressed, else proposal_changed and nothing runs'), pin('src/routes/browser.js', /if \(!shown\) return res\.status\(400\)\.json\(\{ error: 'an Approve names the card it was pressed on \(`shown`\)', code: 'shown_required' \}\)/, 'an Approve naming no card is refused')],
    c: [pin('src/user-todos.js', /'browser-proposal': 'id'/, 'a producer\'s item merges only with the same proposal id'), pin('src/browser-switch.js', /if \(human && by !== 'user'\) return refuse\('agent_forbidden'/, 'no actor but the user moves it (PURE)'), pin('src/routes/browser.js', /refuseAgentBearer\(req, res, PROPOSAL_IS_USERS\)/, 'every proposal route refuses an agent\'s bearer'), pin('src/lib/user-todos-panel.js', /if \(propBtn\.dataset\.answer === 'approve'\) \{[\s\S]{0,120}const pv = pressVerdict\(/, 'an Approve that moved under the pointer does not count (V1)'), pin('src/lib/browser-proposal-card.js', /if \(!approveArmed\(approve\)\) return; approve\.disabled = true;/, 'the CHAT card\'s Approve too: a press within ARM_MS of it appearing / moving / changing its words does not count (lane browser-propose verify r1; gate test-browser-propose-chrome ④b)')],
    d: [pin('src/browser-switch.js', /url: proposalUrlOf\(c\.url\)/, 'the URL shown and reopened is the parsed one — ASCII by construction'), pin('src/server/browser-keeper.js', /const drawn = \(s\) => String\(s == null \? '' : s\)\.replace\(HC\.HIDDEN_RE, ''\);/, 'the agent\'s words on the card carry no hidden / reordering character (THE one set)')],
    gate: [['scripts/test-browser-propose.mjs', 'CONTROL c1'], ['scripts/test-browser-propose.mjs', 'CONTROL c6'], ['scripts/test-browser-propose.mjs', 'the card draws no character that is not drawn']] },
  { id: 'permission-card', surface: 'the chat permission card — Allow / Always Allow / Deny (a main ask, a helper\'s ask, a question)',
    doors: [['W', 'src/lib/chat-renderers.js', /^permission-response$/], ['W', 'src/adapters/acp.js', /^permission-response$/], ['W', 'src/adapters/codex.js', /^permission-response$/], ['A', 'src/helper-ask.js', /^helper-ask$/]],
    a: [pin('src/server/helper-asks.js', /answerFromRecord\(recordOf\(target\.session, data\.requestId\)/, 'the input and the updates come from the SERVER\'s record of the request, never the client\'s copy (K4)'), pin('src/lib/chat-renderers.js', /requestPre\(subj\.text, 'chat-helper-ask-cmd'\)/, 'the helper card shows the WHOLE request (K1)')],
    b: [pin('src/server/helper-asks.js', /function recordOf\(session, requestId\)/, 'the pending request is looked up at the answer; a settled / unknown one refused by the ask table')],
    c: [decl('the pending request is the CLI\'s own control_request, written only by the normalizer from the CLI\'s stdout; the For-you helper item carries no Allow (navigation only); the plain words never replace the raw line (K2)')],
    d: [pin('src/lib/chat-renderers.js', /const hidden = hiddenCharsOf\(msg\.permission\.input\);/, 'hidden characters marked, a warning, a second press (K5)'), pin('src/helper-ask.js', /const HC = require\('\.\/hidden-chars\.js'\);/, 'THE one set (Z2)')],
    gate: [['scripts/test-helper-ask.mjs', 'F6 CONTROL'], ['scripts/test-agent-tool-rules.mjs', 'F4 CONTROL']] },
  { id: 'reset-credit', surface: 'the reset-credit dialog — "Use a reset credit"',
    doors: [['C', 'src/lib/reset-credit-dialog.js', /reset-credit/], ['S', 'src/routes/reset-credit.js', /reset-credit$/], ['A', 'src/server/usage-pool-engine.js', /^reset-credit$/]],
    a: [pin('src/lib/reset-credit-dialog.js', /expect: \{ resetsAtSec: p\.resetsAtSec \?\? null \}/, 'the POST names the window the dialog showed (R1)')],
    b: [pin('src/server/usage-pool-engine.js', /code: 'preview_changed'/, 'a window that reset or moved ⇒ preview_changed, nothing spent')],
    c: [decl('the pool may move and the window may reset while the dialog is open — both are what (b) re-judges; the credit is spent by a person only (agent bearer refused)')],
    d: [decl('every line is textContent from the PURE dialogModel (numbers and an account name)')],
    gate: [['scripts/test-reset-credit-ui.mjs', 'CONTROL (r1)']] },
  { id: 'dial-pair', surface: 'pairing — "Create pairing" / "Replace its pairing" / "Generate a new command" (+ keep it connected)',
    doors: [['C', 'src/lib/sidebar-mounts.js', /^\/api\/device\/dial-pair$/], ['S', 'src/server/mounts-plugins-wiring.js', /^\/api\/device\/dial-pair$/]],
    a: [pin('src/lib/dial-address-picker.js', /return r && r\.dataset\.base \? \{ base: r\.dataset\.base/, 'the POST base IS the checked row\'s base'), pin('src/dial-facts.js', /if \(offered\) return r;\s*claim = v\.base;/, 'a device\'s claim is never the default (L1)')],
    b: [pin('src/server/mounts-plugins-wiring.js', /if \(!nv\.ok\) return res\.status\(409\)/, 'the name verdict before the relay publish'), pin('src/server/mounts-plugins-wiring.js', /if \(!nv2\.ok\) return res\.status\(409\)/, '…and again right before the mint (G4)'), pin('src/server/mounts-plugins-wiring.js', /if \(pushV\.refuse\) return res\.status\(409\)/, 'a requested push to a gone / other link refused (P1)')],
    c: [pin('src/lib/sidebar-mounts.js', /const expect = existing \|\| seenReplace \? 'existing' : 'new';/, 'the tick never turns a press into a replace (P3)'), pin('src/lib/sidebar-mounts.js', /\.\.\.\(keep \? \{ keepLinkSince: keepSince \} : \{\}\)/, 'the push names the link the sheet showed (P1)')],
    d: [pin('src/dial-facts.js', /function dialBaseVerdict/, 'a base is scheme + host + port only (no credentials, path, query)'), pin('src/dial-facts.js', /function deviceIdOf/, 'a name keeps [A-Za-z0-9_-], said before Create (A2)')],
    gate: [['scripts/test-dial-facts.mjs', 'CONTROL (w)'], ['scripts/test-dial-facts.mjs', 'CONTROL (r2)'], ['scripts/test-pair-dialog-ui.mjs', 'verify-r6 P3']] },
  { id: 'install', surface: 'the desktop install dialog — "Install" (xpra / LibreOffice, as root)',
    doors: [['C', 'src/lib/desktop-app-launcher.js', /^\/api\/desktop\/(install-plan|install-xpra)/], ['S', 'src/routes/desktop-apps.js', /^\/api\/desktop\/install(-xpra)?$/]],
    a: [pin('src/server/desktop-access.js', /function planDigest\(plan\)/, 'the digest of the plan shown rides GET install-plan'), pin('src/lib/desktop-app-launcher.js', /planDigest: shownDigest/, 'the press names it')],
    b: [pin('src/server/desktop-access.js', /named\('plan_changed'/, 'a recomputed plan that differs ⇒ plan_changed, nothing runs (I1)')],
    c: [decl('the machine\'s facts can move between the two reads — that is what (b) judges')],
    d: [decl('the commands come from closed PURE templates (desktop-apps installPlanFor), drawn as textContent in a <pre>')],
    gate: [['scripts/test-office-open.mjs', 'CONTROL (i1)']] },
  { id: 'apps', surface: 'the apps install dialog — "Install" (an app / a .deb / a package source / a removal, as root) + an agent\'s proposal: Install… / Not now',
    doors: [['C', 'src/lib/desktop-app-launcher.js', /^\/api\/apps\/install$/], ['C', 'src/lib/app-install-dialog.js', /^\/api\/apps\/proposals\/.*\/reject$/], ['C', 'src/lib/user-todos-actions.js', /^\/api\/apps\/proposals\/.*\/reject$/],
      ['S', 'src/routes/apps.js', /^\/api\/apps\/(install|proposals\/:id\/reject)$/], ['A', 'src/server/apps-engine.js', /^app-install$/]],
    a: [pin('src/server/apps-engine.js', /const shown = await plan\(p\.host, p\.request\);/, 'the dialog shows the plan of the SERVER\'s stored request of the proposal, never the client\'s copy'), pin('src/lib/desktop-app-launcher.js', /\{ proposalId, planDigest: shownDigest \}/, 'the press names the proposal and the digest of the plan it showed'), pin('src/server/apps-engine.js', /host = p\.host; rq = p\.request;/, 'the run takes the request from the stored proposal')],
    b: [pin('src/server/desktop-access.js', /if \(expectDigest != null && planDigest\(plan\) !== String\(expectDigest\)\)/, 'the plan recomputed on the machine at the press; a different one ⇒ plan_changed, nothing runs (the digest binds the commands, the packages, the source AND the closure)'), pin('src/server/apps-engine.js', /if \(p\.state !== 'proposed'\) throw named\('proposal_state'/, 'a proposal already decided is refused')],
    c: [decl('an agent cannot edit a proposal (another ask is a NEW id and a new For-you item); only the user presses Install / Not now (every /api/apps/* route refuses an agent\'s token 403); the machine\'s package lists can move between the two reads — that is what (b) judges')],
    d: [decl('the commands come from the ONE closed root script (app-manifest APP_SCRIPT + appCommands) with every name a POSITION judged by Debian\'s rule before root is asked; the plan\'s words and a package\'s own words are drawn as textContent'), pin('src/server/apps-engine.js', /why: String\(why \|\| ''\)\.replace\(HC\.HIDDEN_RE, ''\)\.slice\(0, 500\)/, 'the agent\'s why on the card and in the dialog carries no hidden / reordering character (THE one set — verify-r1 F8)')],
    gate: [['scripts/test-apps-engine.mjs', 'a plan that changed since it was shown'], ['scripts/test-desktop-serve.mjs', 'an app plan whose closure moved since it was shown']] },
  { id: 'outbox', surface: 'the channel outbox card — Approve / Reject an agent\'s reply or compose',
    doors: [['C', 'src/lib/channel-outbox.js', /^\/api\/channels\/outbox\/.*\/(approve|reject)$/], ['S', 'src/routes/channels.js', /^\/api\/channels\/outbox\/:id\/(approve|reject)$/]],
    a: [pin('src/lib/channel-outbox.js', /shown: P\.shownDigest\(p\)/, 'Approve carries the digest of the card it was pressed on')],
    b: [pin('src/server/channels-engine.js', /code: 'changed-since-shown'/, 'a proposal that is no longer that record ⇒ refused, nothing sent'), pin('src/server/channels-engine.js', /const targetWhy = p\.compose \? null : replyRecheck\(p, rec\);/, 'the reply anchor re-judged at the send (O1)')],
    c: [decl('an agent\'s --replaces makes a NEW proposal id; the card is armed 700 ms after it appears or moves (O4); the reply anchor must be a stored message of the SAME conversation (O1); Gmail recipients fixed at propose (O2)')],
    d: [pin('src/channel-policy.js', /const HC = require\('\.\/hidden-chars\.js'\);/, 'addresses / subject / replyTo refuse hidden characters, the text marks them (O5, Z2)')],
    gate: [['scripts/test-channel-outbox.mjs', 'no-shown-check'], ['scripts/test-channel-outbox.mjs', 'no-anchor-gate']] },
  { id: 'reach-request', surface: 'a channel access request — Approve / Deny an agent\'s request for reach',
    doors: [['C', 'src/lib/channel-reach-editor.js', /reach-requests\/.*\/approve$/], ['S', 'src/routes/channels.js', /^\/api\/channels\/reach-requests\/:id\/:verdict$/]],
    a: [decl('the request record is created by the server (principal + scope) and never edited; approve grants exactly its one visible row')],
    b: [pin('src/server/channels-engine.js', /if \(req\.status !== 'open'\) return \{ ok: false, code: 'bad-state'/, 'a decided request is refused')],
    c: [decl('one open request per agent; only the owner decides (agent bearer refused)')],
    d: [decl('the card names the agent by its session name (held LOW F11: a look-alike name)')],
    gate: [['scripts/test-channel-acl.mjs', 'deciding twice is refused']] },
  { id: 'browser-confirm', surface: 'the agent browser\'s --confirm-actions card — Confirm / Deny',
    doors: [['S', 'src/routes/browser.js', /^\/api\/browser\/confirm$/]],
    a: [pin('src/browser-takeover.js', /function answerGate\(/, 'a Confirm carries the digest of its card')],
    b: [pin('src/browser-takeover.js', /code: 'confirmation_changed'/, 'only an id pending for THIS browser, only for the card shown')],
    c: [pin('src/browser-takeover.js', /function pendingNoteVerdict/, 'first write wins — a later record never repaints a held card (B1)')],
    d: [pin('src/browser-takeover.js', /const HC = require\('\.\/hidden-chars\.js'\);/, 'the target is drawn with every hidden character marked (Z2)')],
    gate: [['scripts/test-browser-takeover.mjs', 'C3']] },
  { id: 'browser-handback', surface: 'the agent browser\'s Hand back / Take over',
    doors: [['C', 'src/lib/app.js', /^\/api\/browser\/handback$/], ['C', 'src/lib/chat-view.js', /^\/api\/browser\/handback$/], ['C', 'src/lib/browser-switcher.js', /^\/api\/browser\/handback$/], ['S', 'src/routes/browser.js', /^\/api\/browser\/handback$/]],
    a: [decl('acts on server state — the viewer\'s relay / the conversation\'s lease — never on a client-sent description')],
    b: [pin('src/server/browser-keeper.js', /T\.handbackWakeEcho\(/, 'the wake count the control showed is echoed; a moved count ⇒ wake_count_changed (B2, money)')],
    c: [decl('the takeover state is the keeper\'s; a sibling joining changes the count — (b)')],
    d: [decl('button words only')],
    gate: [['scripts/test-browser-takeover.mjs', 'C4']] },
  { id: 'jobs-answer', surface: 'a Background Work panel — the job\'s question answered',
    doors: [['C', 'src/lib/jobs-panel.js', /\/answer$/], ['S', 'src/server/jobs-wiring.js', /^\/api\/jobs\/:id\/:act$/]],
    a: [pin('src/job-model.js', /function nextInteractionSeq/, 'a panel\'s identity only grows (J1)')],
    b: [pin('src/jobs.js', /const vv = M\.answerVersionVerdict\(p, answers\);/, 'an answer names its panel — missing / another panel\'s refused')],
    c: [decl('the job itself posts its panels; a panel is never reused — (a)')],
    d: [pin('src/lib/jobs-panel.js', /sanitizeHtml\(marked\.parse/, 'a panel\'s markdown through THE one sanitizer (H1)')],
    gate: [['scripts/test-jobs-triage.mjs', 'CONTROL']] },
  { id: 'desktop-takeover', surface: 'a desktop app window — Take over / Hand back / Resume here',
    doors: [['C', 'src/lib/desktop-app-window.js', /\/(viewers\/)?takeover$|\/handback$/], ['S', 'src/routes/desktop-apps.js', /\/(viewers\/)?takeover$|\/handback$/]],
    a: [decl('the app id and the viewer id captured by the window; nothing displayed is executed')], b: [decl('the keeper judges the lease')], c: [decl('—')], d: [decl('—')], gate: [] },
  { id: 'plugins', surface: 'plugins — Install / Stop / Uninstall',
    doors: [['C', 'src/lib/plugins-ui.js', /^\/api\/plugins\/install$/], ['S', 'src/server/plugin-loader.js', /^\/api\/plugins\/install$/], ['S', 'src/server/mounts-plugins-wiring.js', /^\/api\/plugins\/:id\/install$/]],
    a: [pin('src/lib/plugins-ui.js', /title: t\('Stop \{name\}\?', \{ name: p\.label \}\),/, 'the Stop confirm names what it stops (D1)')],
    b: [decl('held LOW F8: plugin trust is hashed from the manifest at the click, not the capabilities the dialog showed (an owner-side re-scan only)')],
    c: [decl('the owner\'s own files / another owner client')], d: [decl('names escaped')], gate: [['scripts/test-approval-census.mjs', 'CONTROL (d1)']] },
  { id: 'own-installs', surface: 'VibeSpace\'s own installs — the browser, the browser CLI, agent tools / hooks on a host, rclone',
    doors: [['C', 'src/lib/manage-agents.js', /\/(install|uninstall)$/], ['C', 'src/lib/browser-switcher.js', /^\/api\/browser\/install$/], ['C', 'src/lib/browser-new-profile.js', /^\/api\/browser\/install$/] /* lane browser-admin: the New profile… dialog's CloakBrowser row */, ['C', 'src/lib/browser-trace-view.js', /^\/api\/browser\/cli\/install$/] /* lane browser-admin 2b: the Browser CLI row */, ['C', 'src/lib/sidebar-mounts.js', /^\/api\/mounts\/rclone\/install$/], ['S', 'server.js', /^\/api\/agent-hooks\/(install|uninstall)$/], ['S', 'src/server/exit-routes.js', /agent-tools\/(install|uninstall)$/], ['S', 'src/routes/browser.js', /^\/api\/browser\/(cli\/)?install$/], ['S', 'src/server/mounts-plugins-wiring.js', /^\/api\/mounts\/rclone\/install$/]],
    a: [decl('installs VibeSpace\'s own tracked files / a pinned package — nothing another party wrote is displayed then executed')], b: [decl('route-side precondition verdicts')], c: [decl('—')], d: [decl('—')], gate: [] },
  // ── the .197 integration: the other lanes' approve-then-act surfaces, each by the four rules ──
  { id: 'browser-restart', surface: 'lane browser-stuck — Restart a browser whose page is not responding (the live view\'s banner, the Agent browser panel)',
    doors: [['C', 'src/lib/browser-live-window.js', /\/restart$/], ['S', 'src/routes/browser.js', /^\/api\/browser\/(profiles\/:id|session\/:sessionId)\/restart$/]],
    a: [pin('src/routes/browser.js', /const row = rows\.find\(\(r\) => r\.ref === ref\);/, 'the session route acts on the browser row the view named (its `ref`), re-read from the keeper — never a client description')],
    b: [pin('src/routes/browser.js', /if \(row\.kind === 'attachment' && row\.owners > 0\) return res\.status\(409\)/, 'a browser shared with other conversations at the press is refused (409), nothing stopped'), pin('src/routes/browser.js', /humanRefusalText\('browsing_yourself', \{ label: row\.label, act: 'restart' \}\)/, 'the user browsing it himself at the press ⇒ browsing_yourself, nothing stopped (the .197 integration)')],
    c: [decl('the keeper\'s leases and the user\'s own browsing move freely — both are what (b) re-reads at the press; an agent token is refused (THE one guard, RESTART_IS_USERS)')],
    d: [decl('the banner\'s words are PURE stuckWords (textContent); the page\'s own text passes pageText (frame-inert, bounded)')],
    gate: [['scripts/test-browser-stuck.mjs', 'token stops and restarts'], ['scripts/test-browser-human.mjs', 'THE TAB-RELEASE CENSUS (the .197 integration)']] },
  { id: 'browse-yourself-end', surface: 'BROWSE YOURSELF — Close (his tab) / Quit the whole browser (a confirm names who else uses it)',
    doors: [['C', 'src/lib/browser-live-window.js', /\/browse\/.*\/(close|quit)$/], ['S', 'src/routes/browser.js', /^\/api\/browser\/browse\/:key\/(close|quit)$/]],
    a: [pin('src/routes/browser.js', /const key = humanKeyOr400\(req, res\); if \(!key\) return;/, 'the press names HIS key (the window holds it); nothing a client describes is executed')],
    b: [decl('Close ends his own tab only; Quit stops the browser for everyone — the confirm counts who uses it at the press (othersOnIt) and the answer says how many were (conversations), so a moved set is SAID, never silent (a proposal-free act of the owner on his own browser)')],
    c: [decl('his key is derived from the profile (hu-<hex>) and held only by his own windows; an agent token is refused by name (refuseAgentBearer)')],
    d: [decl('the confirm\'s words are PURE humanEndChoices; the names are textContent')],
    gate: [['scripts/test-browser-human.mjs', 'every human route × {vsst_, jbt_}']] },
  { id: 'pool-pin', surface: 'lane pool-pin — a conversation\'s pin to a pool member (the billing menu) / "Move every conversation here now" (gather)',
    doors: [['C', 'src/lib/session-lifecycle.js', /\/pin$/], ['S', 'src/server/account-usage-routes.js', /^\/api\/accounts\/(:poolId\/pin|pool\/:id\/gather)$/]],
    a: [pin('src/lib/session-lifecycle.js', /pinTo\(r\.act === 'auto' \? null : r\.id, r\.name\)/, 'the press sends the member id of the row it was made on')],
    b: [pin('src/server/account-usage-routes.js', /code: 'not_member'/, 'a member no longer signed in to this pool at the press ⇒ not_member, nothing moved'), pin('src/server/account-usage-routes.js', /code: 'not_on_pool'/, 'a conversation that no longer bills this pool ⇒ not_on_pool')],
    c: [decl('the pool\'s members and the conversation\'s account move freely — both are what (b) re-reads; an agent token is refused (human-only)')],
    d: [decl('member names from the owner\'s own account store (textContent); the gather confirm is PURE gatherConfirmWords (a count)')],
    gate: [['scripts/test-pool-auto.mjs', 'route: a non-member is refused (400 not_member)']] },
  { id: 'inbox-close', surface: 'For you — Mark all seen / ✓ / dismiss (closing items)',
    doors: [['C', 'src/lib/user-todos-panel.js', /resolve-many$/], ['S', 'src/routes/user-todos-reply.js', /resolve-many$/]],
    a: [decl('a close is a "no": an exit ask it closes settles NOT allowed, said on its card (r2 ask-b); nothing runs')], b: [decl('—')], c: [decl('—')], d: [decl('—')], gate: [['scripts/test-exit-reach.mjs', 'ask-b']] },
  { id: 'not-an-approval', surface: 'routes the grep reads that approve nothing a person was shown',
    doors: [['S', 'src/routes/opencode.js', /\/reject$/], ['S', 'src/server/exit-routes.js', /allow-exit$/], ['S', 'src/routes/channels.js', /^\/api\/channels\/:adapterId\/:convId\/send$/], ['C', 'src/lib/open-with.js', /^\/api\/desktop\/open-with/], ['S', 'server.js', /^\/api\/editor\/open$/], ['C', 'src/lib/browser-profile-picker.js', /^\/api\/browser\/pin$/], ['S', 'src/routes/browser.js', /^\/api\/browser\/pin$/]],
    a: [decl('an OpenCode reject runs nothing; allow-exit is retired (410); a channel send is the owner\'s own typed message; open-with is a question (peek) — the open acts on the row\'s captured path; the editor bridge is Ctrl+G; a browser pin grants nothing (whoMayUse admits)')], b: [decl('—')], c: [decl('—')], d: [decl('—')], gate: [] },
  { id: 'agent-side', surface: 'an agent\'s own bearer routes (never a person\'s click)',
    doors: [['S', 'src/agent-routes.js', /^\/api\/agent\//], ['S', 'src/routes/browser.js', /^\/api\/agent\/browser\//], ['S', 'src/routes/window-targets.js', /^\/api\/agent\//]],
    a: [decl('the agent\'s own verbs; the approvals they lead to are the rows above')], b: [decl('—')], c: [decl('—')], d: [decl('—')], gate: [] },
];
function approvalRows(read) {
  const hits = doorHits(read), unclaimed = [], wrong = [];
  const used = new Map();
  for (const h of hits) {
    const claim = ROWS.filter((r) => r.doors.some(([k, f, re]) => k === h.kind && f === h.f && re.test(h.key)));
    if (claim.length !== 1) { unclaimed.push(`${h.kind} ${h.f}:${h.line} ${h.key}${claim.length > 1 ? ' (claimed by ' + claim.map((r) => r.id).join(', ') + ')' : ''}`); continue; }
    for (const d of claim[0].doors) if (d[0] === h.kind && d[1] === h.f && d[2].test(h.key)) used.set(d, (used.get(d) || 0) + 1);
  }
  for (const r of ROWS) for (const d of r.doors) if (!used.get(d)) wrong.push(`${r.id}: door ${d[0]} ${d[1]} ${d[2]} claims nothing (dead)`);
  for (const r of ROWS) for (const q of ['a', 'b', 'c', 'd']) {
    const list = r[q];
    if (!Array.isArray(list) || !list.length) { wrong.push(`${r.id}: (${q}) is empty — pin it or declare it with a reason`); continue; }
    for (const p of list) {
      if (p.declared) { if (!String(p.declared).trim()) wrong.push(`${r.id}: (${q}) declared with no reason`); continue; }
      let t = ''; try { t = stripLines(read(p.f)).join('\n'); } catch { t = ''; }
      if (!p.re.test(t)) wrong.push(`${r.id}: (${q}) pin missing in ${p.f}: ${p.re}`);
    }
  }
  for (const r of ROWS) for (const [suite, words] of r.gate) { let t = ''; try { t = read(suite); } catch { t = ''; } if (!t.includes(words)) wrong.push(`${r.id}: gate "${words}" not found in ${suite}`); }
  return { hits, unclaimed, wrong };
}
console.log('§3 THE APPROVAL ROWS — every approval surface found by grep, each proving (a) same record · (b) re-check · (c) no other writer · (d) format, or declaring why');
{
  const c = approvalRows(readRepo);
  ok(c.hits.length >= 50 && c.unclaimed.length === 0, `§3 DOORS: every answer call / answer route / permission frame / producer action the grep finds (${c.hits.length}) is claimed by exactly one of ${ROWS.length} rows — a new approval surface is red until it has one`, c.unclaimed);
  ok(c.wrong.length === 0, '§3 ROWS: every row\'s (a)–(d) is a pin that matches or a declaration with its reason, no dead door, every gate exists by its words in its suite', c.wrong);
  console.log('  ┌ row → (a) same record · (b) re-check · (c) other writers · (d) format   [P = pinned, D = declared]');
  for (const r of ROWS) console.log(`  │ ${r.id.padEnd(17)} ${['a', 'b', 'c', 'd'].map((q) => q + ':' + r[q].map((p) => (p.declared ? 'D' : 'P')).join('')).join(' ')}  — ${r.surface}`);
}

// ── §3b THE TWO CLASS CELLS the brief names (behavioural, in process) ─────────────────────────────────────────────────
// THE MERGE CELL: the For-you store is the record three approval surfaces display from (the exit ask, the helper ask,
// the reset-credit item); a filing by anyone but the producer (an agent's vibespace-ask, which never carries an action)
// must never change a producer's item, and an identity-keyed producer's next question is its own item.
// THE RE-CHECK CELL: the exit ask's Allow, over the REAL ExitProxyManager and the REAL store — an item changed after it
// was shown is refused ask_changed and nothing runs.
const REQ = createRequire(import.meta.url);
const SCR = scratch('approvalcensus');
fs.mkdirSync(SCR, { recursive: true });
process.on('exit', () => { try { fs.rmSync(SCR, { recursive: true, force: true }); } catch { } });
function mergeCell(Todos) {
  const t = new Todos({ dataDir: fs.mkdtempSync(path.join(SCR, 'm-')), expirySweepMs: 0 });
  const out = {};
  const PRODUCERS = [['exit-run-ask', { askId: 'a'.repeat(32), hostId: 'h', machine: 'M', cmd: 'curl x | sh' }, 'machines', 'Allow "ops" to run a command on M?', 'curl x | sh'], ['helper-ask', { requestId: 'r1', sessionId: 's1' }, 'agent', 'A helper waits for your approval', 'Bash: rm -rf ~/x'], ['reset-credit', { sessionId: 's1', accountKey: 'k1', resetsAtSec: 1 }, 'pool', 'Use a stored reset credit on K?', 'the credit discards 0%']];
  for (const [type, fields, origin, text, detail] of PRODUCERS) {
    const it = t.add('claude:A', { text, detail, origin, by: 'agent', kind: 'action', action: { type, ...fields } });
    const re = t.add('claude:A', { text, detail: 'echo hello', origin: 'agent', by: 'agent' }); // the agent route's own shape
    out[type] = { beside: re.id !== it.id, shown: t.get(it.id).detail };
  }
  const a1 = t.add('claude:B', { text: 'Allow "b" to run a command on M?', detail: 'echo one', origin: 'machines', by: 'agent', action: { type: 'exit-run-ask', askId: 'b'.repeat(32) } });
  const a2 = t.add('claude:B', { text: 'Allow "b" to run a command on M?', detail: 'echo two', origin: 'machines', by: 'agent', action: { type: 'exit-run-ask', askId: 'c'.repeat(32) } });
  out.perQuestion = { separate: a1.id !== a2.id, first: t.get(a1.id).detail };
  return out;
}
const mergeOk = (o) => ['exit-run-ask', 'helper-ask', 'reset-credit'].every((k) => o[k].beside && o[k].shown !== 'echo hello') && o.perQuestion.separate && o.perQuestion.first === 'echo one';
async function recheckCell(Mgr, Todos) {
  let clock = Date.now() + 1000;
  const T = { set: (fn, ms) => ({ at: clock + ms, fn }), clear: () => { } };
  const runs = [];
  const recs = [{ id: 'host-dial-M', name: 'M', transport: 'dial', deviceId: 'M', exit: { use: { mode: 'nobody' }, run: { mode: 'nobody', ask: false } } }];
  const dm = { runCmd: async (cmd, args) => { runs.push(args[1]); return { code: 0, stdout: '', stderr: '', timedOut: false, signal: null }; }, serveSocks: async () => ({ port: 1 }), tcpForward: async () => ({ write() { }, close() { } }), unserveSocks: async () => { } };
  const hosts = { list: () => recs.map((h) => ({ ...h, online: true })), get: (id) => recs.find((x) => x.id === id), setExitAccess: (id, exit) => { const h = recs.find((x) => x.id === id); h.exit = { ...exit }; }, setLastRun: () => { }, deviceBounded: async () => dm };
  const dataDir = fs.mkdtempSync(path.join(SCR, 'r-'));
  const todos = new Todos({ dataDir, expirySweepMs: 0 });
  const sessions = new Map([['wa', { name: 'ops', backend: 'claude', claudeSessionId: 'A', cwd: '/w' }]]);
  const mgr = new Mgr({ hosts, log: () => { }, dataDir, userTodos: todos, sessionsMap: () => sessions, bcastAll: () => { }, now: () => clock, timers: T, emitCard: () => true, groupsOf: () => [] });
  await mgr.setAccess('host-dial-M', { run: { mode: 'only', who: [{ kind: 'session', id: 'claude:A' }], ask: true } });
  const p = mgr.run(sessions.get('wa'), 'wa', 'M', 'echo real').then((v) => ({ v }), (e) => ({ e }));
  await new Promise((r) => setImmediate(r));
  const item = todos.snapshot().open.find((i) => i.action && i.action.type === 'exit-run-ask');
  const askId = item && item.action.askId;
  if (item) todos._state.items.find((i) => i.id === item.id).detail = 'echo shown'; // ANY door changed what the row shows
  let answer; try { answer = mgr.answerAsk(askId, { answer: 'allow', by: 'user' }).state; } catch (e) { answer = e.code; }
  const r = await p;
  return { answer, call: r.e ? r.e.code : 'ran', runs: runs.length };
}
console.log('§3b THE MERGE CELL + THE RE-CHECK CELL (the class, behaviourally)');
const TodosReal = REQ(path.join(REPO, 'src/user-todos.js')).UserTodoManager;
const MgrReal = REQ(path.join(REPO, 'src/exit-proxy.js')).ExitProxyManager;
{
  const o = mergeCell(TodosReal);
  ok(mergeOk(o), 'THE MERGE CELL: an agent\'s filing of a producer item\'s own text is filed BESIDE it for every producer (exit ask, helper ask, reset credit) — the item\'s shown detail never becomes the agent\'s; an identity-keyed producer\'s next question is its own item', o);
  const c = await recheckCell(MgrReal, TodosReal);
  ok(c.answer === 'ask_changed' && c.call === 'ask_changed' && c.runs === 0, 'THE RE-CHECK CELL: Allow on an exit ask whose item changed after it was shown ⇒ ask_changed, the waiting call hears ask_changed (never "the user did not allow"), NOTHING ran', c);
}

console.log('controls (patched copies)');
{
  const M = mutantCopies('approvalcensus', REPO);
  // CONTROL (e1): the pre-fix explorer delete — the folder and the machine read after the confirm
  const rel = 'src/lib/file-explorer-ops.js';
  const src = readRepo(rel);
  const mut = src.replace("const r = await fetch(`/api/file?path=${encodeURIComponent(here.path(name))}${here.hp}`, { method: 'DELETE' }).catch(() => null);\n    if (!r?.ok) showToast(t('Delete failed'), { type: 'error' });",
    "const r = await fetch(`/api/file?path=${encodeURIComponent(this.currentPath + '/' + name)}${this._hp()}`, { method: 'DELETE' }).catch(() => null);\n    if (!r?.ok) showToast(t('Delete failed'), { type: 'error' });");
  ok(mut !== src, 'CONTROL (e1): the patch applies');
  const copy = M.write(rel, mut, 'e1');
  const c = captureCensus((f) => (f === rel ? fs.readFileSync(copy, 'utf8') : readRepo(f)), LIB);
  ok(c.hits.length === 1 && /file-explorer-ops\.js:\d+: reads this\.currentPath, this\._hp\( after the dialog/.test(c.hits[0]), 'CONTROL (e1): the pre-fix Delete (the folder and the machine read after the confirm) turns THE CAPTURE RULE red', c.hits);
  // CONTROL (s1): the pre-fix force kill — the panel's machine re-read after the confirm
  {
    const rrel = 'src/lib/sidebar-rail.js', rsrc = readRepo(rrel);
    const rmut = rsrc.replace('body: JSON.stringify({ host, pid, sig })', 'body: JSON.stringify({ host: getHostId(), pid: p.pid, sig })');
    ok(rmut !== rsrc, 'CONTROL (s1): the patch applies');
    const rcopy = M.write(rrel, rmut, 's1');
    const cs = captureCensus((f) => (f === rrel ? fs.readFileSync(rcopy, 'utf8') : readRepo(f)), LIB);
    ok(cs.hits.length === 1 && /sidebar-rail\.js:\d+: reads getHostId\( after the dialog/.test(cs.hits[0]), 'CONTROL (s1): the pre-fix Force kill (the machine read after the confirm) turns THE CAPTURE RULE red', cs.hits);
  }
  // CONTROL (v1): a verdict that lets every press through (the pre-fix behaviour)
  {
    const vrel = 'src/lib/press-arm.js', vsrc = readRepo(vrel);
    const vmut = vsrc.replace("  if (since == null || !Number.isFinite(Number(since))) return { ok: false, code: 'just-moved', waitMs: armMs };", '  return { ok: true };');
    ok(vmut !== vsrc, 'CONTROL (v1): the patch applies');
    const cv = await armCells(M.write(vrel, vmut, 'v1'));
    ok(JSON.stringify(cv.table) !== JSON.stringify([false, false, false, true, true]), 'CONTROL (v1): a verdict that lets every press through turns the V1 table red', cv.table);
  }
  // CONTROL (z2a): the outbox spelling its own set again; (z2b) a raw RLO in a product file
  {
    const prel = 'src/channel-policy.js', psrc = readRepo(prel);
    const BSL = String.fromCharCode(92);
    const pmut = psrc.replace("const HC = require('./hidden-chars.js');", "const HC = require('./hidden-chars.js'); const OWN = /[" + BSL + 'u202a-' + BSL + "u202e]/;");
    ok(pmut !== psrc, 'CONTROL (z2a): the patch applies');
    const pcopy = M.write(prel, pmut, 'z2a');
    const cz = hiddenDoorCensus((f) => (f === prel ? fs.readFileSync(pcopy, 'utf8') : readRepo(f)));
    ok(cz.own.length === 1 && /channel-policy\.js: spells its own set/.test(cz.own[0]), 'CONTROL (z2a): a surface spelling its own set turns §1d red', cz.own);
    const rrel = 'src/exit-reach.js', rsrc = readRepo(rrel);
    const rmut = rsrc.replace('// verify-r6 Z2: THE SET is src/hidden-chars.js', '// verify-r6 Z2: THE SET is src/hidden-chars.js' + String.fromCharCode(0x202e));
    ok(rmut !== rsrc, 'CONTROL (z2b): the patch applies');
    const rcopy = M.write(rrel, rmut, 'z2b');
    const cr = hiddenDoorCensus((f) => (f === rrel ? fs.readFileSync(rcopy, 'utf8') : readRepo(f)));
    ok(cr.raw.length === 1 && /^src\/exit-reach\.js: U\+202E/.test(cr.raw[0]), 'CONTROL (z2b): a RAW direction control in a product file turns §1d red', cr.raw);
  }
  // CONTROL (α): a store that re-enables TEXT-keyed merge for ONE producer (the reset-credit item) — the agent's
  // filing lands on it and its shown detail becomes the agent's
  {
    const trel = 'src/user-todos.js', tsrc = readRepo(trel);
    const tmut = tsrc.replace('      if (!i.action !== !action) return false;', "      if (!i.action !== !action) return !!(i.action && i.action.type === 'reset-credit');");
    ok(tmut !== tsrc, 'CONTROL (α): the patch applies');
    const oa = mergeCell(M.load(trel, tmut, 'alpha').UserTodoManager);
    ok(!mergeOk(oa) && oa['reset-credit'].shown === 'echo hello' && !oa['reset-credit'].beside, 'CONTROL (α): text-keyed merge re-enabled for one producer ⇒ its item shows the agent\'s detail — THE MERGE CELL goes red', oa['reset-credit']);
  }
  // CONTROL (β): the exit route without its re-check at execution (the belt)
  {
    const mrel = 'src/exit-proxy.js', msrc = readRepo(mrel);
    const mmut = msrc.replace("if (v.state === 'allowed' && k.todoId && this.userTodos && typeof this.userTodos.get === 'function') {", 'if (false) {');
    ok(mmut !== msrc, 'CONTROL (β): the patch applies');
    const cb = await recheckCell(M.load(mrel, mmut, 'beta').ExitProxyManager, TodosReal);
    ok(cb.answer === 'allowed' && cb.runs === 1, 'CONTROL (β): the route skipping its re-check allows the changed item and RUNS the stored command — THE RE-CHECK CELL goes red', cb);
  }
  // CONTROL (d1): the pre-fix plugins-ui Stop confirm — two positional strings
  {
    const prel = 'src/lib/plugins-ui.js', psrc = readRepo(prel);
    const pmut = psrc.replace(/const ok = await showConfirmDialog\(\{\n\s*title: t\('Stop \{name\}\?', \{ name: p\.label \}\),\n\s*message: isFrp/, "const ok = await showConfirmDialog(t('Stop {name}?', { name: p.label }), isFrp");
    ok(pmut !== psrc, 'CONTROL (d1): the patch applies');
    const pcopy = M.write(prel, pmut, 'd1');
    const c1 = confirmShapeCensus((f) => (f === prel ? fs.readFileSync(pcopy, 'utf8') : readRepo(f)), LIB);
    ok(c1.bad.length === 1 && /^src\/lib\/plugins-ui\.js:\d+: showConfirmDialog\(t\('Stop/.test(c1.bad[0]), 'CONTROL (d1): the pre-fix Stop frp / Tailscale confirm (positional strings) turns §1b red', c1.bad);
  }
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 8, label: 'mutant-copy (approval census): ' })) ok(r.pass, r.name, r.detail);
}

// ── §2 AGENT HTML NEVER RESTYLES AN APPROVAL ────────────────────────────────────────────────────────────────────────
// verify-r6 (HIGH, reproduced in headless Chrome with the real purify.js + marked): agent markdown was sanitized with
// DOMPurify's DEFAULT config at four sites (assistant / peer / report text, a job panel's md block, the markdown
// preview of a file, a For-you item), which KEEPS <style>, style= and class=. One message carrying
// `<style>.ut-exit-cmd{font-size:0}.ut-exit-cmd::before{content:"echo hello"}</style>` changed the command every exit
// ask displays above Allow while the real one ran; a style= / a product class that is position:fixed covered the
// page; a <form><button> navigated the app. The rule: every sanitize goes through src/lib/safe-html.js (no CSS, class
// only `language-*` on pre/code, no forms / controls / top layer, id/name namespaced, no data-*, HTML only). No DOM
// library ships in node_modules (checked: no jsdom / linkedom / happy-dom — only @xmldom, which DOMPurify cannot run
// on), so the gate is a SOURCE CENSUS + the module's own config and hooks run in node + its fail-closed door.
const SAFE = 'src/lib/safe-html.js';
const MUST_FORBID_TAGS = ['style', 'link', 'meta', 'base', 'form', 'button', 'textarea', 'select', 'option', 'dialog', 'template', 'iframe', 'frame', 'object', 'embed', 'label', 'svg', 'math'];
const MUST_FORBID_ATTR = ['style', 'action', 'formaction', 'for', 'popover', 'popovertarget', 'commandfor'];
const CONFIG_KEYS = ['ALLOW_DATA_ATTR', 'FORBID_ATTR', 'FORBID_TAGS', 'SANITIZE_NAMED_PROPS', 'USE_PROFILES'];
function configProblems(mod) {
  const c = mod.SAFE_HTML_CONFIG || {}, p = [];
  const ft = new Set(c.FORBID_TAGS || []), fa = new Set(c.FORBID_ATTR || []);
  for (const t of MUST_FORBID_TAGS) if (!ft.has(t)) p.push('FORBID_TAGS lacks ' + t);
  for (const a of MUST_FORBID_ATTR) if (!fa.has(a)) p.push('FORBID_ATTR lacks ' + a);
  if (c.SANITIZE_NAMED_PROPS !== true) p.push('SANITIZE_NAMED_PROPS is not true');
  if (c.ALLOW_DATA_ATTR !== false) p.push('ALLOW_DATA_ATTR is not false');
  if (JSON.stringify(c.USE_PROFILES) !== '{"html":true}') p.push('USE_PROFILES is not {html:true}');
  if (JSON.stringify(Object.keys(c).sort()) !== JSON.stringify(CONFIG_KEYS)) p.push('the config names ' + JSON.stringify(Object.keys(c).sort()) + ' — any other key (an ALLOWED_* / ADD_* widening) is a decision reviewed here');
  if (!Object.isFrozen(c) || !Object.isFrozen(c.FORBID_TAGS || []) || !Object.isFrozen(c.FORBID_ATTR || [])) p.push('the config is not frozen');
  return p;
}
function wiringProblems(src) {
  const code = stripLines(src).join('\n'), p = [];
  if (!/const p = DOMPurify\(typeof window === 'undefined' \? undefined : window\);/.test(code)) p.push('no DEDICATED instance (DOMPurify(window)) — hooks would reach every other DOMPurify user');
  if (!/if \(!p \|\| p\.isSupported !== true \|\| typeof p\.sanitize !== 'function'\) throw /.test(code)) p.push('no fail-closed door (DOMPurify hands the input back when it cannot run)');
  for (const w of ["p.addHook('uponSanitizeAttribute', onAttribute);", "p.addHook('afterSanitizeAttributes', afterAttributes);", 'p.setConfig(SAFE_HTML_CONFIG);', 'return safeHtmlPurifier().sanitize(String(html ?? \'\'));']) if (!code.includes(w)) p.push('missing: ' + w);
  if (/\bDOMPurify\.(sanitize|addHook|setConfig)\(/.test(code)) p.push('the shared default DOMPurify instance is configured or used');
  return p;
}
// every DOMPurify use and every markdown parse in the tracked src tree: DOMPurify only inside safe-html.js, and every
// parse of a `marked` binding (the function, or a `new Marked(` instance) on a line that hands it to sanitizeHtml(
// DECLARED SANDBOXED-FRAME SINKS (the .197 integration, lane channel-rich × this census): a DOMPurify use whose output
// is never OUR DOM — it is the srcdoc of an iframe sandboxed WITHOUT allow-same-origin (an opaque origin: no cookie, no
// storage, no reach into the product's document), its own per-call config (never a hook or setConfig on the shared
// instance safe-html does not use), the SECOND wall behind a PURE allowlist re-serializer. Each declaration is pinned.
const DOMPURIFY_DECLARED = {
  'src/lib/channel-mail-frame.js': {
    why: 'lane channel-rich D2: a mail\'s formatted body — step 2 of two walls (MF.sanitizeMailHtml, then DOMPurify with MF.DOMPURIFY_CONFIG per call) — lands ONLY as the srcdoc of a sandbox="allow-scripts" frame (never allow-same-origin)',
    pins: [/const clean = DOMPurify\.sanitize\(pure\.html, \{ \.\.\.MF\.DOMPURIFY_CONFIG,/, /f\.setAttribute\('sandbox', 'allow-scripts'\);/, /f\.srcdoc = doc;/],
    never: [/DOMPurify\.(addHook|setConfig)\(/, /allow-same-origin/],
  },
};
function declaredDomPurifyProblems(read) {
  const p = [];
  for (const [f, d] of Object.entries(DOMPURIFY_DECLARED)) {
    const code = stripLines(read(f)).join('\n');
    for (const re of d.pins) if (!re.test(code)) p.push(`${f}: the declaration's pin ${re} no longer holds`);
    for (const re of d.never) if (re.test(code)) p.push(`${f}: ${re} — the declared sink must never do this`);
  }
  return p;
}
function sanitizerCensus(read, files) {
  const hits = [], sites = [];
  for (const f of files) {
    const text = read(f), lines = stripLines(text);
    if (f !== SAFE && !DOMPURIFY_DECLARED[f]) lines.forEach((l, i) => { if (/\bDOMPurify\b|['"]dompurify['"]/.test(l)) hits.push(`${f}:${i + 1}: DOMPurify used outside ${SAFE}`); });
    const names = new Set();
    for (const m of text.matchAll(/import\s+([\w$]+)?\s*,?\s*(?:\{([^}]*)\})?\s*from\s*['"]marked['"]/g)) {
      if (m[1]) names.add(m[1]);
      for (const part of (m[2] || '').split(',')) { const [imp, loc] = part.trim().split(/\s+as\s+/); if (imp === 'marked') names.add(loc || imp); }
    }
    for (const m of text.matchAll(/\b(?:const|let|var)\s+([\w$]+)\s*=\s*new\s+Marked\(/g)) names.add(m[1]);
    for (const n of names) {
      const call = new RegExp('(^|[^\\w$.])' + n.replace(/\$/g, '\\$') + '\\s*(\\.\\s*(parse|parseInline))?\\s*\\(');
      lines.forEach((l, i) => { if (!call.test(l)) return; sites.push(`${f}:${i + 1}`); if (!/\bsanitizeHtml\(/.test(l)) hits.push(`${f}:${i + 1}: markdown (${n}) parsed outside sanitizeHtml( — ${l.trim().slice(0, 90)}`); });
    }
  }
  return { hits, sites };
}
const classOf = (mod, tag, value) => { const ev = { attrName: 'class', attrValue: value, keepAttr: true }; mod.onAttribute({ nodeName: tag.toUpperCase() }, ev); return ev.keepAttr ? ev.attrValue : null; };
const CLASS_CASES = [
  // [tag, class value, kept (null = the attribute is dropped), why]
  ['div', 'ut-exit-cmd', null, 'the exit ask\'s command class (the verifier\'s ::before overlay)'],
  ['span', 'chat-link chat-link-path', null, 'our linkify span (a click would copy / open its data-path)'],
  ['div', 'chat-img-overlay', null, 'a product class that is position:fixed'],
  ['code', 'language-js', 'language-js', 'a code fence\'s language'],
  ['pre', 'language-mermaid', 'language-mermaid', 'the code preview\'s mermaid pass reads it'],
  ['code', 'language-c++', 'language-c++', 'marked writes the info word verbatim'],
  ['code', 'language-js ut-exit-cmd', 'language-js', 'a smuggled product class beside a language'],
  ['div', 'language-js', null, 'a language class on anything but pre / code'],
  ['code', 'hljs language-', null, 'an empty language + a library class'],
];
const HALF_WINDOW = () => { function Element() {} function Node() {} return { document: { nodeType: 9, implementation: {}, createElement: () => ({}) }, Element, Node }; };
const ATTACK = '<style>.ut-exit-cmd{font-size:0}.ut-exit-cmd::before{content:"echo hello"}</style><div style="position:fixed;inset:0">x</div>';
function failClosed(mod) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'window'), out = {};
  const run = () => { try { const r = mod.sanitizeHtml(ATTACK); return r === ATTACK ? 'returned the input unsanitized' : 'returned ' + JSON.stringify(r).slice(0, 60); } catch { return 'threw'; } };
  try { delete globalThis.window; out.noWindow = run(); globalThis.window = HALF_WINDOW(); out.halfDom = run(); }
  finally { if (saved) Object.defineProperty(globalThis, 'window', saved); else delete globalThis.window; }
  return out;
}
const SRC_FILES = tracked('src').filter((f) => /\.(m?js|cjs)$/.test(f) && !/\/i18n-[a-z]+\.js$/.test(f));
const CSS_CLASSES = [...new Set(tracked('public').filter((f) => f.endsWith('.css')).flatMap((f) => [...readRepo(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/url\([^)]*\)/g, '').matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((m) => m[1])))];
console.log('§2 AGENT HTML NEVER RESTYLES AN APPROVAL — one sanitizer: no CSS, no product classes, no forms (verify-r6)');
const SH = await import(pathToFileURL(path.join(REPO, SAFE)).href);
{
  const c = sanitizerCensus(readRepo, SRC_FILES);
  ok(c.sites.length >= 4, `SITES: the grep finds every markdown parse in src/ (${c.sites.length}: ${c.sites.join(' ')})`, c.sites);
  ok(c.hits.length === 0, `CENSUS: over ${SRC_FILES.length} tracked src files, DOMPurify lives only in ${SAFE} (and the ${Object.keys(DOMPURIFY_DECLARED).length} declared sandboxed-frame sink) and every markdown parse is handed to sanitizeHtml( on its line`, c.hits);
  { const dp = declaredDomPurifyProblems(readRepo); ok(!dp.length && Object.values(DOMPURIFY_DECLARED).every((d) => d.why.length >= 40), `DECLARED: each sandboxed-frame DOMPurify sink (${Object.keys(DOMPURIFY_DECLARED).join(', ')}) still feeds only a sandbox="allow-scripts" srcdoc, per-call config, never a shared hook / setConfig, never allow-same-origin`, dp);
    const mfSrc = readRepo('src/lib/channel-mail-frame.js');
    const opened = mfSrc.replace("f.setAttribute('sandbox', 'allow-scripts');", "f.setAttribute('sandbox', 'allow-scripts allow-same-origin');");
    const hooked = mfSrc.replace('const clean = DOMPurify.sanitize(', "DOMPurify.addHook('afterSanitizeAttributes', () => {}); const clean = DOMPurify.sanitize(");
    const reader = (text) => (f) => (f === 'src/lib/channel-mail-frame.js' ? text : readRepo(f));
    ok(opened !== mfSrc && hooked !== mfSrc && declaredDomPurifyProblems(reader(opened)).length > 0 && declaredDomPurifyProblems(reader(hooked)).length > 0, 'CONTROL (the .197 integration): the mail frame opened to its parent (allow-same-origin) or a hook on the shared instance turns the declaration red'); }
  const PINS = [
    ['src/lib/chat-renderers.js', "let html = sanitizeHtml(marked.parse(text || ''));"],
    ['src/lib/jobs-panel.js', "el.innerHTML = sanitizeHtml(marked.parse(String(b.text || '')));"],
    ['src/lib/code-editor.js', 'this._previewBody.innerHTML = sanitizeHtml(marked.parse(src));'],
    ['src/lib/inbox-window.js', 'el.innerHTML = sanitizeHtml(inline ? md.parseInline(s) : md.parse(s));'],
  ];
  const off = PINS.filter(([f, l]) => !readRepo(f).includes(l) || !/import \{ sanitizeHtml \} from '\.\/safe-html\.js';/.test(readRepo(f))).map(([f]) => f);
  ok(off.length === 0, 'the four sites the verifier named (assistant / peer / report text, a job panel\'s md, a file\'s markdown preview, a For-you item) import and call sanitizeHtml', off);
  ok(configProblems(SH).length === 0, `CONFIG: FORBID_TAGS ⊇ {${MUST_FORBID_TAGS.join(' ')}}, FORBID_ATTR ⊇ {${MUST_FORBID_ATTR.join(' ')}}, SANITIZE_NAMED_PROPS, no data-*, HTML only, nothing widened, frozen`, configProblems(SH));
  ok(wiringProblems(readRepo(SAFE)).length === 0, 'WIRING: a dedicated DOMPurify instance, the two hooks, the config set once, fail closed, the shared default never touched', wiringProblems(readRepo(SAFE)));
  const bad = CLASS_CASES.filter(([tag, v, want]) => classOf(SH, tag, v) !== want).map(([tag, v, want, why]) => ({ tag, v, want, got: classOf(SH, tag, v), why }));
  ok(bad.length === 0, `CLASS: ${CLASS_CASES.length} cases — a product class never survives, a code fence keeps its language-*`, bad);
  const TAGS = ['div', 'span', 'p', 'a', 'code', 'pre', 'img', 'table', 'li'];
  const kept = CSS_CLASSES.filter((cls) => TAGS.some((tag) => classOf(SH, tag, cls) !== null));
  ok(CSS_CLASSES.length > 500 && kept.length === 0, `CLASS CENSUS: every one of the ${CSS_CLASSES.length} classes the product's stylesheets style is dropped on ${TAGS.length} tags`, kept.slice(0, 20));
  const ev = { attrName: 'href', attrValue: 'https://e.com', keepAttr: true }; SH.onAttribute({ nodeName: 'A' }, ev);
  ok(ev.keepAttr === true && ev.attrValue === 'https://e.com', 'the class hook leaves every other attribute to DOMPurify');
  const set = (nodeName, attrs) => ({ nodeName, attrs: { ...attrs }, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } });
  const inp = set('INPUT', { type: 'text' }), box = set('INPUT', { type: 'checkbox', checked: '' }), div = set('DIV', { title: 'x' });
  const a = set('A', { href: '/api/x' }), frag = set('A', { href: '#user-content-x' });
  [inp, box, div, a, frag].forEach((n) => SH.afterAttributes(n));
  ok(inp.attrs.type === 'checkbox' && inp.attrs.disabled === '' && box.attrs.disabled === '' && box.attrs.checked === '' && JSON.stringify(div.attrs) === '{"title":"x"}', 'INPUT: a surviving <input> is always a disabled checkbox (a GFM task list keeps its box and its tick; a text field never)', { inp: inp.attrs, box: box.attrs, div: div.attrs });
  ok(a.attrs.target === '_blank' && a.attrs.rel === 'noopener noreferrer' && JSON.stringify(frag.attrs) === '{"href":"#user-content-x"}', 'LINK: an agent\'s link opens beside the workspace, never in place of the app (an in-page #fragment stays)', { a: a.attrs, frag: frag.attrs });
  const fc = failClosed(SH);
  let lib = null; try { lib = (await import('dompurify')).default(HALF_WINDOW()).sanitize(ATTACK) === ATTACK; } catch { lib = 'threw'; }
  ok(lib === true, 'the hazard is real: on a DOM it cannot run on, DOMPurify ITSELF hands the attack back unsanitized', lib);
  ok(fc.noWindow === 'threw' && fc.halfDom === 'threw', 'FAIL CLOSED: sanitizeHtml throws without a DOM and on a DOM DOMPurify cannot run on — it never returns the input', fc);
}
{
  const M = mutantCopies('safehtml', REPO);
  const SRC = readRepo(SAFE);
  const DP = JSON.stringify(import.meta.resolve('dompurify'));
  const load = (mut, tag) => import(pathToFileURL(M.write(SAFE, mut.replace("from 'dompurify'", 'from ' + DP), tag)).href);
  const patch = (from, to) => { const m = typeof from === 'string' ? SRC.split(from).join(to) : SRC.replace(from, to); return m; };
  // CONTROL (h1): DOMPurify's default config — the lists gone
  const h1 = patch(/export const SAFE_HTML_CONFIG = Object\.freeze\(\{[\s\S]*?\n\}\);/, 'export const SAFE_HTML_CONFIG = Object.freeze({});');
  ok(h1 !== SRC && configProblems(await load(h1, 'h1')).some((p) => p === 'FORBID_TAGS lacks style'), 'CONTROL (h1): the default config (FORBID lists removed) turns CONFIG red', configProblems(await load(h1, 'h1b')).slice(0, 3));
  // CONTROL (h2): one tag short — <style> allowed again
  const h2 = patch("'style', 'link',", "'link',");
  ok(h2 !== SRC && JSON.stringify(configProblems(await load(h2, 'h2'))) === '["FORBID_TAGS lacks style"]', 'CONTROL (h2): a list one tag short (style) is named by CONFIG');
  // CONTROL (h3): the class hook keeps every value
  const h3 = patch("  if (!CLASS_TAGS.has(String(tag || '').toLowerCase())) return '';\n  return String(value || '').split(/\\s+/).filter((c) => CLASS_TOKEN.test(c)).join(' ');", "  return String(value || '');");
  const m3 = await load(h3, 'h3');
  ok(h3 !== SRC && classOf(m3, 'div', 'ut-exit-cmd') === 'ut-exit-cmd' && CLASS_CASES.some(([tag, v, want]) => classOf(m3, tag, v) !== want), 'CONTROL (h3): a class hook that keeps every value turns CLASS red (ut-exit-cmd survives)');
  // CONTROL (h4): the fail-closed door removed — DOMPurify's own fail-open comes through
  const h4 = patch('if (!p || p.isSupported !== true || typeof p.sanitize !== \'function\') throw', 'if (!p || typeof p.sanitize !== \'function\') throw');
  ok(h4 !== SRC && failClosed(await load(h4, 'h4')).halfDom === 'returned the input unsanitized' && wiringProblems(h4).length === 1, 'CONTROL (h4): without the isSupported check the half DOM returns the attack unsanitized, and WIRING names it', failClosed(await load(h4, 'h4b')));
  // CONTROL (h5): the config never installed
  const h5 = patch('  p.setConfig(SAFE_HTML_CONFIG);\n', '');
  ok(h5 !== SRC && JSON.stringify(wiringProblems(h5)) === '["missing: p.setConfig(SAFE_HTML_CONFIG);"]', 'CONTROL (h5): a sanitizer that never installs its config is named by WIRING');
  // CONTROL (h6): the pre-fix call site — assistant text through the shared default DOMPurify
  const rel = 'src/lib/chat-renderers.js', cr = readRepo(rel);
  const h6 = cr.replace("import { sanitizeHtml } from './safe-html.js';", "import DOMPurify from 'dompurify';").replace("let html = sanitizeHtml(marked.parse(text || ''));", "let html = DOMPurify.sanitize(marked.parse(text || ''));");
  const copy = M.write(rel, h6, 'h6');
  const c6 = sanitizerCensus((f) => (f === rel ? fs.readFileSync(copy, 'utf8') : readRepo(f)), SRC_FILES);
  ok(h6 !== cr && c6.hits.length === 3 && c6.hits.every((h) => h.startsWith(rel + ':')), 'CONTROL (h6): the pre-fix renderMarkdown (DOMPurify defaults) turns the CENSUS red — the import, the sanitize, the unsanitized parse', c6.hits);
  for (const r of copiesCensus(M.files, M.dir, REPO, { minCopies: 6, label: 'mutant-copy (safe-html): ' })) ok(r.pass, r.name, r.detail);
}

console.log(fail ? `\nFAILED: ${fail} of ${pass + fail}` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
