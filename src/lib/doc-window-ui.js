// THE DOC WINDOW'S UI (lane doc-window, 2.369.215) — bundled into the LAZY public/doc-editor.js; mounted by the door
// (src/lib/doc-window.js) with the main bundle's helpers in `deps` (t, toasts, dialogs, the file-changed relay, the raw
// CodeEditor). Every rule is src/doc-model.js's; the markdown is src/lib/doc-markdown.js's.
//   · OPEN: read the file → THE FIDELITY RULE (parse → serialize === the source, modulo trailing whitespace) ⇒ the
//     rendered editor; not lossless ⇒ RAW with a chip that says why. Raw is always one press away (the escape hatch).
//   · LIVE + CONFLICT: a 2 s stat poll (this machine) / a check on refocus (a remote host — the code editor's rule) +
//     the `file-changed` relay: the disk moved and no unsaved edits ⇒ repaint in place (scroll kept); with unsaved
//     edits ⇒ the bar "Reload | Keep editing"; after Keep editing the save asks ONCE before overwriting.
//   · COMMENTS: a selection ⇒ a floating Comment button (the house popover) ⇒ a note box; the strip on the right
//     (device-kept per (host, path); a bottom sheet on a phone); Send all = ONE POST /api/doc/comments.
//   · SAVE: the serializer's output through the atomic /api/file/write of THIS window's path only, then
//     POST /api/doc/edited {summary} — the owning chat's free next-turn note.
import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, undo, redo } from 'prosemirror-history';
import { splitListItem, liftListItem, sinkListItem } from 'prosemirror-schema-list';
import M from '../doc-model.js';
import { schema, parseMd, serializeMd, docFidelity, safeImageSrc } from './doc-markdown.js';

const POLL_MS = 2000;
const SHEET_BELOW = 640;   // px of window width: below it the comments strip is a bottom sheet
const STORE_PREFIX = 'vs-doc-comments:';
const CSS = `
.doc-window{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--bg-window);color:var(--text);position:relative}
.doc-window [hidden]{display:none!important}
.doc-bar{display:flex;align-items:center;gap:6px;padding:4px 8px;border-bottom:1px solid var(--border);flex:none;min-width:0}
.doc-bar button{background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:5px;padding:3px 10px;cursor:pointer;font:inherit;font-size:12px}
.doc-bar button[aria-pressed="true"]{background:var(--accent);color:var(--bg-window);border-color:var(--accent)}
.doc-stamp{font-size:11px;color:var(--text-dim);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.doc-chip{margin:6px 8px 0;padding:5px 10px;border-radius:6px;font-size:12px;background:color-mix(in srgb,var(--yellow) 18%,var(--bg-window));border:1px solid color-mix(in srgb,var(--yellow) 45%,var(--border))}
.doc-conflict{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 8px 0;padding:6px 10px;border-radius:6px;font-size:12px;background:color-mix(in srgb,var(--red) 14%,var(--bg-window));border:1px solid color-mix(in srgb,var(--red) 45%,var(--border))}
.doc-conflict span{flex:1;min-width:12em}
.doc-conflict button,.doc-strip button,.doc-note button{background:var(--bg-input);color:var(--text);border:1px solid var(--border);border-radius:5px;padding:3px 10px;cursor:pointer;font:inherit;font-size:12px}
.doc-main{flex:1;display:flex;min-height:0}
.doc-pane{flex:1;overflow:auto;min-width:0}
.doc-raw{flex:1;min-width:0;display:flex;flex-direction:column}
.doc-raw>.editor-container{flex:1;min-height:0}
.doc-page{max-width:760px;margin:0 auto;padding:18px 28px 80px}
.doc-page .ProseMirror{outline:none;white-space:pre-wrap;word-wrap:break-word;line-height:1.6;font-size:15px}
.doc-page .ProseMirror pre{background:var(--bg-input);padding:10px 12px;border-radius:6px;overflow:auto;white-space:pre}
.doc-page .ProseMirror code{background:var(--bg-input);padding:1px 4px;border-radius:4px;font-size:.9em}
.doc-page .ProseMirror pre code{background:none;padding:0}
.doc-page .ProseMirror blockquote{border-left:3px solid var(--border);margin:0 0 0 2px;padding-left:12px;color:var(--text-dim)}
.doc-page .ProseMirror img{max-width:100%}
.doc-page .ProseMirror ul,.doc-page .ProseMirror ol{padding-left:1.6em}
.doc-page .ProseMirror a{color:var(--accent)}
.doc-page .ProseMirror hr{border:none;border-top:1px solid var(--border)}
.doc-strip{width:260px;flex:none;border-left:1px solid var(--border);display:flex;flex-direction:column;min-height:0;background:var(--bg-dialog)}
.doc-strip-head{padding:8px 10px;font-size:12px;font-weight:600;display:flex;align-items:center;gap:6px}
.doc-strip-list{flex:1;overflow:auto;padding:0 8px}
.doc-cmt{position:relative;background:var(--bg-window);border:1px solid var(--border);border-radius:6px;padding:6px 26px 6px 8px;margin-bottom:6px;font-size:12px}
.doc-cmt-q{color:var(--text-dim);border-left:2px solid var(--accent);padding-left:6px;margin-bottom:4px;overflow-wrap:anywhere}
.doc-cmt-n{white-space:pre-wrap;overflow-wrap:anywhere}
.doc-cmt-x{position:absolute;top:2px;right:2px;border:none!important;background:none!important;padding:2px 6px!important;color:var(--text-dim)!important}
.doc-strip-foot{padding:8px 10px;border-top:1px solid var(--border);font-size:12px;display:flex;flex-direction:column;gap:6px}
.doc-strip-foot .doc-send{background:var(--accent);color:var(--bg-window);border-color:var(--accent)}
.doc-strip-empty{color:var(--text-dim);font-size:12px;padding:4px 2px}
.doc-cpop{background:var(--bg-dialog);border:1px solid var(--border);border-radius:6px;padding:4px;box-shadow:0 4px 14px rgba(0,0,0,.25)}
.doc-cpop button{background:var(--accent);color:var(--bg-window);border:none;border-radius:5px;padding:4px 10px;cursor:pointer;font:inherit;font-size:12px}
.doc-note{background:var(--bg-dialog);border:1px solid var(--border);border-radius:8px;padding:8px;width:280px;box-shadow:0 6px 18px rgba(0,0,0,.3);display:flex;flex-direction:column;gap:6px;font-size:12px}
.doc-note textarea{width:100%;box-sizing:border-box;min-height:70px;background:var(--bg-window);color:var(--text);border:1px solid var(--border);border-radius:5px;font:inherit;padding:5px}
.doc-note-q{color:var(--text-dim);overflow-wrap:anywhere}
.doc-note-acts{display:flex;justify-content:flex-end;gap:6px}
.doc-window.doc-sheet .doc-strip{position:absolute;left:0;right:0;bottom:0;width:auto;max-height:60%;border-left:none;border-top:1px solid var(--border);border-radius:12px 12px 0 0;box-shadow:0 -6px 18px rgba(0,0,0,.25);z-index:3}
.doc-window.doc-phone button{min-height:44px}
.doc-window.doc-phone .doc-page{padding:12px 14px 80px}
`;

const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const q = (host, path) => { const u = new URLSearchParams(); if (host) u.set('host', host); u.set('path', path); return u.toString(); };
const dirOf = (p) => p.slice(0, p.lastIndexOf('/')) || '/';
const joinRel = (dir, rel) => { const out = []; for (const seg of (dir + '/' + rel).split('/')) { if (!seg || seg === '.') continue; if (seg === '..') out.pop(); else out.push(seg); } return '/' + out.join('/'); };

export function mountDocWindow({ root, winInfo, host, path, name, from, signal, deps }) {
  const { t, showToast, fetchJson, createModalShell, showConfirmDialog, createPopover, onFileChanged, sameFile, makeRaw, isPhone } = deps;
  if (!document.getElementById('doc-window-css')) { const st = mk('style'); st.id = 'doc-window-css'; st.textContent = CSS; document.head.appendChild(st); }
  const S = { source: '', base: 0, mode: 'rich', verdict: null, dirty: false, kept: 0, confirmed: 0, busy: false, view: null, raw: null, rawBefore: '', owner: null, from, sending: false };
  const storeKey = STORE_PREFIX + (host || '') + '\u0001' + path;
  const loadComments = () => { try { const v = JSON.parse(localStorage.getItem(storeKey) || '[]'); return Array.isArray(v) ? v.filter((c) => c && typeof c.id === 'string' && typeof c.note === 'string').slice(0, M.LIMITS.items) : []; } catch { return []; } };
  const saveComments = () => { try { if (comments.length) localStorage.setItem(storeKey, JSON.stringify(comments)); else localStorage.removeItem(storeKey); } catch { } };
  let comments = loadComments();

  // ── the frame ──
  const bar = mk('div', 'doc-bar'); bar.setAttribute('role', 'toolbar');
  const btnRaw = mk('button', 'doc-raw-btn', t('Raw')); btnRaw.setAttribute('aria-pressed', 'false'); btnRaw.title = t('Edit the markdown source');
  const btnSave = mk('button', 'doc-save-btn', t('Save'));
  const stamp = mk('span', 'doc-stamp');
  const btnStrip = mk('button', 'doc-strip-btn');
  bar.append(btnRaw, btnSave, stamp, btnStrip);
  const chip = mk('div', 'doc-chip'); chip.hidden = true; chip.setAttribute('role', 'status');
  const conflict = mk('div', 'doc-conflict'); conflict.hidden = true; conflict.setAttribute('role', 'alert');
  const cText = mk('span', null, t('The agent changed this file while you were editing.'));
  const btnReload = mk('button', 'doc-reload', t('Reload (your edits go)'));
  const btnKeep = mk('button', 'doc-keep', t('Keep editing'));
  conflict.append(cText, btnReload, btnKeep);
  const main = mk('div', 'doc-main');
  const pane = mk('div', 'doc-pane'); const page = mk('div', 'doc-page'); pane.appendChild(page);
  const rawPane = mk('div', 'doc-raw'); rawPane.hidden = true;
  const strip = mk('aside', 'doc-strip'); strip.setAttribute('aria-label', t('Comments'));
  const stripHead = mk('div', 'doc-strip-head'); const list = mk('div', 'doc-strip-list'); const foot = mk('div', 'doc-strip-foot');
  const ownerLine = mk('div', 'doc-owner'); const btnSend = mk('button', 'doc-send', t('Send all'));
  foot.append(ownerLine, btnSend); strip.append(stripHead, list, foot);
  main.append(pane, rawPane, strip);
  root.append(bar, chip, conflict, main);
  // the strip sits on the right of a wide window; a phone or a narrow pane (a split beside the chat) gets it as a bottom
  // sheet, closed until a comment is added or the bar's Comments (n) opens it
  const sheetMode = () => isPhone() || (root.clientWidth > 0 && root.clientWidth < SHEET_BELOW);
  const layout = () => {
    root.classList.toggle('doc-phone', isPhone());
    const sh = sheetMode();
    if (sh !== root.classList.contains('doc-sheet')) { root.classList.toggle('doc-sheet', sh); strip.hidden = sh; }
  };
  layout();
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(layout) : null;
  if (ro) ro.observe(root);

  const say = (text) => { chip.textContent = text || ''; chip.hidden = !text; };
  const status = (text) => { stamp.textContent = text; };
  const setDirty = (d) => { S.dirty = d; btnSave.textContent = d ? t('Save') + ' ●' : t('Save'); };
  winInfo._editorDirty = () => S.dirty || !!(S.raw && S.raw.modified);
  const info = async () => { const r = await fetchJson('/api/file/info?' + q(host, path)); return r && !r.error && r.modified ? new Date(r.modified).getTime() || 0 : 0; };
  const read = async () => {
    const r = await fetchJson('/api/file/content?' + q(host, path));
    if (!r || r.error) throw new Error((r && r.error) || t('the server did not answer'));
    return String(r.content || '');
  };

  // ── the rendered editor ──
  const imgView = (node) => {
    const img = document.createElement('img');
    const src = safeImageSrc(node.attrs.src);
    if (src) img.src = /^[a-z][a-z0-9+.-]*:/i.test(src) ? src : '/api/file/raw?' + q(host, src.startsWith('/') ? src : joinRel(dirOf(path), src));
    img.alt = node.attrs.alt || ''; if (node.attrs.title) img.title = node.attrs.title;
    return { dom: img };
  };
  let selTimer = 0;
  const selPlugin = new Plugin({ view: () => ({ update: (view) => { clearTimeout(selTimer); selTimer = setTimeout(() => offerComment(view), 250); } }) });
  const mkState = (doc) => EditorState.create({
    doc, plugins: [
      history(),
      keymap({ 'Mod-z': undo, 'Shift-Mod-z': redo, 'Mod-y': redo, 'Mod-b': toggleMark(schema.marks.strong), 'Mod-i': toggleMark(schema.marks.em), 'Mod-`': toggleMark(schema.marks.code), 'Mod-s': () => { save(); return true; } }),
      keymap({ Enter: splitListItem(schema.nodes.list_item), 'Mod-[': liftListItem(schema.nodes.list_item), 'Mod-]': sinkListItem(schema.nodes.list_item) }),
      keymap(baseKeymap), selPlugin,
    ],
  });
  const ensureView = (doc) => {
    if (S.view) return S.view;
    S.view = new EditorView(page, {
      state: mkState(doc), nodeViews: { image: imgView },
      dispatchTransaction(tr) { const v = S.view; v.updateState(v.state.apply(tr)); if (tr.docChanged && !tr.getMeta('doc-repaint')) setDirty(true); },
      handleDOMEvents: { click: (_v, e) => { const a = e.target.closest && e.target.closest('a[href]'); if (a && (e.ctrlKey || e.metaKey)) { window.open(a.href, '_blank', 'noopener'); } if (a) e.preventDefault(); return false; } },
    });
    return S.view;
  };
  /** Show a source in the rendered view: a fresh state on first paint, else ONE replace (ProseMirror keeps every
   *  unchanged DOM node — the keyed in-place repaint) with the pane's scroll kept. */
  const paint = (src) => {
    const doc = parseMd(src);
    if (!S.view) { ensureView(doc); return; }
    const top = pane.scrollTop;
    const tr = S.view.state.tr.replaceWith(0, S.view.state.doc.content.size, doc.content).setMeta('doc-repaint', true).setMeta('addToHistory', false);
    S.view.dispatch(tr);
    pane.scrollTop = top;
  };

  // ── modes ──
  const showRich = () => { S.mode = 'rich'; pane.hidden = false; rawPane.hidden = true; btnRaw.setAttribute('aria-pressed', 'false'); btnSave.hidden = false; };
  const showRaw = () => {
    S.mode = 'raw'; pane.hidden = true; rawPane.hidden = false; btnRaw.setAttribute('aria-pressed', 'true'); btnSave.hidden = true; conflict.hidden = true;
    if (!S.raw) {
      S.raw = makeRaw(rawPane); S.rawBefore = S.source;
      const orig = S.raw.save.bind(S.raw);
      S.raw.save = async () => {
        await orig();
        if (S.raw.modified) return;
        const after = S.raw.editorView ? S.raw.editorView.state.doc.toString() : S.rawBefore;
        if (after !== S.rawBefore) { const before = S.rawBefore; S.rawBefore = after; S.source = after; S.base = await info(); noteEdit(before, after); }
      };
    }
  };
  const fidelityWords = (v) => t('This file uses formatting the rich editor would change — editing raw') + (v && v.code ? ` (${({ table: t('a table'), html: t('HTML'), footnote: t('a footnote'), front_matter: t('front matter'), crlf: 'CRLF', setext: t('an underlined heading'), too_big: t('too large') })[v.code] || t('line {n}', { n: v.line })})` : '');

  /** Read the disk and show it: lossless ⇒ the rendered view; else raw + the chip. */
  async function load({ first = false } = {}) {
    S.busy = true;
    try {
      const [src, m] = await Promise.all([read(), info()]);
      S.source = src; S.base = m; S.kept = 0; S.confirmed = 0; conflict.hidden = true;
      S.verdict = docFidelity(src);
      if (!S.verdict.ok) { say(fidelityWords(S.verdict)); if (S.mode !== 'raw') showRaw(); else if (!first && S.raw && !S.raw.modified) S.raw.reloadFromDisk?.({ auto: true }); setDirty(false); }
      else { if (S.mode === 'rich' || first) { say(''); showRich(); paint(src); setDirty(false); } }
      status(t('Read {time}', { time: new Date().toLocaleTimeString() }));
    } catch (e) {
      if (first) { page.textContent = t('Could not read this document: {why}', { why: e.message }); }
      else say(t('Could not read this document: {why}', { why: e.message }));
    } finally { S.busy = false; }
  }

  btnRaw.addEventListener('click', async () => {
    if (S.mode === 'rich') { if (S.dirty) { say(t('Save first — the raw editor opens the file as it is on disk')); return; } showRaw(); return; }
    if (S.raw && S.raw.modified) { say(t('Save first — the raw editor has unsaved edits')); return; }
    const v = docFidelity(S.raw && S.raw.editorView ? S.raw.editorView.state.doc.toString() : S.source);
    if (!v.ok) { say(fidelityWords(v)); return; }
    showRich(); await load();
  }, { signal });

  // ── save + the edit note ──
  async function save() {
    if (S.mode !== 'rich' || !S.view || S.busy) return;
    const text = M.saveText(serializeMd(S.view.state.doc), S.source);
    S.busy = true;
    try {
      const disk = await info();
      if (M.saveVerdict({ disk, base: S.base, confirmed: S.confirmed }) === 'ask') {
        const ok = await showConfirmDialog({ title: t('Overwrite the agent\'s newer version?'), message: t('The agent changed this file after you opened it. Saving replaces its version with yours.'), confirmText: t('Overwrite'), danger: true });
        if (!ok) return;
        S.confirmed = disk;
      }
      const res = await fetch('/api/file/write', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, content: text, host: host || undefined }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      const before = S.source;
      S.source = text; S.base = await info(); S.kept = 0; S.confirmed = 0; conflict.hidden = true; setDirty(false);
      status(t('Saved {time}', { time: new Date().toLocaleTimeString() }));
      noteEdit(before, text);
    } catch (e) { say(t('Save failed: {why}', { why: e.message })); } finally { S.busy = false; }
  }
  btnSave.addEventListener('click', () => save(), { signal });
  async function noteEdit(before, after) {
    if (before === after) return;
    const r = await fetchJson('/api/doc/edited', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host, path, from: S.from, summary: M.editSummary(before, after) }) });
    if (r && r.ok) status(t('Saved — the chat sees your edit on its next turn'));
  }

  // ── live: the 2 s watch + the relay + the conflict bar ──
  async function check() {
    if (document.hidden || S.busy || S.mode !== 'rich' || !S.base) return;
    const disk = await info();
    const v = M.conflictVerdict({ disk, base: S.base, dirty: S.dirty, kept: S.kept });
    if (v === 'repaint') await load();
    else if (v === 'bar') conflict.hidden = false;
  }
  btnReload.addEventListener('click', () => { setDirty(false); load(); }, { signal });
  btnKeep.addEventListener('click', async () => { S.kept = await info(); conflict.hidden = true; }, { signal });
  const timer = host ? 0 : setInterval(check, POLL_MS);
  window.addEventListener('focus', check, { signal });
  onFileChanged((d) => { if (sameFile(d, { host: host || null, path })) check(); }, { signal });
  signal.addEventListener('abort', () => { clearInterval(timer); clearTimeout(selTimer); ro?.disconnect(); S.view?.destroy(); });

  // ── comments ──
  let pop = null;
  function offerComment(view) {
    const sel = view.state.selection;
    if (sel.empty || !view.hasFocus() || S.mode !== 'rich') return;
    const quote = view.state.doc.textBetween(sel.from, sel.to, ' ', ' ').trim();
    if (!quote) return;
    const c = view.coordsAtPos(sel.to);
    pop = createPopover(pane, 'doc-cpop', { position: 'cursor', x: c.left, y: c.bottom + 4 });
    const b = mk('button', 'doc-comment-btn', t('Add comment')); // its own words (lane artifacts-e2e): the shared 'Comment' is the Design window's 评论, this window says 批注 everywhere else
    b.addEventListener('mousedown', (e) => e.preventDefault());
    b.addEventListener('click', () => { pop.remove(); noteBox(quote, c); });
    pop.appendChild(b);
  }
  function noteBox(quote, c) {
    const box = mk('div', 'doc-note'); box.setAttribute('role', 'dialog');
    const qq = mk('div', 'doc-note-q', '“' + M.commentItem({ quote, note: '-' }).quote + '”');
    const ta = mk('textarea'); ta.placeholder = t('What should change?'); ta.maxLength = M.LIMITS.note;
    const acts = mk('div', 'doc-note-acts'); const cancel = mk('button', null, t('Cancel')); const add = mk('button', 'doc-note-add', t('Add'));
    acts.append(cancel, add); box.append(qq, ta, acts);
    let close;
    if (isPhone()) { const sh = createModalShell({ title: t('Add comment'), escapeToClose: true, dialogClass: 'doc-note-sheet' }); sh.body.appendChild(box); close = () => sh.close(); }
    else { const p = createPopover(pane, 'doc-note-pop', { position: 'cursor', x: c.left, y: c.bottom + 4 }); p.appendChild(box); close = () => p.remove(); }
    cancel.addEventListener('click', () => close());
    add.addEventListener('click', () => {
      const note = ta.value.trim(); if (!note) { ta.focus(); return; }
      if (comments.length >= M.LIMITS.items) { say(t('At most {n} comments — send these first', { n: M.LIMITS.items })); return; }
      comments.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), quote: M.commentItem({ quote, note }).quote, note });
      saveComments(); renderStrip(); close();
      if (sheetMode()) strip.hidden = false;
    });
    setTimeout(() => ta.focus(), 0);
  }
  function renderStrip() {
    stripHead.textContent = comments.length ? t('Comments ({n})', { n: comments.length }) : t('Comments');
    btnStrip.textContent = t('Comments ({n})', { n: comments.length });
    const keep = new Map([...list.children].map((el) => [el.dataset.key, el]));
    const want = comments.map((c) => {
      let el = keep.get(c.id);
      if (!el) {
        el = mk('div', 'doc-cmt'); el.dataset.key = c.id;
        if (c.quote) el.appendChild(mk('div', 'doc-cmt-q', c.quote));
        el.appendChild(mk('div', 'doc-cmt-n', c.note));
        const x = mk('button', 'doc-cmt-x', '×'); x.title = t('Remove'); x.setAttribute('aria-label', t('Remove'));
        x.addEventListener('click', () => { comments = comments.filter((y) => y.id !== c.id); saveComments(); renderStrip(); });
        el.appendChild(x);
      }
      return el;
    });
    for (const [k, el] of keep) if (!comments.some((c) => c.id === k)) el.remove();
    want.forEach((el, i) => { if (list.children[i] !== el) list.insertBefore(el, list.children[i] || null); });
    if (!comments.length && !list.querySelector('.doc-strip-empty')) list.appendChild(mk('div', 'doc-strip-empty', t('Select text in the document, then press Add comment.')));
    if (comments.length) list.querySelector('.doc-strip-empty')?.remove();
    btnSend.hidden = !comments.length;
    ownerLine.textContent = S.owner ? '' : t('Open this document from a chat to send comments to it');
    ownerLine.hidden = !!S.owner;
  }
  btnStrip.addEventListener('click', () => { strip.hidden = !strip.hidden; }, { signal });
  btnSend.addEventListener('click', async () => {
    if (S.sending || !comments.length) return;
    S.sending = true; btnSend.textContent = t('Sending…');
    const r = await fetchJson('/api/doc/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ host, path, from: S.from, items: comments.map((c) => ({ quote: c.quote, note: c.note })) }) });
    S.sending = false; btnSend.textContent = t('Send all');
    if (r && r.ok) {
      comments = []; saveComments(); renderStrip();
      showToast(r.delivered === 'stashed' ? t('Comments wait for the chat\'s next turn') : t('Comments sent to the chat'), { type: 'success' });
    } else if (r && r.code === 'no_owner') { S.owner = null; renderStrip(); }
    else say(t('Could not send the comments: {why}', { why: (r && r.error) || t('the server did not answer') }));
  }, { signal });
  async function resolveOwner() {
    const r = await fetchJson('/api/doc/owner?' + q(host, path) + (S.from ? '&from=' + encodeURIComponent(S.from) : ''));
    S.owner = r && r.owner ? r.owner : null; renderStrip();
  }
  winInfo._docAdopt = (sid) => { S.from = sid; if (winInfo._openSpec) winInfo._openSpec = { ...winInfo._openSpec, from: sid }; resolveOwner(); };
  winInfo._docClose = () => { clearInterval(timer); };

  renderStrip(); resolveOwner(); load({ first: true });
  return { save, load, state: S };
}
