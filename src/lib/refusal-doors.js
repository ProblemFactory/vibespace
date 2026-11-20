// src/lib/refusal-doors.js — B-3b03 follow-up (lane hub-loop-stalls, the coordinator's point 5): two PURE decisions for a file
// request the hub REFUSED (the file pool restarting — 503 `storage_no_worker` — or any coded refusal). No import, no DOM: the
// callers hand in what they own; scripts/test-safe-fs-no-inline.mjs ⑥ / ⑦ drive both with a RED each.

/** A SAVE-AND-CLOSE editor (the CLI's external editor opened by Ctrl+G): the window closes, and the CLI hears «done», only after
 *  its save LANDED. A refused save keeps the window, the text and its unsaved mark ONCE (the release closed it and told the CLI
 *  «done» over the old file: the edits were lost); the toolbar says why. The NEXT ✕ closes it whatever the storage says — never a
 *  window that cannot close (a machine gone, a read-only path) — and the CLI hears «done» only if that last save landed; else
 *  nothing (the hub re-delivers the pending edit at the next attach). A programmatic close is never refused.
 *  `ed` = { save(): Promise<boolean>, signal(), close(), ready(): boolean } → { onCloseRequest(), onClose() } */
export function saveCloseDoors(ed) {
  let saved = false, pending = false, refused = false;
  return {
    onCloseRequest() {
      if (saved || refused || !ed.ready()) return true;   // landed, or refused once already (the next ✕ closes), or nothing loaded yet
      if (pending) return false;               // a second ✕ while the save is out: one save at a time
      pending = true;
      Promise.resolve(ed.save()).then((ok) => { pending = false; if (ok) { saved = true; ed.close(); } else refused = true; }, () => { pending = false; refused = true; });
      return false;                            // the window stays until the save landed
    },
    onClose() {
      if (saved) return ed.signal();
      return Promise.resolve(ed.save()).then((ok) => { if (ok) return ed.signal(); return undefined; }, () => undefined);
    },
  };
}

/** The words of a chat upload that did not land whole. A failure the hub REFUSED by name (it carries a `code`) is said in the
 *  hub's own words (`fsErrorText`, the reader's language) — never «couldn't be read», which blames the person's file.
 *  → the toast text, or null when everything landed. */
export function uploadOutcomeWords(uploaded, failed, { t, fsErrorText }) {
  const said = failed.find((f) => f && f.code);
  if (failed.length && !uploaded.length && failed[0].error) return t('Upload failed: {msg}', { msg: failed[0].code ? fsErrorText(failed[0]) : failed[0].error });
  if (failed.length && said) return t('Uploaded {n}, {failed} not uploaded: {msg} (e.g. {name})', { n: uploaded.length, failed: failed.length, msg: fsErrorText(said), name: said.name });
  if (failed.length) return t("Uploaded {n}, {failed} couldn't be read (e.g. {name})", { n: uploaded.length, failed: failed.length, name: failed[0].name });
  if (!uploaded.length) return t('Upload failed — no files could be read');
  return null;
}
