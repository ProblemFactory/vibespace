/**
 * External editor — Ctrl+G split-pane CodeMirror integration.
 * Opens an editor pane below a terminal window for editing files
 * invoked by Claude Code's EDITOR mechanism.
 */

import { CodeEditor, detectLang, getLangExtension, loadEditorSettings, saveEditorSettings, editorLightTheme, activeLineSelectionPatch } from './code-editor.js';
import { t } from './i18n.js';
import { Resizer } from './resizer.js';
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
export function openExternalEditor(app, filePath, signalPath, sessionId) {
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

  if (!targetWinInfo) {
    // No terminal window — open standalone editor
    app._hideWelcome();
    const winInfo = app.wm.createWindow({ title: `Editor: ${filePath.split('/').pop()}`, type: 'editor' });
    new CodeEditor(winInfo, filePath, filePath.split('/').pop(), app, {
      onSaveAndClose: async () => {
        try { await fetch('/api/editor/signal', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ signalPath, filePath }) }); } catch {}
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

  // Hint pill over the terminal half: while the CLI waits on the editor its
  // fullscreen TUI leaves the alt screen, so the pane sits BLANK — which reads
  // as broken. (Mouse-report suppression for the same window rides
  // _editorState in terminal.js.) Removed by both teardown paths.
  const termVeil = document.createElement('div');
  termVeil.className = 'editor-term-veil';
  termVeil.textContent = t('Editing below — Save & Close to hand the file back');
  termContainer.appendChild(termVeil);
  targetWinInfo._editorTermVeil = termVeil;

  // Create the editor pane
  const editorPane = document.createElement('div');
  editorPane.className = 'editor-container';
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
  const fontDisplay = document.createElement('span'); fontDisplay.className = 'editor-font-size-display'; fontDisplay.textContent = edSettings.fontSize;
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
  if (termSession) setTimeout(() => termSession.fit(), 100);

  // Load file and create CodeMirror editor
  fetch(`/api/file/content?path=${encodeURIComponent(filePath)}`)
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
            fontSizeComp.of(EditorView.theme({ '.cm-content, .cm-gutters': { fontSize: edSettings.fontSize + 'px' } })),
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
      setTimeout(() => editorView.focus(), 50);

      // Wire up editor settings buttons
      btnWrap.onclick = () => {
        edSettings.wordWrap = !edSettings.wordWrap;
        btnWrap.textContent = edSettings.wordWrap ? 'Wrap: On' : 'Wrap: Off';
        editorView.dispatch({ effects: wrapComp.reconfigure(edSettings.wordWrap ? EditorView.lineWrapping : []) });
        saveEditorSettings(edSettings);
      };
      btnFontDown.onclick = () => {
        edSettings.fontSize = Math.max(8, edSettings.fontSize - 1);
        fontDisplay.textContent = edSettings.fontSize;
        editorView.dispatch({ effects: fontSizeComp.reconfigure(EditorView.theme({ '.cm-content, .cm-gutters': { fontSize: edSettings.fontSize + 'px' } })) });
        saveEditorSettings(edSettings);
      };
      btnFontUp.onclick = () => {
        edSettings.fontSize = Math.min(32, edSettings.fontSize + 1);
        fontDisplay.textContent = edSettings.fontSize;
        editorView.dispatch({ effects: fontSizeComp.reconfigure(EditorView.theme({ '.cm-content, .cm-gutters': { fontSize: edSettings.fontSize + 'px' } })) });
        saveEditorSettings(edSettings);
      };
      btnTheme.onclick = () => {
        edSettings.theme = edSettings.theme === 'dark' ? 'light' : 'dark';
        btnTheme.textContent = edSettings.theme === 'dark' ? 'Dark' : 'Light';
        editorView.dispatch({ effects: themeComp.reconfigure(edSettings.theme === 'dark' ? oneDark : editorLightTheme) });
        saveEditorSettings(edSettings);
      };

      const doSave = async () => {
        const newContent = editorView.state.doc.toString();
        try {
          const res = await fetch('/api/file/write', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path: filePath, content: newContent }) });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
          await fetch('/api/editor/signal', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ signalPath, filePath }) });
        } catch (err) {
          // Write failed — keep the editor open with the user's edits instead
          // of tearing down and unblocking Claude with a stale file
          saveBtn.textContent = `✕ ${err.message || 'Save failed'} — retry`;
          saveBtn.style.background = 'var(--red)';
          setTimeout(() => { saveBtn.textContent = 'Save & Close'; saveBtn.style.background = ''; }, 4000);
          return;
        }
        // Remove editor pane + resizer, restore terminal to full height
        targetWinInfo._editorState = null;
        targetWinInfo._editorDoSave = null;
        targetWinInfo._editorTermVeil?.remove(); targetWinInfo._editorTermVeil = null;
        editorView.destroy();
        splitResizer.destroy();
        editorPane.remove();
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
            termSession.terminal.focus();
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
        try { await fetch('/api/editor/signal', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ signalPath, filePath }) }); } catch {}
        targetWinInfo._editorState = null;
        targetWinInfo._editorDoSave = null;
        splitResizer.destroy();
        editorPane.remove();
        contentEl.style.display = '';
        contentEl.style.flexDirection = '';
        termContainer.style.flex = '';
        termContainer.style.minHeight = '';
        termContainer.style.height = '';
        termContainer.style.flexBasis = '';
        if (termSession) setTimeout(() => { termSession.fit(); termSession.terminal.focus(); }, 150);
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
    if (win._editorState?.signalPath === signalPath) {
      const editorPane = win.content.querySelector('.editor-container');
      const termContainer = win.content.querySelector('.terminal-container');
      if (editorPane) {
        win._editorState?.editorView?.destroy?.(); // release the CodeMirror instance (leaked per remote close)
        editorPane.remove();
        win._editorState = null;
        win._editorDoSave = null;
        win._editorTermVeil?.remove(); win._editorTermVeil = null;
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
