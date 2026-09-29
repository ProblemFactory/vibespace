// A RESPONSE BODY READ TO A BOUND (lane channel-rich SECURITY verify r2, 2026-09-28). PURE over the Fetch
// primitives (a Response, a ReadableStream), imports nothing — the mail frame's DOM half and its node suite take
// the same rule.
//
// THE INCIDENT: round 1's "bound BEFORE the download" read `Content-Length` — and the attachment route answers
// `Transfer-Encoding: chunked` with no length at all (a file stream piped straight to the response), so the guard
// compared `0 > MAX_HTML_BYTES` and `res.arrayBuffer()` pulled the WHOLE body into memory before the size was
// judged: up to the route's 100 MB, on every open of the conversation, in every client. A header is a claim; the
// bytes are the fact. This reads the body chunk by chunk and STOPS the moment the bound is passed — the stream is
// cancelled (the socket released), what was read is dropped, the caller is told `over` with the bytes it cost.
// A `Content-Length` over the bound is still refused before the first byte (the cheap rung), never trusted under it.

/** Read `res`'s body up to `max` bytes. Answers `{buf: ArrayBuffer, bytes}` or `{over: true, bytes}`
 *  (the read stopped — at most one chunk past `max` was ever held). Never throws on a size; a transport
 *  failure rejects like the fetch would. */
export async function readBounded(res, max) {
  const limit = Number(max);
  if (!Number.isFinite(limit) || limit < 0) throw new Error('readBounded: a finite bound is required');
  const claimed = Number(res && res.headers && typeof res.headers.get === 'function' ? res.headers.get('content-length') : NaN);
  if (Number.isFinite(claimed) && claimed > limit) {
    try { if (res.body && typeof res.body.cancel === 'function') await res.body.cancel(); } catch {}
    return { over: true, bytes: 0, claimed };
  }
  const body = res && res.body;
  if (!body || typeof body.getReader !== 'function') {
    // no stream (an old runtime): the whole body, judged after — the only rung left
    const buf = await res.arrayBuffer();
    return buf.byteLength > limit ? { over: true, bytes: buf.byteLength } : { buf, bytes: buf.byteLength };
  }
  const reader = body.getReader();
  const chunks = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value instanceof Uint8Array ? value : new Uint8Array(value);
    n += chunk.byteLength;
    if (n > limit) {
      try { await reader.cancel(); } catch {}
      return { over: true, bytes: n };
    }
    chunks.push(chunk);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return { buf: out.buffer, bytes: n };
}
