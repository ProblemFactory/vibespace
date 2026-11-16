'use strict';
// THE PAGE'S SHELL FROM MEMORY (unit interface-trial, phase 1 (g) G1 — the design run of 2026-11-16: «the index page is
// served from memory: server.js read it and stated each asset on every load»). GET / and /index.html answer the versioned
// index.html (every local js / css asset as `?v=<its mtime>` — the cache-busting a soft reload needs after an update) from
// MEMORY: the request path makes NO disk call. The copy is built with fs.promises — at the first ask (the boot warms it)
// and again, never on the loop, when a load finds it older than REFRESH_MS: a rebuilt bundle (an update restarts the hub;
// a build beside a running hub) shows on the NEXT load after the one that noticed. A build that fails keeps the last good
// copy; with none yet the route passes on (the static files answer, as before).
// The cure round (主开发 2026-11-16 23:09Z):
//   · A1 — THE PAGE OPEN MAKES NO SYNCHRONOUS FILE CALL: the copy keeps each named file's stamp, and the static layer's
//     stamp check (src/server/static-public.js, a `?v=` on /bundle.js or /mermaid.js) asks `stampOf` here — memory, no disk.
//   · A3 — A BUILD IS BOUNDED: one that has not answered in DEADLINE_MS is given up (its late answer is dropped); the last
//     good copy serves and a load after REFRESH_MS tries again. A failed build is SAID once per change of state (failing,
//     then good again), never per load.
const fs = require('fs');
const path = require('path');

const REFRESH_MS = 5000;
const DEADLINE_MS = 10000;
const ASSET_RE = /(href|src)="\/([^"?]+\.(?:js|css))"/g;

/** → { get(): Promise<string|null>, stampOf(file): string|undefined, html(): string|null, refresh(): Promise } —
 *  `fsp` = fs.promises (a suite hands a stub). */
function create({ pubDir, fsp = fs.promises, refreshMs = REFRESH_MS, deadlineMs = DEADLINE_MS, now = Date.now, log = console } = {}) {
  let html = null, stamps = new Map(), builtAt = 0, triedAt = -Infinity, building = null, failing = false;
  async function build() {
    const text = await fsp.readFile(path.join(pubDir, 'index.html'), 'utf-8');
    const files = [...new Set([...text.matchAll(ASSET_RE)].map((m) => m[2]))];
    const mt = new Map(await Promise.all(files.map(async (f) => {
      try { return [f, Math.floor((await fsp.stat(path.join(pubDir, f))).mtimeMs)]; } catch { return [f, null]; }   // a missing asset keeps its plain link, as before
    })));
    return { html: text.replace(ASSET_RE, (m, attr, file) => (mt.get(file) != null ? `${attr}="/${file}?v=${mt.get(file)}"` : m)), mt };
  }
  /** A3: only a CHANGE of state is said — the first failure, then the first good build after it */
  function said(good, why) {
    if (good === !failing) return;
    failing = !good;
    try {
      if (good) log.log?.('[index-page] the page\'s copy is built again from public/');
      else log.warn?.(`[index-page] the page's copy could not be built (${why}) — ${html !== null ? 'the last good copy serves' : 'no copy yet: GET / falls to the static file'}; a load after ${refreshMs / 1000} s tries again`);
    } catch { }
  }
  function refresh() {
    if (building) return building;
    triedAt = now();
    let timer = null;
    const deadline = new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error(`public/ did not answer in ${deadlineMs / 1000} s`)), deadlineMs); timer.unref?.(); });
    building = Promise.race([build(), deadline])
      .then((b) => { html = b.html; stamps = b.mt; builtAt = now(); said(true); return html; },
        (e) => { said(false, (e && e.message) || String(e)); return html; })
      .finally(() => { clearTimeout(timer); building = null; });
    return building;
  }
  const due = () => now() - Math.max(builtAt, triedAt) >= refreshMs;
  async function get() {
    if (html === null) return building || (triedAt === -Infinity || due() ? refresh() : null);   // no copy: the first ask builds; after a failed try, a load after REFRESH_MS
    if (due()) refresh();   // never awaited: THIS load answers from memory
    return html;
  }
  /** A1: a file's build stamp (`?v=`) as the copy knows it — the page names it — from memory; undefined when the copy
   *  does not know it (no copy yet, a file the page does not name, a named file that is missing): the caller states it
   *  off the loop. A stamp ask is a load too: an old copy starts its refresh (never awaited). */
  function stampOf(file) {
    if (html !== null && due()) refresh();
    const v = stamps.get(String(file || '').replace(/^\//, ''));
    return v == null ? undefined : String(v);
  }
  return { get, stampOf, refresh, html: () => html };
}

module.exports = { create, REFRESH_MS, DEADLINE_MS };
