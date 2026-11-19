// A FOR-YOU REPLY TAKES A PICTURE (B-51dd — the owner: a reply to an ask that wanted a screenshot could not carry one).
// ONE wiring for every reply box (the tray's / a chat card's — src/lib/user-todos-panel.js openBox — and the For-you
// window's — src/lib/inbox-window.js): a picture button (on a finger device it offers the camera too — the composer's
// cameraDoor — since a phone's gallery picker has no camera), a paste of a file into the box (a paste that carries TEXT
// stays text: a copied spreadsheet range is text plus a picture of it), a drop of files on it. Each file goes through
// THE picture door (src/lib/image-attach.js — the rule the chat composer asks: the type by its bytes, HEIC by name, no
// empty file; the size, sides and total the asking conversation's HARNESS row states), so a refusal is the composer's own toast.
// The pictures are the ITEM's, kept in the model's `pictures` map beside its text draft (`drafts`): a folded box keeps
// them, a box opened again shows them, a sent reply removes exactly the ones it carried. Every box showing an item
// redraws on any change to its pictures (the tray and the window may show the same item); a ✕ removes ITS picture (by
// identity, never by a stale index). Every chip is DOM nodes (the image by its .src, never markup).
//
// replyPictures({ box, ta, id, store, t, backend }) → { strip, btn, input, camera, draw, dispose }
//   backend = the asking conversation's harness, or a function answering it (backendOfKey) — its row's picture limits
//             judge each picture (batch 20 cure: a codex ask takes the phone photo a claude one cannot)
//   box   = the element a drop lands on; ta = the textarea a paste lands in
//   store = the model's Map (item id → [{base64, mediaType, dataUrl, name}]); id = the item's
//   strip (the chips, hidden while empty) · btn (the picture button) · input + camera.input (hidden file inputs) — the
//   caller places them, in the turn that made them · dispose() = the box left the page (releaseBoxesIn(root): every box
//   inside root — the tray's form, it holds rows, not the returned object)
import { createImageDoor, refusalText, heldOf } from './image-attach.js';
import { imageLimitsOf, harnessOfRecord } from '../backend-caps.js';   // batch 20 cure: the numbers are the conversation's HARNESS row
import { cameraDoor, sheetRow } from './chat-input.js';   // THE camera door (lane phone-take-photo) and the sheet's row
import { UI_ICONS } from './icons.js';
import { showToast, showImageOverlay, showContextMenu } from './utils.js';

const hasFiles = (e) => { const types = e.dataTransfer && e.dataTransfer.types; return !!types && Array.from(types).includes('Files'); };
// every live box per item: a change to an item's pictures redraws all of them. A BOX THAT LEAVES THE PAGE LEAVES THIS
// REGISTRY (B-51dd hosted cure — a For-you pane dropped while its item's pictures never changed again stayed reachable
// from here, and the item's words with it, after the record was cleared): its owner disposes it where it leaves (the
// For-you window's pane drop, rebuild and close: dispose(); the tray's one fold exit, every rows-leave stash, a row its
// reconciler drops and a rebuilt popup: releaseBoxesIn), and every draw — and every For-you snapshot's render and chat
// card pass (sweepBoxes) — first SWEEPS the boxes no longer on the page: the second belt, for a road that leaves without
// its owner's word (a band or a notice group redrawn, the mini inbox closed, a card dropped)
const boxesOf = new Map();   // item id → Set(entry) — entry = { box, paint, settled }
const unlist = (id, e) => { const s = boxesOf.get(id); if (!s) return; s.delete(e); if (!s.size) boxesOf.delete(id); };
// settled = the turn that made the box has ended (both owners place it in that turn): from then on, off the page = left
const sweep = () => { for (const [id, s] of [...boxesOf]) for (const e of [...s]) if (e.settled && !e.box.isConnected) unlist(id, e); };
const redrawAll = (id) => { sweep(); for (const e of [...(boxesOf.get(id) || [])]) e.paint(); };

/** THE SECOND BELT AT A BROADCAST: a clear draws no reply box, so the For-you snapshot's render (the tray's apply) and the
 *  chat card's pass sweep after they drew — a box their rows took off the page leaves the registry then, not at a later draw */
export function sweepBoxes() { sweep(); }

/** Every reply box `root` is or holds leaves the registry (call it BEFORE the nodes leave — a detached subtree is still
 *  searched, so after is fine too). The tray's disposal: it keeps rows, never the object replyPictures returned. */
export function releaseBoxesIn(root) {
  if (!root) return;
  for (const [id, s] of [...boxesOf]) for (const e of [...s]) if (e.box === root || (typeof root.contains === 'function' && root.contains(e.box))) unlist(id, e);
}

/** The harness of the conversation a For-you item belongs to: its key names it (`<harness>:<id>`), or — a page-only key
 *  (`webui:<id>`) — the live session row that holds it. null = not known (then no number judges a picture here; the route
 *  judges again with the conversation it sends to). */
export function backendOfKey(key, rows = null) {
  const k = String(key || '');
  const at = k.indexOf(':');
  if (at <= 0) return null;
  const head = k.slice(0, at), rest = k.slice(at + 1);
  if (head !== 'webui') return head;
  const list = rows || (typeof window !== 'undefined' && window.app && window.app.sidebar && window.app.sidebar._allSessions) || [];
  const row = Array.isArray(list) ? list.find((s) => s && s.webuiId === rest) : null;
  return row ? harnessOfRecord(row) : null;   // a row that names no harness is claude's (the ONE rule, backend-caps)
}

export function replyPictures({ box, ta, id, store, t, backend = null }) {
  const list = () => store.get(id) || [];
  const setList = (l) => { if (l.length) store.set(id, l); else store.delete(id); redrawAll(id); };
  const strip = document.createElement('div');
  strip.className = 'ut-reply-pics';
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.style.display = 'none';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'ut-act ut-reply-pic';
  btn.title = t('Attach image');
  btn.setAttribute('aria-label', btn.title);
  btn.innerHTML = UI_ICONS.image;   // a constant SVG (src/lib/icons.js), no item string
  const chip = (p) => {
    const c = document.createElement('div');
    c.className = 'ut-reply-pic-item';
    c.title = t('Click to view full size');
    const img = document.createElement('img');
    img.alt = p.name;
    img.src = p.dataUrl;
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'ut-reply-pic-remove';
    x.textContent = '✕';
    x.title = t('Remove');
    x.setAttribute('aria-label', x.title);
    x.onclick = (e) => { e.preventDefault(); e.stopPropagation(); setList(list().filter((q) => q !== p)); };
    c.onclick = (e) => { e.stopPropagation(); showImageOverlay(p.dataUrl); };
    c.append(img, x);
    return c;
  };
  const entry = { box, paint: null, settled: false };
  entry.paint = () => {
    if (entry.settled && !box.isConnected) { unlist(id, entry); return; }   // a box that left the page stops listening
    const l = list(); strip.replaceChildren(...l.map(chip)); strip.hidden = !l.length;
  };
  const draw = () => { sweep(); entry.paint(); };
  if (!boxesOf.has(id)) boxesOf.set(id, new Set());
  boxesOf.get(id).add(entry);
  queueMicrotask(() => { entry.settled = true; });
  const door = createImageDoor({
    held: () => heldOf(list()),
    onAdd: (p) => setList([...list(), p]),
    onRefused: (l) => showToast(refusalText(l, t), { type: 'error' }),
    limits: () => imageLimitsOf(typeof backend === 'function' ? backend() : backend),
  });
  const camera = cameraDoor((shot) => door.add([shot]));
  btn.onclick = (e) => {
    e.preventDefault(); e.stopPropagation();
    // a finger device: 拍照 / 照片 (the composer's sheet rows) — the camera is its own input; a desk: the picker at once
    const row = camera.row();
    if (!row) { input.click(); return; }
    const r = btn.getBoundingClientRect();
    showContextMenu(r.left, r.top, [row, sheetRow(UI_ICONS.image, t('Photos'), () => input.click())], 'context-menu', { extraClass: 'chat-plus-sheet' });
  };
  input.onchange = () => { door.add([...input.files]); input.value = ''; };
  // a paste that carries a FILE (a screenshot, a copied picture) — a paste that carries text stays the box's own
  ta.addEventListener('paste', (e) => {
    const cd = e.clipboardData;
    if (!cd || (cd.getData && cd.getData('text/plain'))) return;
    const files = Array.from(cd.items || []).filter((it) => it.kind === 'file').map((it) => it.getAsFile()).filter(Boolean);
    if (!files.length) return;
    e.preventDefault();
    door.add(files);
  });
  // a drop of files ON the box is the box's (never the chat view's upload into the working folder underneath); the
  // outline follows the drag by a short timer (dragleave is not reliable across browsers — chat-view.js's own pattern)
  let dragTimer = null;
  const unmark = () => { clearTimeout(dragTimer); dragTimer = null; box.classList.remove('ut-reply-drop'); };
  box.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation();
    box.classList.add('ut-reply-drop');
    clearTimeout(dragTimer); dragTimer = setTimeout(unmark, 150);
  });
  box.addEventListener('drop', (e) => {
    unmark();
    if (!hasFiles(e)) return;
    e.preventDefault(); e.stopPropagation();
    door.add([...e.dataTransfer.files]);
  });
  draw();
  return { strip, btn, input, camera, draw, dispose: () => unlist(id, entry) };
}

/** after a sent reply: remove exactly the pictures it carried (one added while the send was in flight stays), redraw */
export function dropSentPictures(store, id, sent) {
  const left = (store.get(id) || []).filter((p) => !(sent || []).includes(p));
  if (left.length) store.set(id, left); else store.delete(id);
  redrawAll(id);
}
