'use strict';
// THE SAID JOURNAL (row B-cd4b's last part, the wrapper's hold — 主开发 r1132): WHAT A WRAPPER HAS SAID IS ON DISK BEFORE IT CAN BE
// LOST TO A RESTART. A chat wrapper keeps its history ring in memory and rewrites its history file WHOLE (tmp + rename) on a timer —
// the claude wrapper 2 s, the codex wrapper 1 s, 250 ms while a person's CLI follows. A dtach master drops what it reads while no hub
// is attached, and a restarting hub reads that file (src/server/boot-restore.js: the registration's read, then each attach's
// catch-up): a line said with no hub attached and not yet written when its survivor's catch-up read the file was LOST to the
// restored conversation — a permission ask among them (no card, the agent waiting on an answer nobody can give). A kill of the
// wrapper beat the timer the same way for every line said in its last seconds.
// THE CURE: between two whole rewrites every line the wrapper SAYS is APPENDED to the file first — `add` as it joins the ring,
// `flush` once per input (ONE write: a chunk of the CLI's output, a chunk of stdin) BEFORE the lines go out on stdout. The whole
// rewrite (the ring's trim, a held copy's edit, the lines that are never said) stays on its timer and REPLACES the file:
// `rewritten()` after its rename forgets the descriptor (it names the file the rename replaced) and the lines that rewrite carried.
// Never an append onto a previous life's file: until the wrapper's first whole rewrite, a flush asks for that rewrite instead
// (`rewrite`). A failed append is SAID once (the wrapper's log) and the timer stays the fallback: nothing here throws.
// THE FENCE (the restore's last gap — src/server/session-stdout.js): `_fence` is the one record a wrapper says ONLY when a hub asks
// for it (`webui_fence`, written once its attach is connected). It is in the file AT ITS PLACE before it is said, so the restore
// reads exactly what was said between its catch-up and its connect (dtach dropped it) and nothing the live stream also brings.
// SHARED: required by data/bin/chat-wrapper.js and data/bin/codex-chat-wrapper.js (guarded: a tree without it keeps the timer
// alone), and by the hub (the fence's words). Node builtins only.
const fs = require('fs');
const { closeWritten } = require('./fd-close.js');

const FENCE_TYPE = '_fence';
const FENCE_VERSION = 1;   // a wrapper's sidecar adverts `caps.fence` = this: the hub asks a fence of no other
/** the fence record a wrapper says for a hub's ask (its id bounded: an ask's id is the hub's own random word) */
function fenceLine(id) { return JSON.stringify({ type: FENCE_TYPE, id: String(id == null ? '' : id).slice(0, 64) }); }
/** the hub's ask of a fence (a stdin frame; never forwarded to a CLI) */
function fenceAsk(id) { return JSON.stringify({ type: 'webui_fence', id: String(id == null ? '' : id).slice(0, 64) }); }

function create({ file, rewrite = null, say = () => { } } = {}) {
  let fd = null, pending = '', armed = false, armTried = false, failedSaid = false;
  const where = 'the said journal';
  const fail = (e) => {
    fd = closeWritten(fd, where, say);
    if (!failedSaid) { failedSaid = true; try { say(`${where} could not append to the history file (${(e && e.code) || (e && e.message) || e}) — the timer's whole rewrite carries what it held`); } catch { /* a sink that throws says nothing more */ } }
  };
  return {
    /** a line the wrapper is about to SAY joined its ring: it goes to the file at the next flush */
    add(text) { if (file && text) pending += text; },
    /** before the lines go out: ONE append of what joined since the last flush → true when it is on disk */
    flush() {
      if (!pending) return true;
      if (!armed) {   // the file may still be a previous life's: the first flush makes it the ring (a whole rewrite)
        if (!armTried && typeof rewrite === 'function') { armTried = true; try { rewrite(); } catch (e) { fail(e); } }
        if (!armed) pending = '';   // the ring holds them: the timer's rewrite carries them
        return armed;
      }
      const b = Buffer.from(pending, 'utf8'); pending = '';
      try {
        if (fd === null) fd = fs.openSync(file, 'a');
        let off = 0;
        while (off < b.length) off += fs.writeSync(fd, b, off, b.length - off);   // O_APPEND: at the end the last rewrite left
        return true;
      } catch (e) { fail(e); return false; }
    },
    /** the wrapper's whole rewrite RENAMED its ring over the file: the descriptor names the replaced file — forgotten; armed */
    rewritten() { pending = ''; armed = true; fd = closeWritten(fd, where, say); },
    /** the wrapper ends (its last whole rewrite done or not): the descriptor closed once */
    close() { fd = closeWritten(fd, where, say); },
    get armed() { return armed; },
  };
}

// THE RESTORE'S LAST GAP (PURE — the hub's half, src/server/session-stdout.js): `cu` = what the survivor's file holds past the
// catch-up's read (boot-restore restoreCatchUp: {text, drop} | null | {skipped}), `line` = this fence's record, `live` = what the live
// stream brought between the attach's connect and the fence. Every said line is in the file before it is said, and the fence is in it
// at its place: the file's lines before the fence are what was said since the catch-up — the live stream's own lines are their END
// (matched from the end: \r\n read as \n, dtach's clear preamble and the wrapper's transport records left out — they are never in the
// file; a first line the connect tore is the end of its file line). What comes before that end is what dtach DROPPED → { lost, drop }
// (feed `lost` before `live`; `drop` = the catch-up's partial last line the hub already holds), or { skipped: why } — fed nothing.
const DTACH_CLEAR = /^(?:\x1b\[H|\x1b\[[0-3]?J)+/;
const isTransport = (l) => { if (l[0] !== '{') return false; try { const o = JSON.parse(l); return !!o && typeof o.type === 'string' && o.type[0] === '_'; } catch { return false; } };
function fenceGap(cu, line, live) {
  if (!cu) return { skipped: 'the fence is not in the file (nothing written past the catch-up)' };
  if (cu.skipped) return { skipped: cu.skipped };
  const text = String(cu.text || ''), at = text.indexOf(line + '\n');
  if (at < 0) return { skipped: 'the fence is not in the file past the catch-up' };
  const fileText = text.slice(0, at);
  const F = fileText ? fileText.replace(/\n$/, '').split('\n') : [];
  const L = String(live || '').replace(/\r\n/g, '\n').replace(DTACH_CLEAR, '').split('\n').filter((l, i, a) => !(i === a.length - 1 && l === '')).filter((l) => l && !isTransport(l));
  let j = F.length, head = '';
  for (let i = L.length - 1; i >= 0; i--) {
    let q = j - 1;
    while (q >= 0 && !(i === 0 ? F[q].endsWith(L[i]) : F[q] === L[i])) q--;
    if (q < 0) return { skipped: `a line the live stream brought is not in the file (${L[i].length} bytes)` };
    if (i === 0 && F[q] !== L[i]) head = F[q].slice(0, F[q].length - L[i].length);   // the connect tore it: its head was dropped
    j = q;
  }
  const lost = F.slice(0, j).map((l) => l + '\n').join('') + head;
  return { lost, drop: cu.drop || '' };
}

module.exports = { create, FENCE_TYPE, FENCE_VERSION, fenceLine, fenceAsk, fenceGap };
