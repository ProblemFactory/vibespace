// THE BOOT LADDER (lane update-reload-ready, B-0ece — PURE: no DOM, no globals;
// fetch / sleep / the clock are injected). The boot splash waited on app.ready,
// and app.ready awaited GET /api/layouts → /api/active → /api/sessions with no
// timeout: one request the busy, still-booting server never answered left the
// page on the loading screen until a manual refresh. Now every boot request
// gets a stall bound and a bounded retry ladder (1 s → 2 s → 5 s → 10 s), then
// the caller shows a Reload button with the reason in words. waitServerReady
// is the reload rule: the update dialog, the stale-tab reload and the splash
// reload / restore only once the server's boot phase (GET /api/boot) is `ready`.

export const LADDER_MS = [1000, 2000, 5000, 10000];
export const STALL_MS = 10000;     // one boot request that has not answered by then = stalled
export const POLL_MS = 1000;       // the boot-phase poll while the server says `booting`
export const STARTING_CAP_MS = 180000; // the server flips to ready after 90 s itself; this is the belt

/** After the n-th consecutive failure (n ≥ 1): the wait before the next try, or null = give up. */
export function ladderWait(failures, ladder = LADDER_MS) {
  return failures >= 1 && failures <= ladder.length ? ladder[failures - 1] : null;
}

/** One request bounded by stallMs → { ok, status, json } | { ok: false, why: 'stall' | 'network' | 'http', status? }. */
export async function timedJson(url, { fetchImpl, stallMs = STALL_MS } = {}) {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  let timer = null;
  const stall = new Promise((res) => { timer = setTimeout(() => { try { ctl?.abort(); } catch { } res({ ok: false, why: 'stall' }); }, stallMs); });
  const go = (async () => {
    try {
      const r = await fetchImpl(url, { cache: 'no-store', signal: ctl?.signal });
      if (!r.ok) return { ok: false, why: 'http', status: r.status };
      return { ok: true, status: r.status, json: await r.json() };
    } catch { return { ok: false, why: 'network' }; }
  })();
  try { return await Promise.race([go, stall]); } finally { clearTimeout(timer); }
}

/** The reason in words' parts: { key, params } for t(). */
export function reasonOf(fail, stallMs = STALL_MS) {
  if (fail.why === 'stall') return { key: 'no answer within {n} s', params: { n: Math.round(stallMs / 1000) } };
  if (fail.why === 'http') return { key: 'HTTP {code}', params: { code: fail.status } };
  if (fail.why === 'starting') return { key: 'still starting, waiting on {steps}', params: { steps: (fail.waitingOn || []).join(', ') || '?' } };
  return { key: 'network error', params: {} };
}

/** A boot request on the ladder. Resolves the JSON, or { gaveUp: { url, tries, fail } } after the last rung.
 *  onRetry({ url, fail, waitMs, tries }) fires before each wait (the splash line). */
export async function ladderJson(url, { fetchImpl, sleep, stallMs = STALL_MS, ladder = LADDER_MS, onRetry = () => {} } = {}) {
  for (let tries = 1; ; tries++) {
    const r = await timedJson(url, { fetchImpl, stallMs });
    if (r.ok) return { json: r.json };
    const waitMs = ladderWait(tries, ladder);
    if (waitMs == null) return { gaveUp: { url, tries, fail: r } };
    onRetry({ url, fail: r, waitMs, tries });
    await sleep(waitMs);
  }
}

/** THE RELOAD RULE: wait until GET /api/boot says `ready`. A 404 = an older server (no phase) = ready.
 *  While `booting`, onStatus(snapshot) fires each poll (the "N sessions reconnected" line) and the ladder
 *  resets — progress is not failure; failures climb the ladder. → { ok: true, boot } | { ok: false, url, tries, fail }. */
export async function waitServerReady({ fetchImpl, sleep, now = Date.now, stallMs = STALL_MS, ladder = LADDER_MS, pollMs = POLL_MS, capMs = STARTING_CAP_MS, onStatus = () => {}, onRetry = () => {} } = {}) {
  const t0 = now();
  let failures = 0;
  for (;;) {
    const r = await timedJson('/api/boot?t=' + now(), { fetchImpl, stallMs });
    if (r.ok && r.json && r.json.phase !== 'booting') return { ok: true, boot: r.json };
    if (!r.ok && r.why === 'http' && r.status === 404) return { ok: true, boot: { phase: 'ready', legacy: true } };
    if (r.ok) {
      failures = 0;
      onStatus(r.json);
      if (now() - t0 > capMs) return { ok: false, url: '/api/boot', tries: 1, fail: { why: 'starting', waitingOn: r.json.waitingOn } };
      await sleep(pollMs);
      continue;
    }
    failures++;
    const waitMs = ladderWait(failures, ladder);
    if (waitMs == null) return { ok: false, url: '/api/boot', tries: failures, fail: r };
    onRetry({ url: '/api/boot', fail: r, waitMs, tries: failures });
    await sleep(waitMs);
  }
}

/** The page-side knobs: production defaults, or a chrome suite's short ladder (window.__vsBootLadderTest). */
export function ladderConfig(g) {
  const o = (g && g.__vsBootLadderTest) || {};
  return { stallMs: o.stallMs || STALL_MS, ladder: Array.isArray(o.ladder) ? o.ladder : LADDER_MS, pollMs: o.pollMs || POLL_MS };
}
