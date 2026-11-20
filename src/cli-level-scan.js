'use strict';
/**
 * src/cli-level-scan.js — SHARED (fs + the PURE src/claude-level-signal.js): DOES A CLAUDE CODE BINARY DECLARE THE BACKGROUND
 * SIGNAL, read on the machine that runs it (row B-24e2, lane login-request-card, 2026-11-20 — the law: a fact about a machine is
 * read where the fact lives). The hub reads its OWN binary for the signal inside its catalog read (src/server/cli-model-catalog.js
 * readBinary, a 64 MiB window past the catalog); a PAIRED machine whose Claude Code is newer than any binary the hub has read had no
 * reader at all, so the background of its idle conversations stayed «unknown» for good and an automation grant's end refused them.
 * The device agent bundles this module (src/machine-probes.js cliFacts, behind `probe-cli`) and reads its own binary, ONCE per
 * binary identity.
 *
 *   scanLevel(file, {timeoutMs, open}) → Promise<{declared, whole, version, builtAt, size, at, ms} | {error, retry: true}>
 *
 * It streams the WHOLE file in CHUNK reads with an OVERLAP (the loop is free between reads), judging each occurrence of
 * CMC.LEVEL_NEEDLE by CMC.levelSignalAt — a mention in a description or a comparison is not a declaration — and reads the
 * build's identity (CMC.identityIn: VERSION … BUILD_TIME) on the way. It stops once it has BOTH (a declaration without the build's
 * identity names no version: read on — round wwf11hqbh (1)). `whole` = every byte
 * was read: `declared: false` is a verdict about the whole file only then; a read cut by its bound answers `whole: false`
 * (unknown, never «does not declare»). An I/O failure (EACCES, a swapped file) is `{error, retry: true}`; the bound is that with `cut:
 * true`. `maxStepMs` = the longest single step on the loop (one chunk's search) — the device agent serves conversations on it.
 */
const fs = require('fs');
const CMC = require('./claude-level-signal.js');   // PURE: the declaration's judge and the build's identity (not the whole catalog)

const CHUNK = 8 << 20, OVERLAP = 4096;
const SCAN_TIMEOUT_MS = 60e3;   // as the hub's READ_TIMEOUT_MS: one read never runs longer than this

async function scanLevel(file, { timeoutMs = SCAN_TIMEOUT_MS, open = null, now = () => Date.now() } = {}) {
  const t0 = now();
  let fh = null, abandoned = false, timer = null;
  const work = (async () => {
    try {
      fh = await (open || ((f) => fs.promises.open(f, fs.constants.O_RDONLY | (fs.constants.O_NONBLOCK || 0))))(file);
      const st = await fh.stat();
      if (!st.isFile()) return { error: 'not-a-file', retry: true };
      const identity = `${st.dev}:${st.ino}:${st.size}:${Math.round(st.mtimeMs)}`;   // the opened handle's own (the file the bytes come from)
      const size = st.size, buf = Buffer.alloc(CHUNK + OVERLAP);
      let pos = 0, carry = 0, at = -1, ident = null, maxStepMs = 0;
      while (pos < size && (at < 0 || !ident) && !abandoned) {   // round wwf11hqbh (1): read on until the build's identity is found too
        const { bytesRead } = await fh.read(buf, carry, CHUNK, pos);
        if (!bytesRead) break;
        const view = buf.subarray(0, carry + bytesRead), base = pos - carry, s0 = now();   // ONE step: this chunk's search (the loop is free between reads)
        // each occurrence of the literal: a 200-byte look decoded (no whole-chunk string)
        for (let j = view.indexOf(CMC.LEVEL_NEEDLE, 0, 'latin1'); j >= 0 && at < 0; j = view.indexOf(CMC.LEVEL_NEEDLE, j + 1, 'latin1')) {
          const from = Math.max(0, j - 200), k = CMC.levelSignalAt(view.subarray(from, j + CMC.LEVEL_NEEDLE.length).toString('latin1'));
          if (k >= 0) at = base + from + k;
        }
        if (!ident) { const b = view.indexOf('BUILD_TIME:"', 0, 'latin1'); if (b >= 0) ident = CMC.identityIn(view.subarray(Math.max(0, b - 800), b + 48).toString('latin1')); }
        carry = Math.min(OVERLAP, view.length); view.copy(buf, 0, view.length - carry); pos += bytesRead;
        maxStepMs = Math.max(maxStepMs, now() - s0);
      }
      if (abandoned) return { error: 'timeout', retry: true, cut: true };
      return { declared: at >= 0, whole: at >= 0 || pos >= size, at: at >= 0 ? at : null, version: (ident && ident.version) || null, builtAt: (ident && ident.builtAt) || null, size, maxStepMs, identity };
    } catch (e) {
      return { error: (e && e.code) || 'read-failed', retry: true };
    } finally {
      if (fh) { const h = fh; fh = null; try { await h.close(); } catch { } }
    }
  })();
  const bound = new Promise((resolve) => { timer = setTimeout(() => { abandoned = true; resolve({ error: 'timeout', retry: true, cut: true }); }, timeoutMs); });
  const out = await Promise.race([work, bound]);
  clearTimeout(timer);
  return { ...out, ms: now() - t0 };
}

module.exports = { scanLevel, SCAN_TIMEOUT_MS, CHUNK, OVERLAP };
