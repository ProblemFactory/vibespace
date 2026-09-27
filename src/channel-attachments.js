'use strict';
/**
 * A PICTURE THE VENDOR SENT IS SHOWN AS A PICTURE (docs/design-communication-
 * panel.zh.md §23 R3, 2026-09-26 — the owner on the aggregated IM release:
 * "lark图像不能预览吗？").
 *
 * PURE — imports NOTHING (CJS, so the engine requires it and the bundle
 * imports it, the channel-caps pattern). Three decisions live here and
 * nowhere else:
 *
 *   fetchVerdict(facts)   THE SERVER'S ORDER for ONE attachment request —
 *                         which is also the vendor-call gate
 *                         scripts/test-vendor-whitelist.mjs §7 pins:
 *                           1. CACHE FIRST: a cached file is served whatever
 *                              the budget, the back-off or the account says;
 *                           2. a REMEMBERED refusal answers without a vendor
 *                              call until it expires (`negativeTtlMs`) — a
 *                              window full of gone images is not a request
 *                              per image per open; the person's Retry
 *                              (`retry`) skips it;
 *                           3. only an attachment a record of OURS names is
 *                              fetched (the route is not a proxy);
 *                           4. only where the capability row says `fetch`;
 *                           5. never for a disabled account;
 *                           6. a fetch already in flight is JOINED (one
 *                              charge, however many thumbnails asked);
 *                           7. never inside the vendor's back-off;
 *                           8. never past the account's budget for the minute;
 *                           9. then, and only then, `fetch` — ON DEMAND (the
 *                              only caller is the attachment route, i.e. a
 *                              thumbnail the window rendered or a person's
 *                              click; ingest never fetches bytes).
 *                         Facts arrive as they are learned: an `owner` of
 *                         `undefined` answers `lookup` (the engine reads the
 *                         log only AFTER the cache missed).
 *   thumbVerdict(answer, attempt)   THE WINDOW'S: what a thumbnail that did not
 *                         load does next — retry itself after the server's
 *                         wait (a budget / a back-off / a rate limit: the
 *                         picture is fine, the minute is not), or become the
 *                         chip that NAMES the reason with a Retry (a refusal
 *                         that waiting does not fix). Never silent.
 *   bodyShown(text, placeholders)   the text line a message shows once its
 *                         pictures are drawn: each drawn attachment removes
 *                         ONE occurrence of the token its adapter wrote for it
 *                         (Lark's "[image]"); the record's `text` is never
 *                         changed (agents, search and the wake block read it).
 */

/** Codes a WAIT fixes: the picture exists, this minute / this back-off does not allow fetching it. */
const TRANSIENT = Object.freeze(['vendor-budget', 'backoff', 'rate-limited', 'transport', 'refresh-queue-full', 'stopped']);
/** How many times a thumbnail retries ITSELF before it becomes the chip (the person's Retry is always there). */
const AUTO_RETRIES = 2;
/** The longest a thumbnail waits between its own retries (a budget minute resets inside it). */
const MAX_RETRY_WAIT_SEC = 60;
/** How long a refusal the VENDOR answered is remembered (no second vendor call inside it). */
const NEGATIVE_TTL = Object.freeze({
  permanent: 10 * 60e3,   // not-found / forbidden / too-large / not-supported: waiting does not fix these
  transient: 20e3,        // rate-limited / transport / vendor-error: the next thumbnail retry may try again
});
/** Codes that are NEVER remembered: no vendor call was made to learn them (the budget, the back-off, the
 *  engine's own state) — the gate itself answers them again, cheaply, every time. */
const NEVER_REMEMBERED = Object.freeze(['vendor-budget', 'backoff', 'refresh-queue-full', 'stopped', 'disabled']);
/** Raster types the route serves `inline` (a thumbnail); anything else downloads. SVG never (it is script). */
const INLINE_IMAGE = Object.freeze(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

const isImage = (a) => !!a && /^image\//.test(String(a.mime || ''));

/**
 * The next step for ONE attachment request, from the facts known so far.
 * `{act:'serve', from:'cache'}` · `{act:'refuse', code, remembered?}` ·
 * `{act:'lookup'}` (read the log for the owning record, then ask again) ·
 * `{act:'join'}` (await the fetch in flight) · `{act:'fetch'}`.
 */
function fetchVerdict(f = {}) {
  if (f.cached) return { act: 'serve', from: 'cache' };
  if (f.remembered && !f.retry) return { act: 'refuse', code: String(f.remembered.code || 'vendor-error'), remembered: true };
  if (f.owner === undefined) return { act: 'lookup' };
  if (!f.owner) return { act: 'refuse', code: 'not-found' };
  if (!f.fetchable) return { act: 'refuse', code: 'not-supported' };
  if (f.enabled === false) return { act: 'refuse', code: 'disabled' };
  if (f.inflight) return { act: 'join' };
  if (f.backoff) return { act: 'refuse', code: 'backoff' };
  if (f.affordable === false) return { act: 'refuse', code: 'vendor-budget' };
  return { act: 'fetch' };
}

/** How long a refusal answered by a vendor fetch is remembered, or 0 = not at all. */
function negativeTtlMs(code, { retryAfterSec = null } = {}) {
  const c = String(code || '');
  if (NEVER_REMEMBERED.includes(c)) return 0;
  if (TRANSIENT.includes(c) || c === 'vendor-error') {
    const s = Number(retryAfterSec);
    return Number.isFinite(s) && s > 0 ? Math.min(MAX_RETRY_WAIT_SEC, s) * 1000 : NEGATIVE_TTL.transient;
  }
  return NEGATIVE_TTL.permanent;
}

/**
 * What a thumbnail that did not draw does next. `answer` = what the route
 * said on a re-ask: `{ok:false, code, retryAfterSec}` for a refusal,
 * `{ok:true, mime}` when the file IS there (then it was the picture that did
 * not decode — HEIC, a non-raster type — and the chip downloads it), or
 * `null` when the server could not be reached. `attempt` = retries already
 * made (0 on the first failure).
 *   `{kind:'retry', afterSec}`  wait, then load again (the chip says so)
 *   `{kind:'chip', code, download}`  stop: the chip with the reason + Retry;
 *                                   `download` = the file itself is fine
 */
function thumbVerdict(answer, attempt = 0) {
  if (!answer) return { kind: 'chip', code: 'unreachable', download: false };
  if (answer.ok) return { kind: 'chip', code: 'no-preview', download: true };
  const code = String(answer.code || 'vendor-error');
  if (TRANSIENT.includes(code) && attempt < AUTO_RETRIES) {
    const s = Number(answer.retryAfterSec);
    return { kind: 'retry', afterSec: Math.max(1, Math.min(MAX_RETRY_WAIT_SEC, Number.isFinite(s) && s > 0 ? Math.ceil(s) : 5)) };
  }
  return { kind: 'chip', code, download: false };
}

/** The text a message shows once `placeholders` (one per DRAWN attachment)
 *  are drawn as pictures: one occurrence removed per drawn attachment, the
 *  blank lines that leaves collapsed. `''` = the line disappears. */
function bodyShown(text, placeholders = []) {
  let s = String(text == null ? '' : text);
  for (const p of placeholders || []) {
    const tok = String(p || '');
    if (!tok) continue;
    const i = s.indexOf(tok);
    if (i < 0) continue;
    s = s.slice(0, i) + s.slice(i + tok.length);
  }
  const out = [];
  for (const line of s.split('\n').map((l) => l.replace(/[ \t]+$/, ''))) {
    if (line.trim() === '' && (!out.length || out[out.length - 1].trim() === '')) continue;   // a run of blank lines is one
    out.push(line);
  }
  return out.join('\n').trim();
}

module.exports = {
  TRANSIENT, AUTO_RETRIES, MAX_RETRY_WAIT_SEC, NEGATIVE_TTL, NEVER_REMEMBERED, INLINE_IMAGE,
  isImage, fetchVerdict, negativeTtlMs, thumbVerdict, bodyShown,
};
