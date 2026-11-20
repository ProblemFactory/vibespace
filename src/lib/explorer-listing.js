// explorer-listing.js — the Files window's listing and, only when it is owed, its file-info probe (B-23e5, 主开发's r336).
// Imports nothing: the fetch is handed in (the page's own, or a stand-in in scripts/test-safe-fs-path-memory.mjs).

/** After a refused listing the explorer asks «is it a file?» (the file-info probe) ONLY when the refusal is not the storage's: a
 *  storage that did not answer — 503: its deadline, a remembered dead path, no worker, a blocked or parked mount; or any
 *  `storage_…` code — is never asked a second time for the same press (one press, one worker). PURE. */
export const probeAfterListing = (status, data) => !(status === 503 || /^storage_/.test(String((data && data.code) || '')));

/** The listing (with the press's own init — the mark, when a person pressed Refresh), then the probe if it is owed — NEVER with
 *  the mark. → { data, info } (`info` null when no probe ran or it failed). */
export async function listingAndProbe(fetchFn, listUrl, infoUrl, init) {
  const res = await fetchFn(listUrl, init);
  const data = await res.json();
  if (!data || !data.error || !probeAfterListing(res.status, data)) return { data, info: null };
  const infoRes = await fetchFn(infoUrl);   // never marked: a probe is no press
  return { data, info: infoRes && infoRes.ok ? await infoRes.json() : null };
}
