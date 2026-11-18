'use strict';
/**
 * THE BROWSER'S OWN NOTES — PURE, imports nothing; CJS so the page's telemetry and the hub's summary share ONE spelling
 * (B-402f). Chrome and Firefox raise a window 'error' event for the ResizeObserver loop («ResizeObserver loop completed
 * with undelivered notifications.», the older «ResizeObserver loop limit exceeded») when a resize callback changes a size
 * the same frame — a note that some notifications wait for the next frame, never a failure of the page. The Diagnostics
 * rail badge counted it as a client error at every page load (turn-never-silent's picture walks: 3 → 4 → 5).
 *
 * isBrowserNote(message) → true for those notes (an «Uncaught » / «Error: » prefix allowed), false for anything else.
 * The page records one as a NOTE (kind 'event', name BROWSER_NOTE, once per page — src/lib/telemetry-client.js); the
 * summary never counts a stored one as an error (src/telemetry.js — the rows older pages already sent).
 */
const BROWSER_NOTE = 'browser-note';
const NOTE_RE = /^(?:Uncaught |Error: )*ResizeObserver loop (?:completed with undelivered notifications|limit exceeded)\.?$/;
const isBrowserNote = (message) => typeof message === 'string' && NOTE_RE.test(message.trim());
module.exports = { isBrowserNote, BROWSER_NOTE, NOTE_RE };
