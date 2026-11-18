#!/usr/bin/env node
// THE X SEAT — THE WINDOW'S DOORS, SOURCE PINS (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED VERBATIM from the heavy
// scripts/test-browser-x-seat.mjs (its in-process wiring / route / client legs and every other mutant stay there): §5 the doors' source
// facts (doorFacts) of src/lib/desktop-app-window.js, src/lib/browser-live-window.js, src/lib/xpra-view.js, src/lib/xpra-client.js and
// public/style.css, their words (literal t() with zh + ja: src/lib/i18n-zh.js, src/lib/i18n-ja.js), §3's r5 oneRank pin, and the five
// door mutants that are those legs' red controls (each rule's line undone in a copy: its leg goes red). Each file is read BY NAME, so
// ci.mjs's affected rule selects this suite on a change of that file.
// Run: node scripts/test-browser-x-seat-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { scratch } from './scratch.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra !== undefined ? '\n    ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } return !!c; };
const read = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
// §5's words read the picture module's DESK_DOOR_WORDS (the heavy's W0 = load(REPO), its PIC only)
const W0 = { PIC: require(path.join(REPO, 'src/browser-picture.js')) };

/** §5 — the doors' source facts of ONE tree; → facts */
function doorFacts(root) {
  const dw = read(root, 'src/lib/desktop-app-window.js'), live = read(root, 'src/lib/browser-live-window.js'), view = read(root, 'src/lib/xpra-view.js'), css = read(root, 'public/style.css');
  const rule = (css.match(/\n\.desktop-app-xseat \{[^}]*\}/) || [''])[0];
  return {
    unknownIsWatch: /const seatState = \(\) => \(browserDisplay\(\) \? bseat\.seat \|\| 'watch' :/.test(dw),
    failedIsWatch: /if \(!r \|\| r\.error \|\| !r\.seat\) setBrowserSeat\('watch', null, \{ failed: true \}\);/.test(dw) && dw.includes("t('View only — this window\\'s seat could not be read; it is asked again when it reconnects')"),
    told: /onSeat: \(v\) => applyBrowserSeat\(v\),/.test(dw) && /seat: \(v\) => \{ try \{ onSeat\?\.\(v\); \}/.test(view) && read(root, 'src/lib/xpra-client.js').includes("case 'vibespace-seat':"),
    labelIsAct: /xDoorBtn\.textContent = doorAct === 'take' \? t\('Use it here'\) : doorAct === 'open' \? t\('Open your browsing window'\) : t\('Browse yourself'\);/.test(dw)
      && /const takeSeatHere = \(\) => fetchJson\(`\/api\/desktop\/apps\/\$\{encodeURIComponent\(id\)\}\/browser-seat`, \{ method: 'POST'/.test(dw)
      && /if \(doorAct === 'take'\) \{\n\s*const r = await takeSeatHere\(\);/.test(dw)
      && /if \(\(doorAct === 'browse' \|\| doorAct === 'open'\) && typeof app\.browseYourself === 'function'\) \{\n\s*await takeSeatHere\(\);/.test(dw)
      && !/xDoorBtn\.textContent = t\('Take over'\)/.test(dw),
    doorVerdict: /const a = deskDoorAct\(\{ profile: prof, human: browserHuman\(\) \}\);/.test(dw) && /xDoorBtn\.style\.display = doorAct \? '' : 'none';/.test(dw),
    inputMode: /const next = m === 'watch' \|\| m === 'blocked' \|\| m === 'input' \? \(m === 'input' \? 'watch' : m\) : 'active';/.test(view) && /const sends = \(\) => mode === 'active' \|\| \(mode === 'watch' && inputSeat\);/.test(view) && /client\.viewOnly = viewOnly \|\| !sends\(\);/.test(view),
    liveDoorHuman: /deskDoorOf\(\{ source: pictureNow\(\), xShown: xOn\(\), stuck: deskDoorStuck\(\{ passkey: pkFactNow\(\), stuck: stuckNow\(\) \}\), human: !!H \}\)/.test(live), // the .367 seam: the banner's passkey fact first; B-37a1: the window's stuckNow() (its row's fact, else the person's own native-prompt fact)
    liveDoorRejudged: /const renderMode = \(\) => \{\n    renderDeskDoor\(\);/.test(live) && /scheduleReport\(\); renderDeskDoor\(\);/.test(live) && /renderOwner\(\); renderDeskDoor\(\);/.test(live) && /const renderDialog = \(\) => \{\n    renderDeskDoor\(\);/.test(live),
    themeShadow: !!rule && !/rgba?\(/.test(rule) && rule.includes('box-shadow: var(--shadow-window)'),
    oneRank: /w\.el\.style\.zIndex = String\(Z_FLOOR \+ stackRank\(win\)\);/.test(view) && /import \{[^}]*\bstackRank\b[^}]*\} from '\.\/xpra-proto\.js';/.test(view) && !/Z_REACH|Z_BASE/.test(view)
      && /\.sort\(\(a, b\) => P\.stackRank\(b\) - P\.stackRank\(a\)\)\[0\] \|\| null;/.test(read(root, 'src/lib/xpra-client.js')),
    clientRefusalSaid: /onRefused: \(v\) => sayClientRefusal\(v\),/.test(dw) && dw.includes("if (sayPaced('click-first', now)) { showToast(t('Click your window first — another window is over it there, so the scroll would land in that one')")
      && /refused: \(v\) => \{ try \{ onRefused\?\.\(v\); \}/.test(view) && read(root, 'src/lib/xpra-client.js').includes("emit('refused', { act: 'wheel', code: 'click-first' }); return; }"),
    toastOnActs: /const more = \(Number\(v\.acts\) \|\| 0\) > bseat\.acts;/.test(dw) && /if \(more && bseat\.seat === 'input'\) \{/.test(dw),
    dw, live,
  };
}

const D = doorFacts(REPO);

console.log('§3 r5 — ONE drawn order (the doors\' oneRank source pin)');
{
  ok(D.oneRank === true, "r5 — ONE drawn order: the view's z-index is Z_FLOOR + stackRank and windowAt sorts by P.stackRank (what is drawn on top is what the person's press hits); r6: the front is frontOf's own question");
}

// ═══ §5 ═══
console.log("§5 the window's doors (source pins) and their words");
{
  ok(D.unknownIsWatch, "FAIL 3 — a browser display's pane is WATCH until the bridge (or the route) says otherwise — never this window's election's 'active'");
  ok(D.failedIsWatch, 'FAIL 3 — a failed seat answer is WATCH and SAID («…seat could not be read…»), never active by default');
  ok(D.told, "FAIL 3 — the window takes the bridge's in-band word (xpra-client → xpra-view onSeat → the window)");
  ok(D.toastOnActs, "r3 — the window's one toast is for a refused ACT (the person's press, the person's key: `acts`); a quiet refusal is told, never toasted");
  ok(D.clientRefusalSaid, "r6 MINOR 1 — the person's wheel the CLIENT refused (a raise would take the person's focus from the person's own dialog: nothing sent) reaches the person's Desktop window (xpra-client on.refused → xpra-view onRefused) and is said, paced like the bridge's refusals");
  ok(D.labelIsAct, "MAJOR B — the door's label IS its act: «Use it here» POSTs the seat, «Browse yourself» / «Open your browsing window» open the person's own tab (and hold the person's seat in THIS pane — measured: a synced copy on another client took it); no «Take over» that is no takeover");
  ok(D.doorVerdict, "MAJOR B — the door's act is deskDoorAct's (a conversation's temporary browser: no button, the words say why)");
  ok(D.inputMode, "the view's 'input' mode: Watch's picture (nothing sized), the person's input sent");
  ok(D.liveDoorHuman && D.liveDoorRejudged, "the live view's raw-fallback door: only in the person's browse-yourself window, judged again at every fact, X mount / unmount, mode and digest change");
  ok(D.themeShadow, 'the Watch door strip\'s shadow is the theme\'s (--shadow-window), never a literal colour');
  const zh = read(REPO, 'src/lib/i18n-zh.js'), ja = read(REPO, 'src/lib/i18n-ja.js');
  const keys = [...D.dw.matchAll(/\bt\((?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g)].map((m) => (m[1] !== undefined ? m[1] : m[2]).replace(/\\(['"])/g, '$1')).filter((k) => /^(View only — |Use it here|Only your own window|Make this window the one|Open your own tab in this browser|You browse this browser yourself|You are browsing it|Browse yourself|Open your browsing window)/.test(k));
  const has = (src, k) => src.includes(JSON.stringify(k)) || src.includes(`'${k.replace(/'/g, "\\'")}'`);
  ok(keys.length >= 12 && keys.every((k) => has(zh, k) && has(ja, k)), `every word of the doors is a literal t() with zh + ja (${keys.length})`, keys.filter((k) => !has(zh, k) || !has(ja, k)));
  const PICw = W0.PIC.DESK_DOOR_WORDS || {};
  ok(D.live.includes('t("' + PICw.line + '")') && D.live.includes("t('" + PICw.button + "')") && has(zh, PICw.line) && has(ja, PICw.line) && has(zh, PICw.button) && has(ja, PICw.button), "the live view says the door's words (literal t() of DESK_DOOR_WORDS, zh + ja)");
  ok(zh.includes('只能看——这个浏览器由「{name}」的 agent 在操作；自己浏览后可在这里操作你自己的窗口'), "zh says the owner's sentence, its way true to its act: 只能看——这个浏览器由 <X> 在操作；自己浏览后可在这里操作你自己的窗口");
}

console.log('§6 the door mutants — each rule undone in a copy of src: its leg goes red');
{
  const M = path.join(scratch('bxseat-pins'), 'mut'); fs.mkdirSync(M, { recursive: true });   // the heavy's scratch root shape (scripts/scratch.mjs)
  process.on('exit', () => { try { fs.rmSync(path.dirname(M), { recursive: true, force: true }); } catch { } });
  fs.cpSync(path.join(REPO, 'src/lib'), path.join(M, 'src/lib'), { recursive: true });
  fs.cpSync(path.join(REPO, 'public/style.css'), path.join(M, 'public/style.css'));
  const MUTANTS = [
    { tag: 'view-own-order', file: 'src/lib/xpra-view.js', from: 'w.el.style.zIndex = String(Z_FLOOR + stackRank(win));', to: "w.el.style.zIndex = String((win.reach ? 400000 : 0) + ({ main: 1000, dialog: 200000, popup: 300000 }[win.kind] || 1000) + Math.min(win.z, 99999));", door: true, red: (d) => d.oneRank === false },
    { tag: 'door-says-take-over', file: 'src/lib/desktop-app-window.js', from: ": doorAct === 'open' ? t('Open your browsing window') : t('Browse yourself');", to: ": t('Take over');", door: true, red: (d) => d.labelIsAct === false },
    { tag: 'unread-is-active', file: 'src/lib/desktop-app-window.js', from: "browserDisplay() ? bseat.seat || 'watch' :", to: "browserDisplay() && bseat.seat ? bseat.seat :", door: true, red: (d) => d.unknownIsWatch === false },
    { tag: 'client-refusal-silent', file: 'src/lib/desktop-app-window.js', from: '    onRefused: (v) => sayClientRefusal(v),', to: '   ', door: true, red: (d) => d.clientRefusalSaid === false },
    { tag: 'toast-on-any-refusal', file: 'src/lib/desktop-app-window.js', from: 'const more = (Number(v.acts) || 0) > bseat.acts;', to: 'const more = (Number(v.refused) || 0) > bseat.refused;', door: true, red: (d) => d.toastOnActs === false },
  ];
  for (const m of MUTANTS) {
    const f = path.join(M, m.file), orig = fs.readFileSync(f, 'utf8');
    if (orig.split(m.from).length !== 2) { ok(false, `mutant ${m.tag}: its line is in ${m.file} exactly once`); continue; }
    fs.writeFileSync(f, orig.replace(m.from, m.to));
    let facts = null;
    try { facts = doorFacts(M); } catch (e) { facts = { error: String(e && e.message || e) }; }
    fs.writeFileSync(f, orig);
    ok(!!facts && !facts.error && m.red(facts), `MUTANT ${m.tag} (${m.file}) ⇒ its leg goes RED`);
  }
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
