// src/lib/refusal-doors.js — B-3b03 follow-up (lane hub-loop-stalls, the coordinator's point 5): two PURE decisions for a file
// request the hub REFUSED (the file pool restarting — 503 `storage_no_worker` — or any coded refusal). No import, no DOM: the
// callers hand in what they own; scripts/test-safe-fs-no-inline.mjs ⑥ / ⑦ drive both with a RED each.

/** A SAVE-AND-CLOSE editor (the CLI's external editor opened by Ctrl+G) — ONE RULE, no state carried between presses (its third
 *  read: every state a round added, the next round found a fault in): EVERY ✕ SAVES FIRST. The save landed and the text on screen
 *  is the text it sent ⇒ the window closes and the CLI hears «done». The person typed while it was out ⇒ the window stays, never
 *  asked (the unsaved mark shows; the next ✕ saves again). The save was REFUSED ⇒ the person is ASKED «Close without saving?»,
 *  Keep editing focused and Enter keeping (a question that opens seconds late must not take a keystroke meant for the text):
 *  discard (a press on the button) ⇒ it closes and the CLI reads the file as it is on disk (a quit without saving); keep ⇒ it stays. Never a window that
 *  cannot close, never a close or a «done» over a refused save the person did not choose. (The release closed at once and told
 *  the CLI «done» whatever the save answered: the edits were lost.) A programmatic close is never refused; its refused save tells
 *  the CLI nothing (the hub re-delivers the pending edit at the next attach).
 *  `ed` = { save(): Promise<boolean>, text(): string, signal(), close(), ready(): boolean, confirmDiscard(): Promise<boolean> }
 *  → { onCloseRequest(), onClose() } */
export function saveCloseDoors(ed) {
  let pending = false, closing = false, gone = false;
  return {
    onCloseRequest() {
      if (!ed.ready()) return true;              // nothing loaded yet: nothing to save
      if (pending) return false;                 // a save or the question is out: one at a time
      pending = true;
      const sent = ed.text();
      const settle = (closeIt) => { pending = false; if (closeIt && !gone) { closing = true; ed.close(); } };
      Promise.resolve().then(() => ed.save()).then((ok) => !!ok, () => false).then(async (ok) => {
        if (gone) return settle(false);          // the window closed another way meanwhile: nothing to ask
        if (ed.text() !== sent) return settle(false);   // typed while the save was out: stays — never asked over typing
        if (ok) return settle(true);
        let yes = false;
        try { yes = !!(await ed.confirmDiscard()); } catch { yes = false; }
        return settle(yes && ed.text() === sent);
      }).catch(() => { pending = false; });
      return false;                              // the window stays until its save landed, or the person chose
    },
    onClose() {
      gone = true;
      if (closing) return ed.signal();           // saved (the text on screen), or discarded by the person
      return Promise.resolve().then(() => ed.save()).then((ok) => (ok ? ed.signal() : undefined), () => undefined);
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
