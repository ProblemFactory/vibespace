#!/usr/bin/env node
// THE DESKTOP RECORD — §5 THE RAW-WRITER CENSUS + §6 WIRING (fast, text only — lane lg-text-legs-2, B-94d3 part two). MOVED VERBATIM from the
// heavy scripts/test-desktop-record.mjs (§1–§3 PURE, §4 the doors on the real classes, §8–§10 and every behaviour CONTROL stay there): §5's census
// of every held-record write in src/lib/desktop-manager.js, src/lib/layout.js, src/lib/session-lifecycle.js, src/lib/stage-manager.js; §6's wiring
// pins (src/lib/window.js, src/lib/desktop-manager.js, src/lib/command-mode.js, src/lib/layout.js, src/ws-handler.js, src/lib/tab-group.js,
// src/lib/desktop-app-window.js, src/lib/taskbar.js …) and THE GEOMETRY DOOR CENSUS over every src/lib file; and §7's TEXT-ONLY controls of
// those pins ((x), (r5③), (ai), (d) and (b)'s census half). Each file is read BY NAME (the census walks 'src/lib'), so ci.mjs's affected rule
// selects this suite on a change of any of them.
// Run: node scripts/test-desktop-record-pins.mjs
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);   // acorn (the capture census) and the PURE CJS record model
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const J = JSON.stringify;
let pass = 0, fail = 0;
const ok = (c, n, extra) => { if (typeof n !== 'string') throw new TypeError('ok(): the leg name is not a string — a swapped call (scripts/lib/check.mjs)'); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (extra ? '\n    ' + String(extra).slice(0, 700) : '')); } return !!c; };

// ── §5 THE RAW-WRITER CENSUS ─────────────────────────────────────────────────────────────────────────────────────
const CENSUS_FILES = ['src/lib/desktop-manager.js', 'src/lib/layout.js', 'src/lib/session-lifecycle.js', 'src/lib/stage-manager.js'];
const RAW = [
  { kind: 'cache-set', re: /\b_savedStates\.set\(/ },
  { kind: 'windows-assign', re: /\.windows\s*=(?!=)/ },
  { kind: 'windows-mutate', re: /\.windows\.(push|splice|unshift|pop|shift|sort|reverse|fill|copyWithin)\(/ },
  { kind: 'held-write', re: /\.\s*_setRecord\(/ },
];
// every held-record write that is NOT a merge / recordFor result on its own line — each named, with why
const ALLOWED = [
  ['src/lib/desktop-manager.js', 'this._savedStates.set(desktopId, record);', 'cache-set', '_setRecord: THE ONE WRITER'],
  ['src/lib/desktop-manager.js', 'this._setRecord(firstId, legacyState);', 'held-write', 'boot: the legacy top-level record the server sent, as it is'],
  ['src/lib/desktop-manager.js', "if (id !== '__stage__' && dState.autoSave) { this._setRecord(id, dState.autoSave);", 'held-write', 'boot: each desktop\'s record the server sent, as it is'],
  ['src/lib/desktop-manager.js', 'this._setRecord(desktopId, state);', 'held-write', 'noteSent: the record recordFor made that just left this page'],
  ['src/lib/desktop-manager.js', 'this._setRecord(this._activeId, currentState);', 'held-write', 'switchTo: `currentState = this.recordFor(this._activeId)` on the line above'],
  ['src/lib/desktop-manager.js', 'if (this._standsNow?.get(d)?.length) this._setRecord(d, this._standsInto(d, this._savedStates.get(d)));', 'held-write', 'onSyncRefused (B-1d87): a window standing in a row\'s place — _standsInto returns a mergeDesktopRecord result (the ONE capture of that window into the row\'s seat)'],
];
function census(srcs) {
  const out = [];
  for (const [rel, text] of srcs) {
    text.split('\n').forEach((l, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
      for (const r of RAW) {
        if (!r.re.test(l)) continue;
        const merged = r.kind === 'held-write' && /\bmergeDesktopRecord\(|\brecordFor\(/.test(l);
        const row = ALLOWED.find(([f, snip, kind]) => f === rel && kind === r.kind && l.includes(snip));
        out.push({ at: `${rel}:${i + 1}`, kind: r.kind, ok: merged || !!row, row, line: l.trim().slice(0, 140) });
      }
    });
  }
  return out;
}
const sources = (over = {}) => CENSUS_FILES.map((f) => [f, over[f] != null ? over[f] : read(f)]);
console.log('— §5 THE RAW-WRITER CENSUS (a new raw writer of a desktop record is RED by name)');
{
  const sites = census(sources());
  const bad = sites.filter((s) => !s.ok);
  ok(sites.length >= 10 && !bad.length, `§5 every write of a held desktop record (${sites.length}) is the ONE writer, a merge / recordFor result, or named here with why`, J(bad));
  ok(sites.filter((s) => s.kind === 'cache-set').length === 1, '§5 exactly ONE `_savedStates.set(` in the four files (inside _setRecord)', J(sites.filter((s) => s.kind === 'cache-set')));
  ok(!sites.some((s) => s.kind === 'windows-assign' || s.kind === 'windows-mutate'), '§5 no `.windows =` / `.windows.push(…)` on a record anywhere in them (the pre-fix `cached.windows = wins`, `st.windows = kept`, `currentState.windows.push(pw)`)');
  const used = new Set(sites.map((s) => s.row).filter(Boolean));
  ok(ALLOWED.every((r) => used.has(r)) && ALLOWED.every((r) => r[3].length >= 8), '§5 no dead allowlist row; every row says why', J(ALLOWED.filter((r) => !used.has(r)).map((r) => r[1])));
}

// ── §6 WIRING ────────────────────────────────────────────────────────────────────────────────────────────────────
/** verify r3 ①: window.js's two `_boundsAt` stamps — the drag's AFTER the drag threshold gate, the resize's behind `resized`. */
const geomWitnessPin = (src) => {
  const gate = src.indexOf('      if (!dragging) return;\n      dragging = false;\n');
  const stamp = src.indexOf('      win._boundsAt = Date.now();\n');
  return gate > 0 && stamp > gate && stamp - gate < 900 && /if \(resized\) win\._boundsAt = Date\.now\(\);/.test(src) && /pendingEv = e; resized = true;/.test(src) && (src.match(/_boundsAt = Date\.now\(\)/g) || []).length === 3 && /witnessGeometry\(id\) \{\s*const w = this\.windows\.get\(id\); if \(!w\) return;\s*w\._boundsAt = Date\.now\(\);/.test(src); // the two pointer stamps + the ONE helper the user doors call (verify r4 ③)
};
/** verify r4 ③: THE USER DOORS of a geometry act stamp the witness — the title-bar buttons + double-click, snapToHalf (command mode's arrows),
 *  a named window's restore, move mode's restore + placement, the taskbar's minimize / Restore-Minimize row, command mode's m and its cycle's restore. */
const geomDoorsPin = (W, TB, CM) => [
  /this\.witnessGeometry\(winInfo\.id\); this\.minimize\(winInfo\.id\);/.test(W),
  /this\.witnessGeometry\(winInfo\.id\); this\.toggleMaximize\(winInfo\.id\); \};/.test(W),
  /if \(!e\.target\.closest\('\.window-controls'\)\) \{ this\.witnessGeometry\(winInfo\.id\); this\.toggleMaximize\(winInfo\.id\); \}/.test(W),
  /snapToHalf\(winId, side\) \{\s*const win = this\.windows\.get\(winId\); if \(!win\) return;\s*this\.witnessGeometry\(winId\);/.test(W),
  /if \(host\.isMinimized\) \{ this\.witnessGeometry\(focusId\); this\.restore\(focusId\); \}/.test(W),
  /if \(win\.isMinimized\) \{ this\.witnessGeometry\(id\); this\.restore\(id\); \}/.test(W),
  /this\.witnessGeometry\(win\.id\);[^\n]*\n\s*this\._captureGridBounds\(win\);\s*this\._notify\(\);/.test(W),
  /\{ app\.wm\.witnessGeometry\?\.\(id\); app\.wm\.minimize\(id\); \}/.test(TB),
  /run: \(c\) => \{ c\.app\.wm\.witnessGeometry\?\.\(c\.id\); c\.win\.isMinimized \? c\.app\.wm\.restore\(c\.id\) : c\.app\.wm\.minimize\(c\.id\); \}/.test(TB),
  /\{ wm\.witnessGeometry\?\.\(wm\.activeWindowId\); wm\.toggleMaximize\(wm\.activeWindowId\); \}/.test(CM),
  /\{ wm\.witnessGeometry\?\.\(nextId\); wm\.restore\(nextId\); \}/.test(CM),
];
/** verify r5 ③: the doors r4 ③ missed — a layout preset (applyLayout), command mode's digits (snapActiveToCell), the tab tear-off's drop
 *  (tab-group _setupTabDrag), a desktop app's own □ / ▁ (desktop-app-window onAppState), a named preset (layout.js loadPreset ×2). */
const geomDoorsPin2 = (W, TG, DA, L) => [
  /this\.witnessGeometry\(w\.id\);[^\n]*\n\s*this\._positionToCell\(w, cellIdx, true\);/.test(W),
  /this\.witnessGeometry\(win\.id\);[^\n]*\n\s*this\._positionToCell\(win, cellIdx, true\);/.test(W),
  /this\.witnessGeometry\(winId\);[^\n]*\n\s*let snapped = false;/.test(TG),
  // every act-door of desktop-app-window.js (the main window's onAppState, a satellite's onState — 2.369.205) stamps first
  ((DA.match(/if \(act === 'maximize' \|\| act === 'restore'\) app\.wm\.toggleMaximize\(winInfo\.id\);/g) || []).length >= 1
    && (DA.match(/if \(act\) app\.wm\.witnessGeometry\?\.\(winInfo\.id\);[^\n]*\n\s*if \(act === 'maximize' \|\| act === 'restore'\) app\.wm\.toggleMaximize\(winInfo\.id\);/g) || []).length
      === (DA.match(/if \(act === 'maximize' \|\| act === 'restore'\) app\.wm\.toggleMaximize\(winInfo\.id\);/g) || []).length),
  /this\.app\.wm\.witnessGeometry\?\.\(winInfo\.id\);[^\n]*\n\s*\/\/ Restore from minimized if preset says it should be visible/.test(L),
  /this\.app\.wm\.witnessGeometry\?\.\(id\);[^\n]*\n\s*this\.app\.wm\.minimize\(id\);/.test(L),
];
/** verify r5 ③: THE GEOMETRY DOOR CENSUS — grep-derived over every call of a geometry primitive in src/lib (`wm.X(` / `this.X(`): a site
 *  is a call INTO a self-stamping verb (its body stamps — pinned), a site that stamps the witness within the four lines above it, a call
 *  from inside a primitive's own body, or a MACHINE path named in GEOM_MACHINE with its reason. Anything else is a door added without
 *  a witness — RED by file:line. */
const GEOM_PRIMS = ['toggleMaximize', 'minimize', 'restore', 'snapToHalf', 'snapActiveToCell', 'applyLayout', '_snapToGrid', '_snapToGridRange', '_applySnap', '_positionToCell'];
const GEOM_SELF = ['snapToHalf', 'snapActiveToCell', 'applyLayout', 'startMoveMode', 'revealWindow', 'loadPreset'];
const GEOM_MACHINE = [
  ['layout.js', '_applyRemoteState', "the apply of a record — a witness here would hold another client's act for a minute (r3 ①)"],
  ['layout.js', '_createRemoteWindow', 'the apply creating a window the record lists, at its recorded state'],
  ['layout.js', 'restoreState', 'the boot / a replay restoring a record'],
  ['session-lifecycle.js', '_placeCarried', 'a resumed window placed by its record (a replay) — createSession\'s carried place, moved whole (lane phone-resume-keeps-layout r2: an attach of the live session lands where its create would)'],
  ['session-lifecycle.js', '_focusExistingSession', 'a replay found the window minimized (`replay` only; the user path is revealWindow, which stamps)'],
  ['stage-manager.js', '_borrowHero', "the Stage's borrow: a record never applies geometry while staged"],
  ['stage-manager.js', '_handBackHero', "the Stage's return"],
  ['stage-manager.js', '_giveHome', "the Stage hands a split borrowed frame's half its HOME (lane stage-blank r3–r5: a re-maximize over the home px, as _handBackHero does) — the Stage's own placement, never a user act (2.369.199 integration)"],
  ['window.js', '_putBackAfterRefusedDrop', 'a refused drop puts the window back where the drag began — the drag stamped its own witness'],
  ['window.js', '_setupDrag', "the title-bar drag's drop (snap / grid cell / range) — stamped at its pointerup above the drop"],
  ['window.js', 'setFixedSize', "app-fit-fixed (the 2.369.204 integration): a window whose APP fixes its size is restored from maximized before the lock — the app's own size hints (xpra), applied alike on every client, never a user act"],
];
function geomDoorCensus(files) {
  const out = [];
  for (const [file, src] of Object.entries(files)) {
    const lines = src.split('\n'); let enclosing = null;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const m = /^  (?:async )?([A-Za-z_]\w*)\(.*\) \{$/.exec(l) || /^(?:export )?(?:async )?function ([A-Za-z_]\w*)\(/.exec(l);
      if (m) enclosing = m[1];
      if (/^\s*\/\//.test(l)) continue;
      const re = new RegExp(`\\b(?:wm|this)\\.(${GEOM_PRIMS.join('|')})\\(`, 'g'); let c;
      while ((c = re.exec(l))) {
        const verb = c[1], above = lines.slice(Math.max(0, i - 4), i + 1).join('\n');
        const verdict = GEOM_SELF.includes(verb) ? 'self' : /witnessGeometry|_boundsAt = Date\.now\(\)/.test(above) ? 'witnessed' : (GEOM_PRIMS.includes(enclosing) || GEOM_SELF.includes(enclosing)) ? 'inner' : GEOM_MACHINE.some(([f, en]) => f === file && en === enclosing) ? 'machine' : null;
        out.push({ file, line: i + 1, verb, enclosing, verdict });
      }
    }
  }
  return out;
}
const libFiles = () => Object.fromEntries(fs.readdirSync(path.join(REPO, 'src/lib')).filter((f) => f.endsWith('.js')).map((f) => [f, read('src/lib/' + f)]));
/** every self-stamping verb's body stamps (the census trusts the name). */
const selfStampPin = (W, L) => GEOM_SELF.every((v) => { const src = v === 'loadPreset' ? L : W; const i = src.search(new RegExp(`^  (?:async )?${v}\\(`, 'm')); if (i < 0) return false; const body = src.slice(i, src.indexOf('\n  }\n', i)); return /witnessGeometry\??\.?\(/.test(body); });
console.log('— §6 wiring: every door, the belt, the refusal route, the rollback change');
{
  const W = read('src/lib/window.js'), D = read('src/lib/desktop-manager.js'), CM = read('src/lib/command-mode.js'), SL = read('src/lib/session-lifecycle.js'), L = read('src/lib/layout.js'), WS = read('src/ws-handler.js'), PR = read('src/routes/persistence.js'), SM = read('src/lib/stage-manager.js');
  ok(/dm\.moveWindowToDesktop\(win\.id, targetDeskId\);/.test(W) && /if \(winId\) this\.moveWindowToDesktop\(winId, desk\.id, \{ speak: true \}\);/.test(D) && /action: \(\) => this\.moveWindowToDesktop\(winId, d\.id, \{ speak: true \}\)/.test(D) && /dm\.moveWindowToDesktop\(wm\.activeWindowId, dm\.desktops\[next\]\.id, \{ speak: true \}\)/.test(CM), '§6 the doors — the title-bar drop, a taskbar drop, the menu, command mode d/D — all reach moveWindowToDesktop (the one move)');
  ok(/dm\.moveWindowToDesktop\(winInfo\.id, destDesktop, \{ replaces: winBounds\.winId && String\(winBounds\.winId\) !== String\(winInfo\.id\) \? winBounds\.winId : null \}\)/.test(SL) && /desktopId: meta\.id, winId: ws\.winId \|\| ws\.id \|\| null \}/.test(L), '§6 resume placement passes the old record entry it REPLACES (scanStoppedInDesktopStates carries its winId) — none when the row is re-opened under its own id (lane phone-resume-keeps-layout, LAW 1)');
  ok(/this\._updateCachedDesktop\(desktopId, \{ from, ids: members\.map\(\(m\) => m\.id\), replaces: replaces \? \[replaces\] : \[\] \}\);/.test(D), '§6 moveWindowToDesktop hands _updateCachedDesktop the source, the moved chain and what it replaces');
  ok(/for \(const d of dm\?\.takeDirty\?\.\(\) \|\| \[\]\) \{\s*const st = dm\.recordFor\(d\);\s*if \(dm\.holdsBack\?\.\(d, st\)\) continue;[^\n]*\n\s*this\.app\.ws\.send\(\{ type: 'layout-sync', state: st, desktopId: d, evidence: dm\.evidence\(\), sentAt, viewport: this\._viewport\(\), base: dm\.stampOf\?\.\(d\) \}\);/.test(L), '§6 _doAutoSave sends each changed desktop it does not show from its HELD record (recordFor), with the evidence (and the save\'s sentAt — verify r5 ⑤)');
  ok(/const state = dm\?\.recordFor && desktopId \? dm\.recordFor\(desktopId\) : this\.captureState\(\);/.test(L) && /evidence: dm\?\.evidence\?\.\(\) \|\| \[\], sentAt, viewport: this\._viewport\(\), base: desktopId \? dm\?\.stampOf\?\.\(desktopId\) : undefined \}\);/.test(L), '§6 …and the desktop on show through recordFor too (the held record merged with the page), with the evidence');
  ok(/ws\.send\(JSON\.stringify\(\{ type: 'layout-sync-ack', desktopId: desktopId \|\| null, sentAt: data\.sentAt \?\? null, seq: layoutSyncSeqRef\.value, updatedAt: stampNow \}\)\);/.test(WS) && WS.indexOf("type: 'layout-sync-ack'") > WS.indexOf('writeLayouts(layoutData);\n          // Broadcast to other clients') && /if \(msg\.type === 'layout-sync-ack'\) \{ this\._onLayoutAnswer\(msg\.desktopId, msg\.sentAt, \{ refused: false \}\); return; \}/.test(L) && /if \(msg\.type === 'layout-sync-refused'\) \{ this\._onLayoutAnswer\(msg\.desktopId, msg\.sentAt, \{ refused: true \}\); return; \}/.test(L) && (L.match(/this\.noteLayoutSent\(sentDesks, sentAt\);/g) || []).length === 3 && /this\.app\.layoutManager\?\.noteLayoutSent\?\.\(\[desktopId\], sentAt\);/.test(D) && !/_movesSentAt = Date\.now\(\)/.test(L) && !/_releaseHeldCloses\(d\);/.test(L) && /if \(refused\) s\.refused\.add\(key\);/.test(L) && /if \(!s\.refused\.has\(d\)\) this\._markCarried\(d, s\.sentAt\);/.test(L) && /this\.app\.desktopManager\?\.noteCarried\?\.\(key\);/.test(L) && /const ACK_WAIT_MS = 2000;/.test(L) && /if \(!this\._serverAcks && s\.at != null && now - s\.at > ACK_WAIT_MS\)/.test(L), '§6 verify r5 ⑤: THE ACK — the server answers every layout-sync it wrote with `layout-sync-ack {desktopId, sentAt}` AFTER the write; every record the client sends (the autosave\'s, the switch\'s) is owed an answer; an ack carries the acts of that save (a refusal carries nothing); the held closes, ratios and the dirty desks are released at the ack, never at the send; an older server that answers nothing is given ACK_WAIT_MS on an open socket, then today\'s rule');
  ok(/const currentState = this\.recordFor\(this\._activeId\);/.test(D) && /dm\._setRecord\(this\._prevDesktopId, dm\.recordFor\(this\._prevDesktopId\)\);/.test(SM), '§6 the switch\'s and the Stage\'s capture of the desktop being left go through recordFor');
  ok(/else if \(msg\.type === 'layout-sync-refused'\) this\.onSyncRefused\(msg\);/.test(D), '§6 the client routes `layout-sync-refused` to onSyncRefused');
  const beltAt = WS.indexOf('const v = shrinkVerdict({ prev: stored.windows, next: data.state.windows, evidence: data.evidence, alive: (sid) => activeSessions.has(sid), recent: recentArrivals(desktopId, ws), elsewhere: otherRecords(layoutData, desktopId), showing: (sid) => showingElsewhere(ws, sid), refused: refusedHere });'); // + the boxless newcomers this socket was refused for (lane phone-resume-keeps-layout r3 C1)
  const writeAt = WS.indexOf('layoutData.desktops[desktopId].autoSave = { ...data.state, updatedAt: Date.now() };');
  ok(/const \{ shrinkVerdict, windowIds, layerGate \} = require\('\.\/lib\/desktop-record\.js'\);/.test(WS) && beltAt > 0 && writeAt > beltAt, '§6 ws-handler asks the PURE belt BEFORE it writes the desktop record');
  const gateAt = WS.indexOf('const g = layerGate(data.viewport, stored, data.state);');
  ok(gateAt > beltAt && gateAt < writeAt && WS.indexOf("const viewport = data.viewport === 'phone'") > gateAt && /if \(!g\.ok\) \{[\s\S]{0,1200}ws\.send\(JSON\.stringify\(\{ type: 'layout-sync-refused', desktopId, reason: g\.reason, fields: g\.fields, state: stored, sentAt: data\.sentAt \?\? null \}\)\);[\s\S]{0,40}(?:break|return);/.test(WS), '§6 THE LAYER GATE (lane layout-layers-p1): ws-handler asks PURE layerGate with the SYNC\'s own stamp AFTER the shrink belt and BEFORE the stamp is stored and the record written; a refusal tells the sender with the record kept, writes nothing, broadcasts nothing');
  ok(/if \(viewport === 'phone'\) for \(const k of PHONE_KEEPS\) delete chrome\[k\];/.test(D) && /if \(this\.app\.isMobile\) for \(const k of PHONE_KEEPS\) \{ if \(k in held\) state\[k\] = held\[k\]; else delete state\[k\]; \}/.test(D) && !/VIEWPORT_CHROME/.test(D), '§6 the write half: a phone\'s recordFor and presetState carry every record field outside the workspace from the held record (PHONE_KEEPS — the retired VIEWPORT_CHROME carried the sidebar and the grid only)');
  ok(/if \(!v\.ok\) \{[\s\S]{0,1200}ws\.send\(JSON\.stringify\(\{ type: 'layout-sync-refused', desktopId, reason: v\.reason, unexplained: v\.unexplained, arrived: v\.arrived \|\| \[\], \.\.\.\(v\.unplaced\?\.length \? \{ unplaced: v\.unplaced \} : \{\}\), state: stored, sentAt: data\.sentAt \?\? null \}\)\);[\s\S]{0,40}(?:break|return);/.test(WS), '§6 …a refusal tells the SENDER (with the record the server kept, which drops were arrivals, and — lane phone-resume-keeps-layout — which rows would have lost their position), writes nothing and broadcasts nothing (break)');
  const noteAt = WS.indexOf('noteArrivals(desktopId, windowIds(layoutData.desktops[desktopId].autoSave || null), windowIds(data.state.windows), ws);');
  ok(noteAt > beltAt && noteAt < writeAt && /layoutArrivals\.delete\(data\.desktopId\);/.test(WS) && /const ARRIVAL_TTL_MS = 10 \* 60 \* 1000;/.test(WS) && /if \(a\.by !== me\) out\.push\(id\);/.test(WS), '§6 verify r1: what a write ADDS is remembered per desktop against every OTHER socket for 10 min (the belt\'s `recent`), noted after the verdict and before the write; a deleted desktop forgets them');
  ok(/if \(this\._restoring \|\| this\._pointerDown \|\| this\._pendingRemote\.size\) \{ this\._deferRemote\(msg\); return; \}/.test(L) && /this\._pendingRemote\.set\(deferKey\(msg\), msg\);/.test(L) && !/if \(msg\.type !== 'layout-sync' \|\| this\._restoring\) return;/.test(L), '§6 verify r1: a layout-sync under a gate is deferred PER DESKTOP (never dropped under `_restoring`, never one slot for all)');
  ok(/if \(this\._connects\+\+ > 0\) setTimeout\(\(\) => this\._resyncFromServer\(\), 250\);/.test(L) && /this\._applyRemoteState\(msg\.state, \{ closeOnlyWired: !!msg\.resync, receivedAt, writer: writerClass\(msg\), dupsLeft: msg\.dupsLeft \}\);/.test(L) && /if \(closeOnlyWired && !this\.app\.desktopManager\?\.wireListed\?\.\(activeDesk, id\)\) continue;/.test(L), '§6 verify r1: a reconnect re-reads /api/layouts through the ordinary inbound path, closing only what the wire listed');
  ok(/msg\.receivedAt = Date\.now\(\);/.test(L) && /const receivedAt = msg\.receivedAt \?\? Date\.now\(\);/.test(L) && (L.match(/if \(this\.actHeld\(win\._movedAt, receivedAt, win\)\) \{ heldMoved = true; continue; \}/g) || []).length === 2 && /if \(heldMoved\) setTimeout\(\(\) => this\._resendHeldMove\(\), 1000\);/.test(L) && /dm\.cacheRemoteState\(msg\.desktopId, msg\.state, \{ receivedAt, dupsLeft: msg\.dupsLeft \}\);/.test(L) && /&& !this\.app\.layoutManager\?\.actHeld\?\.\(w\._movedAt, receivedAt, w\)\)/.test(D) && /m\._movedAt = movedAt;/.test(D), '§6 verify r2: THE HELD MOVE — every inbound record is stamped when it lands, a move stamps its windows, the apply\'s update loop / close loop and the cached sweep skip a window moved after the record arrived, and the move is re-sent once');
  ok((W.match(/win\._boundsAt = Date\.now\(\);/g) || []).length === 2 && /const heldGeom = this\.actHeld\(win\._boundsAt, receivedAt, win\);/.test(L) && /if \(a && a\.gridBounds && !heldGeom\) \{/.test(L) && /const t = Math\.max\(w\._movedAt \|\| 0, w\._boundsAt \|\| 0\);/.test(L), '§6 verify r2 ⑩: THE HELD GEOMETRY — window.js stamps the drag\'s and the resize\'s pointerup, the apply keeps the user\'s box / maximize / minimize over a record received before it, and the re-send carries it');
  ok(/return t >= receivedAt \|\| t > \(win \? this\._carriedAt\(win\._desktopId\) : \(this\._movesSentAt \|\| 0\)\);/.test(L) && /if \(!\(t > 0\) \|\| Date\.now\(\) - t > ACT_HOLD_MS\) return false;/.test(L) && /const ACT_HOLD_MS = 60000;/.test(L), '§6 verify r4 ①: THE UNSAVED ACT — a witness holds over a record while no save the server READ has carried the act (the window\'s desktop `_carriedAt`, verify r5 ⑤), or when the record landed before it; bounded by ACT_HOLD_MS (guard 2\'s expiry)');
  ok(/if \(to\) \{[\s\S]{0,700}if \(to === from \|\| to === '__stage__'\) return null;\s*dest = to;\s*\} else \{/.test(D), '§6 verify r4 ②: adoptRemoteMove told the destination answers it or nothing — the held-record search is the close loop\'s and the sweep\'s alone');
  { const doors = geomDoorsPin(W, read('src/lib/taskbar.js'), CM); ok(doors.every(Boolean), '§6 verify r4 ③: every USER door of a geometry act stamps the witness (the □ / ▁ buttons, the double-click, snapToHalf, a named window\'s restore, move mode, the taskbar row + menu, command mode m + cycle) — and no programmatic caller does (the apply, the boot, a replay, a preset, the Stage)', J(doors)); }
  { const lp = L.search(/^  async loadPreset\(name\) \{/m), lpEnd = L.indexOf('\n  }\n', lp); const inPreset = (L.slice(lp, lpEnd).match(/witnessGeometry/g) || []).length;
    ok(lp > 0 && inPreset === 2 && (L.match(/witnessGeometry/g) || []).length === 2 && !/witnessGeometry/.test(SM) && !/witnessGeometry/.test(SL), '§6 verify r4 ③ / r5 ③: …the apply / the boot restore (layout.js) stamp nothing — its ONLY stamps are the named preset\'s (loadPreset, a user\'s click); the Stage and a session replay never stamp (a replay-stamped witness would hold another client\'s act for a minute and re-send the old state over it)', J([lp, inPreset, (L.match(/witnessGeometry/g) || []).length])); }
  { const TG = read('src/lib/tab-group.js'), DA = read('src/lib/desktop-app-window.js'); const d2 = geomDoorsPin2(W, TG, DA, L); ok(d2.every(Boolean), '§6 verify r5 ③: the doors r4 ③ missed stamp the witness — a layout preset (applyLayout, every window it places), command mode\'s digits (snapActiveToCell), the tab tear-off\'s drop, a desktop app\'s own □ / ▁, a named preset (loadPreset: each placed window + each one it minimizes)', J(d2)); }
  ok(selfStampPin(W, L), '§6 verify r5 ③: every verb the census trusts by name stamps in its own body (snapToHalf, snapActiveToCell, applyLayout, startMoveMode, revealWindow, loadPreset)');
  { const TG = read('src/lib/tab-group.js'); const bodyOf = (v) => { const i = TG.search(new RegExp(`^  ${v}\\(`, 'm')); return i < 0 ? '' : TG.slice(i, TG.indexOf('\n  },\n', i)); };
    const stamping = ['createTabChain', 'addToTabChain', 'bindSplit', 'unbindSplit', 'swapSplit', 'moveTabInChain', '_restoreChainLayout'], silent = ['applyChainRecord', 'restoreTabChain', '_detachFromChain', '_ungroupLast', 'removeFromTabChain'];
    ok(stamping.every((v) => /this\.witnessChain\(chain/.test(bodyOf(v))) && silent.every((v) => !/witnessChain/.test(bodyOf(v))) && /onTornOff\?\.\(win, frame\); \} catch[^\n]*\n\s*this\.witnessChain\(chain, \[winId\]\);/.test(TG) && /witnessChain\(chain, extra = \[\]\) \{\s*const t = Date\.now\(\);\s*for \(const id of \[\.\.\.\(\(chain && chain\.tabs\) \|\| \[\]\), \.\.\.extra\]\) \{ const w = this\.windows\.get\(id\); if \(w\) w\._chainAt = t; \}/.test(TG), '§6 verify r5 ②: THE CHAIN WITNESS — every structural verb of a group stamps it (createTabChain, addToTabChain, bindSplit, unbindSplit, swapSplit, moveTabInChain, the Undo\'s _restoreChainLayout, the tear-off\'s detach site with the window that left); the apply\'s and the restore\'s paths (applyChainRecord, restoreTabChain, _detachFromChain, _ungroupLast, removeFromTabChain) never do', J([stamping.filter((v) => !/this\.witnessChain\(chain/.test(bodyOf(v))), silent.filter((v) => /witnessChain/.test(bodyOf(v)))]));
    ok(/if \(this\.actHeld\(w\._chainAt, receivedAt, w\)\) \{ heldKept = true; continue; \}/.test(L) && /return m && this\.actHeld\(m\._chainAt, receivedAt, m\); \}\)\) \{ heldKept = true; continue; \}/.test(L) && /w\._chainAt > this\._carriedAt\(w\._desktopId\) && now - w\._chainAt <= ACT_HOLD_MS\) at = Math\.max\(at, w\._chainAt\);/.test(L) && /Math\.max\(w\._movedAt \|\| 0, w\._boundsAt \|\| 0, w\._chainAt \|\| 0\)/.test(L) && /if \(fresh\(w\._chainAt\) && w\._chainAt > carried\) \{ w\._chainAt \+= gap; n\+\+; \}/.test(L), '§6 verify r5 ②: …the apply keeps a held group as it is (the break loop) and never rebuilds a record\'s group around a held member (the create loop); the held chain is re-sent, counted at a stale release and re-armed after a sleep like every witness'); }
  { const rows = geomDoorCensus(libFiles()); const bad = rows.filter((r) => !r.verdict); ok(rows.length >= 35 && bad.length === 0, `§6 verify r5 ③: THE GEOMETRY DOOR CENSUS — every call of a geometry primitive in src/lib (${rows.length} sites) is a self-stamping verb, a witnessed door, a primitive's own body or a named machine path; a new door without a witness is RED by name`, J(bad.map((r) => `${r.file}:${r.line} ${r.verb} in ${r.enclosing}`)));
    ok(GEOM_MACHINE.every(([f, en]) => rows.some((r) => r.file === f && r.enclosing === en && r.verdict === 'machine')), '§6 …and no dead machine row (every allowlisted path still has a site)', J(GEOM_MACHINE.filter(([f, en]) => !rows.some((r) => r.file === f && r.enclosing === en)))); }
  ok(geomWitnessPin(W), '§6 verify r3 ①: the geometry witness is stamped only by a press that DRAGGED (after `if (!dragging) return;`) or a handle press that MOVED (`if (resized)`) — a click-to-focus on a title bar holds no geometry');
  ok(/this\.app\.desktopManager\?\.adoptRemoteMove\?\.\(win, win\._desktopId, \{ to: this\.app\.desktopManager\.activeDesktopId, rec: \{ \.\.\.rw, \.\.\.a \} \}\);/.test(L) && /if \(this\.app\.desktopManager\?\.adoptRemoteMove\?\.\(win, activeDesk\)\) continue;/.test(L) && /\.filter\(\(w\) => !this\.adoptRemoteMove\(w, desktopId\)\)/.test(D), '§6 verify r1: a remote move is adopted at all three sites — the apply\'s update loop (in), its close loop (out), the cached record\'s gone sweep');
  ok(/const \{ desktopChanges \} = require\('\.\.\/lib\/desktop-record\.js'\);/.test(PR) && /snapshotLayout\(_lastGood, nextShape, data, \{ writer, refused: _ringNotes\.refused \}\);/.test(PR) && /totalWindows: total, change, \.\.\.seen \}\);/.test(PR), '§6 a rollback point records the change that FOLLOWED it (routes/persistence.js; its own legs: test-layout-history)');
  const orphanAt = WS.indexOf("if (desktopId && Array.isArray(layoutData.desktopMeta) && layoutData.desktopMeta.length && !layoutData.desktopMeta.some((d) => d && d.id === desktopId)) {");
  ok(orphanAt > 0 && orphanAt < beltAt && /reason: 'no-such-desktop', desktops: layoutData\.desktopMeta, sentAt: data\.sentAt \?\? null \}\)\);[\s\S]{0,40}(?:break|return);/.test(WS.slice(orphanAt, orphanAt + 1200)) && /if \(msg\?\.reason === 'no-such-desktop'\) \{ if \(Array\.isArray\(msg\.desktops\)\) this\._onRemoteDesktopUpdated\(\{ desktops: msg\.desktops \}\); return; \}/.test(D), '§6 verify r2 ⑦: a per-desktop write for a desktop the meta does not name is refused BEFORE the belt (`no-such-desktop`, the meta rides the refusal, nothing written) and the client drops the desktop as a desktop-updated would');
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const keys = ['{names} on “{desktop}” were kept — this page had not opened them yet', '{names} on “{desktop}” were kept — this page had not opened them yet (refused {n} times)', 'This page and the server disagree about desktop “{desktop}” — reload to take the server\'s record', 'Then: {changes}', 'The layout could not be re-read after reconnecting — window changes on this page are held until it can be', 'The layout was re-read — window changes made on this page more than a minute ago were not kept ({n})', '{names} on “{desktop}” kept their places — this page had no position to give them', '{names} on “{desktop}” kept their places — this page had no position to give them (refused {n} times)', 'Resumed {n} conversations where they were', 'Resumed 1 conversation where it was', '{n} windows · not placed — opening this desktop lays them out', '1 window · not placed — opening this desktop lays it out', '{names} on “{desktop}” kept their places — this page had no position to give them; {others} were kept too — this page had not opened them yet', '{names} on “{desktop}” kept their places — this page had no position to give them; {others} were kept too — this page had not opened them yet (refused {n} times)'];
  ok(keys.every((k) => zh.includes(J(k) + ':') && ja.includes(J(k) + ':')), '§6 the new words have zh AND ja entries', J(keys.filter((k) => !zh.includes(J(k) + ':') || !ja.includes(J(k) + ':'))));
}

console.log('— §7 the TEXT-ONLY controls of §5 / §6 (patched source strings, never a module run)');
{
  const DSRC = read('src/lib/desktop-manager.js');   // the heavy's §7 block reads it once for every control
  // (x) verify r3 ①: the witness stamped by every title-bar release (a click-to-focus included) / a handle press that never moved
  {
    const WSRC = read('src/lib/window.js');
    ok(geomWitnessPin(WSRC), 'control click-witness: the real window.js passes the pin');
    const gate = '      if (!dragging) return;\n      dragging = false;\n', stamp = '      win._boundsAt = Date.now();\n';
    const g = WSRC.indexOf(gate), k = WSRC.indexOf(stamp, g + gate.length); // r2's placement: the stamp before the gate, the one after it gone
    const before = WSRC.slice(0, g) + stamp + WSRC.slice(g, k) + WSRC.slice(k + stamp.length);
    ok(!geomWitnessPin(before), 'control click-witness: the stamp moved back BEFORE the drag gate (every press stamps) is RED by the pin');
    ok(!geomWitnessPin(WSRC.replace('if (resized) win._boundsAt = Date.now();', 'win._boundsAt = Date.now();')), 'control click-witness: a resize stamp without its `resized` guard is RED by the pin');
  }
  // (r5③) a door planted without a witness is RED by the census; each new stamp removed is RED by the doors pin
  {
    const files = libFiles();
    const planted = { ...files, 'window.js': files['window.js'] + '\n  _plantedDoor(id) {\n    this.toggleMaximize(id);\n  }\n' };
    const bad = geomDoorCensus(planted).filter((r) => !r.verdict);
    ok(bad.length === 1 && /window\.js:\d+ toggleMaximize in _plantedDoor/.test(`${bad[0].file}:${bad[0].line} ${bad[0].verb} in ${bad[0].enclosing}`), 'control planted-door: a new call of a geometry primitive with no witness, no self-stamping verb and no machine row is RED by name', J(bad));
    const WSRC = files['window.js'], TGSRC = files['tab-group.js'], DASRC = files['desktop-app-window.js'], LSRC = files['layout.js'];
    const cases = [
      ['window.js applyLayout', geomDoorsPin2(WSRC.replace("      this.witnessGeometry(w.id); // a preset is the user's act", "      // a preset is the user's act"), TGSRC, DASRC, LSRC)],
      ['window.js snapActiveToCell', geomDoorsPin2(WSRC.replace("    this.witnessGeometry(win.id); // command mode's digits", "    // command mode's digits"), TGSRC, DASRC, LSRC)],
      ['tab-group.js tear-off', geomDoorsPin2(WSRC, TGSRC.replace("      this.witnessGeometry(winId); // the tear-off's drop", "      // the tear-off's drop"), DASRC, LSRC)],
      ['desktop-app-window.js onAppState', geomDoorsPin2(WSRC, TGSRC, DASRC.replace("    if (act) app.wm.witnessGeometry?.(winInfo.id);", "    //"), LSRC)],
      ['desktop-app-window.js a satellite\'s onState (2.369.205)', geomDoorsPin2(WSRC, TGSRC, DASRC.replace("      if (act) app.wm.witnessGeometry?.(winInfo.id);\n      if (act === 'maximize'", "      //\n      if (act === 'maximize'"), LSRC)],
      ['layout.js loadPreset', geomDoorsPin2(WSRC, TGSRC, DASRC, LSRC.replace("      this.app.wm.witnessGeometry?.(winInfo.id); // a named preset", "      // a named preset"))],
    ];
    for (const [name, d] of cases) ok(!d.every(Boolean), `control door-unwitnessed (r5 ③): ${name} without its stamp is RED by the doors pin`, J(d));
    ok(!selfStampPin(WSRC.replace("      this.witnessGeometry(w.id); // a preset is the user's act", "      // a preset is the user's act"), LSRC), 'control self-stamp: applyLayout without its stamp is RED by the self-stamping pin (the census trusts the name)');
  }
  // (ai) verify r4 ③: a door that stamps nothing — the □ button, snapToHalf, the taskbar row, command mode's m — each RED by the doors pin; the helper gone RED by the witness pin
  {
    const WSRC = read('src/lib/window.js'), TBSRC = read('src/lib/taskbar.js'), CMSRC = read('src/lib/command-mode.js');
    const cases = [
      ['window.js □', geomDoorsPin(WSRC.replace('this.witnessGeometry(winInfo.id); this.toggleMaximize(winInfo.id); };', 'this.toggleMaximize(winInfo.id); };'), TBSRC, CMSRC)],
      ['window.js snapToHalf', geomDoorsPin(WSRC.replace('    this.witnessGeometry(winId); // command mode', '    // command mode'), TBSRC, CMSRC)],
      ['taskbar.js row', geomDoorsPin(WSRC, TBSRC.replace('{ app.wm.witnessGeometry?.(id); app.wm.minimize(id); }', 'app.wm.minimize(id);'), CMSRC)],
      ['command-mode.js m', geomDoorsPin(WSRC, TBSRC, CMSRC.replace('{ wm.witnessGeometry?.(wm.activeWindowId); wm.toggleMaximize(wm.activeWindowId); }', 'wm.toggleMaximize(wm.activeWindowId);'))],
    ];
    for (const [name, d] of cases) ok(!d.every(Boolean), `control door-unwitnessed: ${name} without its stamp is RED by the doors pin`, J(d));
    ok(!geomWitnessPin(WSRC.replace('    w._boundsAt = Date.now();\n    const host', '    const host')), 'control door-unwitnessed: the helper that stamps nothing is RED by the witness pin');
  }
  // (b) the pre-fix _updateCachedDesktop (2.369.198, byte for byte in its body)
  {
    const start = DSRC.indexOf('  _updateCachedDesktop(desktopId, { from = null, ids = [], replaces = [] } = {}) {\n');
    const end = DSRC.indexOf('\n  }\n', start);
    ok(start > 0 && end > start, 'control pre-fix-cache: _updateCachedDesktop found in desktop-manager.js');
    const PRE = `  _updateCachedDesktop(desktopId) {
    if (desktopId === this._activeId) return;
    const cached = this._savedStates.get(desktopId) || { windows: [] };
    const wins = [];
    for (const [id, win] of this.app.wm.windows) {
      if (win._desktopId !== desktopId) continue;
      wins.push({
        winId: id, gridBounds: win.gridBounds,
        isMinimized: false, openSpec: win._openSpec,
      });
    }
    cached.windows = wins;
    this._savedStates.set(desktopId, cached);`;
    const mut = DSRC.slice(0, start) + PRE + DSRC.slice(end);
    const bad = census(sources({ 'src/lib/desktop-manager.js': mut })).filter((s) => !s.ok);
    ok(bad.length === 2 && bad.some((s) => /cached\.windows = wins/.test(s.line)) && bad.some((s) => /_savedStates\.set\(desktopId, cached\)/.test(s.line)), '§5 control: …and the CENSUS names its two raw writes by line', J(bad));
  }
  // (ch) verify r5 ②'s TEXT half: a verb's stamp gone is RED by the pin (its hold half — doorLegs over a patched layout.js — stays in the heavy)
  {
    const TGSRC = read('src/lib/tab-group.js');
    const unst = TGSRC.replace("    enterSplit(chain, { anchorId: anchorWin.id, guestId: guestWin.id, side });\n    this.witnessChain(chain); // this page's act (verify r5 ②)", "    enterSplit(chain, { anchorId: anchorWin.id, guestId: guestWin.id, side });");
    const bodyOf = (src, v) => { const i = src.search(new RegExp(`^  ${v}\\(`, 'm')); return i < 0 ? '' : src.slice(i, src.indexOf('\n  },\n', i)); };
    ok(unst !== TGSRC && /this\.witnessChain\(chain/.test(bodyOf(TGSRC, 'bindSplit')) && !/this\.witnessChain\(chain/.test(bodyOf(unst, 'bindSplit')), 'control verb-unstamped: bindSplit without its stamp is RED by the chain witness pin');
  }
  // (d) a NEW raw writer of a held record (a purge written the old way)
  {
    const find = "      this._setRecord(desk, mergeDesktopRecord({ record: st, remove: [winId] }));";
    ok(DSRC.split(find).length === 2, 'control raw-writer: the patched line exists once in desktop-manager.js');
    const mut = DSRC.replace(find, '      st.windows = st.windows.filter((w) => (w.winId || w.id) !== winId);');
    const bad = census(sources({ 'src/lib/desktop-manager.js': mut })).filter((s) => !s.ok);
    ok(bad.length === 1 && bad[0].kind === 'windows-assign' && /st\.windows = st\.windows\.filter/.test(bad[0].line), 'control raw-writer: a new raw write of a held record is RED under §5, and only it', J(bad));
  }
}

/** Every key layout.js's capture writes into a record (acorn — comments / strings never count): captureWin's entry and
 *  its assignments ('tabChain.<key>' for the chain's), captureChrome's and captureState's returned fields. */
function captureKeys(text) {
  const ast = require('acorn').parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
  const keys = new Set();
  const propKeys = (o) => o.properties.filter((p) => p.type === 'Property' && !p.computed).map((p) => (p.key.type === 'Identifier' ? p.key.name : String(p.key.value)));
  const pathOf = (m) => { const st = []; while (m.type === 'MemberExpression' && !m.computed) { st.unshift(m.property.name); m = m.object; } return m.type === 'Identifier' ? [m.name, ...st] : null; };
  const visit = (node, meth) => {
    if (!node || typeof node.type !== 'string') return;
    if (node.type === 'MethodDefinition' && node.key) meth = node.key.name;
    if (meth === 'captureWin' && node.type === 'VariableDeclarator' && node.id.name === 'winState' && node.init && node.init.type === 'ObjectExpression') propKeys(node.init).forEach((k) => keys.add(k));
    if (meth === 'captureWin' && node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression') {
      const p = pathOf(node.left);
      if (p && p[0] === 'winState' && p.length > 1) { const f = p.slice(1).join('.'); keys.add(f); if (p.length === 2 && node.right.type === 'ObjectExpression') propKeys(node.right).forEach((k) => keys.add(f + '.' + k)); }
    }
    if ((meth === 'captureChrome' || meth === 'captureState') && node.type === 'ReturnStatement' && node.argument && node.argument.type === 'ObjectExpression') propKeys(node.argument).forEach((k) => keys.add(k));
    for (const k of Object.keys(node)) { const c = node[k]; if (Array.isArray(c)) c.forEach((x) => visit(x, meth)); else if (c && typeof c.type === 'string') visit(c, meth); }
  };
  visit(ast, null);
  return [...keys];
}

console.log('— §8 THE CAPTURE CENSUS over src/lib/layout.js (COPIED VERBATIM from the heavy scripts/test-desktop-record.mjs layerLegs — lane gmail-connect-wall,\n'
  + '  B-94d3 remainder: the heavy keeps its copy, which its LAYER LAW controls re-run on patched models; this copy runs over the real model in every lane\'s gate)');
{
  const { layerOf } = require(path.join(REPO, 'src/lib/desktop-record.js'));
  const leg = ok;
  const LT = read('src/lib/layout.js');
  const cap = captureKeys(LT);
  const capBad = cap.filter((k) => layerOf(k) == null);
  leg(cap.length >= 35 && !capBad.length, `§8 THE CAPTURE CENSUS (acorn over layout.js captureWin / captureChrome / captureState): every key a page writes into a record (${cap.length}) has a layer`, J({ capBad, cap }));
  const SNAP = '      if (win._isSnapped) { winState.isSnapped = true;';
  leg(LT.includes(SNAP) && J(captureKeys(LT.replace(SNAP, '      winState.dockSide = win._dock;\n' + SNAP)).filter((k) => layerOf(k) == null)) === J(['dockSide']), '§8 RED control: a capture writing a field no layer names (winState.dockSide) is RED, by name');
  leg(!captureKeys(LT.replace('  captureWin(win, id = win?.id) {', "  // winState.dockSide = win._dock; 'winState.sidebarWidth = 1'\n  captureWin(win, id = win?.id) {")).filter((k) => layerOf(k) == null).length, '§8 control: the same assignment in a comment and a string captures nothing (acorn reads code only)');
}

console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
