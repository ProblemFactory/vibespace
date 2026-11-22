/**
 * External editor — Ctrl+G split-pane CodeMirror integration.
 * Opens an editor pane below a terminal window for editing files
 * invoked by Claude Code's EDITOR mechanism.
 */

import { CodeEditor, detectLang, getLangExtension, loadEditorSettings, saveEditorSettings, editorLightTheme, activeLineSelectionPatch, editorFontFace, editorFontTheme, sayFingerFloor } from './code-editor.js';
import { isTouchDevice } from './utils.js';
import { t } from './i18n.js';
import { showConfirmDialog } from './utils.js';
import { fsErrorText, ATTENDED_HEADERS } from './file-explorer-ops.js';   // B-3b03 follow-up: the pane's refused save in the reader's language; B-23e5: its save marked
import { Resizer } from './resizer.js';
import { lateFocus, openClock } from './late-focus.js'; // B-c87d: the terminal takes its keys back through THE door (the keyboard stays where the person last put it)
import { EditorView, basicSetup } from 'codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorState, Compartment, Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { indentWithTab } from '@codemirror/commands';

/**
 * Open an external editor split-pane in a terminal window.
 * @param {object} app - App instance (for wm, sessions, _hideWelcome)
 * @param {string} filePath - Path to edit
 * @param {string} signalPath - Signal file for editor completion
 * @param {string} sessionId - WebUI session ID that triggered the editor
 */
export function openExternalEditor(app, filePath, signalPath, sessionId, host) {
  const openAt = openClock();   // B-c87d: the editor pane's open began NOW (the CLI's signal); its file loads later
  // host = the machine the CLI (and therefore the tmpfile + signal file) runs
  // on — remote Ctrl+G (B-2de8): every read/write/signal must target it.
  const hq = host ? `&host=${encodeURIComponent(host)}` : '';
  // Find the terminal window that triggered this — match by webui session ID
  let targetWinInfo = null;
  if (sessionId) {
    for (const [winId, win] of app.wm.windows) {
      const term = app.sessions.get(winId);
      if (term && term.sessionId === sessionId) { targetWinInfo = win; break; }
    }
  }
  // Fallback: active window, then any terminal
  if (!targetWinInfo) {
    for (const [winId, win] of app.wm.windows) {
      if (win.type === 'terminal' && winId === app.wm.activeWindowId) { targetWinInfo = win; break; }
    }
  }
  if (!targetWinInfo) {
    for (const [, win] of app.wm.windows) { if (win.type === 'terminal') { targetWinInfo = win; break; } }
  }

  // Re-delivered editor-open (the server re-broadcasts a pending edit on
  // attach so it survives restarts/reloads) — the pane is already open here
  if (targetWinInfo && targetWinInfo._editorState?.signalPath === signalPath) return;

  if (!targetWinInfo) {
    // No terminal window — open standalone editor
    app._hideWelcome();
    const winInfo = app.wm.createWindow({ title: `Editor: ${filePath.split('/').pop()}`, type: 'editor' });
    new CodeEditor(winInfo, filePath, filePath.split('/').pop(), app, {
      host: host || undefined,
      onSaveAndClose: async () => {
        try { await fetch('/api/editor/signal', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ signalPath, filePath, host: host || undefined }) }); } catch {}
      },
    });
    return;
  }

  // Split the terminal window: add an editor pane below the terminal
  const contentEl = targetWinInfo.content;
  const termContainer = contentEl.querySelector('.terminal-container');
  if (!termContainer) return;

  // Create split layout
  contentEl.style.display = 'flex';
  contentEl.style.flexDirection = 'column';
  termContainer.style.flex = '1';
  termContainer.style.minHeight = '100px';

  // Store editor state on winInfo for layout save/restore
  targetWinInfo._editorState = { filePath, signalPath };

  // Hint over the terminal half while the CLI blocks on the editor. (Mouse-
  // report suppression for the same window rides _editorState in terminal.js.)
  // Removed by both teardown paths. If the pane still shows blank after the
  // fit+scrollToBottom below settle (rare — e.g. an empty fresh buffer), the
  // pill upgrades to a centered explainer so the void doesn't read as a crash.
  // NOTE the historical trap here: a "random per-window blank screen" was NOT
  // a renderer difference (buffers showed zero alt-screen use in both) — it was
  // the missing scrollToBottom parking the viewport below the content.
  const termVeil = document.createElement('div');
  termVeil.className = 'editor-term-veil';
  termVeil.textContent = t('Editing below — Save & Close to hand the file back');
  termContainer.appendChild(termVeil);
  targetWinInfo._editorTermVeil = termVeil;
  setTimeout(() => {
    if (!targetWinInfo._editorTermVeil) return; // already closed
    try {
      const term = [...app.sessions.values()].find(s => s.winInfo === targetWinInfo)?.terminal;
      if (!term) return;
      const buf = term.buffer.active;
      let hasContent = false;
      for (let i = buf.viewportY; i < buf.viewportY + term.rows; i++) {
        const line = buf.getLine(i);
        if (line && line.translateToString(true).trim()) { hasContent = true; break; }
      }
      if (!hasContent) {
        termVeil.classList.add('editor-term-veil-center');
        termVeil.textContent = '';
        const b = document.createElement('b');
        b.textContent = t('Waiting for the editor below');
        const s = document.createElement('span');
        s.textContent = t('The terminal resumes after Save & Close.');
        termVeil.append(b, s);
      }
    } catch {}
  }, 350);

  // Create the editor pane
  const editorPane = document.createElement('div');
  editorPane.className = 'editor-container';
  editorPane.dataset.signal = signalPath;   // B-23e5: the CLI's close of THIS pane removes this pane, never another left in the window
  editorPane.style.flex = '1';
  editorPane.style.borderTop = '2px solid var(--accent)';
  editorPane.style.minHeight = '150px';

  // Editor toolbar with settings
  const toolbar = document.createElement('div');
  toolbar.className = 'editor-toolbar';
  const pathSpan = document.createElement('span');
  pathSpan.className = 'file-path';
  pathSpan.textContent = filePath;
  toolbar.appendChild(pathSpan);

  const edSettings = loadEditorSettings();
  const mkBtn = (text) => { const b = document.createElement('button'); b.className = 'editor-setting-btn'; b.textContent = text; return b; };

  // Wrap toggle
  const btnWrap = mkBtn(edSettings.wordWrap ? 'Wrap: On' : 'Wrap: Off');
  // Font size
  const btnFontDown = mkBtn('A-');
  const fontDisplay = document.createElement('span'); fontDisplay.className = 'editor-font-size-display'; fontDisplay.textContent = editorFontFace(edSettings.fontSize, isTouchDevice()).drawn;   // B-9b12: the size DRAWN (the finger rule — code-editor.js)
  const btnFontUp = mkBtn('A+');
  // Theme toggle
  const btnTheme = mkBtn(edSettings.theme === 'dark' ? 'Dark' : 'Light');

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-create';
  saveBtn.style.cssText = 'padding:3px 12px;font-size:11px;';
  saveBtn.textContent = 'Save & Close';

  const sep = document.createElement('span'); sep.className = 'editor-toolbar-sep';
  toolbar.append(sep, btnWrap, btnFontDown, fontDisplay, btnFontUp, btnTheme, saveBtn);

  const editorBody = document.createElement('div');
  editorBody.className = 'editor-body';
  editorPane.append(toolbar, editorBody);
  contentEl.appendChild(editorPane);

  // Draggable divider between terminal and editor (vertical resize)
  targetWinInfo._splitResizer?.destroy();
  const splitResizer = new Resizer(termContainer, 'vertical', {
    min: 80, max: 1000,
    onResize: () => { if (termSession) termSession.fit(); },
  });
  targetWinInfo._splitResizer = splitResizer;

  // Resize terminal to fit the new split
  const termSession = [...app.sessions.values()].find(s => {
    return s.winInfo === targetWinInfo;
  }) || [...app.sessions.values()][0];
  // fit() shrinks the terminal for the split — without the follow-up
  // scrollToBottom the viewport can park in the blank region BELOW the content
  // (looked like a random per-window "blank screen"; the close path always had
  // the scrollToBottom, the open path forgot it).
  if (termSession) setTimeout(() => { termSession.fit(); termSession.terminal.scrollToBottom(); }, 100);

  // Load file and create CodeMirror editor
  fetch(`/api/file/content?path=${encodeURIComponent(filePath)}${hq}`)
    .then(r => r.json())
    .then(data => {
      const content = data.content || '';
      const langExtensions = getLangExtension(detectLang(filePath));
      const edSettings = loadEditorSettings();

      const themeComp = new Compartment();
      const wrapComp = new Compartment();
      const fontSizeComp = new Compartment();

      const editorView = new EditorView({
        state: EditorState.create({
          doc: content,
          extensions: [
            basicSetup,
            activeLineSelectionPatch,
            themeComp.of(edSettings.theme === 'dark' ? oneDark : editorLightTheme),
            wrapComp.of(edSettings.wordWrap ? EditorView.lineWrapping : []),
            fontSizeComp.of(editorFontTheme(edSettings.fontSize, isTouchDevice())),
            ...langExtensions,
            Prec.highest(keymap.of([
              { key: 'Mod-s', run: () => { doSave(); return true; } },
              { key: 'Mod-g', run: () => { doSave(); return true; } },
            ])),
            keymap.of([indentWithTab]),
          ],
        }),
        parent: editorBody,
      });
      if (targetWinInfo._editorState) targetWinInfo._editorState.editorView = editorView; // for closeExternalEditor teardown
      editorPane._editorView = editorView;   // B-23e5's LEFT (1): the CLI's close of THIS pane finds its own editor (the window's state may name another)
      // B-23e5's remainder (r1442 (D)): the pane's text lives only here until a save lands — the TERMINAL WINDOW asks before a close drops it
      // (its ✕, a tab's, a group's close-all: requestClose), with the tree's own dialog; the reload guard and the stage hear it (_editorDirty)
      // ONE guard a window, over EVERY pane it holds (a pane left behind by an interrupted CLI counts too): a pane whose text is not on
      // disk and whose editor is still in the window is unsaved; a removed pane never is (its delta read: no guard over a guard, none lost)
      const panes = targetWinInfo._editorPanes || (targetWinInfo._editorPanes = new Set());
      panes.add({ view: editorView, name: String(filePath).split('/').pop() || filePath, dirty: () => editorView.dom.isConnected && editorView.state.doc.toString() !== content });
      if (!targetWinInfo._editorPaneGuard) {
        targetWinInfo._editorPaneGuard = true;
        const prevDirty = targetWinInfo._editorDirty, prevAsk = targetWinInfo.onCloseRequest;
        const unsavedPane = () => { const names = []; for (const x of panes) { if (!x.view.dom.isConnected) panes.delete(x); else if (x.dirty()) names.push(x.name); } return names.length ? { name: names.join(', ') } : null; };   // every unsaved pane named
        targetWinInfo._editorDirty = () => !!unsavedPane() || (typeof prevDirty === 'function' && prevDirty());
        targetWinInfo.onCloseRequest = (o) => {
          const d = unsavedPane();
          if (d && !(o && o.discardAsked)) {
            showConfirmDialog({ title: t('Close without saving?'), message: t('{name} has unsaved changes — they are only in this window. Close it and discard them?', { name: d.name }), confirmText: t('Discard'), danger: true, cancelDefault: true })   // r1733 (2): Enter keeps
              .then((ok) => { if (ok) app.wm.requestClose(targetWinInfo.id, { ...(o || {}), discardAsked: true }); });
            return false;
          }
          return typeof prevAsk === 'function' ? prevAsk(o) : true;
        };
      }
      setTimeout(() => lateFocus(editorView, { win: targetWinInfo, since: openAt }), 50);   // B-c87d: the pane takes the keys only if the person did nothing elsewhere since it began opening

      // Wire up editor settings buttons
      btnWrap.onclick = () => {
        edSettings.wordWrap = !edSettings.wordWrap;
        btnWrap.textContent = edSettings.wordWrap ? 'Wrap: On' : 'Wrap: Off';
        editorView.dispatch({ effects: wrapComp.reconfigure(edSettings.wordWrap ? EditorView.lineWrapping : []) });
        saveEditorSettings(edSettings);
      };
      // B-9b12: the same finger rule as the code editor (one stored size): the size DRAWN shown and written, «−» at the touch floor
      // says why, a step counts from the size drawn
      const stepFont = (delta) => {
        const finger = isTouchDevice(), { drawn, floor } = editorFontFace(edSettings.fontSize, finger);
        if (delta < 0 && floor) { sayFingerFloor(); return; }
        edSettings.fontSize = Math.max(8, Math.min(32, drawn + delta));
        fontDisplay.textContent = editorFontFace(edSettings.fontSize, finger).drawn;
        editorView.dispatch({ effects: fontSizeComp.reconfigure(editorFontTheme(edSettings.fontSize, finger)) });
        saveEditorSettings(edSettings);
      };
      btnFontDown.onclick = () => stepFont(-1);
      btnFontUp.onclick = () => stepFont(1);
      btnTheme.onclick = () => {
        edSettings.theme = edSettings.theme === 'dark' ? 'light' : 'dark';
        btnTheme.textContent = edSettings.theme === 'dark' ? 'Dark' : 'Light';
        editorView.dispatch({ effects: themeComp.reconfigure(edSettings.theme === 'dark' ? oneDark : editorLightTheme) });
        saveEditorSettings(edSettings);
      };

      const doSave = async () => {
        const at = openClock();   // B-c87d: the close began NOW (the person's Save & Close); the save answers later
        const newContent = editorView.state.doc.toString();
        try {
          const res = await fetch('/api/file/write', { method:'POST', headers:{'Content-Type':'application/json', ...ATTENDED_HEADERS}, body: JSON.stringify({ path: filePath, content: newContent, host: host || undefined }) });   // B-23e5: a person's save, marked
          const data = await res.json().catch(() => ({}));
          // r1733 (6): a save refused «still trying» — the save before it may still land: one true sentence, never «not saved»
          if (data && data.code === 'storage_path_trying') { saveBtn.textContent = t('{name}: the save before this one is still being tried — wait for its answer', { name: String(filePath).split('/').pop() || filePath }); return; }
          if (!res.ok || data.error) throw new Error(data.error ? fsErrorText(data) : `HTTP ${res.status}`);   // B-3b03 follow-up: a refusal in the reader's language
          await fetch('/api/editor/signal', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ signalPath, filePath, host: host || undefined }) });
        } catch (err) {
          // Write failed — keep the editor open with the user's edits instead
          // of tearing down and unblocking Claude with a stale file
          saveBtn.textContent = '✕ ' + t('{name} is not saved — {why}', { name: String(filePath).split('/').pop() || filePath, why: err.message || t('Error') }) + ' — ' + t('retry');   // B-23e5 (the save law): where it is not saved
          saveBtn.style.background = 'var(--red)';   // r1378 (3): the words STAY until the next press (no reset) — the CLI is not told «done»
          pathSpan.textContent = t('{name} is not saved — {why}. Your text is still here, unsaved: save again, or copy it to keep it elsewhere.', { name: String(filePath).split('/').pop() || filePath, why: err.message || t('Error') }); pathSpan.style.color = 'var(--red)';
          return;
        }
        // Remove editor pane + resizer, restore terminal to full height — B-23e5's LEFT (1): the window's state is cleared only when it is
        // THIS pane's, and the split stays while another pane (one left behind by an interrupted CLI) is still shown
        if (targetWinInfo._editorState && targetWinInfo._editorState.signalPath === signalPath) {
          targetWinInfo._editorState = null;
          targetWinInfo._editorDoSave = null;
          targetWinInfo._editorTermVeil?.remove(); targetWinInfo._editorTermVeil = null;
        }
        editorView.destroy();
        editorPane.remove();
        if (contentEl.querySelectorAll('.editor-container').length) return;   // another pane still shows: its split stays
        (targetWinInfo._splitResizer || splitResizer).destroy(); targetWinInfo._splitResizer = null;   // the LIVE resizer (a later open replaced this pane's)
        contentEl.style.display = '';
        contentEl.style.flexDirection = '';
        termContainer.style.flex = '';
        termContainer.style.minHeight = '';
        termContainer.style.height = '';
        termContainer.style.flexBasis = '';
        if (termSession) {
          setTimeout(() => {
            termSession.fit();
            termSession.terminal.scrollToBottom();
            lateFocus({ focus: () => termSession.terminal.focus() }, { win: targetWinInfo, since: at });   // B-c87d
          }, 150);
        }
      };

      saveBtn.onclick = doSave;
      targetWinInfo._editorDoSave = doSave;
    })
    .catch((err) => {
      // Load failed (server briefly down, file unreadable) — without this the
      // split pane appeared with a dead Save button and the terminal was stuck
      pathSpan.textContent = `Failed to load ${filePath}: ${err.message}`;
      pathSpan.style.color = 'var(--red)';
      saveBtn.textContent = 'Close editor';
      saveBtn.onclick = async () => {
        const at = openClock();   // B-c87d: the close began NOW; its signal answers later
        try { await fetch('/api/editor/signal', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ signalPath, filePath, host: host || undefined }) }); } catch {}
        if (targetWinInfo._editorState && targetWinInfo._editorState.signalPath === signalPath) { targetWinInfo._editorState = null; targetWinInfo._editorDoSave = null; }   // B-23e5: only its own pane's state
        editorPane.remove();
        if (contentEl.querySelectorAll('.editor-container').length) return;   // another pane still shows: its split stays
        (targetWinInfo._splitResizer || splitResizer).destroy(); targetWinInfo._splitResizer = null;
        contentEl.style.display = '';
        contentEl.style.flexDirection = '';
        termContainer.style.flex = '';
        termContainer.style.minHeight = '';
        termContainer.style.height = '';
        termContainer.style.flexBasis = '';
        if (termSession) setTimeout(() => { termSession.fit(); lateFocus({ focus: () => termSession.terminal.focus() }, { win: targetWinInfo, since: at }); }, 150);   // B-c87d
      };
    });
}

/**
 * Close an external editor split-pane by signal path.
 * @param {object} app - App instance
 * @param {string} signalPath - Signal file identifying which editor to close
 */
export function closeExternalEditor(app, signalPath) {
  for (const [, win] of app.wm.windows) {
    // B-23e5's LEFT (1): the window is found by the pane of ITS OWN signal — never by the window's state (an older pane's save may have
    // cleared it while this pane still shows), and only that pane goes
    const editorPane = [...((win.content && win.content.querySelectorAll) ? win.content.querySelectorAll('.editor-container') : [])].find((el) => el.dataset.signal === signalPath);
    if (!editorPane) continue;
    {
      const termContainer = win.content.querySelector('.terminal-container');
      const mine = win._editorState?.signalPath === signalPath;
      {
        (editorPane._editorView || (mine ? win._editorState.editorView : null))?.destroy?.(); // release the CodeMirror instance (leaked per remote close)
        editorPane.remove();
        if (mine) { win._editorState = null; win._editorDoSave = null; win._editorTermVeil?.remove(); win._editorTermVeil = null; }
        if (win.content.querySelectorAll('.editor-container').length) break;   // another pane still shows: its split stays
        if (win._splitResizer) { win._splitResizer.destroy(); win._splitResizer = null; }
        if (termContainer) {
          win.content.style.display = '';
          win.content.style.flexDirection = '';
          termContainer.style.flex = '';
          termContainer.style.minHeight = '';
          termContainer.style.height = '';
          termContainer.style.flexBasis = '';
        }
        const termSession = [...app.sessions.values()].find(s => s.winInfo === win);
        if (termSession) {
          setTimeout(() => { termSession.fit(); termSession.terminal.scrollToBottom(); }, 150);
        }
      }
      break;
    }
  }
}
