import { cssVarDefault, escHtml, showContextMenu, showInputDialog, showToast, uiScale } from './utils.js';
import { startPointerDrag } from './drag-feed.js'; // THE feed for every drag door (lane-drag-release verify r2 census)
import { t } from './i18n.js';
import { switcherForm, TILE_MIN_PX, STRIP_MIN_TILES, OVERFLOW_CHIP_PX, OVERFLOW_CHIP_WARM_PX } from './taskbar-fit.js'; // PURE (lane desktop-small): the switcher folds to ONE button when the desktops crowd the tiles out
import { sheetRows } from './desktop-switch-sheet.js'; // int358 seam: the compact list's rows = the phone sheet's (PURE desktopRows over ONE input)
import { desktopDoors, doorItems } from '../desktop-switch.js'; // lane desktop-doors-table: THE desktop doors — one PURE table for every surface
import { UI_ICONS } from './icons.js'; // a compact-list row's ⋯ (lane desktop-small r2 ①)
import { menuPlace } from './menu-place.js'; // PURE: THE ONE placement — the compact list at its open and after every patch (lane desktop-doors-table r4)
import { stageRefusalSentence } from './stage-rules.js'; // inc-muly2izg-cks3: the Stage's move refusal, in words (PURE)
import { mergeDesktopRecord, windowIds, captureForViewport, PHONE_KEEPS } from './desktop-record.js';
import { isNameless, isSession } from './desktop-record.js'; // PURE (lane layout-stopped-window): a window never written nameless; a session window never 'unbuilt' // userW inc-mun7qjmw-iksh: a held record is a VIEW — every write merges (PURE)
import { duplicatesOf, refusalKey, namesOf, doorSessionOf } from './desktop-record.js'; // PURE (userW inc-mw1ogdno-5jny): one conversation, one window entry; a refusal is said once; a copy by the session its door attaches (r9)
import { conversationOf, hostOf, hasBox, placeholderBoxes } from './desktop-record.js'; // PURE (lane phone-resume-keeps-layout): a resume re-opens its row; a row with no position is drawn, never nothing
import { withoutMembers, withMembersBack, chainSyncKey } from './chain-layout.js'; // r2 (inc-mw1ogdno-5jny): a copy that leaves takes its place in its tab group with it; r4: a kept one keeps it
import { deferKeysOf } from './layout-model.js'; // B-4767: a desktop's deferred records wait in one slot per writer class (PURE)
import { noteStamp } from './layout-model.js'; // lane layout-stale-record-sync: the newest server stamp seen per desktop — each write's `base` (PURE)
import { paintPreviews, warmthDrawn } from './warmth-chrome.js'; // lane cache-warmth-band (q-059 r1b): the previews' prompt-cache tiers

const SPRING_MS = 350; // a window drag held this long on the compact switcher springs its list open (lane desktop-small r2 ①)

/** A window this page tried to build (a desktop's first visit, the boot restore) and that is still absent this long
 *  after is one it cannot build: the record drops it, and says so to the server's belt ('unbuilt'). Before that it is
 *  in flight and stays in the record (the 2.141.1 fast-switch protection, now bounded). */
const BUILD_GRACE_MS = 20000;
/** How long a window this page closed / moved / could not build stays in the evidence every layout-sync carries. */
const DEPARTED_TTL_MS = 10 * 60 * 1000;
const DEPARTED_CAP = 200;
/** A refusal's toast is said once per desktop and reason in this long; a repeat inside it is counted, never shown (inc-mw1ogdno-5jny). */
const REFUSAL_TOAST_MS = 30000;
/** The entries of `record` whose recorded tab chain names `id`, each with the chain read WITHOUT it (chain-layout withoutMembers:
 *  the host promoted, a split that lost its pair decided there) — none left to group ⇒ the entry stands alone (r2). */
/** `record` with every row's tab chain read WITHOUT `ids` (chain-layout withoutMembers; a row left alone stands alone) — r3 G. */
function chainsWithout(record, ids) {
  return ids.reduce((r, id) => mergeDesktopRecord({ record: r, add: chainWithout(r, id) }), record); // THE ONE writer: `add` replaces each row in place
}
function chainWithout(record, id) {
  const out = [];
  for (const w of (record && record.windows) || []) {
    const wid = String(w && (w.winId || w.id));
    if (!w || wid === String(id) || !w.tabChain || !Array.isArray(w.tabChain.tabs) || !w.tabChain.tabs.map(String).includes(String(id))) continue;
    const c = withoutMembers(w.tabChain, [String(id)]);
    const e = { ...w };
    if (c) { e.tabChain = c; e.isTabGuest = String(c.tabs[0]) !== wid; } else { delete e.tabChain; delete e.isTabGuest; }
    out.push(e);
  }
  return out;
}

const rowId = (w) => String(w && (w.winId || w.id));
const withChain = (row, c) => { const e = { ...row }; if (c) { e.tabChain = JSON.parse(JSON.stringify(c)); e.isTabGuest = String(c.tabs[0]) !== rowId(row); } else { delete e.tabChain; delete e.isTabGuest; } return e; };
/** A KEPT COPY RIDES ITS GROUP (r4 I — the r3 acceptance: a refused dedup's copy stayed a kept row carrying the server's chain
 *  while the page's own members were captured loose, or regrouped by the person — 'chain-disagrees' for the page's life, every
 *  act on that desktop lost): `ghosts` = the rows of `held` this page CARRIES and does not build (DesktopManager.ghostsOf);
 *  `built` = its captures. A ghost whose recorded group has members the page built rides the group the first of them is in
 *  (chain-layout withMembersBack: the record's own group when nothing changed; the person's group with the ghost in its old
 *  place when they changed it) — that group's every row is written with it. None of them grouped here: the record's group
 *  could not show here (one non-ghost member) ⇒ as recorded, those rows with it; else the page's person took it apart ⇒ the
 *  ghost stands alone. No member built ⇒ its row as the record holds it. The page's rows and its carried rows therefore never
 *  disagree about a group. → {built, rows: the ghosts' rows to write}. PURE (no input mutated). */
function rideKept(held, built, ghosts) {
  const out = (built || []).map((b) => ({ ...b }));
  const rows = new Map();
  for (const w of (held && held.windows) || []) if (w) rows.set(rowId(w), w);
  const byId = new Map(out.map((b) => [rowId(b), b]));
  const ghost = new Set((ghosts || []).map(String).filter((id) => rows.has(id) && !byId.has(id)));
  const set = (c) => { for (const m of c.tabs) { const i = out.findIndex((b) => rowId(b) === String(m)); if (i >= 0) { out[i] = withChain(out[i], c); byId.set(String(m), out[i]); } } };
  const said = new Map(), groups = [];
  for (const id of ghost) {
    const was = rows.get(id).tabChain;
    if (!was || !Array.isArray(was.tabs)) continue;
    const co = was.tabs.map(String).filter((m) => m !== id && byId.has(m));
    if (!co.length) continue; // none of its group built here: its row as the record holds it
    const anchor = co.find((m) => byId.get(m).tabChain);
    if (anchor) { const k = rowId(byId.get(anchor)) + '|' + chainSyncKey(was), g = groups.find((x) => x.k === k); if (g) g.ids.push(id); else groups.push({ k, anchor, was, ids: [id] }); continue; }
    if (withoutMembers(was, was.tabs.map(String).filter((m) => ghost.has(m)))) { said.set(id, null); continue; } // taken apart here: it stands alone
    said.set(id, was); set(was); // the record's group could not show here: as recorded
  }
  for (const g of groups) {
    const c = withMembersBack(byId.get(g.anchor).tabChain, g.was, g.ids);
    if (!c) { for (const id of g.ids) said.set(id, null); continue; }
    set(c);
    for (const id of c.tabs) if (ghost.has(String(id))) said.set(String(id), c);
  }
  return { built: out, rows: [...said].map(([id, c]) => withChain(rows.get(id), c)) };
}

/**
 * DesktopManager — virtual desktop system.
 * Each desktop has its own set of windows, grid mode, and layout state.
 * Multiple clients can view different desktops simultaneously.
 */
export class DesktopManager {
  constructor(app) {
    this.app = app;
    this._desktops = [];           // [{ id, name }]
    this._activeId = null;
    this._savedStates = new Map(); // desktopId → capturedState (cached layout for non-active desktops)
    this._wireIds = new Map();     // desktopId → Set of window ids its LAST record on the wire listed (sent, applied or loaded) — the base a newer remote record is diffed against (inc-mukeyzpt-lpou)
    this._restoring = false;
    // userW inc-mun7qjmw-iksh: the desktops this page CHANGED but does not show (a move's target and source) — the
    // next autosave sends their HELD record (never a list derived from the page); the build attempts (winId → {desk,
    // at}); the evidence ledger (winId → {why, at}) every layout-sync carries for the server's shrink belt
    this._dirtyDesks = new Set();
    this._buildAttempts = new Map();
    this._departed = new Map();
    // THE BASE (lane layout-stale-record-sync, §6b guard 11): desktopId → the newest server stamp (`updatedAt`) this page has
    // seen of that desktop's record — the boot read, a relayed record, its own write's ack, a refusal's record kept
    this._stamps = new Map();
    // A REFUSAL NEVER RE-SENDS THE RECORD IT REFUSED (userW inc-mw1ogdno-5jny — 222 refusals in 130 s): the windows the server
    // KEPT against this page's drop (desktopId → Set of ids — never dropped again by this page until the person closes one or
    // the page reloads); per desktop the last refusal {key, n, json, said} (the breaker: the record it refused is never sent
    // unchanged; ≥ 2 refusals of one key are said ONCE); the record last sent per desktop; the refusal toasts said lately
    this._kept = new Map();
    this._refusals = new Map();
    this._sentJson = new Map();
    this._refusalToasts = new Map();

    // Listen for desktop metadata updates from other clients
    app.ws.onGlobal((msg) => {
      if (msg.type === 'desktop-updated') this._onRemoteDesktopUpdated(msg);
      else if (msg.type === 'layout-sync-refused') this.onSyncRefused(msg);
      else if (msg.type === 'layout-sync-ack' && msg.desktopId) { this._refusals?.delete(msg.desktopId); this._settleAsked(msg.desktopId, true, msg.sentAt); } // a write of it was accepted: the disagreement is over (and a dedup it carried stands — r3 G)
    });
    // A LATE REVEAL NEVER TAKES THE PERSON BACK (r3 H): a press of a key or a pointer anywhere is the person's act — a reveal still
    // waiting for its window retires (_revealWhenBuilt)
    try { for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, (e) => this._noteAct(e && e.target), { capture: true, passive: true }); } catch { }

    // Taskbar resize handle (drag top edge to resize)
    this._setupTaskbarResize();
    this._setupToolbarResize();

    // Re-adapt sizes when preview ratio changes
    app.settings?.on('taskbar.desktopPreviewRatio', () => {
      const taskbar = document.getElementById('taskbar');
      if (taskbar) this._adaptTaskbarSize(taskbar.offsetHeight);
    });
  }

  get activeDesktopId() { return this._activeId; }

  /** THE BASE every layout-sync of `desktopId` names (lane layout-stale-record-sync): the server refuses a write whose base is
   *  older than a record ANOTHER writer stored since (ws-handler THE STALENESS GATE) — the page adopts that record and
   *  re-sends from it (onSyncRefused). undefined = never seen one (a first write; the gate does not judge it). */
  stampOf(desktopId) { return this._stamps.get(desktopId || '') || undefined; }
  noteStamp(desktopId, at) { noteStamp(this._stamps, desktopId, at); }
  get desktops() { return this._desktops; }

  // ── Lifecycle ──

  /** Load desktops from server layout data. Called from LayoutManager.loadAutoSave(). */
  async loadFromServer(layoutData) {
    const meta = layoutData.desktopMeta || [];
    const desktopsData = layoutData.desktops || {};

    if (meta.length === 0) {
      // Migration: no desktops yet — create Desktop 1 from legacy autoSave
      const firstId = this._generateId();
      this._desktops = [{ id: firstId, name: 'Desktop 1' }];
      this._activeId = firstId;

      const legacyState = layoutData.autoSave;
      if (legacyState?.windows?.length) {
        this._setRecord(firstId, legacyState); // the server's record, as it is
        await this.app.layoutManager.restoreState(legacyState);
        for (const [, win] of this.app.wm.windows) win._desktopId = firstId;
        this._noteAttempts(firstId, windowIds(legacyState));
      }

      // Persist the new desktop structure to server
      this.app.ws.send({ type: 'desktop-create', name: 'Desktop 1', id: firstId });
    } else {
      this._desktops = meta;
      this._activeId = meta[0].id;

      // Cache all desktop states — except a poisoned '__stage__' record
      // (pre-2.209.0 raw switchTo while staged persisted the stage's window
      // set under that key; caching it would lazy-replay slot-bounds copies)
      for (const [id, dState] of Object.entries(desktopsData)) {
        if (id !== '__stage__' && dState.autoSave) { this._setRecord(id, dState.autoSave); this.noteWire(id, dState.autoSave); } // the server's record, as it is
      }
      for (const [id, dState] of Object.entries(desktopsData)) this.noteStamp(id, dState?.autoSave?.updatedAt); // the base of this page's first write of each

      // Restore the active (first) desktop
      const firstState = this._savedStates.get(this._activeId);
      if (firstState?.windows?.length) {
        await this.app.layoutManager.restoreState(firstState);
        for (const [, win] of this.app.wm.windows) {
          if (!win._desktopId) win._desktopId = this._activeId;
        }
        this._noteAttempts(this._activeId, windowIds(firstState)); // the boot desktop is BUILT: a window still absent after the grace is one this page cannot build
      }
    }

    this._renderSwitcher();
  }

  // ── Desktop CRUD ──

  createDesktop(name) {
    const id = this._generateId();
    const deskName = name || `Desktop ${this._desktops.length + 1}`;
    this._desktops.push({ id, name: deskName });
    this.app.ws.send({ type: 'desktop-create', name: deskName, id });
    this._renderSwitcher();
    return id;
  }

  async deleteDesktop(desktopId) {
    if (this._desktops.length <= 1) return; // can't delete last desktop
    let idx = this._desktops.findIndex(d => d.id === desktopId);
    if (idx < 0) return;

    // If deleting the active desktop, run the FULL switch pipeline to the
    // adjacent one. The old hand-rolled path only _showWin'ed windows already
    // in the DOM — a target desktop never visited since page load keeps its
    // windows ONLY in _savedStates (they lazy-replay on first switchTo), so it
    // presented EMPTY and the closing autosave then saved that emptiness over
    // the target's real layout (real report: create desktop → switch → delete
    // → the previously-last desktop's layout wiped). switchTo also restores
    // the target's grid, which this path never did.
    const wasActive = this._activeId === desktopId;
    if (wasActive) {
      const targetDeskId = this._desktops[idx > 0 ? idx - 1 : 1].id;
      // Wait out an in-flight switch — switchTo's re-entry guard would
      // silently bail and leave _activeId pointing at the deleted desktop.
      for (let i = 0; i < 12 && this._restoring; i++) await new Promise(r => setTimeout(r, 150));
      await this.switchTo(targetDeskId);
      if (this._activeId !== targetDeskId) {
        // Switch still bailed — minimal fallback (DOM-only show), never leave
        // the active pointer on a deleted desktop.
        this._activeId = targetDeskId;
        for (const [, win] of this.app.wm.windows) {
          if (win._desktopId === this._activeId && win._hiddenByDesktop) this._showWin(win);
        }
      }
      idx = this._desktops.findIndex(d => d.id === desktopId); // list may have shifted while awaiting
      if (idx < 0) return;
    }
    const targetId = this._activeId;

    // Reassign deleted desktop's windows to the active desktop and show them
    for (const [, win] of this.app.wm.windows) {
      if (win._desktopId === desktopId) {
        win._desktopId = targetId;
        if (win._hiddenByDesktop) this._showWin(win);
      }
    }

    // For windows not yet in DOM (never switched to after refresh),
    // restore them via the standard layout restore pipeline
    const cached = this._savedStates.get(desktopId);
    if (cached?.windows) {
      const unloaded = cached.windows.filter(ws => !this.app.wm.windows.has(ws.winId || ws.id));
      if (unloaded.length) {
        // Tag restored windows with active desktop
        const origCreate = this.app.wm.createWindow;
        this.app.wm.createWindow = (opts) => {
          const win = origCreate.call(this.app.wm, opts);
          win._desktopId = targetId;
          return win;
        };
        this.app.layoutManager.restoreState({ windows: unloaded });
        this.app.wm.createWindow = origCreate;
      }
    }

    // The deleted desktop's record ENTRIES move into the target's held record and go out NOW, before the server
    // forgets the desktop (lane desktop-move verify r1 D1: the target's record was left to the closing autosave,
    // which the switch's gate drops when the desktop deleted was the one on show — the server deleted HR and held
    // its 3 windows in NO record until the user's next input; a reload in between lost them). Built or not (an async
    // opener's window is not built yet), they are the target's from here — the ONE merge door.
    const moving = (cached?.windows || []).filter((ws) => ws && (ws.winId || ws.id));
    for (const ws of moving) this._buildAttempts.delete(String(ws.winId || ws.id));
    this._setRecord(targetId, mergeDesktopRecord({ record: this._savedStates.get(targetId) || { windows: [] }, add: moving }));
    this._desktops.splice(idx, 1);
    this._savedStates.delete(desktopId);
    this._wireIds.delete(desktopId);
    this._broadcastDesktopState(targetId, this.recordFor(targetId)); // the target holds them BEFORE the server forgets the desktop
    this.app.ws.send({ type: 'desktop-delete', desktopId });
    // Reflow positions for all now-visible windows
    this.app.wm._reflowWindows();
    this._renderSwitcher();
    this.app.updateTaskbar();
    this.app.layoutManager.scheduleAutoSave();
  }

  renameDesktop(desktopId, name) {
    const desk = this._desktops.find(d => d.id === desktopId);
    if (desk) {
      desk.name = name;
      this.app.ws.send({ type: 'desktop-rename', desktopId, name });
      this._renderSwitcher();
    }
  }

  // ── Desktop Switching ──

  // Drop a CLOSED window from every cached desktop record. Called from
  // wm.closeWindow for every close path (detach and terminate alike): the
  // switchTo merge-preserve keeps openSpec-backed records that aren't in
  // wm.windows ("still lazy-replaying"), which is indistinguishable from
  // "user closed it" — without this purge, every desktop round-trip
  // resurrected every closed window as a lazy replay (real report 2.151.1).
  purgeClosedWindow(winId) {
    if (!winId) return;
    if (this._reopens?.delete(String(winId))) return; // A RESUME RE-OPENS ITS ROW (lane phone-resume-keeps-layout): the row stays in every record — the new window takes its id
    const lm = this.app.layoutManager;
    const byUser = !(lm?._applying || lm?._booting); // a close the apply / the boot itself made is not this page's change to send; one the user made in the cooldown after an apply is (verify r3 ③)
    for (const [desk, st] of this._savedStates) {
      if (!(st?.windows?.length && windowIds(st).includes(String(winId)))) continue;
      this._setRecord(desk, mergeDesktopRecord({ record: st, remove: [winId] }));
      if (byUser && desk !== this._activeId) this._dirtyDesks.add(desk); // a desktop not on show that listed it: its record goes out now, with the close as evidence
    }
    this._buildAttempts.delete(String(winId));
    for (const [, ids] of this._kept || []) ids.delete(String(winId)); // the person's close: a window the server kept is the person's to remove
    this._noteDeparted(winId, 'closed'); // the evidence the server's shrink belt reads (userW inc-mun7qjmw-iksh)
  }

  // ── The held records (userW inc-mun7qjmw-iksh; PURE rule in src/lib/desktop-record.js) ──
  // A desktop's held record (`_savedStates`) is a VIEW of the server's record plus what this page has built. The ONE
  // writer is _setRecord, and every call hands it either a record straight off the wire (boot, a remote record) or a
  // mergeDesktopRecord result — never a list derived from the page alone (scripts/test-desktop-record.mjs census).

  /** THE ONE WRITER of a held desktop record. A desktop this page does not know (deleted meanwhile) has no held
   *  record (verify r2 ④: the switch off a remotely deleted desktop captured a record for it and broadcast it — an
   *  orphan record on the server, no meta naming it). */
  _setRecord(desktopId, record) {
    if (!desktopId || desktopId === '__stage__' || !record || typeof record !== 'object') return;
    if (!this._desktops.some((d) => d.id === desktopId)) return;
    this._savedStates.set(desktopId, record);
  }

  /** The record this page would WRITE for `desktopId`: the held record merged with the windows the page has built
   *  there; a window the page tried to build and could not is dropped (evidence 'unbuilt'); every other window the
   *  page has not built stays exactly as the record holds it. The global chrome is the page's current one; the grid
   *  is the page's only for the desktop it shows (another desktop keeps its own). Used for every record that leaves
   *  this page (the autosave, a switch's capture, the Stage's) — never the bare DOM capture. */
  recordFor(desktopId) {
    const lm = this.app.layoutManager;
    const held = this._savedStates.get(desktopId) || { windows: [] };
    // a window the page HAS built lives where the page says: one the record lists here that the page holds on another
    // desktop is not this desktop's any more (it left through a path that is not a move — evidence 'moved')
    const elsewhere = windowIds(held).filter((id) => {
      const w = this.app.wm.windows.get(id);
      if (!w || (w._desktopId || this._activeId) === desktopId) return false;
      this._noteDeparted(id, 'moved');
      return true;
    });
    const unbuilt = this._unbuilt(desktopId, held);
    lm.dropUnbuiltMembers?.(unbuilt.filter((id) => !this._isAsked(desktopId, id))); // a chain waiting for a window the page could not build is rebuilt without it (a dedup's waits for the hub's verdict — r3 G)
    // a PHONE writes membership, never arrangement (§6b guard 10): the boxes, z, maximize / minimize / snap of the windows
    // it built — and every record field outside the workspace (the grid, the sidebar, the bars, the theme, the fonts:
    // PHONE_KEEPS) — are the held record's, verbatim (PURE captureForViewport; the server's layerGate refuses anything else)
    const viewport = this.app.isMobile ? 'phone' : 'desktop';
    const built = this.captureBuilt(desktopId, held);
    // A PAGE'S VIEW OF A DESKTOP IS THE RECORD (r4 I): a row this page carries and does not build (a kept copy) rides the group
    // its members form here — every row of that group written with it (rideKept); the page's rows never disagree about a group
    const ghosts = this.ghostsOf(desktopId).filter((id) => !unbuilt.includes(id)); // …a copy this write lets go (a dedup it proposes) rides nothing
    const rode = ghosts.length ? rideKept(held, built, ghosts) : null;
    const onto = mergeDesktopRecord({ record: held, built: rode ? rode.built : built, remove: [...unbuilt, ...elsewhere] });
    const merged = rode && rode.rows.length ? mergeDesktopRecord({ record: onto, add: rode.rows }) : onto;
    // A WINDOW NEVER LOSES ITS NAME (lane layout-stopped-window): a session window this page built that names no conversation and
    // no server session yet (a new session whose create has not answered) and that the last record on the wire did not list is
    // left out of THIS write — said in the evidence ('nameless'); the first write after its name arrives carries it (a desktop
    // not on show stays owed). One the wire listed nameless is the record's own (a placeholder shows it) and stays.
    const wire = this._wireIds.get(desktopId);
    const nameless = windowIds((merged.windows || []).filter((w) => isNameless(w) && !(wire && wire.has(String(w.winId || w.id)))));
    for (const id of nameless) this._noteDeparted(id, 'nameless');
    if (nameless.length && desktopId !== this._activeId) this._dirtyDesks.add(desktopId);
    const named = nameless.length ? mergeDesktopRecord({ record: merged, remove: nameless }) : merged;
    // A REFUSAL LEAVES THE RECORD EXACTLY AS IT WAS (r3 G): a dedup this page proposes reads its group without the copy IN THE
    // RECORD it sends (every row that names it — the members' captures still carry the waiting chain); the page's own group
    // re-forms only when the hub accepts (the ack — _settleAsked), and a refusal leaves it as it stood
    const asked = [...(this._dupAsked?.get(desktopId)?.keys() || [])];
    const rec = asked.length ? chainsWithout(named, asked) : named;
    const { grid, ...chrome } = lm.captureChrome();
    if (viewport === 'phone') for (const k of PHONE_KEEPS) delete chrome[k];
    Object.assign(rec, chrome);
    if (desktopId === this._activeId && viewport !== 'phone') rec.grid = grid;
    delete rec.updatedAt; // the server's stamp on the record it holds — it stamps every write itself
    delete rec.viewport; // …and so is the writer's viewport (the layout-sync's own `viewport`, never a held copy's)
    return rec;
  }

  /** THE ONE CAPTURE (§6b guard 10, phone-arrangement-fixes): every record this page builds from its OWN windows — the
   *  autosave's recordFor, a refused save's merge, a move's target, a named preset — captures them here, never through
   *  layout.js captureWindows / captureWin / captureState directly (test-phone-desktop-sync ⑭ CENSUS: a new site is RED).
   *  A phone's capture keeps `held`'s arrangement verbatim (PURE captureForViewport); a desktop's is the page's own.
   *  `ids` = only those windows (a move), else every window the page built on `desktopId`. */
  captureBuilt(desktopId, held, ids = null) {
    const lm = this.app.layoutManager;
    const built = ids ? ids.map((id) => this.app.wm.windows.get(id)).filter(Boolean).map((w) => lm.captureWin(w, w.id)).filter(Boolean) : lm.captureWindows(desktopId);
    return captureForViewport({ held, built, viewport: this.app.isMobile ? 'phone' : 'desktop' });
  }

  /** A named preset of the desktop on show (layout.js savePreset): its windows through THE ONE CAPTURE, the page's chrome
   *  — a phone's grid / chrome / preference are the held record's (PHONE_KEEPS: its sidebar is an overlay, its screen
   *  the full one, its bars and theme its own), as recordFor's. */
  presetState() {
    const held = this._savedStates.get(this._activeId) || { windows: [] };
    const state = { windows: this.captureBuilt(this._activeId, held), ...this.app.layoutManager.captureChrome() };
    if (this.app.isMobile) for (const k of PHONE_KEEPS) { if (k in held) state[k] = held[k]; else delete state[k]; }
    return state;
  }

  /** A remote record for the desktop ON SHOW was applied (layout.js _handleRemoteSync): it is the view's base now —
   *  minus a window this page closed that no save carried yet; a window it lists that this page does not have is
   *  being created by that apply — an attempt like any other (still absent after the grace ⇒ dropped, with evidence). */
  cacheShownState(desktopId, state) {
    if (!desktopId || desktopId !== this._activeId || !state || typeof state !== 'object') return;
    state = this.keptRecord(desktopId, state, this._takeKept(desktopId)); // a window the apply kept: in its place and its group (r4 J)
    this._relisted(desktopId, state);
    const held = this.app.layoutManager?.heldCloseIds?.() || [];
    this._setRecord(desktopId, held.length ? mergeDesktopRecord({ record: state, remove: held }) : state);
    this._noteAttempts(desktopId, windowIds(state).filter((id) => !this._buildAttempts.has(id)));
  }

  /** A record of `desktopId` left this page (sent to the server): it is now the view's base, and the wire's. */
  noteSent(desktopId, state, sentAt = null) {
    if (!desktopId || desktopId === '__stage__' || !state) return;
    (this._sentJson || (this._sentJson = new Map())).set(desktopId, this._writeJson(desktopId, state)); // what a refusal of it refused (the breaker's witness)
    const asked = this._dupAsked?.get(desktopId), listed = new Set(windowIds(state));
    if (asked) for (const [id, a] of asked) if (!listed.has(id) && a.sentAt == null) a.sentAt = sentAt ?? Date.now(); // a dedup this write proposes: its verdict is THIS write's answer (r3 G)
    this._setRecord(desktopId, state);
    this.noteWire(desktopId, state);
  }

  /** The desktops this page changed but does not show — sent by the next autosave from their HELD record. A desktop stays
   *  dirty until the server READ a record of it (`noteCarried`, the ack — verify r5 ⑤): a save that left on a socket the
   *  server never read used to take the desk out of the set, and the re-send after the reconnect then carried the desktop on
   *  show alone (the moved window reached no record). A desk sent twice before its ack is an idempotent duplicate write. */
  takeDirty() {
    return [...this._dirtyDesks].filter((d) => d && d !== this._activeId && d !== '__stage__' && this._desktops.some((x) => x.id === d));
  }

  /** The server read a record of `desktopId` (the layout manager's ack): no longer owed. */
  noteCarried(desktopId) { if (desktopId) this._dirtyDesks.delete(desktopId); }
  /** A desktop not on show owes the server its record (layout.js noteOwnRecipe — r4 N1: a recipe this page owes rides its next save) */
  markDirty(desktopId) { if (desktopId && desktopId !== this._activeId && desktopId !== '__stage__') this._dirtyDesks.add(desktopId); }

  /** The evidence every layout-sync carries: the windows this page closed, moved, replaced or could not build lately. */
  evidence() {
    const now = Date.now(), out = [];
    for (const [id, e] of this._departed) {
      if (now - e.at > DEPARTED_TTL_MS) { this._departed.delete(id); continue; }
      out.push(e.by ? { id, why: e.why, by: e.by } : { id, why: e.why }); // `by`: the window that replaced it (lane layout-stopped-window)
    }
    return out;
  }

  _noteDeparted(winId, why, by = null) {
    if (winId == null) return;
    const id = String(winId);
    this._departed.delete(id);
    this._departed.set(id, by != null ? { why, at: Date.now(), by: String(by) } : { why, at: Date.now() });
    while (this._departed.size > DEPARTED_CAP) this._departed.delete(this._departed.keys().next().value);
  }

  /** The page is building these windows of `desktopId` now (a first visit's replay, the boot restore). */
  _noteAttempts(desktopId, ids, { at = Date.now() } = {}) {
    for (const id of ids || []) if (id != null && !this.app.wm.windows.has(String(id))) this._buildAttempts.set(String(id), { desk: desktopId, at });
  }

  /** The held windows of `desktopId` the page tried to build and could not (still absent past the grace). */
  _unbuilt(desktopId, held) {
    const now = Date.now(), out = [];
    for (const id of windowIds(held)) {
      const a = this._buildAttempts.get(id);
      if (!a) continue;
      if (this.app.wm.windows.has(id)) { this._buildAttempts.delete(id); continue; }
      if (a.desk === desktopId && now - a.at > BUILD_GRACE_MS) {
        if (this._isKept(desktopId, id)) { this._buildAttempts.delete(id); continue; } // the server kept it against this page's drop: carried as the record holds it (inc-mw1ogdno-5jny)
        // UNBUILT IS NOT DROPPED (lane layout-stopped-window): a SESSION window stays in the record (the restore shows it as a
        // placeholder); only a duplicate of a session this page already shows live is settled (as before)
        const entry = (held.windows || []).find((w) => String(w && (w.winId || w.id)) === id);
        const dup = entry?.openSpec?.action === 'attachSession' && entry.openSpec.serverId && [...this.app.wm.windows.values()].some((w) => w._openSpec?.serverId === entry.openSpec.serverId);
        if (isSession(entry) && !dup) { this._buildAttempts.delete(id); this._carry(desktopId, id); continue; } // kept as the record holds it: the next build of this desktop (a visit, a reload) shows it — carried meanwhile (r4 I: a member of its group in what this page writes)
        // A DUPLICATE IS EXPLAINED WHEREVER IT IS SHOWN (userW inc-mw1ogdno-5jny): the copy leaves with the window that shows its session
        // (`by`) — once the server holds that window (listed on the wire for its desktop); until then it stays and waits
        const shower = dup ? this._showerOf(entry.openSpec.serverId, id) : null;
        if (dup && !shower) continue;
        out.push(id); if (shower) { this._noteDeparted(id, 'dup', shower); this._ask(desktopId, id); } else this._noteDeparted(id, 'unbuilt');
      }
    }
    return out;
  }

  /** The server REFUSED a record of `desktopId` (its shrink belt — or its layer gate, `cross-layer`: a phone record that
   *  moved a field outside the workspace — ws-handler layout-sync): the server kept its own and sent it back. The view
   *  becomes that record plus what this page has built; on the desktop on show the windows it holds that this page never
   *  opened are opened now; the corrected record goes out with the next save (the dirty bit re-armed at the last REAL
   *  input — §6b guard 2's expiry keeps its meaning). */
  onSyncRefused(msg) {
    const d = msg?.desktopId;
    // the server no longer has this desktop (verify r2 ⑦): its meta rides the refusal — the page drops the desktop
    // as a `desktop-updated` would have made it (its windows follow the record that lists them, or the first desktop)
    if (msg?.reason === 'no-such-desktop') { if (Array.isArray(msg.desktops)) this._onRemoteDesktopUpdated({ desktops: msg.desktops }); return; }
    if (!d || d === '__stage__' || !this._desktops.some((x) => x.id === d)) return;
    const lm = this.app.layoutManager;
    const rec = msg.state && typeof msg.state === 'object' ? msg.state : { windows: [] };
    this.noteStamp(d, rec.updatedAt); // the record kept is the base of the re-send (a 'stale' refusal: the page adopts it — lane layout-stale-record-sync)
    const dupDrops = new Set((msg.unexplained || []).map(String).filter((id) => this._departed.get(id)?.why === 'dup')); // this page's own cleanup — no person asked for it, nothing to tell them
    for (const id of msg.unexplained || []) { this._buildAttempts.delete(String(id)); this._departed.delete(String(id)); }
    this._settleAsked(d, false); // A REFUSAL LEAVES THE RECORD EXACTLY AS IT WAS (r3 G): a dedup it refused shrank no group here — the record below is the server's + the page's untouched captures
    // THE RECONCILED RE-SEND CARRIES WHAT THE PAGE DID NOT BUILD (userW inc-mw1ogdno-5jny): each window the server kept against this
    // page's drop is carried as the server's row, verbatim, and never dropped again by this page (a duplicate, an unbuilt window)
    // until the person closes it or the page reloads — the loop cannot exist by construction
    if (msg.reason === 'shrink-without-close') for (const id of msg.unexplained || []) this._keep(d, id);
    // A REFUSED PAGE RE-SENDS THE KEPT ROW, NEVER THE DROP AGAIN (lane phone-resume-keeps-layout r2, N3): each row the hub kept for its
    // box takes back the window this page opened in its place — before the capture below reads the page
    const unplaced = (msg.unplaced || []).map(String);
    for (const id of unplaced) this._takeKeptRow(d, id, rec);
    // A PAGE'S VIEW OF A DESKTOP IS THE RECORD (r4 I — the r3 acceptance: a refused dedup's group never formed on the proposer,
    // its two members loose for the page's life): every group the record has forms here around the members this page builds —
    // a kept copy is a member of it in what the page writes (rideKept), never one the group waits for (layout.js _reconcileChain)
    if ((msg.unexplained || []).length) lm._settlePendingChains?.();
    // …and a write whose rows disagree about a group is never the page's for its life: repaired here (_chainsDisagreed)
    const repaired = msg.reason === 'chain-disagrees' && this._chainsDisagreed(d, rec, (msg.windows || []).map(String), msg.sentAt) === 'taken';
    // THE BREAKER: the refusal's identity (PURE refusalKey — the desktop, the reason, what it refused) and the record it refused
    const key = refusalKey({ desktopId: d, reason: msg.reason, unexplained: msg.unexplained, fields: msg.fields, windows: msg.windows });
    const refusals = this._refusals || (this._refusals = new Map()), was = refusals.get(d);
    const ref = { key, n: was && was.key === key ? was.n + 1 : 1, json: this._sentJson?.get(d) || null, said: !!(was && was.key === key && was.said) };
    refusals.set(d, ref);
    // the windows this page built there through THE ONE CAPTURE: a phone's re-send carries the kept record's arrangement,
    // never its own z (phone-arrangement-verify F2: the reconciled re-send wrote the phone's z, a desktop's reload restacked)
    this._setRecord(d, mergeDesktopRecord({ record: rec, built: this.captureBuilt(d, rec), remove: lm.heldCloseIds?.() || [] }));
    this.noteWire(d, rec);
    let opened = 0;
    if (d === this._activeId && !this.app.stage?.isActive) opened = this._replayMissing(d, this._savedStates.get(d));
    if (d !== this._activeId) this._dirtyDesks.add(d);
    // the rearm only when the record this page would write NOW is not the one refused (the breaker — a refused record is never
    // re-sent unchanged: held until the person's act or a reload changes it)
    const same = ref.json != null && ref.json === this._writeJson(d, this.recordFor(d));
    if (!same) lm.rearmSave?.();
    this._renderSwitcher(); this.refreshSwitcher();
    const n = (msg.unexplained || []).length;
    const name = this._desktops.find((x) => x.id === d)?.name || d;
    try { window.__vsOp?.('layout-sync-refused', { desk: d, n, opened, again: ref.n, held: same }); } catch { }
    if (repaired) { ref.said = true; showToast(t('The tab groups on “{desktop}” did not match the server\'s — this page now shows the server\'s', { desktop: name }), { type: 'warn', duration: 8000 }); return; }
    // ≥ 2 refusals of one key: the page and the server disagree — said ONCE, never a cadence
    if (ref.n >= 2 && !ref.said) {
      ref.said = true;
      showToast(t('This page and the server disagree about desktop “{desktop}” — reload to take the server\'s record', { desktop: name }), { type: 'warn', duration: 12000, action: { label: t('Reload now'), run: () => location.reload() } });
      return;
    }
    // POSITIONS ARE NEVER DROPPED (lane phone-resume-keeps-layout, LAW 3): the hub kept the boxes this write had none for — said once, in
    // its own words, with EVERY other window the same refusal kept (r2 N5: one toast, both groups)
    const told = (msg.unexplained || []).map(String).filter((id) => !dupDrops.has(id) && !unplaced.includes(id));
    if (unplaced.length) { this._sayRefusal(d, 'unplaced', unplaced, rec, name, told); return; }
    if (told.length) this._sayRefusal(d, msg.reason, told, rec, name);
  }

  /** THE KEPT ROW TAKES ITS WINDOW BACK (r2 N3 — the r1 acceptance: after an `unplaced` refusal the page re-sent the very drop with no
   *  evidence, and the hub took it — the box lost right after «kept their places»): row `id` of `desk`, kept by the hub for its box. This
   *  page's close of it is void (its evidence went above, its held close goes here), and the window this page opened for the same
   *  conversation in its place — not a row of the kept record — takes the row's id (wm.rekeyWindow; on a desktop page, its box): the
   *  next write carries the kept row, never the drop again. true = a window took it. */
  _takeKeptRow(desk, id, rec) {
    const row = ((rec && rec.windows) || []).find((r) => rowId(r) === id), wm = this.app.wm;
    this.app.layoutManager?.forgetClose?.(id);
    const cid = row && conversationOf(row);
    if (!cid || wm.windows.has(id)) return false;
    const listed = new Set(windowIds(rec)), backend = row.backend || row.openSpec?.backend || 'claude';
    const convOf = (x) => x._openSpec?.backendSessionId || x._conversation?.backendSessionId || null;
    const w = [...wm.windows.values()].find((x) => !listed.has(String(x.id)) && (x._desktopId || this._activeId) === desk && convOf(x) === cid && (x._openSpec?.backend || x._conversation?.backend || 'claude') === backend);
    // a member of a tab group keeps its seat under the row's id (r3 C3 — the r2 acceptance's edge m: rekeyWindow declined a grouped
    // window, _replayMissing rebuilt the kept row beside it — two windows and two rows of the conversation); its box is its frame's
    if (!w || !wm.rekeyWindow(w.id, id, { inChain: true })) return false;
    this.app.layoutManager?.onWindowCreated?.(w);
    if (!this.app.isMobile && !w._onStage && !w._tabChain && row.gridBounds) { w.gridBounds = { ...row.gridBounds }; wm._applyGridBounds(w); }
    try { window.__vsOp?.('kept-row-retaken', { desk, id }); } catch { }
    return true;
  }

  /** ONE TOAST PER CAUSE (userW inc-mw1ogdno-5jny — a warn every 500 ms): a refusal's toast names the windows the server kept and
   *  is said once per desktop and reason in REFUSAL_TOAST_MS; a repeat inside it is counted, and the next one says the count. */
  _sayRefusal(desk, reason, ids, rec, name, others = []) {
    const said = this._refusalToasts || (this._refusalToasts = new Map());
    const k = desk + '|' + reason, now = Date.now(), s = said.get(k);
    if (s && now - s.at < REFUSAL_TOAST_MS) { s.count++; return false; }
    const namesFor = (list) => {
      const titles = list.map((id) => { const w = (rec?.windows || []).find((x) => String(x && (x.winId || x.id)) === id); const nm = w ? [...namesOf(w)][0] : null; return '“' + String(nm || id).slice(0, 40) + '”'; });
      return titles.length > 3 ? titles.slice(0, 3).join(', ') + ' +' + (titles.length - 3) : titles.join(', ');
    };
    const names = namesFor(ids);
    const times = s ? s.count + 1 : 1;
    said.set(k, { at: now, count: 0 });
    if (reason === 'unplaced' && others.length) { const o = namesFor(others); showToast(times > 1 ? t('{names} on “{desktop}” kept their places — this page had no position to give them; {others} were kept too — this page had not opened them yet (refused {n} times)', { names, others: o, desktop: name, n: times }) : t('{names} on “{desktop}” kept their places — this page had no position to give them; {others} were kept too — this page had not opened them yet', { names, others: o, desktop: name }), { type: 'warn', duration: 10000 }); return true; }
    if (reason === 'unplaced') { showToast(times > 1 ? t('{names} on “{desktop}” kept their places — this page had no position to give them (refused {n} times)', { names, desktop: name, n: times }) : t('{names} on “{desktop}” kept their places — this page had no position to give them', { names, desktop: name }), { type: 'warn', duration: 8000 }); return true; }
    showToast(times > 1 ? t('{names} on “{desktop}” were kept — this page had not opened them yet (refused {n} times)', { names, desktop: name, n: times }) : t('{names} on “{desktop}” were kept — this page had not opened them yet', { names, desktop: name }), { type: 'warn', duration: 8000 });
    return true;
  }

  /** The text of a write of `desktopId`: its record and its base — what the breaker compares (a re-send on a new base is a new write). */
  _writeJson(desktopId, state) { return JSON.stringify({ state, base: this.stampOf(desktopId) ?? null }); }

  /** THE BREAKER (layout.js _doAutoSave asks before each send): `state` is the very record the server refused last for `desktopId`. */
  holdsBack(desktopId, state) {
    const r = this._refusals?.get(desktopId);
    return !!(r && r.json != null && r.json === this._writeJson(desktopId, state));
  }

  /** A DEDUP ASKED OF THE HUB (r3 G): desktopId → Map(id → {sentAt}) — the `sentAt` of the first write that left it out (noteSent). */
  _ask(desktopId, id) { if (!desktopId || id == null) return; const m = this._dupAsked || (this._dupAsked = new Map()); let s = m.get(desktopId); if (!s) { s = new Map(); m.set(desktopId, s); } if (!s.has(String(id))) s.set(String(id), { sentAt: null }); }
  _isAsked(desktopId, id) { return !!this._dupAsked?.get(desktopId)?.has(String(id)); }
  /** The hub's answer to a write of `desktopId` (its `sentAt`): the ack of the write that carried a dedup (or of a later one) ⇒ it
   *  stands — the page's own waiting group re-forms without the copy (layout.js dropUnbuiltMembers); an ack of an earlier write
   *  settles nothing; a refusal ⇒ nothing of it was done here — forgotten (the copy is the server's again). */
  _settleAsked(desktopId, accepted, sentAt = null) {
    const s = this._dupAsked?.get(desktopId);
    if (!s) return;
    const done = [...s].filter(([, a]) => !accepted || (a.sentAt != null && (sentAt == null || sentAt >= a.sentAt))).map(([id]) => id);
    for (const id of done) s.delete(id);
    if (!s.size) this._dupAsked.delete(desktopId);
    if (accepted && done.length) this.app.layoutManager?.dropUnbuiltMembers?.(done);
    if (accepted) { const g = this._letGo || (this._letGo = new Map()); if (!g.has(desktopId)) g.set(desktopId, new Set()); for (const id of done) g.get(desktopId).add(id); } // read back by _relisted
  }

  /** A COPY THE HUB LET GO IS ASKED FOR ONCE (r5 O — the r4 acceptance's q1: B's keep re-send listed the copy again, and this page,
   *  which had let it go, would ask again at its next save — refused while B shows it, or accepted and re-sent by B at its next
   *  return): a record of `desk` that lists a copy this page's dedup let go is another page's keep (r3 F) — this page carries it as
   *  a ghost for its life, never asks again (a reload asks once more — the hub's verdict stands, as for any dedup). */
  _relisted(desk, state) {
    const g = this._letGo?.get(desk);
    if (!g || !g.size || !state || !Array.isArray(state.windows)) return;
    for (const w of state.windows) { const id = rowId(w); if (g.has(id)) { g.delete(id); this._keep(desk, id); } }
  }

  _keep(desktopId, id) { if (!desktopId || id == null) return; const kept = this._kept || (this._kept = new Map()); let s = kept.get(desktopId); if (!s) { s = new Set(); kept.set(desktopId, s); } s.add(String(id)); }
  _isKept(desktopId, id) { const s = this._kept?.get(desktopId); return !!(s && s.has(String(id))); }
  _carry(desktopId, id) { if (!desktopId || id == null) return; const m = this._carried || (this._carried = new Map()); let s = m.get(desktopId); if (!s) { s = new Set(); m.set(desktopId, s); } s.add(String(id)); }

  /** The rows of `desk`'s record this page CARRIES and does not build (r4 I): a copy the server kept against its drop, a session
   *  window it could not build and keeps as the record holds it — not built here, no build of it under way. Each is a member of
   *  its group in what the page writes (rideKept), never one the page's group waits for (layout.js _reconcileChain).
   *  A COPY THIS PAGE CANNOT BUILD IS A GHOST FROM THE MOMENT THE RECORD NAMES IT (r5 O — the r4 acceptance: a copy that came by a
   *  relay or a first visit was a build attempt until a save ran _unbuilt, and the group waited on it — the proposer's group taken
   *  apart by a keep re-send, a person's merge refused and undone, an open that revealed nothing): a row of `desk`'s record (`rec`
   *  — a record being applied — or the held one) whose conversation this page already shows in ANOTHER built window is a ghost
   *  at once, whatever the road that brought it, and stays one while that window shows it (copiesOf). */
  ghostsOf(desk, rec = null) {
    const out = [], now = Date.now(), wm = this.app.wm;
    for (const m of [this._kept, this._carried]) {
      for (const id of m?.get(desk) || []) {
        const a = this._buildAttempts.get(id);
        if (wm.windows.has(id) || out.includes(id) || (a && a.desk === desk && now - a.at <= BUILD_GRACE_MS)) continue;
        out.push(id);
      }
    }
    for (const id of this.copiesOf(desk, rec)) if (!out.includes(id)) out.push(id);
    return out;
  }

  /** The rows of `desk`'s record (`rec` — a record being applied — or the held one) this page CANNOT build: their conversation is
   *  shown here in another built window, and attachSession never builds a second window of a conversation (_focusExistingSession
   *  raises the first). Never built by an apply (layout.js), never waited for, ghosts from the moment the record names them (r5 O). */
  copiesOf(desk, rec = null) {
    const out = [], wm = this.app.wm, census = this._shownCensus();
    if (!census.shows.size) return out;
    for (const st of [rec, this._savedStates.get(desk)]) {
      for (const w of (st && st.windows) || []) {
        const id = rowId(w);
        if (wm.windows.has(id) || out.includes(id) || !this._isCopy(w, census)) continue;
        out.push(id);
      }
    }
    return out;
  }

  /** ONE CENSUS FOR EVERY COPY VERDICT (r9): `shows` = each session this page shows or is still attaching → the built window that
   *  shows it; `live` = the live sessions the restore matches a row against, as this page knows them — the server's list (the
   *  sidebar's active-sessions: what /api/active answers the restore), then each session this page shows or is still attaching
   *  that the list does not name yet (its window's recipe: the conversation its attach was asked for). */
  _shownCensus() {
    const shows = new Map(), mine = [];
    for (const w of this.app.wm.windows.values()) {
      const spec = w._openSpec?.action === 'attachSession' ? w._openSpec : null;
      if (!spec || !spec.serverId || shows.has(String(spec.serverId))) continue;
      shows.set(String(spec.serverId), String(w.id));
      mine.push({ id: String(spec.serverId), backend: spec.backend || 'claude', backendSessionId: spec.backendSessionId || null });
    }
    const listed = (this.app.sidebar?._webuiSessions || []).filter((s) => s && s.id != null), named = new Set(listed.map((s) => String(s.id)));
    return { shows, live: listed.concat(mine.filter((s) => !named.has(s.id))) };
  }
  /** A COPY IS NAMED BY WHAT ITS RESTORE NAMES (r9 — the r8 acceptance: a row naming its conversation only by its id, or by a stale
   *  server id beside it, was no copy here while the restore found that conversation's window by its id first — restored on a visit,
   *  offered in the ⧉ list, its press told «did not appear» with the window on screen): `w` is a copy ⇔ the session its own door
   *  attaches (desktop-record doorSessionOf — the restore's ladder for a row with no recipe, the recipe's session for one with) is
   *  one this page shows in ANOTHER built window. */
  _isCopy(w, census = this._shownCensus()) {
    const sid = doorSessionOf(w, census.live);
    return !!sid && census.shows.has(sid) && census.shows.get(sid) !== rowId(w);
  }

  /** A DESKTOP IS NEVER UNWRITABLE FROM A PAGE (r4 I): the hub refused this page's write of `d` because its rows disagree about a
   *  group ('chain-disagrees', `rows`). A member of those groups still being built (its grace runs) ⇒ nothing is said: the write
   *  goes again once the grace is over (the member stood, or was dropped as unbuilt — either way the rows agree).
   *  THE PAGE NEVER UNDOES A PERSON'S ACT (r5 P — the r4 acceptance's q3: a person's merge beside a group still waiting on a copy
   *  was refused, and this repair took the hub's groups and said so — the merge lost on the page and on the hub): every group the
   *  page SHOWS holds together (each member of it holds that very group) ⇒ the disagreement is between what it shows and a row it
   *  carries or a group still forming — what it shows stands: a forming group an act superseded is let go (layout.js
   *  _reconcileChain's act-wins rule), every carried row of them rides what the page shows (a ghost — rideKept) and the write goes
   *  again; nothing is taken, nothing said ('kept'). Only a page whose own groups do not hold together (a state the real tab-group
   *  never makes — an injected one, the loop's on-purpose leg) TAKES THE HUB'S GROUPS for those windows (layout.js takeChains;
   *  said once by the caller — 'taken') — and even then every group act the person made after the refused write left (`sentAt`; the
   *  same millisecond counts as after — the page cannot tell, and an act is never undone on a tie) stays as they made it. false = nothing done (the grace). */
  _chainsDisagreed(d, rec, rows, sentAt = null) {
    const wm = this.app.wm, lm = this.app.layoutManager, now = Date.now();
    const recRows = new Map(((rec && rec.windows) || []).map((w) => [rowId(w), w]));
    const touch = new Set(rows);
    for (const id of rows) for (const m of recRows.get(id)?.tabChain?.tabs || []) touch.add(String(m));
    for (const id of [...touch]) for (const m of wm.windows.get(id)?._tabChain?.tabs || []) touch.add(String(m));
    const building = [...touch].filter((id) => !wm.windows.has(id)).map((id) => this._buildAttempts.get(id)).filter((a) => a && a.desk === d && now - a.at <= BUILD_GRACE_MS);
    if (building.length) { setTimeout(() => lm?.rearmSave?.(), Math.max(0, Math.max(...building.map((a) => a.at)) + BUILD_GRACE_MS - now) + 600); return false; }
    if (!lm?.takeChains) return false;
    const holds = (id) => { const c = wm.windows.get(id)?._tabChain; return !c || c.tabs.every((m) => { const o = wm.windows.get(String(m)); return !o || o._tabChain === c; }); };
    if ([...touch].every(holds)) {
      lm._settlePendingChains?.();
      for (const id of touch) if (!wm.windows.has(id) && recRows.has(id)) this._carry(d, id);
      try { window.__vsOp?.('layout-chains-kept', { desk: d, n: touch.size }); } catch { }
      return 'kept';
    }
    const since = Number(sentAt) || 0, keep = new Set();
    if (since) for (const id of touch) { const w = wm.windows.get(id); if (w && (w._chainAt || 0) >= since) { keep.add(id); for (const m of w._tabChain?.tabs || []) keep.add(String(m)); } }
    const take = [...touch].filter((id) => !keep.has(id));
    lm.takeChains(d, rec, take, { keep });
    // a window the hub's record holds ALONE goes back to the record's box (the detach dropped it on its old host's frame, as a tear-off
    // does); a phone's record moves no box here and a phone takes none (§6b guard 10)
    if (!this.app.isMobile) for (const id of take) { const r = recRows.get(id), w = wm.windows.get(id); if (r && !r.tabChain && r.gridBounds && w && !w._onStage) { w.gridBounds = { ...r.gridBounds }; wm._applyGridBounds(w); } }
    try { window.__vsOp?.('layout-chains-taken', { desk: d, n: take.length, kept: keep.size }); } catch { }
    return 'taken';
  }

  /** The window this page shows server session `serverId` in (built, on a desktop — never the stage) that the server holds (the wire
   *  lists it for its desktop) — the `by` of a duplicate's evidence; null = none. */
  _showerOf(serverId, notId = null) {
    if (!serverId) return null;
    for (const w of this.app.wm.windows.values()) {
      if (String(w.id) === String(notId) || w._onStage || w._desktopId === '__stage__') continue;
      if (w._openSpec?.action !== 'attachSession' || w._openSpec.serverId !== serverId) continue;
      if (this.wireListed(w._desktopId || this._activeId, w.id)) return String(w.id);
    }
    return null;
  }

  /** ONE CONVERSATION, ONE WINDOW ENTRY (userW inc-mw1ogdno-5jny): a held record that lists a session this page SHOWS (a built window
   *  the server holds) under another window id holds a stale copy — it leaves that record with evidence {id, why: 'dup', by} (the
   *  dedup is its own evidence, never a silent delete) and a desktop not on show goes out with the next save (PURE duplicatesOf).
   *  A copy the server kept against this page, or one this page has built, stays. Returns the count.
   *  THE ONE COPY VERDICT (r10 — the r9 acceptance: this keyed on the server id alone while _isCopy read the restore's ladder, so the
   *  first autosave dropped as S's copy a row the ⧉ list offered and the visit would build — D's window, never built): duplicatesOf
   *  resolves each row through doorSessionOf against the census's live list, as _isCopy does; `shown` is a part of the census's
   *  `shows` (a built window the server holds), so every row proposed is one _isCopy calls a copy, and none it calls no copy is. */
  normalizeDups() {
    const shown = new Map();
    for (const w of this.app.wm.windows.values()) {
      const sid = w._openSpec?.action === 'attachSession' ? w._openSpec.serverId : null;
      if (sid && !shown.has(sid)) { const by = this._showerOf(sid); if (by) shown.set(sid, by); }
    }
    if (!shown.size) return 0;
    let n = 0;
    for (const x of duplicatesOf({ records: this._savedStates, shown, live: this._shownCensus().live })) {
      if (x.desk === '__stage__' || this._isKept(x.desk, x.id) || this.app.wm.windows.has(x.id)) continue;
      // A DEDUPED COPY LEAVES ITS TAB GROUP TOO (r2): the members' recorded chain is read without it, and — once the hub accepts
      // (r3 G) — a chain still waiting for it is told: the road an unbuilt departure takes (dropUnbuiltMembers)
      this._setRecord(x.desk, mergeDesktopRecord({ record: this._savedStates.get(x.desk), remove: [x.id], add: chainWithout(this._savedStates.get(x.desk), x.id) }));
      this._ask(x.desk, x.id); // …and the page's own group waits for the hub's verdict (r3 G: a refusal leaves every group as it was)
      this._buildAttempts.delete(x.id);
      this._noteDeparted(x.id, 'dup', x.by);
      if (x.desk !== this._activeId) this._dirtyDesks.add(x.desk);
      if (x.carry) this._placeSurvivor(x.by, x.carry); // THE SURVIVOR KEEPS THE POSITION (lane phone-resume-keeps-layout)
      n++;
    }
    return n;
  }

  /** THE SURVIVOR KEEPS THE POSITION (lane phone-resume-keeps-layout, LAW 1): a copy with a box retired in favour of window `id`, whose
   *  row holds none (a phone wrote it), hands it `carry` (PURE duplicatesOf — the copy's arrangement): written into the survivor's row
   *  (a phone's capture keeps the held arrangement — it writes it from now on) and, on a desktop page, put on the window itself. */
  _placeSurvivor(id, carry) {
    const w = this.app.wm.windows.get(String(id)), desk = (w && w._desktopId) || this._activeId, rec = this._savedStates.get(desk);
    const row = ((rec && rec.windows) || []).find((r) => rowId(r) === String(id));
    if (!row || hasBox(row)) return;
    this._setRecord(desk, mergeDesktopRecord({ record: rec, add: [{ ...row, ...carry }] }));
    if (w && !this.app.isMobile && !w._onStage && carry.gridBounds) { w.gridBounds = { ...carry.gridBounds }; this.app.wm._applyGridBounds(w); }
    if (desk !== this._activeId) this._dirtyDesks.add(desk);
  }

  /** THE ROW A RESUME RE-OPENS (lane phone-resume-keeps-layout, LAW 1 — userW 2026-11-05: after a hub restart his PHONE accepted «Resume
   *  all» first; each stopped conversation reopened in a NEW window, the desktops' rows were retired for it, and the phone, which owns
   *  no desktop geometry, wrote eleven desktops' records with no box): the row a held record of this page lists for the conversation
   *  (`backend` + `backendSessionId`, on `hostId` — none = this hub) — the row named `winId` first, then the desktop on show's. A held
   *  row is re-opened AS ITSELF on every viewport (session-lifecycle resumeSession): its id, box, z and tab group stay; never a second
   *  window. → {desk, id, row} | null. */
  heldRowOf({ backend = 'claude', backendSessionId = null, hostId = null, winId = null } = {}) {
    if (!backendSessionId) return null;
    const mine = (w) => isSession(w) && conversationOf(w) === String(backendSessionId) && (w.backend || w.openSpec?.backend || 'claude') === (backend || 'claude') && (hostOf(w) || null) === (hostId || null);
    const desks = [...this._savedStates.keys()].filter((d) => d !== '__stage__' && this._desktops.some((x) => x.id === d)).sort((a, b) => (b === this._activeId) - (a === this._activeId));
    let hit = null;
    for (const desk of desks) {
      for (const w of this._savedStates.get(desk)?.windows || []) {
        if (!mine(w)) continue;
        if (winId != null && rowId(w) === String(winId)) return { desk, id: rowId(w), row: w };
        if (!hit) hit = { desk, id: rowId(w), row: w };
      }
    }
    return hit;
  }

  /** Window `id`'s close that follows is its row's RE-OPENING (LAW 1): every held record keeps the row — no 'closed' evidence, nothing
   *  dirty (purgeClosedWindow); the resume's new window takes its id. */
  reopenRow(id) { if (id != null) (this._reopens || (this._reopens = new Set())).add(String(id)); }

  /** Row `id` of `desk` stands again as a window of that id (LAW 1): the mark is spent, and a tab group the row belongs to waits for it
   *  as a record's does (layout.js queueRecordChains — until it forms, the window's capture writes the record's group). */
  reopenedRow(id, desk) {
    this._reopens?.delete(String(id));
    const rec = desk ? this._savedStates.get(desk) : null;
    if (rec) this.app.layoutManager?.queueRecordChains?.(desk, rec, { naming: [String(id)] });
  }

  /** A LATE REVEAL NEVER TAKES THE PERSON BACK (r3 H — the r2 acceptance: a reveal that waited ~5 s for a slow group pulled the
   *  person back to the conversation's desktop at 4.0 s / 5.7 s): every act of the person (a key or pointer press, an open, a
   *  desktop switch) starts a new generation; a deferred reveal acts only in the generation it was asked in. */
  _noteAct(target = null) { this._revealGen = (this._revealGen || 0) + 1; this._revealAsk = null; this.app.layoutManager?.dropFront?.(target); } // …and a front mark stays only for an act inside its window (r6 Q)

  /** THE REVEAL'S OWN SWITCH IS NOT THE PERSON'S ACT (r7 Q′ — the r6 acceptance: keepInFront marked the conversation's tab, then the
   *  caller's revealWindow switched to its desktop, and switchTo took that switch for the person's act — dropFront(null), every mark
   *  gone: the group still forming there formed with the record's tab in front, the conversation just opened a hidden tab, focus
   *  moved, nothing said). A switch is the reveal's own when it is the one a deferred reveal asked for (`_revealAsk`, r4 L) or one
   *  made while a reveal performed now is still the generation (`_revealing`: keepInFront, then the caller's revealWindow; the
   *  deferred reveal's revealWindow) — queued behind the 1 s gate or not. It is part of the act that set the mark: no new
   *  generation, the mark kept. Only the person's own act leaves that generation — a press (a switch the person makes starts with
   *  one), which drops the mark unless it is inside the marked window; their own switch then drops it as before.
   *  THE REVEAL'S SWITCH IS ONE SWITCH, TO ONE DESKTOP, ONCE (r8 — the r7 acceptance's «qdrain» / «late-nopress»: `_revealing` held
   *  the generation alone and was never cleared, so ANY later switch of that generation that came from no press — the drain of a
   *  switch queued before the open, a remote deletion's, a forwarded shortcut's 2.5 s later — kept every front mark): `_revealing`
   *  names the desktop the revealed window stands on, only a switch TO it is the reveal's, and the one that lands spends it (switchTo). */
  _revealsSwitch(desktopId) {
    const ask = this._revealAsk, r = this._revealing;
    return !!(ask && ask.desk === desktopId) || !!(r && r.desk === desktopId && r.gen === (this._revealGen || 0));
  }

  /** Reveal `id` (a person named it — never the replay's raise) on `desk` once the window exists — only while nothing has happened
   *  since the open that named it (`gen` is still the generation, `desk` still on show). A REVEAL WAITS ONLY FOR WHAT IS NOT YET
   *  STANDING (r5 O — the r4 acceptance's qR: a reveal that waited for the window's group to re-form revealed nothing when a member
   *  took > 5 s): its switch, its build — never a group; a group still forming around it forms with it in front (layout.js
   *  showWhenFormed). A REVEAL IS NEVER GIVEN UP IN SILENCE (r6 R — the r5 acceptance: a window that stood after 50 × 100 ms was
   *  left unrevealed, `_revealAsk` set, nothing said): it waits for as long as the window is still coming (_buildState — no clock
   *  of its own); it retires by the person's own act (the generation) or by the open's failure, which is SAID (the opener's error
   *  word; a build that gave no sign of life within the page's own grace for it, BUILD_GRACE_MS: «its window did not appear») —
   *  once, `_revealAsk` clear. */
  _revealWhenBuilt(id, desk, gen) {
    if ((this._revealGen || 0) !== gen) return; // the person moved on: the reveal retires
    // A REVEAL WAITS FOR THE SWITCH IT ASKED FOR (r4 L — the r3 acceptance: an open while another switch still held its 1 s gate
    // queued its own switch, and the reveal retired at once because its desktop was not on show yet): that switch is still to
    // land (queued, or in flight) ⇒ it waits for it; its desktop not on show and no switch to it coming ⇒ the open failed (said)
    const coming = this._pendingSwitch === desk || (this._restoring && this._activeId !== desk);
    if (this._activeId !== desk && !coming) return this._revealFailed(id, null);
    const wm = this.app.wm;
    if (this._activeId !== desk || !wm.windows.has(id)) {
      const b = this._activeId !== desk ? { s: 'coming' } : this._buildState(id, desk);
      if (b.s === 'coming') { setTimeout(() => this._revealWhenBuilt(id, desk, gen), 100); return; }
      return this._revealFailed(id, b.why || null);
    }
    this._revealAsk = null;
    this.app.layoutManager?.showWhenFormed?.(id, desk);
    this._revealing = { gen, desk: wm.windows.get(id)._desktopId || desk }; // a switch its revealWindow makes — to the window's desktop — is this reveal's own (r7 Q′, r8)
    wm.revealWindow?.(id);
  }

  /** A reveal waiting for window `id` of `desk` (r6 R): 'coming' while its build is alive — its opener still answering (an async
   *  opener's promise, a restore's reads: _opening) or the page's attempt within its grace — else 'failed' with the opener's error
   *  word (`why`), or 'failed' with none (no build of it is alive: it gave no sign of life). AN OPENER STILL OUT IS A SIGN OF LIFE
   *  ONLY WITHIN THE SAME GRACE (r7 — the r6 acceptance's t3: a promise that never settles kept the reveal polling at 10 Hz for ever,
   *  nothing said, `_revealAsk` set): past BUILD_GRACE_MS from its start it is said once, as a build with no sign of life. */
  _buildState(id, desk) {
    const o = this._openers?.get(String(id));
    if (o && o.desk === desk) {
      if (o.why == null && Date.now() - o.at <= BUILD_GRACE_MS) return { s: 'coming' };
      this._openers.delete(String(id));
      return { s: 'failed', why: o.why };
    }
    const a = this._buildAttempts.get(String(id));
    if (a && a.desk === desk && Date.now() - a.at <= BUILD_GRACE_MS) return { s: 'coming' };
    return { s: 'failed' };
  }

  /** An opener of window `id` of `desk` still answering (a promise: an async opener, the restore's session reads) — a sign of life for
   *  a reveal waiting on it; a rejection's error word is kept for that reveal to say (_buildState). */
  _opening(id, desk, p) {
    const o = this._openers || (this._openers = new Map()), me = { desk, why: null, at: Date.now() };
    o.set(String(id), me);
    while (o.size > 64) o.delete(o.keys().next().value);
    Promise.resolve(p).then(() => { if (o.get(String(id)) === me) o.delete(String(id)); }, (err) => { if (o.get(String(id)) === me) me.why = String((err && err.message) || err || ''); });
  }

  /** The reveal of `id` ends without it (r6 R): said ONCE, naming the conversation — the opener's error word, or «its window did not
   *  appear» — and `_revealAsk` left clear. */
  _revealFailed(id, why) {
    const ask = this._revealAsk;
    this._revealAsk = null;
    const name = (ask && ask.id === String(id) && ask.name) || String(id);
    showToast(t('Could not open “{name}”: {why}', { name, why: why || t('its window did not appear') }), { type: 'error', duration: 8000 });
  }

  /** A person's open of a conversation whose window STANDS on the desktop on show (session-lifecycle _focusExistingSession /
   *  _focusPendingAttach): the caller reveals it NOW (r5 O — the r4 acceptance's qR / qR2: r4 deferred that reveal while the
   *  window's group was still forming, and a group waiting on a copy or a slow member revealed nothing, focused nothing, said
   *  nothing). The open is an act (an earlier deferred reveal retires); a group still forming around the window forms with it
   *  in front (layout.js showWhenFormed) — a double-click's second open lands on the same tab the first one asked for. */
  keepInFront(id) {
    const w = this.app.wm.windows.get(String(id));
    if (!w || w._onStage) return;
    this._noteAct();
    const desk = w._desktopId || this._activeId;
    this.app.layoutManager?.showWhenFormed?.(String(id), desk);
    // THE LATEST ACT WINS (r8 — the r7 acceptance: the person pressed another desktop's tile inside the 1 s gate, then opened a
    // conversation whose window stands on the desktop on show; the open made no switch, the queued one stayed armed and its drain
    // took the person away from what they had just opened): an open that lands on the desktop on show consumes a switch queued
    // before it, as switchTo(active) does; a press made after the open queues its own and wins (r7 u2)
    if (desk === this._activeId) this._pendingSwitch = null;
    this._revealing = { gen: this._revealGen || 0, desk }; // the caller's revealWindow switches to THIS desktop next: the reveal's own switch (r7 Q′, r8)
  }

  /** ONE CONVERSATION, ONE WINDOW (userW inc-mw1ogdno-5jny — THE WRITER): a person opening a conversation (session-lifecycle
   *  attachSession, not a replay) whose window waits in the held record of ANOTHER desktop this page has not built goes to that
   *  desktop — its switch builds the window — never a second window on the desktop on show. true = switched. A COPY IS NEVER A
   *  REVEAL TARGET (r7 S — the r6 acceptance: with the conversation's window still attaching on this page, the open went to another
   *  desktop's entry of it, where nothing gets built — _replayMissing settles a copy at once — and said «its window did not appear»
   *  while that window was on screen on the desktop just left): an entry of a conversation that already has a window on this page
   *  (copiesOf — attached, still attaching, or past its attach's 15 s) is passed over; the open resolves to that window first
   *  (session-lifecycle attachSession: the window shown, then the window still attaching, only then a held one). */
  revealHeldSession(serverId) {
    if (!serverId || this.app.stage?.isActive) return false;
    const live = this._shownCensus().live; // an entry names the session its own door attaches (r9 — doorSessionOf: a recipe's session)
    for (const [desk, st] of this._savedStates) {
      if (desk === '__stage__' || desk === this._activeId || !this._desktops.some((x) => x.id === desk)) continue;
      const e = (st?.windows || []).find((w) => w && w.openSpec && doorSessionOf(w, live) === String(serverId) && !this.app.wm.windows.has(String(w.winId || w.id)));
      if (!e || this.copiesOf(desk).includes(String(e.winId || e.id))) continue;
      const id = String(e.winId || e.id);
      try { window.__vsOp?.('desktop-reveal-held', { desk, win: id }); } catch { }
      // A PERSON'S OPEN REVEALS THE CONVERSATION (r2; inc-muiq348r-jwb5's rule — the USER named it ⇒ wm.revealWindow, its own tab
      // even when it is a guest of a group that shows another): the switch builds the desktop (its groups with the record's active
      // tab), then the window is revealed once it stands and no group is still re-forming around it
      // A LATE REVEAL NEVER TAKES THE PERSON BACK (r3 H): the open is an act (a reveal still waiting from an earlier one retires);
      // this one belongs to the generation after its own switch
      // A REVEAL WAITS FOR THE SWITCH IT ASKED FOR (r4 L): the ask names its desktop — that switch, queued or not, keeps its generation
      this.revealHeld(id, desk, e.openSpec.name || e.title || null); // the conversation's name, for a failure said (r6 R)
      return true;
    }
    return false;
  }

  /** A person named window `id`, which `desk`'s held record lists and this page has not built (revealHeldSession's open; the ⧉ window
   *  list's «Other desktops» row — taskbar goOtherDesk, r8): the switch builds it, then it is revealed — THE deferred reveal (r4 L, r6 R:
   *  it waits for as long as the window is still coming, retires by the person's next act, and a failure is said ONCE with `name`). */
  revealHeld(id, desk, name = null) {
    id = String(id);
    this._noteAct();
    const gen = this._revealGen || 0;
    this._revealAsk = { id, desk, gen, name };
    Promise.resolve(this.switchTo(desk)).then(() => this._revealWhenBuilt(id, desk, gen)).catch((err) => {
      console.warn('[desktop] the switch to the conversation\'s desktop failed', err);
      if ((this._revealGen || 0) === gen) this._revealFailed(id, String((err && err.message) || err || '')); // the open's failure, said (r6 R)
    });
  }

  /** Open the held windows of `desktopId` that the page does not have yet (openSpec-backed; one already being built
   *  is left to its attempt) — a first visit (switchTo step 6), and a refused record's reconcile. Returns the count. */
  _replayMissing(desktopId, state) {
    let n = 0;
    const now = Date.now();
    const noSpec = [], building = [], bySession = [];
    // a webui SESSION already open on this page under ANOTHER window id: attachSession's "already open in a live
    // window" shortcut (_focusExistingSession, keyed on the server session id) focuses that window and builds
    // nothing. The key is the session's `serverId`, never the conversation id (verify r2): a fork's window carries
    // its PARENT's backendSessionId in its openSpec, so the conversation id settled the parent's own never-opened
    // entry as a duplicate and dropped it from its desktop's record — attachSession would have built it.
    const census = this._shownCensus(), liveServerIds = new Set(census.shows.keys()); // the copy verdicts' one census (r9)
    for (const ws of state?.windows || []) {
      const winId = ws.winId || ws.id;
      if (!winId || this.app.wm.windows.has(winId)) continue;
      if (!ws.openSpec && isSession(ws)) {
        // A COPY IS NEVER RESTORED (r8 — the r7 acceptance's «bysession»: a row with no openSpec, of a conversation whose window this
        // page was still attaching on another desktop, was restored on a visit — the restore's attach found that window and took the
        // person back to it ~1 s after their own switch, a reveal in flight retired, nothing said): the verdict of the openSpec door
        // below — a conversation this page already shows, attached or still attaching, is settled at once (a ghost of it: copiesOf)
        // …BY ANY NAME THE RESTORE READS (r9 — the r8 acceptance: a row naming it only by its conversation id, or by a stale server
        // id beside it, was restored; its attach found the window on the other desktop): _isCopy, the restore's own ladder
        if (this._isCopy(ws, census)) { noSpec.push(winId); continue; }
        // lane layout-stopped-window: built by its identity — attached, read-only or a placeholder, never 'unbuilt'; one already
        // being built (an earlier replay whose reads are still out — r2: two doors 50 ms apart built every window twice) is left to it
        const a = this._buildAttempts.get(String(winId));
        if (!(a && a.desk === desktopId && now - a.at <= BUILD_GRACE_MS)) bySession.push(ws);
        continue;
      }
      if (!ws.openSpec) { noSpec.push(winId); continue; } // nothing to build it from: settled at once (dropped as before, with evidence)
      // …nor can a second window of a session this page already shows live: settled at once too (verify r1: it
      // lingered as a build attempt for the whole 20 s grace — a record entry nobody could build, which the server
      // then held against every other client's write)
      if (ws.openSpec.action === 'attachSession' && ws.openSpec.serverId && liveServerIds.has(ws.openSpec.serverId)) { noSpec.push(winId); continue; }
      const a = this._buildAttempts.get(String(winId));
      if (a && a.desk === desktopId && now - a.at <= BUILD_GRACE_MS) continue; // already being built
      const opened = this.app.replayOpenSpec(ws.openSpec, winId);
      if (opened && typeof opened.then === 'function') this._opening(winId, desktopId, opened); // still answering: a sign of life (r6 R)
      this._noteAttempts(desktopId, [winId], { at: now });
      building.push(String(winId));
      n++;
      // Tag and position after creation
      setTimeout(() => {
        const newWin = this.app.wm.windows.get(winId);
        if (newWin) {
          newWin._desktopId = desktopId;
          if (ws.gridBounds) {
            newWin.gridBounds = ws.gridBounds;
            this.app.wm._applyGridBounds(newWin);
          }
        }
      }, 500);
    }
    this._noteAttempts(desktopId, noSpec, { at: 0 });
    if (bySession.length) {
      const sids = windowIds(bySession);
      this._noteAttempts(desktopId, sids, { at: now });
      building.push(...sids); n += sids.length;
      // the restore's session door (layout.js restoreState: alive ⇒ attached, stopped ⇒ read-only, else a placeholder); its
      // windows are this desktop's whatever is on show when its reads answer
      const restoring = Promise.resolve(this.app.layoutManager?.restoreState?.({ windows: bySession }));
      for (const id of sids) this._opening(id, desktopId, restoring); // its reads still out: a sign of life (r6 R)
      restoring.then(() => {
        for (const id of sids) { const w = this.app.wm.windows.get(id); if (w && w._desktopId !== desktopId) { w._desktopId = desktopId; if (desktopId !== this._activeId) this._hideWin(w); } }
      }).catch(() => {});
    }
    // the record's tab groups (lane split-restore-hidden, userW inc-muundq37-cjay): a first visit after a reload built
    // every member as a plain window and the next save wrote the split away — each chain waits for its last member.
    // Only a chain naming a window THIS replay builds (int214: this runs on every switch — a chain whose members all stand
    // here is the page's own truth, and re-queuing it re-formed a group the user had just split; test-stage-dragout-ui 6 T1)
    if (building.length) this.app.layoutManager?.queueRecordChains?.(desktopId, state, { naming: building });
    return n;
  }

  /** The record `desktopId` was last seen as ON THE WIRE (a save this client sent, a remote record it applied or
   *  cached, the disk record it booted from): the window ids it listed. */
  noteWire(desktopId, state) {
    if (!desktopId || desktopId === '__stage__' || !state || !Array.isArray(state.windows)) return;
    if (!this._desktops.some((d) => d.id === desktopId)) return; // a desktop this page does not know (verify r2 ④)
    this._wireIds.set(desktopId, new Set(state.windows.map((w) => String(w.winId || w.id))));
  }

  /** WHO IS LOOKING IS A FACT ABOUT THE PAGE, NOT A STATE OF ITS SOCKET (r3 F, userW inc-mw1ogdno-5jny — the r2 acceptance: a page
   *  whose socket was down when another page's dedup was accepted closed, at its reconnect's re-read, the window it was showing):
   *  `win` is a session window this page has BUILT (it shows that conversation) and the record of `desk` dropped it as a duplicate
   *  the hub let go (`dupsLeft` — the hub's trace, relayed with the write and read back by every re-read). Then no record closes
   *  it: kept, its desktop owed (the next save lists it again — the hub learns it). true = kept. Nothing is said (law C). */
  keepsShown(win, desk, dupsLeft) {
    if (!win || !Array.isArray(dupsLeft) || win._onStage || win._desktopId === '__stage__') return false;
    if (win._openSpec?.action !== 'attachSession' || !win._openSpec.serverId) return false;
    if (!dupsLeft.some((e) => e && String(e.id) === String(win.id))) return false;
    const d = desk || win._desktopId || this._activeId;
    if (d !== this._activeId) this._dirtyDesks.add(d);
    const k = this._keptNow || (this._keptNow = new Map()); if (!k.has(d)) k.set(d, new Set()); k.get(d).add(String(win.id)); // read back in its place and group (keptRecord)
    try { window.__vsOp?.('layout-dup-kept', { desk: d, win: String(win.id) }); } catch { }
    return true;
  }
  /** The windows keepsShown kept for `desk` in the record now being taken (the apply's, or a hidden desktop's cache) — once. */
  _takeKept(desk) { const s = this._keptNow?.get(desk); if (s) this._keptNow.delete(desk); return s ? [...s] : []; }

  /** A KEPT WINDOW KEEPS ITS PLACE (r4 J — the r3 acceptance: the window kept on show left its tab group, the re-send wrote it
   *  alone and every page lost the group, while the hidden road kept it — the two roads disagreed): `state` is a record of `desk`
   *  that let `ids` go as another page's duplicates while this page shows them (keepsShown). It is read as the record before the
   *  dedup: each kept window's row back where this page's held record had it (after its nearest earlier row still listed), and
   *  each group it was a member of given it back (chain-layout withMembersBack — the group exactly as it was when nothing else
   *  changed it; another page's change to that group meanwhile stands, the window in its old place in it). The ONE reading for
   *  both roads — the apply of the desktop on show (layout.js) and a hidden desktop's cache (cacheRemoteState). */
  keptRecord(desk, state, ids) {
    const prev = this._savedStates.get(desk);
    if (!prev || !Array.isArray(prev.windows) || !state || !Array.isArray(state.windows) || !ids || !ids.length) return state;
    let rows = [...state.windows];
    const at = (id) => rows.findIndex((r) => rowId(r) === id);
    const back = ids.map(String).filter((id) => at(id) < 0 && prev.windows.some((r) => rowId(r) === id));
    for (const id of back) {
      const pi = prev.windows.findIndex((r) => rowId(r) === id);
      let k = 0; for (let j = pi - 1; j >= 0; j--) { const q = at(rowId(prev.windows[j])); if (q >= 0) { k = q + 1; break; } }
      rows = [...rows.slice(0, k), prev.windows[pi], ...rows.slice(k)];
    }
    const groups = new Map(); // the chain each kept window was in → the kept ids of it
    for (const id of back) { const was = prev.windows.find((r) => rowId(r) === id).tabChain; if (was && Array.isArray(was.tabs)) { const k = chainSyncKey(was); const g = groups.get(k) || { was, ids: [] }; g.ids.push(id); groups.set(k, g); } }
    for (const { was, ids: kept } of groups.values()) {
      const mate = rows.find((r) => !kept.includes(rowId(r)) && was.tabs.map(String).includes(rowId(r))); // the group as this record reads it
      const c = withMembersBack(mate ? mate.tabChain || null : null, was, kept);
      const members = new Set(c ? c.tabs.map(String) : kept);
      rows = rows.map((r) => (members.has(rowId(r)) ? withChain(r, c) : r));
    }
    return { ...state, windows: rows };
  }

  /** Did the last record of `desktopId` on the wire list `winId`? (A reconnect's re-read may close only these.) */
  wireListed(desktopId, winId) {
    const base = this._wireIds.get(desktopId);
    return !!base && base.has(String(winId));
  }

  /** A remote record for a desktop this client is NOT showing (inc-mukeyzpt-lpou, the parked second client). It
   *  replaces the cached record (as before) — and a window this client still HOLDS there, hidden, that the
   *  record's sender REMOVED (the last record on the wire listed it, this one does not: somebody closed it) is
   *  closed here now. Before, the stale window waited in this client's DOM: the next switch showed it again and
   *  this client's next save wrote it back to every other client. A window the wire never listed for that desktop
   *  (moved or opened here, not yet sent) is this client's own change and stays; a window on show (the stage) is
   *  never touched. The closes are not this user's (no held close, no save: `_restoring` around them). */
  cacheRemoteState(desktopId, state, { receivedAt = Date.now(), dupsLeft = null } = {}) {
    const base = this._wireIds.get(desktopId);
    const now = new Set(((state && state.windows) || []).map((w) => String(w.winId || w.id)));
    // …unless another desktop's record lists it now: it MOVED there (a remote move — lane desktop-move verify r1);
    // a window this page moved here AFTER the record arrived, or whose move no save has carried yet, is the user's own
    // act the record cannot know (verify r2; THE UNSAVED ACT, verify r4 ①: layout.js actHeld)
    const gone = base ? [...this.app.wm.windows.values()].filter((w) => w._desktopId === desktopId && w._hiddenByDesktop && !w._onStage && w._openSpec && base.has(String(w.id)) && !now.has(String(w.id)) && !this.app.layoutManager?.actHeld?.(w._movedAt, receivedAt, w)).filter((w) => !this.adoptRemoteMove(w, desktopId)) : [];
    // WHO IS LOOKING IS A FACT ABOUT THE PAGE (r3 F): a window this page shows (hidden here) that another page's dedup wrote away —
    // the hub's trace names it — stays, and this desktop's next save lists it again
    const kept = gone.filter((w) => this.keepsShown(w, desktopId, dupsLeft));
    if (kept.length) { gone.splice(0, gone.length, ...gone.filter((w) => !kept.includes(w))); setTimeout(() => this.app.layoutManager?.resendKeptShown?.(), 1000); } // after the re-read's own apply gate (its dirty clear), as layout.js's held re-sends
    // …in its place and its group (r4 J — the one reading for both roads: keptRecord)
    const wire = state;
    state = this.keptRecord(desktopId, state, this._takeKept(desktopId));
    if (gone.length) {
      const lm = this.app.layoutManager, was = lm._restoring;
      lm._restoring = true; lm._applying = true; // these closes are the record's, not the user's (verify r3 ③)
      try { for (const w of gone) if (this.app.wm.windows.has(w.id)) this.app.wm.closeWindow(w.id); } finally { lm._restoring = was; lm._applying = false; }
    }
    // EVERY OPEN PAGE FOLLOWS A ROW'S RE-KEY (lane phone-resume-keeps-layout r2, N2) — on a desktop not on show too: a DEAD view this
    // page holds there (hidden) of a row whose record now names another session goes as the row's re-opening (no evidence), and the
    // next switch builds the row from the record (layout.js _deadFor — the apply's own rule on the desktop on show)
    const lmr = this.app.layoutManager, rows = new Map(((state && state.windows) || []).map((r) => [rowId(r), r]));
    const dead = [...this.app.wm.windows.values()].filter((w) => w._desktopId === desktopId && w._hiddenByDesktop && !w._onStage && rows.has(String(w.id)) && lmr?._deadFor?.(w, rows.get(String(w.id)).openSpec));
    if (dead.length) { lmr._applying = true; try { for (const w of dead) { this.reopenRow(w.id); this.app.wm.closeWindow(w.id); } } finally { lmr._applying = false; } }
    // the server's record, as it is — minus a window THIS page closed that no save has carried yet (the held close:
    // the record is older than the close; the next switch would replay it, and a save of this desktop re-send it)
    this._relisted(desktopId, state);
    const held = this.app.layoutManager?.heldCloseIds?.() || [];
    this._setRecord(desktopId, held.length ? mergeDesktopRecord({ record: state, remove: held }) : state);
    this.noteWire(desktopId, wire);
  }

  /** A REMOTE MOVE (lane desktop-move verify r1, D4): a window this page holds on `from` that the wire now places
   *  on another desktop — `to` when the caller knows it (the record of the desktop on show lists it), else the
   *  desktop whose HELD record lists it (a move's target record is sent first, so it is there before the source's
   *  drops it). The window is retagged and shown / hidden as its new desktop is — never closed: a close here
   *  became 'closed' evidence and the next save of the target dropped the moved window on the server. Returns the
   *  desktop it moved to, or null (the window is nobody else's: a real close). Stage windows are never moved. */
  adoptRemoteMove(win, from, { to = null, rec = null } = {}) {
    if (!win || !win.id || win._onStage || win._desktopId === '__stage__' || win._isStagePlaceholder) return null;
    const id = String(win.id);
    let dest = null, entry = rec;
    if (to) {
      // the caller KNOWS where the record places the window (the record of the desktop on show lists it): the answer
      // is that desktop or nothing — never the held-record search below. `to === from` fell through to it and moved a
      // window OUT of the desktop on show, listed by its record, to a desktop whose STALE held record also listed it
      // (this page's own unsaved move, a racing double) — the window bounced Fin ⇄ HR on every record (verify r4 ②)
      if (to === from || to === '__stage__') return null;
      dest = to;
    } else {
      for (const [d, st] of this._savedStates) {
        if (d === from || d === '__stage__' || !this._desktops.some((x) => x.id === d)) continue;
        const e = (st?.windows || []).find((w) => String(w.winId || w.id) === id);
        if (e) { dest = d; entry = e; break; }
      }
    }
    if (!dest || dest === win._desktopId) return null;
    win._desktopId = dest;
    if (entry?.gridBounds) { win.gridBounds = { ...entry.gridBounds }; try { this.app.wm._applyGridBounds(win); } catch { } }
    if (dest === this._activeId) { if (win._hiddenByDesktop) this._showWin(win); }
    else if (!win._hiddenByDesktop) this._hideWin(win);
    try { window.__vsOp?.('desktop-move-remote', { win: id, from: from || null, to: dest }); } catch { }
    return dest;
  }

  async switchTo(desktopId) {
    // Stage state-machine guard (2.209.0): while staged, EVERY switch must
    // route through stage.leave() — a raw switchTo would captureState the
    // stage's window set under the '__stage__' key (poisoning
    // desktops['__stage__'] in layouts.json, lazily replayed later as real
    // windows at slot bounds) and leave stage._active desynced from
    // _activeId. Reachable while staged via the + add-desktop button,
    // command-mode d/D, moveSessionWindow, and _onRemoteDesktopUpdated.
    // Conversely '__stage__' is never a switchTo target — route to enter().
    if (desktopId === '__stage__') {
      if (this.app.stage && this.app.stage.enabled && !this.app.stage.isActive) this.app.stage.enter();
      return;
    }
    if (this.app.stage?.isActive) return this.app.stage.leave(desktopId);
    if (desktopId === this._activeId) { this._pendingSwitch = null; return; }
    // a switch, whoever asked it, retires a reveal still waiting (r3 H) — except the switch that reveal ASKED for, queued or not, and
    // a switch to that same desktop (r4 L: the queued switch's drain moved the generation and the person's open revealed nothing) —
    // and a switch a reveal performs now never drops the front mark it set (r7 Q′: _revealsSwitch)
    if (!this._revealsSwitch(desktopId)) this._noteAct();
    // Rapid switching: a switch requested mid-flight is QUEUED (latest wins),
    // not dropped — dropping left the user's actual position out of sync with
    // _activeId, so a later capture/save could persist the WRONG desktop's
    // window set over another's (real report: windows vanish on fast switches).
    if (this._restoring) { this._pendingSwitch = desktopId; return; }
    this._revealing = null; // a switch lands: a reveal's own switch is spent — once (r8); queued, it stays the reveal's until its drain lands
    this._restoring = true;

    try {
      // 1. Capture current desktop state and cache it. MERGE-PRESERVE: a window
      // that was in this desktop's PRIOR saved state (an openSpec-backed window
      // still lazy-replaying — chat re-attach, disk restore) may not be in the
      // DOM yet, so the fresh capture would drop it. Carry such windows forward
      // so a fast switch-away never persists a desktop MINUS its slow windows.
      // (userW inc-mun7qjmw-iksh: the ONE record door — the held record merged with the built windows; a window
      // the page tried to build and could not is the only one dropped, and it is named to the server.)
      const currentState = this.recordFor(this._activeId);
      this._setRecord(this._activeId, currentState);

      // 2. Hide all windows for current desktop
      for (const [, win] of this.app.wm.windows) {
        if (win._desktopId === this._activeId && !win._hiddenByDesktop) {
          this._hideWin(win);
        }
      }

      // 3. Switch active desktop
      const prevId = this._activeId;
      this._activeId = desktopId;

      // 4. Apply target desktop's grid
      const targetState = this._savedStates.get(desktopId);
      if (targetState?.grid) {
        this.app.wm.setGrid(targetState.grid.rows, targetState.grid.cols);
      } else {
        this.app.wm.setGrid(null);
      }

      // 5. Show windows for target desktop (visibility:hidden preserves all state)
      let hasWindows = false;
      for (const [, win] of this.app.wm.windows) {
        if (win._desktopId === desktopId && win._hiddenByDesktop) {
          this._showWin(win);
          hasWindows = true;
        }
      }
      // Single reflow: recalculate all visible windows' pixel positions from gridBounds
      this.app.wm._reflowWindows();

      // 6. Create windows that exist in saved state but not yet in DOM
      // (from other clients or disk restore) — each one an ATTEMPT: still absent after the grace, it is one this page
      // cannot build and the record drops it (with evidence); until then it stays in the record
      if (targetState?.windows) {
        if (this._replayMissing(desktopId, targetState)) hasWindows = true;
      }

      // 7. Update UI
      this._renderSwitcher();
      this.app.updateTaskbar();
      this.app._checkWelcome();
      // Lazy-replayed windows get their gridBounds AFTER this render (async
      // capture timers) and nothing re-renders the switcher on its own — the
      // newly active desktop's preview stayed white until the next unrelated
      // interaction (real report). Two delayed digest-invalidating refreshes
      // (the second covers slow replays, e.g. chat windows re-attaching).
      setTimeout(() => this.refreshSwitcher(), 400);
      setTimeout(() => this.refreshSwitcher(), 1300);

      // 8. Broadcast (save previous desktop's state, then save current desktop)
      // Use non-restoring doAutoSave for the previous desktop
      this._broadcastDesktopState(prevId, currentState);
      // Schedule save for new active desktop
      setTimeout(() => this.app.layoutManager.scheduleAutoSave(), 300);

    } finally {
      setTimeout(() => {
        this._restoring = false;
        // drain a queued switch (latest wins) so rapid clicks all land
        if (this._pendingSwitch != null && this._pendingSwitch !== this._activeId) {
          const next = this._pendingSwitch; this._pendingSwitch = null;
          this.switchTo(next);
        } else { this._pendingSwitch = null; }
      }, 1000);
    }
  }

  /** Move a window to another desktop → `{ok:true}` | `{ok:true, moved:false}` (nothing to move) | a Stage refusal
   *  `{ok:false, code:'stage-window'|'onto-stage', kind}` (PURE stage-rules.js). `speak` = a USER's act (a drop on a
   *  preview, the menu, the keyboard): a refusal is said in a toast — never silent (inc-muly2izg-cks3). Programmatic
   *  callers (resume placement) pass nothing and read the result. `replaces` = the id of the record entry this window
   *  takes the place of on the target (a resumed conversation landing where its old, never-opened window was). */
  moveWindowToDesktop(winId, desktopId, { speak = false, replaces = null } = {}) {
    let win = this.app.wm.windows.get(winId);
    if (!win) return { ok: false, code: 'no-window' };

    // Stage↔desktop moves are blocked in BOTH directions (user directive
    // 2.112.4, superseding the earlier unbind+move design): stage-view
    // windows stay on the stage, and nothing moves ONTO the stage — and the
    // refusal SPEAKS (inc-muly2izg-cks3: it used to return in silence).
    const v = this.app.stage?.moveVerdict ? this.app.stage.moveVerdict(win, desktopId)
      : (desktopId === '__stage__' ? { ok: false, code: 'onto-stage', kind: null } : { ok: true });
    if (!v.ok) { if (speak) this.sayStageRefusal(v); return v; }
    if (v.same) return { ok: true, moved: false };
    // Tab chains live on ONE desktop (invariant enforced at creation):
    // move the whole group together, anchored at the host. Moving a single
    // guest used to split the chain across desktops, which captureState /
    // restoreTabChain can't represent.
    const members = win._tabChain ? win._tabChain.tabs.map(id => this.app.wm.windows.get(id)).filter(Boolean) : [win];
    if (win._tabChain) win = members[0]; // host owns the visible element
    if (!win || win._desktopId === desktopId) return { ok: true, moved: false };

    // breadcrumb AFTER the guards — the ONE op that relocates a window between
    // desktops, and an incident bundle must be able to answer "what moved my
    // windows". Logging above the guards recorded moves that never happened.
    try { window.__vsOp?.('desktop-move', { win: win.id, from: win._desktopId, to: desktopId, chain: members.length }); } catch {}
    const from = win._desktopId || null;
    const movedAt = Date.now();
    for (const m of members) { m._desktopId = desktopId; m._movedAt = movedAt; } // THE HELD MOVE's witness (verify r2): a record received before this instant cannot know it

    // If moving to a non-active desktop, hide (host element carries the group)
    if (desktopId !== this._activeId) {
      this._hideWin(win);
    }

    // The two held records: the target ADDS the moved windows (so its preview shows them), the source drops them —
    // nothing else in either is touched (userW inc-mun7qjmw-iksh: this rebuilt the target from the page's built
    // windows, which for a desktop never opened since the page loaded is nothing but the moved one)
    this._updateCachedDesktop(desktopId, { from, ids: members.map((m) => m.id), replaces: replaces ? [replaces] : [] });

    this._renderSwitcher();
    this.app.updateTaskbar();
    this.app.layoutManager.scheduleAutoSave();
    this.app._checkWelcome();
    return { ok: true, moved: true };
  }

  /** Say a Stage move refusal (the ONE toast every user door shows — the drop on a preview, the menu, the keyboard). */
  sayStageRefusal(v) {
    const text = stageRefusalSentence(v, { t });
    if (text) showToast(text, { type: 'warn', duration: 6000 });
    return text;
  }

  /** A move's two held records (userW inc-mun7qjmw-iksh). The TARGET: the moved windows (`ids`, captured whole)
   *  are ADDED and what they `replaces` is dropped — every other window of its record stays exactly as it is, built
   *  here or not. The SOURCE: the moved windows leave it. A desktop not on show is marked dirty: the next autosave
   *  sends its HELD record (never a list derived from the page). The moves are evidence for the server's belt. */
  _updateCachedDesktop(desktopId, { from = null, ids = [], replaces = [] } = {}) {
    // the moved windows through THE ONE CAPTURE: on a phone each keeps the arrangement the record it LEAVES holds (one
    // born on the phone: no box, on top of both) — never the phone's own z / full-screen box (phone-arrangement-verify F3)
    const src = (from && this._savedStates.get(from)) || { windows: [] }, dst = this._savedStates.get(desktopId) || { windows: [] };
    const moved = this.captureBuilt(desktopId, { windows: [...(src.windows || []), ...(dst.windows || [])] }, ids);
    const replaced = ids.length === 1 ? replaces.map((r) => [ids[0], r]) : []; // lane layout-stopped-window: the resumed window takes the replaced entry's name
    this._setRecord(desktopId, mergeDesktopRecord({ record: this._savedStates.get(desktopId) || { windows: [] }, add: moved, remove: replaces, replaced }));
    if (replaced.length) this.app.layoutManager?.queueRecordChains?.(desktopId, this._savedStates.get(desktopId), { naming: [String(ids[0])] }); // …its seat in the replaced row's group, held until the group forms here (lane phone-resume-keeps-layout)
    if (from && from !== desktopId && this._savedStates.has(from)) this._setRecord(from, mergeDesktopRecord({ record: this._savedStates.get(from), remove: ids }));
    for (const d of [desktopId, from]) if (d && d !== this._activeId && d !== '__stage__') this._dirtyDesks.add(d);
    for (const id of ids) { this._buildAttempts.delete(String(id)); this._noteDeparted(id, 'moved'); }
    for (const id of replaces) { this._buildAttempts.delete(String(id)); this._noteDeparted(id, 'replaced', ids.length === 1 ? ids[0] : null); }
  }

  // ── Remote sync ──

  _onRemoteDesktopUpdated(msg) {
    if (msg.desktops) {
      const before = JSON.stringify(this._desktops.map((d) => [d.id, d.name])); // what an open list drew (r2 ①)
      const oldIds = new Set(this._desktops.map(d => d.id));
      const newIds = new Set(msg.desktops.map(d => d.id));
      this._desktops = msg.desktops;

      // Reassign windows from deleted desktops — to the desktop the DELETER's record put them on (verify r2 ④):
      // deleteDesktop merges them into its target's record and broadcasts it BEFORE `desktop-delete` (b21c2d40),
      // so the target's held record (or its record still deferred under a gate) lists them; the first remaining
      // desktop only when nothing does. (The old rule sent them to desktop #1 on every OTHER page: a second record
      // of the same windows on the server, and on the deleter's page they then jumped from its target to #1.)
      // STAGE-owned windows are EXEMPT ('__stage__' is never in the meta, so
      // every remote desktop create/rename/delete used to retag the whole
      // stage — placeholder included — onto a normal desktop, turning parked
      // slot-geometry ex-heroes into desktop windows at slot bounds).
      const gone = [...oldIds].filter((id) => !newIds.has(id));
      const homeOf = (winId) => {
        const id = String(winId);
        for (const [d, st] of this._savedStates) if (newIds.has(d) && (st?.windows || []).some((w) => String(w.winId || w.id) === id)) return d;
        for (const [, m] of this.app.layoutManager?._pendingRemote || []) if (m?.desktopId && newIds.has(m.desktopId) && (m.state?.windows || []).some((w) => String(w.winId || w.id) === id)) return m.desktopId;
        return null;
      };
      const fallbackId = this._desktops[0]?.id;
      let activeHome = null; // where the desktop on show's windows went — the switch follows them
      if (fallbackId) {
        for (const [, win] of this.app.wm.windows) {
          if (win._desktopId && win._desktopId !== '__stage__' && !newIds.has(win._desktopId)) {
            const dest = homeOf(win.id) || fallbackId;
            if (win._desktopId === this._activeId && !activeHome) activeHome = dest;
            win._desktopId = dest;
            if (dest === this._activeId) { if (win._hiddenByDesktop) this._showWin(win); }
            else if (!win._hiddenByDesktop) this._hideWin(win);
          }
        }
      }
      // the deleted desktops' held records, wire bases and deferred records go with them — never a ghost record a
      // late broadcast or the drain fills (verify r2 R1(b))
      for (const id of gone) { this._savedStates.delete(id); this._wireIds.delete(id); for (const k of deferKeysOf(id)) this.app.layoutManager?._pendingRemote?.delete(k); } // both writer classes' slots (B-4767)

      // If our active desktop was deleted, switch to where its windows went (else the first). While staged,
      // _activeId is '__stage__' (never in the meta) — the old check
      // force-yanked a staged client off the stage on ANY remote desktop
      // meta change.
      if (!newIds.has(this._activeId) && this._activeId !== '__stage__' && this._desktops.length > 0) {
        this.switchTo(activeHome || this._desktops[0].id);
      }
      this._renderSwitcher();
      this._followOpenLists(before);
    }
  }

  /** Update desktop metadata from layout-sync message */
  updateFromMeta(desktopMeta) {
    if (!desktopMeta?.length) return;
    const before = JSON.stringify(this._desktops.map((d) => [d.id, d.name]));
    this._desktops = desktopMeta;
    this._renderSwitcher();
    this._followOpenLists(before);
  }

  /** AN OPEN LIST FOLLOWS A REMOTE CHANGE (lane desktop-doors-table r2 ①): the compact list, the phone sheet and the window
   *  switcher are body-level popovers that outlive the switcher's render — a desktop renamed, moved, added or deleted on
   *  another screen redraws each one that is open (PURE followDesktops): a deleted one keeps its row in place, greyed WITH
   *  the why that names it — never a live-looking row whose doors open on nothing, never a row gone from under a pointer or
   *  a held drag (the next row would take the tap, the drop). The compact list is the manager's own — PATCHED IN PLACE, row
   *  by row (its `_follow`, r3 ②: r2 rebuilt the whole popover, so the row under the pointer or a held drag was a new node);
   *  the phone's two hear `vs-desktops`. `before` = the list's [id, name] pairs before the change. */
  _followOpenLists(before) {
    if (JSON.stringify(this._desktops.map((d) => [d.id, d.name])) === before) return;
    const list = document.querySelector('.desktop-switch-menu'), btn = document.querySelector('#desktop-previews .desktop-switch-compact');
    if (list?._follow && btn) list._follow(); // the same list, its rows patched — a sprung one stays the drag's list, its scroll where it was
    else if (list?._follow) { list.remove(); if (this._springList === list) this._springList = null; } // no compact button (the previews have room again): the list has no home
    window.dispatchEvent(new CustomEvent('vs-desktops'));
  }

  /** Broadcast a specific desktop's state (used during switch) */
  _broadcastDesktopState(desktopId, state) {
    if (desktopId === '__stage__') return; // stage state never enters desktop records
    if (!this._desktops.some((d) => d.id === desktopId)) return; // a desktop deleted meanwhile: its record is nobody's to write (verify r2 ④ — the switch off it wrote an orphan record on the server)
    if (this.holdsBack(desktopId, state)) return; // THE BREAKER (inc-mw1ogdno-5jny): the very record the server refused is never re-sent
    const sentAt = Date.now();
    this.app.ws.send({ type: 'layout-sync', state, desktopId, evidence: this.evidence(), sentAt, viewport: this.app.isMobile ? 'phone' : 'desktop', base: this.stampOf(desktopId) });
    this.app.layoutManager?.noteLayoutSent?.([desktopId], sentAt); // this record carries every close made on that desktop (inc-mukeyzpt-lpou) — released once the server READ it (verify r5 ⑤)
    this.noteSent(desktopId, state, sentAt);
  }

  // ── UI: Ubuntu-style desktop previews in taskbar ──

  // Digest-invalidating re-render, debounced. Needed when the preview DOM is
  // stale in a way the digest can't detect (the drag path live-mutates rects
  // directly) or when gridBounds arrive after the last render (async capture
  // timers after switch/snap). Called from wm._captureGridBounds + switchTo.
  refreshSwitcher() {
    if (this._refreshT) return;
    this._refreshT = setTimeout(() => {
      this._refreshT = null;
      this._switcherDigest = null;
      this._renderSwitcher();
    }, 60);
  }

  _renderSwitcher() {
    this.app._mobileNav?.updateDesktopsDoor?.(); // the phone classes' Desktops door follows every desktop change (lane desktop-switch-phone)
    const container = document.getElementById('desktop-previews');
    if (!container) return;
    // Digest guard (audit round-2, high): updateTaskbar funnels EVERY window
    // mousedown/focus/blink here and this rebuilt all previews + listeners
    // each time. Rebuild only when the rendered content would differ.
    // The digest must cover EVERY field the render below filters on —
    // _hiddenByDesktop/_hiddenByStage/_onStage were missing, so stage.leave()'s
    // intermediate render (setGrid fires while the target desktop's windows are
    // still hidden) cached a BLANK preview and the post-show final render
    // early-returned on an identical digest (real report: preview stayed white
    // after leaving the stage until switching desktops).
    // _flashingWinId included (2.247.4, userW's report — THIRD strike of the
    // 2.151.0 class): flashWindow's cross-desktop preview flash sets it and
    // calls _renderSwitcher, but a mere card click changes nothing else, so
    // the digest matched and the flash never painted.
    const digest = JSON.stringify([this._activeId, this._flashingWinId || 0, !!this.app.stage?.enabled, !!this.app.stage?.isActive, this.app.stage?.enabled ? this.app.stage.slotBounds() : 0, this._desktops.map(d => [d.id, d.name]),
      [...this.app.wm.windows.values()].map(w => [w._desktopId, w.isMinimized,
        !!w._hiddenByDesktop, !!w._hiddenByStage, !!w._onStage,
        !!w.element?.classList.contains('window-waiting'),
        w.gridBounds ? [w.gridBounds.left, w.gridBounds.top, w.gridBounds.width, w.gridBounds.height] : w.element?.style.left]),
      // the held records draw the windows a desktop holds that the page has not built (userW inc-mun7qjmw-iksh)
      [...this._savedStates].map(([k, st]) => [k, (st?.windows || []).map((w) => [w.winId || w.id, w.isMinimized ? 1 : 0, w.gridBounds ? [w.gridBounds.left, w.gridBounds.top, w.gridBounds.width, w.gridBounds.height] : 0])])]);
    // lane desktop-small (the owner: «userW有一大堆桌面，屏幕尺寸小了之后桌面就堆积在一起了»): the switcher's FORM is part of what
    // it draws — full (a preview per desktop) or compact (ONE «Desktop k/N ▾» button) — PURE switcherForm over the bar's room
    const form = this._switcherFormFor(container);
    if (digest + form === this._switcherDigest) return;
    this._switcherDigest = digest + form;
    container.innerHTML = '';
    container.classList.toggle('desktop-previews-compact', form === 'compact');
    if (form === 'compact') { this._renderCompactSwitcher(container); return; }

    // Dynamic desktop (Stage): leftmost, visually separated. Clicking enters
    // the stage view; clicking a normal desktop while staged leaves it.
    const stage = this.app.stage;
    if (stage?.enabled) {
      const wrap = document.createElement('div');
      wrap.className = 'desktop-preview-wrapper stage-preview-wrapper';
      const pv = document.createElement('div');
      pv.className = 'desktop-preview stage-preview' + (stage.isActive ? ' active' : '');
      pv.title = t('Stage — sessions materialize here with their workspace');
      // slot outline (always) + stage-visible windows when active
      const slot = stage.slotBounds();
      const slotRect = document.createElement('div');
      slotRect.className = 'desktop-preview-win stage-preview-slot';
      slotRect.style.left = (slot.left * 100) + '%';
      slotRect.style.top = (slot.top * 100) + '%';
      slotRect.style.width = (slot.width * 100) + '%';
      slotRect.style.height = (slot.height * 100) + '%';
      pv.appendChild(slotRect);
      let stageHasWaiting = false;
      if (stage.isActive) {
        for (const [id, win] of this.app.wm.windows) {
          if (stage._isStageVisible(win) && win.gridBounds && !win._isStagePlaceholder) {
            const r = document.createElement('div');
            // waiting-blink + find-flash reach the Stage preview too (2.250.0,
            // real report: neither showed here — the desktop loop drew them,
            // this block didn't)
            const waiting = win.element?.classList.contains('window-waiting');
            const flash = this._flashingWinId === id;
            r.className = 'desktop-preview-win' + (waiting ? ' desktop-preview-win-waiting' : '') + (flash ? ' desktop-preview-find-flash' : '');
            if (waiting) stageHasWaiting = true;
            r.dataset.winId = id;
            r.style.left = (win.gridBounds.left * 100) + '%';
            r.style.top = (win.gridBounds.top * 100) + '%';
            r.style.width = (win.gridBounds.width * 100) + '%';
            r.style.height = (win.gridBounds.height * 100) + '%';
            pv.appendChild(r);
          }
        }
      }
      if (stageHasWaiting) pv.classList.add('desktop-preview-waiting');
      const label = document.createElement('div');
      label.className = 'desktop-preview-label';
      label.textContent = t('Stage');
      wrap.append(pv, label);
      wrap.addEventListener('click', () => { if (!stage.isActive) stage.enter(); });
      container.appendChild(wrap);
      const divider = document.createElement('div');
      divider.className = 'stage-preview-divider';
      container.appendChild(divider);
    }

    for (const desk of this._desktops) {
      const preview = document.createElement('div');
      preview.className = 'desktop-preview' + (desk.id === this._activeId ? ' active' : '');
      // the drop target resolves the desktop by THIS id, never by DOM index —
      // the Stage preview also carries `.desktop-preview` (+ `stage-preview`)
      // and sits BEFORE these, so an index map lands the window one desktop to
      // the right when the Stage is active (real report)
      preview.dataset.desktopId = desk.id; // (no title of its own: the tile's — the wrapper's switch door — covers the thumbnail too)

      // Collect windows for this desktop and draw miniature rectangles
      // All windows exist in DOM (visibility:hidden for non-active), so check live state
      const winEntries = []; // { id, gridBounds, waiting }
      const unplaced = []; // the rows it holds with NO position (lane phone-resume-keeps-layout, LAW 2): drawn as placeholders + their count
      let deskHasWaiting = false;
      if (desk.id === this._activeId) {
        for (const [id, win] of this.app.wm.windows) {
          if (win._desktopId === desk.id && win.gridBounds && !win._hiddenByDesktop && !win.isMinimized) {
            const waiting = win.element.classList.contains('window-waiting');
            winEntries.push({ id, gridBounds: win.gridBounds, waiting });
            if (waiting) deskHasWaiting = true;
          }
        }
      } else {
        // Non-active: try live DOM windows first (they exist after first switch)
        for (const [id, win] of this.app.wm.windows) {
          if (win._desktopId === desk.id && win.gridBounds && !win.isMinimized) {
            const waiting = win.element.classList.contains('window-waiting');
            // A window currently BORROWED by the stage carries the stage
            // SLOT's geometry in its live gridBounds — its home desktop's
            // preview must draw where it actually lives when it returns
            // (real report: hero activation painted a phantom window at the
            // slot position on the home desktop's preview).
            // _stageHomeBounds IS the flat {left,top,width,height} object
            // (stage-manager _borrowHero: `= { ...win.gridBounds }`) — the
            // first fix read `._stageHomeBounds?.gridBounds` and was a NO-OP
            // (always undefined → slot geometry leaked; second real report).
            const gb = (win._onStage && win._stageHomeBounds) ? win._stageHomeBounds : win.gridBounds;
            winEntries.push({ id, gridBounds: gb, waiting });
            if (waiting) deskHasWaiting = true;
          }
        }
        // …and the windows its held record holds that the page has NOT built (a desktop not opened since the page
        // loaded holds nothing else) — every one of them, beside the live ones: the preview draws the desktop's
        // record, never just the page's part of it (userW inc-mun7qjmw-iksh: a drop onto such a desktop drew 1
        // rect of 4 — the fallback ran only when no live window was there)
        const cached = this._savedStates.get(desk.id);
        if (cached?.windows) {
          for (const ws of cached.windows) {
            const wid = ws.winId || ws.id;
            if (wid && this.app.wm.windows.has(wid)) continue; // built: drawn above where it lives now
            if (ws.gridBounds && !ws.isMinimized) {
              winEntries.push({ id: wid, gridBounds: ws.gridBounds, waiting: false });
            } else if (!ws.isMinimized) unplaced.push(wid); // A DESKTOP WHOSE ROWS HAVE NO POSITION SAYS SO (LAW 2) — never nothing
          }
        }
      }
      if (deskHasWaiting) preview.classList.add('desktop-preview-waiting');
      for (const entry of winEntries) {
        const b = entry.gridBounds;
        if (!b) continue;
        const rect = document.createElement('div');
        const flash = this._flashingWinId === entry.id;
        rect.className = 'desktop-preview-win' + (entry.waiting ? ' desktop-preview-win-waiting' : '') + (flash ? ' desktop-preview-find-flash' : '');
        if (entry.id) rect.dataset.winId = entry.id;
        rect.style.left = (b.left * 100) + '%';
        rect.style.top = (b.top * 100) + '%';
        rect.style.width = (b.width * 100) + '%';
        rect.style.height = (b.height * 100) + '%';
        preview.appendChild(rect);
      }
      // LAW 2 (lane phone-resume-keeps-layout — «从来没有被加载过的 desktop 的窗口» previewed as nothing): a dashed cascade (PURE
      // placeholderBoxes) and the count; visiting the desktop lays them out and saves their positions
      if (unplaced.length) {
        placeholderBoxes(unplaced.length).forEach((b, i) => {
          const ph = document.createElement('div');
          ph.className = 'desktop-preview-win desktop-preview-win-unplaced';
          ph.dataset.winId = unplaced[i];
          ph.style.left = (b.left * 100) + '%'; ph.style.top = (b.top * 100) + '%'; ph.style.width = (b.width * 100) + '%'; ph.style.height = (b.height * 100) + '%';
          preview.appendChild(ph);
        });
        const badge = document.createElement('div');
        badge.className = 'desktop-preview-unplaced';
        badge.textContent = String(unplaced.length);
        badge.title = unplaced.length === 1 ? t('1 window · not placed — opening this desktop lays it out') : t('{n} windows · not placed — opening this desktop lays them out', { n: unplaced.length });
        preview.appendChild(badge);
      }

      // Wrapper: preview + label below
      const wrapper = document.createElement('div');
      wrapper.className = 'desktop-preview-wrapper';
      const label = document.createElement('div');
      label.className = 'desktop-preview-label';
      label.textContent = desk.name;
      wrapper.append(preview, label);
      wrapper.title = this._doorLabel('switch', desk.id); // the tile IS the switch door (lane desktop-doors-table: its words are the table's)

      // Click to switch (leaving the stage view first when active)
      wrapper.addEventListener('click', () => {
        if (this.app.stage?.isActive) return this.app.stage.leave(desk.id);
        this.switchTo(desk.id);
      });

      // Right-click context menu
      wrapper.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        // STOP THE BUBBLE (2.250.1, real report): chrome elements are
        // drag-movable between bars, and the TOOLBAR's background handler
        // only exempts `button, select, input` — so once the previews were
        // dragged into the toolbar, its "Customize UI…" menu fired too and,
        // because showContextMenu removes any existing menu, REPLACED this
        // one. The element owning the menu must stop the event rather than
        // rely on each container's exemption list staying in sync.
        e.stopPropagation();
        const items = this._deskItems(desk); // THE desktop's doors — a compact-list row offers the same (lane desktop-small r2 ①)
        // Open in the direction there's room (2.250.0, real report: a top-docked taskbar puts the previews near the viewport
        // TOP): upward only from the lower half — PURE menuPlace (showContextMenu's) keeps it inside the viewport (lane
        // desktop-small P2-3: the bottom anchor had no top clamp)
        showContextMenu(e.clientX, e.clientY, items, 'context-menu', { up: e.clientY > window.innerHeight / 2 });
      });

      // Drag-to-reorder desktops (2.250.0). HTML5 drag on the wrapper; the
      // preview stays a DROP target for BOTH a window-move (text/window-id) and
      // a desktop-reorder (text/desktop-id) — resolved by which data is set.
      wrapper.draggable = true;
      wrapper.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/desktop-id', desk.id);
        e.dataTransfer.effectAllowed = 'move';
        wrapper.classList.add('desktop-preview-dragging');
      });
      wrapper.addEventListener('dragend', () => wrapper.classList.remove('desktop-preview-dragging'));

      // Drop target: a window (move it here) OR another desktop (reorder)
      preview.addEventListener('dragover', (e) => { e.preventDefault(); preview.classList.add('desktop-preview-drop'); });
      preview.addEventListener('dragleave', () => preview.classList.remove('desktop-preview-drop'));
      preview.addEventListener('drop', (e) => {
        e.preventDefault();
        preview.classList.remove('desktop-preview-drop');
        const dragDesk = e.dataTransfer.getData('text/desktop-id');
        if (dragDesk && dragDesk !== desk.id) { this.reorderDesktop(dragDesk, desk.id); return; }
        const winId = e.dataTransfer.getData('text/window-id');
        if (winId) this.moveWindowToDesktop(winId, desk.id, { speak: true }); // a taskbar item dropped here: a refusal is said
      });

      container.appendChild(wrapper);
    }

    // "+" add button
    const addBtn = document.createElement('button');
    addBtn.className = 'desktop-preview-add';
    addBtn.textContent = '+';
    addBtn.title = this._doorLabel('new'); // THE 'new' door's words (lane desktop-doors-table: an untranslated English literal here, «New desktop» on the phone)
    addBtn.addEventListener('click', () => {
      const id = this.createDesktop();
      this.switchTo(id);
    });
    container.appendChild(addBtn);
    paintPreviews(this.app); // lane cache-warmth-band: the squares' tiers + each desktop's ring, from the tick's map (never in the digest)
  }

  /** THE SWITCHER'S FORM in the taskbar (lane desktop-small — P2-2 + the owner's many desktops): 'compact' when the previews
   *  (each desktop's, the Stage's, the «+») would take more than their share of the bar or leave the tile strip under its
   *  floor (PURE switcherForm); 'full' elsewhere (moved into the toolbar / a row, the phone). The bar's width is watched:
   *  a resize that changes the verdict re-draws the switcher. */
  _switcherFormFor(container) {
    const bar = typeof container.closest === 'function' ? container.closest('#taskbar') : null;
    if (!bar || this.app.isMobile) return 'full';
    if (!this._barRO && typeof ResizeObserver === 'function') {
      this._barRO = new ResizeObserver(() => { if (this._switcherFormFor(container) !== (container.classList.contains('desktop-previews-compact') ? 'compact' : 'full')) this.refreshSwitcher(); });
      this._barRO.observe(bar);
    }
    const tray = container.parentElement, gap = (el) => (el ? parseFloat(getComputedStyle(el).columnGap) || 0 : 0);
    // the «+N» chip's room (taskbar.js), counted whether it shows or not — the verdict never depends on itself: a PURE constant,
    // the warm chip's longest form while warmth is drawn (lane cache-warmth-band r2 H4: «+5 · 2 critical» outgrew the 48)
    let others = warmthDrawn(this.app) ? OVERFLOW_CHIP_WARM_PX : OVERFLOW_CHIP_PX;
    if (tray && tray !== bar) for (const el of tray.children) if (el !== container && el.offsetWidth) others += el.offsetWidth + gap(tray);
    const cs = getComputedStyle(bar);
    others += (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + 2 * gap(bar) + 8;
    const previewW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--desktop-preview-w')) || 48;
    const n = this._desktops.length + (this.app.stage?.enabled ? 1 : 0);
    return switcherForm({ n, each: previewW + 6, add: 27, bar: bar.clientWidth, others, stripMin: STRIP_MIN_TILES * TILE_MIN_PX });
  }

  /** The compact switcher: ONE button — the active desktop's place «Desktop k/N ▾» (the Stage's name while staged) — whose
   *  list switches (every desktop with its window count, the Stage first when it is on) and adds a desktop. A window
   *  waiting on another desktop marks the button as it marks that desktop's preview. */
  _renderCompactSwitcher(container) {
    const stage = this.app.stage, i = this._desktops.findIndex((d) => d.id === this._activeId), desk = this._desktops[i];
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'desktop-switch-compact'; btn.setAttribute('aria-haspopup', 'menu');
    // the desktop on show by its NAME (r2 ①: a rename shows on the button) and its place k/N
    const word = document.createElement('span'), pos = document.createElement('span');
    word.className = 'dsc-btn-name'; pos.className = 'dsc-btn-pos';
    word.textContent = stage?.isActive ? t('Stage') : (desk?.name || '');
    if (!stage?.isActive) pos.textContent = i + 1 + '/' + this._desktops.length;
    btn.append(word, pos);
    btn.setAttribute('aria-label', stage?.isActive ? t('Stage') : (desk?.name || '') + ' — ' + t('Desktop {k}/{n}', { k: i + 1, n: this._desktops.length }));
    btn.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 6l4.5 4.5L12.5 6"/></svg>');
    btn.title = stage?.isActive ? t('Stage — sessions materialize here with their workspace') : this._doorLabel('switch', desk?.id); // the desktop on show's switch door — the table's words (r2 ④: the fence found it hand-written); the Stage: its tile's words
    if ([...this.app.wm.windows.values()].some((w) => w._desktopId && w._desktopId !== this._activeId && w.element?.classList.contains('window-waiting'))) btn.classList.add('desktop-switch-waiting');
    btn.addEventListener('click', (e) => { e.stopPropagation(); this._openDesktopList(btn); });
    btn.addEventListener('dragover', () => this.dragHover(btn)); // a taskbar tile held here springs the list open too (its rows take the drop)
    btn.addEventListener('dragleave', () => this._springStop()); // r3 ①: off the button before SPRING_MS — nothing springs later
    container.appendChild(btn);
    paintPreviews(this.app); // lane cache-warmth-band: the folded button's ring = the worst live tier on every desktop
  }

  /** THE COMPACT LIST'S ROWS — ONE named source: the phone sheet's (int358: its sheetRows = master's
   *  PURE desktopRows over the page's built windows and each held record's unbuilt ones — the same rows, the same counts on
   *  both surfaces); the Stage first when it is on, then every desktop with its window count; `desk` = the manager's own
   *  desktop (the row's doors); `on` = the one on show. `drawn` = the rows an open list shows (a remote change patches it,
   *  r2 ① / r3 ②): a desktop deleted elsewhere keeps its row, `why` = the switch door's shut words (by the name it showed). */
  _desktopListRows(drawn = null) {
    const stage = this.app.stage;
    const rows = [];
    if (stage?.enabled) rows.push({ kind: 'stage', name: t('Stage'), count: null, on: !!stage.isActive });
    for (const r of sheetRows({ desktopManager: this, wm: this.app.wm }, drawn)) {
      const desk = this._desktops.find((d) => d.id === r.id);
      if (desk) rows.push({ kind: 'desktop', id: r.id, desk, name: r.name, count: r.windows, on: !stage?.isActive && r.active });
      else if (r.gone) rows.push({ kind: 'desktop', id: r.id, desk: { id: r.id, name: r.name }, name: r.name, count: null, on: false, gone: true, why: this._doorLabel('switch', r.id, r.name) });
    }
    return rows;
  }

  /** The compact switcher's list (above the button on a bottom taskbar — PURE menuPlace keeps it inside the viewport): a row
   *  switches, its right-click / ⋯ opens the desktop's doors, it takes a window's drop (_rowDoors); «New desktop» last. Open,
   *  it FOLLOWS a remote change IN PLACE (`menu._follow`, from _followOpenLists — r3 ②, kb-patterns' keyed rows): each row
   *  found by its desktop id is re-worded (_paintListRow), a desktop added elsewhere gets a new row at its place, a moved one
   *  moves alone, a deleted one stays greyed with its why — its tap says it, its doors say it, a drop on it is refused by its
   *  name (dropOnRow); never a new node under the pointer or a held drag. Placed by ONE door (_placeList — r4) once its
   *  words are painted and again after every patch. */
  _openDesktopList(anchor) {
    const stage = this.app.stage, rows = this._desktopListRows();
    const more = `<span class="dsc-more" role="button" aria-label="${escHtml(t('More'))}" title="${escHtml(t('More'))}">${UI_ICONS.more}</span>`;
    const html = (r) => `<span class="dsc-mark"></span><span class="dsc-name"></span><span class="dsc-why"></span><span class="dsc-count"></span>${r.kind === 'desktop' ? more : ''}`; // the row's parts — _paintListRow writes their words (as text: a desktop's name is the person's)
    // a row switches — judged on the list as it is NOW (r2 ②): a desktop gone meanwhile is refused with the table's why, by the
    // name its row shows (r3 ④: ONE sayer, _doorRefused)
    const go = (id) => { const shown = menu._deskRows.find((x) => x.id === id) || { id, name: '' }; if (this._doorRefused(shown, 'switch')) return; if (stage?.isActive) return stage.leave(id); this.switchTo(id); };
    const items = rows.map((r) => ({ labelHtml: html(r), action: r.kind === 'stage' ? () => { if (!stage.isActive) stage.enter(); } : () => go(r.id) }));
    items.push({ separator: true });
    items.push({ label: '+ ' + this._doorLabel('new'), action: () => { const id = this.createDesktop(); this.switchTo(id); } });
    const r = anchor.getBoundingClientRect();
    const menu = showContextMenu(r.left, r.top, items, 'context-menu', { up: r.top > window.innerHeight / 2, extraClass: 'desktop-switch-menu' }); // styled BEFORE it is measured
    const els = menu.querySelectorAll(':scope > .context-menu-item');
    rows.forEach((row, k) => { if (row.kind === 'desktop' && els[k]) this._rowDoors(els[k], row.desk); });
    rows.forEach((row, k) => { if (els[k]) this._paintListRow(els[k], row); });
    this._placeList(menu); // its words painted: placed as it reads (showContextMenu measured empty rows — a long name ran it past the edge)
    menu._deskRows = rows.filter((r) => r.kind === 'desktop').map((r) => ({ id: r.id, name: r.name, gone: !!r.gone })); // what it shows — a remote change follows from it
    const head = rows[0]?.kind === 'stage' ? els[0] : null; // the Stage's row stays first
    menu._follow = () => {
      const stood = menu.getBoundingClientRect(); // the box as it stood before the patch — the placement keeps its top
      const now = this._desktopListRows(menu._deskRows).filter((x) => x.kind === 'desktop');
      const byId = new Map([...menu.querySelectorAll(':scope > [data-desktop-id]')].map((el) => [el.dataset.desktopId, el]));
      let prev = head;
      for (const row of now) {
        let el = byId.get(row.id);
        if (!el) { // a desktop added on another screen: showContextMenu's own row (its class, its parts, close-then-act), its doors
          el = document.createElement('div'); el.className = 'context-menu-item'; el.innerHTML = html(row); el.onclick = () => { menu.remove(); go(row.id); };
          this._rowDoors(el, row.desk);
        }
        const at = prev ? prev.nextElementSibling : menu.firstElementChild;
        if (el !== at) menu.insertBefore(el, at); // only a row whose place changed moves (a reorder moves one row, never the list)
        this._paintListRow(el, row);
        prev = el;
      }
      menu._deskRows = now.map((x) => ({ id: x.id, name: x.name, gone: !!x.gone }));
      this._placeList(menu, stood); // THE ONE placement again (r4 — never a correction by hand: it lifted the list past the top)
    };
    return menu;
  }

  /** THE compact list's placement — at its open and after every patch (lane desktop-doors-table r4: the patch corrected the
   *  box by hand, with no floor and no cap — 3 desktops added to 17 at 951×585 put its top at −61, its first rows out of
   *  reach, nothing to scroll; a name wider than the screen ran it 2 574 px wide). PURE menuPlace over the list's own box:
   *  it KEEPS its top — a row added grows it downward (every row it shows stays where it was: the pointer and a held drag
   *  keep their row), past the viewport's foot it is capped there and scrolls; never above the top, never wider than the
   *  viewport (a long name is cut by its ellipsis). Measured whole: a capped list with what it scrolls, its width uncapped;
   *  `stood` = its box before the change (a patch grew it already). Scrolled, it KEEPS ITS OFFSET (r5 — the room grown, a
   *  remote change lifted its cap whole: the offset fell to 0, every row came down by it under the pointer): its cap lifts
   *  only as far as its rows stay where they stood, and the offset is written back. */
  _placeList(menu, stood = menu.getBoundingClientRect()) {
    const Z = uiScale(), s = menu.scrollTop; // the offset it shows — read before a style is written
    menu.style.maxWidth = '';
    const b = menu.getBoundingClientRect(), k = menu.offsetHeight ? b.height / menu.offsetHeight : 1; // viewport px per layout px
    const h = b.height + Math.max(0, menu.scrollHeight - menu.clientHeight) * k;
    const at = menuPlace({ x: b.left, y: stood.top, w: b.width, h, vw: window.innerWidth, vh: window.innerHeight, keep: stood.height, scrolled: s * k });
    menu.style.maxHeight = at.maxH == null ? '' : (at.maxH / Z) + 'px'; menu.style.overflowY = at.maxH == null ? '' : 'auto';
    menu.style.maxWidth = at.maxW == null ? '' : (at.maxW / Z) + 'px';
    menu.style.left = (at.left / Z) + 'px'; menu.style.top = (at.top / Z) + 'px';
    if (at.scroll != null) menu.scrollTop = at.scroll / k; // kept: the same offset — every row where it stood
  }

  /** A compact-list row's words — written at the open and again IN PLACE by a remote change (r3 ②): the mark, the name, a
   *  gone desktop's why (its name hidden — style.css), the window count, the switch door's title (a gone one: its why),
   *  greyed; and the row's desktop, which its doors and its drop read (_rowDoors). */
  _paintListRow(el, r) {
    const part = (k) => el.querySelector(':scope > .dsc-' + k), why = part('why'), n = part('count');
    part('mark').textContent = r.on ? '\u2713' : '';
    part('name').textContent = r.name;
    why.textContent = r.why || ''; why.hidden = !r.why;
    n.textContent = r.count == null ? '' : String(r.count); n.hidden = r.count == null; n.title = r.count == null ? '' : t('{n} windows', { n: r.count });
    el.classList.toggle('dsc-gone', !!r.gone);
    if (r.kind === 'desktop') { el.title = this._doorLabel('switch', r.id, r.name); el._desk = r.desk; }
  }

  /** THE DESKTOP'S DOORS — the ONE menu builder of every surface (lane desktop-small r2 ①: the compact form dropped them;
   *  lane desktop-doors-table: they were five hand-written lists, and the phone sheet's long press offered Rename · Delete
   *  only — a phone has no drag, so it could not reorder). The rows are THE PURE table's (src/desktop-switch.js
   *  desktopDoors → doorItems), the handlers the manager's own. `tier` = how they are drawn: 'desk' — the preview's
   *  right-click (its order is its drag: `order` false) and a compact-list row's right-click / ⋯ (`order` true: Move up /
   *  Move down), a shut door left out; 'phone' — the sheet's and the window switcher's long press: every door, a shut one
   *  greyed WITH its why. `after` runs once the act is done — never after a cancel (r3 ④), on both tiers.
   *  Round 2: the table is asked with the name the row SHOWED (a desktop gone meanwhile is said by it, never by its id —
   *  and on the desk too: every door greyed with that why, never an empty menu); a menu is a picture of the list when it
   *  opened, so each act is judged AGAIN at the press on the list as it is now (its neighbours too) — a shut one SAYS why
   *  and runs nothing, `after` included (_doorRefused). */
  _deskItems(desk, { order = false, after = null, tier = 'desk' } = {}) {
    const done = (p) => Promise.resolve(p).then((r) => { if (r !== false) after?.(); }); // a cancelled act (Rename… dismissed) leaves everything shut (r3 ④)
    const at = (id, run) => () => { // THE VERDICT AT THE ACT (r2 ②)
      if (this._doorRefused(desk, id)) return Promise.resolve(false);
      const i = this._desktops.findIndex((d) => d.id === desk.id);
      return run(this._desktops[i - 1], this._desktops[i + 1]);
    };
    const act = {
      rename: at('rename', () => done(this._startRename(desk))),
      delete: at('delete', () => done(this.deleteDesktop(desk.id))),
      'move-up': at('move-up', (prev) => done(this.reorderDesktop(desk.id, prev.id))),
      'move-down': at('move-down', (prev, next) => done(this.reorderDesktop(next.id, desk.id))),
    };
    return doorItems(desktopDoors({ desk: desk.id, name: desk.name, desktops: this._desktops, order, tier }), { t }).map((d) => (d.separator ? d
      : d.enabled ? { door: d.id, label: d.label, action: act[d.id], ...(d.danger ? { style: 'color:var(--red, #e55)' } : {}) }
      : { door: d.id, label: d.label, off: d.why }));   // lane ui-controls-and-bugs: the menu's OFF row (the why in words, ONE grammar for every menu) // a shut door says why (never greyed with no words)
  }

  /** A door's words from THE table (desktopDoors) — the «+»'s ('new'), a row's / tile's switch title ('switch'): its label,
   *  or when it is shut its why (a row whose desktop is gone, by the `name` it showed — r2 ①③). */
  _doorLabel(id, deskId = null, name = '') {
    const d = desktopDoors({ desk: deskId, name, desktops: this._desktops }).find((x) => x.id === id);
    return d ? t(d.enabled ? d.label : d.why, d.params) : '';
  }

  /** THE VERDICT AT THE ACT (r2 ②: a door's verdict was frozen when its menu opened — another screen deleted the desktop or
   *  its neighbour, and the press then did nothing while `after` counted it done): the door `id` of `desk` asked AGAIN of the
   *  table on the list as it is now. Shut ⇒ its why is SAID (a toast, the words its row would show) and true; open ⇒ false. */
  _doorRefused(desk, id) {
    const d = desktopDoors({ desk: desk.id, name: desk.name, desktops: this._desktops }).find((x) => x.id === id);
    if (!d || d.enabled) return false;
    showToast(t(d.why, d.params), { type: 'warn', duration: 6000 });
    return true;
  }

  /** A compact-list row's doors (r2 ①): its right-click and its ⋯ open the desktop's items (with the order) — the list
   *  comes back on its new state after the act; and it is a DROP target — a title-bar drag released on it (window.js hit-tests
   *  `.desktop-switch-row`) or a taskbar tile dropped on it moves that window there, the preview drop's road. */
  _rowDoors(el, desk) {
    el.classList.add('desktop-switch-row'); el.dataset.desktopId = desk.id; el._desk = desk; // the row's desktop as it shows NOW — a remote change re-sets it (_paintListRow: renamed, gone)
    const back = () => setTimeout(() => { const b = document.querySelector('#desktop-previews .desktop-switch-compact'); if (b) this._openDesktopList(b); }, 0);
    const open = (x, y) => showContextMenu(x, y, this._deskItems(el._desk, { order: true, after: back }), 'context-menu', { up: y > window.innerHeight / 2 });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); open(e.clientX, e.clientY); });
    el.querySelector('.dsc-more')?.addEventListener('click', (e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); open(r.right, r.top); });
    el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('desktop-preview-drop'); });
    el.addEventListener('dragleave', () => el.classList.remove('desktop-preview-drop'));
    el.addEventListener('drop', (e) => {
      e.preventDefault(); const list = el.closest('.desktop-switch-menu');
      const winId = e.dataTransfer.getData('text/window-id');
      this.dragDone(); list?.remove(); // the drag is over: the list (sprung or clicked open) and its ref go (r3 ①)
      if (winId) this.dropOnRow(winId, el._desk.id, el._desk.name); // a taskbar tile dropped here: a refusal is said
    });
  }

  /** A WINDOW DRAGGED OVER THE COMPACT SWITCHER (r2 ①) — ONE lifecycle for BOTH roads (r3 ①: the HTML5 road never ended it):
   *  held SPRING_MS on the button, its list springs open and its desktop rows take the drop; off the button the timer stops,
   *  off both the button and the list the list closes; the drag over (dragDone) ends it all — timer, list, ref, listeners.
   *  `under` = the element under the pointer: the title-bar drag hit-tests it (window.js hides its window to look), a
   *  taskbar tile's HTML5 drag is the document's dragover target (armed while a spring is live, _springArm). */
  dragHover(under) {
    if (this._springList && !this._springList.isConnected) this._springList = null; // closed by its own door (a press outside, Escape)
    const btn = under?.closest?.('.desktop-switch-compact') || null;
    if (btn && !this._springList) {
      this._springArm();
      if (!this._springTimer) this._springTimer = setTimeout(() => { this._springTimer = 0; const b = document.querySelector('#desktop-previews .desktop-switch-compact'); if (b && this._springLife) this._springList = this._openDesktopList(b); }, SPRING_MS);
      return;
    }
    if (!btn) this._springStop();
    if (!btn && this._springList && !under?.closest?.('.desktop-switch-menu')) this.dragDone();
  }

  /** The HTML5 road's half of the lifecycle (r3 ①): while a spring is live the document's dragenter / dragover are its hit
   *  test (Chrome fires only dragenter on the step into a new element — its dragover waits for the next), and the drag's end
   *  — a drop anywhere (a row's own handler runs first), a dragend (dropped, or Esc) — is dragDone. The pointer road fires
   *  none of these; dragDone aborts them either way. */
  _springArm() {
    if (this._springLife) return;
    const life = this._springLife = new AbortController(), o = { capture: true, signal: life.signal };
    for (const type of ['dragenter', 'dragover']) window.addEventListener(type, (e) => this.dragHover(e.target), o);
    window.addEventListener('drop', () => setTimeout(() => this.dragDone(), 0), o);
    window.addEventListener('dragend', () => this.dragDone(), o);
  }

  _springStop() { if (this._springTimer) { clearTimeout(this._springTimer); this._springTimer = 0; } }

  dragDone() {
    this._springStop();
    if (this._springList) { this._springList.remove(); this._springList = null; }
    if (this._springLife) { this._springLife.abort(); this._springLife = null; }
  }

  /** A window dropped on a compact-list ROW — both roads (window.js _dropOnDeskRow, a tile's drop). The row may be stale (r3
   *  ③: its desktop deleted on another screen while the list was open), so the move goes only to a desktop that IS here, as
   *  the preview drop checks; a gone one is refused BY NAME and the window stays where it is — the switch door's why, the
   *  table's words (desktop-doors-table r3 ④: it kept a «{name}» sentence of its own). */
  dropOnRow(winId, deskId, name) {
    if (!this._desktops.some((d) => d.id === deskId)) {
      showToast(t('{why} — the window stays where it is', { why: this._doorLabel('switch', deskId, name) }), { type: 'warn', duration: 6000 });
      return { ok: false, code: 'no-desktop' };
    }
    return this.moveWindowToDesktop(winId, deskId, { speak: true });
  }

  async _startRename(desk) {
    const w = desktopDoors({ desk: desk.id, name: desk.name, desktops: this._desktops }).find((d) => d.id === 'rename').dialog; // the Rename door's own dialog — its words are the table's (r2 ④)
    const now = this._desktops.find((d) => d.id === desk.id) || desk; // its name as it is now (renamed elsewhere since the menu opened)
    const name = await showInputDialog({ title: t(w.title), label: t(w.label), value: now.name, confirmText: t(w.confirm) });
    if (!(name && name.trim())) return false; // cancelled — false: nothing comes back (r3 ④)
    if (this._doorRefused(desk, 'rename')) return false; // deleted on another screen while the dialog was open: SAID, the typed name never dropped in silence (r2 ②)
    const typed = name.trim(), live = this._desktops.find((d) => d.id === desk.id);
    // renamed on ANOTHER screen while the dialog was open (r3 ⑤): the typed name lands — the person's own last act — and the
    // name it replaces is SAID, never overwritten in silence (renamed there to the same name: nothing to say)
    if (live.name !== now.name && live.name !== typed) showToast(t(w.meanwhile, { was: now.name, now: live.name, name: typed }), { type: 'warn', duration: 8000 });
    this.renameDesktop(desk.id, typed);
    return true;
  }

  // Move dragId to sit just BEFORE targetId in the desktop order (2.250.0).
  reorderDesktop(dragId, targetId) {
    const from = this._desktops.findIndex(d => d.id === dragId);
    const to = this._desktops.findIndex(d => d.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = this._desktops.splice(from, 1);
    // after removing `from`, the target index shifts left if it was after `from`
    const insertAt = this._desktops.findIndex(d => d.id === targetId);
    this._desktops.splice(insertAt, 0, moved);
    this.app.ws.send({ type: 'desktop-reorder', order: this._desktops.map(d => d.id) });
    this._renderSwitcher();
  }

  /** Build "Move to Desktop" submenu items for window context menu. A Stage window gets ONE row that SAYS why it
   *  stays (inc-muly2izg-cks3 — the desktop rows used to be listed and do nothing; never greyed names with a hidden
   *  hint: the reason is the row). */
  getDesktopMenuItems(winId) {
    const win = this.app.wm.windows.get(winId);
    if (!win || this._desktops.length < 1) return [];
    const target = this._desktops.find((d) => d.id !== win._desktopId);
    const v = target && this.app.stage?.moveVerdict ? this.app.stage.moveVerdict(win, target.id) : { ok: true };
    if (!v.ok) return [{ label: stageRefusalSentence(v, { t }), stageRefusal: v.code }];
    if (this._desktops.length < 2) return [];
    return this._desktops
      .filter(d => d.id !== win._desktopId)
      .map(d => ({
        label: d.name,
        action: () => this.moveWindowToDesktop(winId, d.id, { speak: true }),
      }));
  }

  // ── Toolbar resize (2.250.1) ──
  // The layout is a flex COLUMN (toolbar · workspace flex:1 · taskbar), so the
  // absorbs the delta automatically and windows re-derive their pixels from
  // proportional gridBounds via _reflowWindows(). 2.254.0: the resize is a
  // CONTENT SCALE (--toolbar-scale zoom on #toolbar + #toolbar-row2), not a
  // fixed height — the toolbar auto-fits its content so there's never a dead
  // empty band (userW's report), and dragging changes compactness.
  _setupToolbarResize() {
    const handle = document.getElementById('toolbar-resize-handle');
    const toolbar = document.getElementById('toolbar');
    if (!handle || !toolbar) return;
    // 2.254.0 rework (userW's dead-band bug): the toolbar height AUTO-FITS its
    // content rows now; the drag drives --toolbar-scale (a zoom on #toolbar +
    // #toolbar-row2), so it changes content COMPACTNESS — smaller = more
    // desktop, larger = bigger chrome — never a dead empty band. ~230px of drag
    // spans the whole range so it feels like a size adjustment, not a nudge.
    const MIN_S = 0.7, MAX_S = 1.25, PXPER = 230; // upper bound modest: large scales overflow the center zone in narrow windows — the feature's value is COMPACT (more desktop)
    const root = document.documentElement;
    const clampS = (s) => Math.max(MIN_S, Math.min(MAX_S, s));
    const curScale = () => parseFloat(getComputedStyle(root).getPropertyValue('--toolbar-scale')) || 1;
    const setS = (s) => root.style.setProperty('--toolbar-scale', clampS(s).toFixed(3));

    // MIGRATE the old fixed-height override (pre-2.254.0) to a scale so a user
    // who had resized doesn't jump back to default: scale ≈ oldHeight / 40.
    const oldH = parseInt(localStorage.getItem('toolbarHeight'));
    if (oldH && !localStorage.getItem('toolbarScale')) {
      localStorage.setItem('toolbarScale', clampS(oldH / 40).toFixed(3));
      localStorage.removeItem('toolbarHeight');
    }
    const saved = parseFloat(localStorage.getItem('toolbarScale'));
    if (saved && saved >= MIN_S && saved <= MAX_S && Math.abs(saved - 1) > 0.02) setS(saved);

    handle.title = t('Drag to resize the top bar · double-click to reset');
    handle.addEventListener('dblclick', () => {
      root.style.removeProperty('--toolbar-scale'); // back to the CSS default (1)
      localStorage.removeItem('toolbarScale');
      this.app.wm._reflowWindows?.();
      this.app.layoutManager.scheduleAutoSave();
    });
    handle.addEventListener('pointerdown', (e) => { // THE DOOR (verify r2 census): captured on the handle, fed by the one feed
      if (e.button !== 0 || e.isPrimary === false) return;
      const startY = e.clientY;
      const startS = curScale();
      handle.classList.add('active');
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      this.app.wm._suppressReflow = true; // ResizeObserver storm during drag
      const onMove = (ev) => setS(startS + (ev.clientY - startY) / uiScale() / PXPER); // drag DOWN = bigger (viewport→layout px under the DPI zoom)
      const onUp = () => {
        handle.classList.remove('active');
        document.body.style.cursor = ''; document.body.style.userSelect = '';
        const s = curScale();
        if (Math.abs(s - 1) < 0.03) { root.style.removeProperty('--toolbar-scale'); localStorage.removeItem('toolbarScale'); }
        else localStorage.setItem('toolbarScale', s.toFixed(3));
        this.app.wm._suppressReflow = false;
        this.app.wm._reflowWindows?.();
        this.app.layoutManager.scheduleAutoSave();
      };
      startPointerDrag(handle, e, { onMove, onEnd: onUp, shield: 'toolbar-scale' });
    });
    handle.addEventListener('mousedown', (e) => { if (e.button === 0) e.preventDefault(); }); // the compat press: no selection
  }

  // ── Taskbar resize ──

  _setupTaskbarResize() {
    const handle = document.getElementById('taskbar-resize-handle');
    const taskbar = document.getElementById('taskbar');
    if (!handle || !taskbar) return;

    const MIN_H = 36, MAX_H = 120;
    // Restore saved height
    const saved = parseInt(localStorage.getItem('taskbarHeight'));
    if (saved && saved >= MIN_H && saved <= MAX_H) {
      taskbar.style.height = saved + 'px';
      this._adaptTaskbarSize(saved);
    }

    // Double-click = reset to the CSS default: clears the inline height, the
    // persisted override AND the adaptive size vars. The first drag used to
    // permanently inflate item sizing — the JS-derived vars don't equal the
    // CSS defaults even at the same 44px height — with no way back (real
    // report: "margin一resize就变大再也回不去").
    handle.addEventListener('dblclick', () => {
      taskbar.style.height = '';
      localStorage.removeItem('taskbarHeight');
      this._clearTaskbarSizeVars();
      this.app.wm._reflowWindows?.();
      this.app.layoutManager.scheduleAutoSave();
    });
    handle.title = t('Drag to resize · double-click to reset');

    handle.addEventListener('pointerdown', (e) => { // THE DOOR (verify r2 census)
      if (e.button !== 0 || e.isPrimary === false) return;
      const startY = e.clientY;
      const startH = taskbar.offsetHeight;
      handle.classList.add('active');
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      // Suppress ResizeObserver-triggered reflow during drag
      this.app.wm._suppressReflow = true;

      const top = document.body.classList.contains('taskbar-top');
      const onMove = (e) => {
        // bottom taskbar: drag UP grows; top taskbar: drag DOWN grows
        const delta = (top ? (e.clientY - startY) : (startY - e.clientY)) / uiScale();
        const h = Math.max(MIN_H, Math.min(MAX_H, startH + delta));
        taskbar.style.height = h + 'px';
        this._adaptTaskbarSize(h);
      };
      const onUp = () => {
        handle.classList.remove('active');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        localStorage.setItem('taskbarHeight', taskbar.offsetHeight);
        // Re-enable reflow and do one final reflow
        this.app.wm._suppressReflow = false;
        this.app.wm._reflowWindows?.();
        // Broadcast height to other clients via layout sync
        this.app.layoutManager.scheduleAutoSave();
      };
      startPointerDrag(handle, e, { onMove, onEnd: onUp, shield: 'taskbar-height' });
    });
    handle.addEventListener('mousedown', (e) => { if (e.button === 0) e.preventDefault(); });
  }

  /** Adapt desktop preview and taskbar element sizes to current height */
  _clearTaskbarSizeVars() {
    const root = document.documentElement;
    for (const v of ['--desktop-preview-h', '--desktop-preview-w', '--desktop-label-size',
      '--taskbar-icon-size', '--taskbar-icon-scale', '--taskbar-title-size',
      '--taskbar-sub-size', '--usage-pie-size', '--taskbar-item-pad']) {
      root.style.removeProperty(v);
    }
  }

  _adaptTaskbarSize(h) {
    const root = document.documentElement;
    // Preview: ratio of taskbar height, rest for label. Default 70%.
    const ratio = (this.app.settings?.get('taskbar.desktopPreviewRatio') ?? 70) / 100;
    const previewH = Math.max(12, Math.round(h * ratio) - 6); // 6px for padding
    const labelSize = Math.max(6, Math.round((h - previewH) * 0.6));
    root.style.setProperty('--desktop-preview-h', previewH + 'px');
    root.style.setProperty('--desktop-preview-w', Math.round(previewH * 1.5) + 'px');
    root.style.setProperty('--desktop-label-size', labelSize + 'px');
    // Toolbar-hosted previews (customize-mode arrangement) obey the SAME ratio
    // derived from the fixed 40px toolbar — they were clamped to hardcoded
    // 34×20 and ignored taskbar.desktopPreviewRatio entirely (real report).
    const tbH = 40;
    const tpH = Math.max(12, Math.min(28, Math.round((tbH - 6) * ratio)));
    root.style.setProperty('--toolbar-preview-h', tpH + 'px');
    root.style.setProperty('--toolbar-preview-w', Math.round(tpH * 1.6) + 'px');
    root.style.setProperty('--toolbar-preview-label', Math.max(6, Math.round((tbH - tpH - 8) * 0.55)) + 'px');
    // All elements proportional to taskbar height — no upper caps
    const iconSize = Math.max(14, Math.round(h * 0.4));
    root.style.setProperty('--taskbar-icon-size', iconSize + 'px');
    root.style.setProperty('--taskbar-icon-scale', (iconSize / 14).toFixed(2));
    root.style.setProperty('--taskbar-title-size', Math.max(8, Math.round(h * 0.18)) + 'px');
    root.style.setProperty('--taskbar-sub-size', Math.max(7, Math.round(h * 0.14)) + 'px');
    root.style.setProperty('--usage-pie-size', Math.max(10, Math.round(h * 0.25)) + 'px');
    root.style.setProperty('--taskbar-item-pad', Math.max(2, Math.round(h * 0.06)) + 'px');
  }

  // ── Helpers ──

  /** Hide a window without collapsing layout (preserves scroll, DOM state): the DESKTOP REASON is added through the ONE
   *  door (WindowManager.setWindowHidden) and every mark is derived there — visibility:hidden + pointer-events (the box
   *  stays), aria-hidden (2.369.144), a chat's content-visibility:hidden (inc-mtd54h45: the switch repaints from the
   *  cached rendering instead of re-measuring), the suspended ChatView (inc-mtd1d0ft). This method writes none of them
   *  (inc-munl8jkl-gaih: the Stage's show forgot one this method wrote — a blank, unclickable window). */
  _hideWin(win) {
    this.app.wm.setWindowHidden(win, { desktop: true });
  }

  /** Show a previously hidden window: the desktop reason goes; the marks follow from whatever reason is left. */
  _showWin(win) {
    this.app.wm.setWindowHidden(win, { desktop: false });
  }

  _generateId() {
    return 'desk-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 5);
  }
}
