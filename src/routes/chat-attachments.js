'use strict';
/**
 * THE PICTURE A MESSAGE SHOWED, READ FROM ITS RECORD — and the files a person dropped (lane chat-attachments-persist, the
 * cut — 主开发 2026-11-13 08:54Z: «the record is the store»).
 *
 * GET /api/chat-picture/:tx/:key/:n[?agent=<id>][&b=claude|codex][&host=<host id>] — the n-th picture of the record `key`
 * (Claude: its uuid; Codex: the function output's call_id) in the transcript `tx`:
 *   · FOUND ONLY THROUGH WHAT THE HUB KNOWS: `tx` is a conversation's transcript id — the harness's own locate finds it in
 *     the CLI's own tree, in the transcript worker (src/transcript-service.js picture → src/transcript-worker.js `picture`);
 *     `agent` must be AMONG that conversation's own sub-agent files; `n` is a block index; `host` a machine the hub has
 *     paired. Never a path, never a name joined into one.
 *   · THE OWNER'S COOKIE ONLY: auth.js has no door for this path; a request that carries a bearer is refused BY NAME here.
 *   · The type from an OWN entry of the closed table; nosniff; private + immutable caching with an ETag (a record's bytes
 *     never change). Streamed: the base64 span is read from the file and decoded block by block (never the line twice).
 *   · A place nobody knows ⇒ 404 `unknown`; a record gone / shortened / stubbed by the owner's rescue ⇒ 410 `gone` + why
 *     (the view says it in words); a paired machine whose agent predates the reader ⇒ 409 `old-agent` (the card keeps
 *     today's road and says why). MANY AT ONCE: at most MAX_AT_ONCE readings run; the rest wait in order, and a request
 *     whose page closed leaves the queue. Past DEADLINE_MS ⇒ 503 `finding` + retryMs (the view says it and asks again) —
 *     the reading goes on and warms the index.
 * GET /api/chat-attachments/usage · GET /api/chat-attachments/orphans · POST /api/chat-attachments/orphans/remove — the
 *   files a person dropped (src/server/chat-attachments.js): what is kept; what belongs to conversations that no longer
 *   exist; their removal, which acts only on the count and size it named.
 */
const fsp = require('fs').promises;
const crypto = require('crypto');
const { Transform } = require('stream');
const { KEY_RE, hasPictures } = require('../transcript-picture.js');

const MAX_AT_ONCE = 3;
const DEADLINE_MS = 10000;
const RETRY_MS = 2000;
const MIME_OF = Object.freeze(Object.assign(Object.create(null), { 'image/png': 'image/png', 'image/jpeg': 'image/jpeg', 'image/jpg': 'image/jpeg', 'image/gif': 'image/gif', 'image/webp': 'image/webp' }));
const mimeOf = (t) => { const k = String(t || '').toLowerCase(); return Object.prototype.hasOwnProperty.call(MIME_OF, k) ? MIME_OF[k] : null; };
const HOST_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

/** base64 text → bytes, block by block (a remainder of < 4 characters waits for the next block) */
function base64Decoder() {
  let rest = '';
  return new Transform({
    transform(chunk, _enc, cb) { const s = rest + chunk.toString('latin1'); const cut = s.length - (s.length % 4); rest = s.slice(cut); cb(null, cut ? Buffer.from(s.slice(0, cut), 'base64') : null); },
    flush(cb) { cb(null, rest ? Buffer.from(rest, 'base64') : null); },
  });
}

function registerChatAttachmentRoutes(app, { store, transcripts, hostKnown = () => false, cwdOf = () => '', maxAtOnce = MAX_AT_ONCE, deadlineMs = DEADLINE_MS } = {}) {
  // ── many at once: a few readings run, the rest wait in order; a closed page's requests leave ──
  const queue = []; let running = 0;
  const pump = () => { while (running < maxAtOnce && queue.length) { const j = queue.shift(); if (j.left) continue; running++; j.go(); } };
  // the RESPONSE's close before it finished = the page went away (a GET's request stream closes as soon as it is read);
  // `withdraw()` = nobody waits any more (the deadline answered): a job not started yet leaves the queue — one running goes
  // on and warms the index
  const inTurn = (res, fn) => {
    const j = { left: false, started: false };
    const promise = new Promise((resolve, reject) => {
      j.go = () => { j.started = true; Promise.resolve().then(fn).then(resolve, reject).finally(() => { running--; pump(); }); };
      j.leave = (why) => { if (!j.started && !j.left) { j.left = true; stats.left++; reject(Object.assign(new Error(why), { code: 'left' })); } };
      res.once('close', () => { if (!res.writableEnded) j.leave('the page closed'); });
      queue.push(j); pump();
    });
    promise.catch(() => { });
    return { promise, withdraw: () => j.leave('answered at its deadline') };
  };
  const stats = { asked: 0, left: 0, finding: 0, served: 0, ran: 0 };

  app.get('/api/chat-picture/:tx/:key/:n', async (req, res) => {
    stats.asked++;
    if (req.headers.authorization) return res.status(403).json({ error: 'a picture is shown to the owner\'s signed-in page only — a bearer token is refused here', code: 'bearer_refused' });
    const tx = String(req.params.tx || ''), key = String(req.params.key || ''), n = /^\d{1,4}$/.test(String(req.params.n)) ? Number(req.params.n) : -1;
    const agent = req.query.agent ? String(req.query.agent) : null, b = req.query.b ? String(req.query.b) : 'claude', host = req.query.host ? String(req.query.host) : null;
    if (!KEY_RE.test(tx) || !KEY_RE.test(key) || n < 0 || n > 1000 || (agent !== null && !KEY_RE.test(agent)) || !hasPictures(b) || (host !== null && !(HOST_RE.test(host) && hostKnown(host)))) {
      return res.status(400).json({ error: 'not a picture\'s place', code: 'bad_place' });
    }
    let timer = null;
    const deadline = new Promise((r) => { timer = setTimeout(() => r({ finding: true }), deadlineMs); timer.unref?.(); });
    let p;
    const turn = inTurn(res, () => { stats.ran++; return transcripts.picture({ backend: b, sessionId: tx, cwd: host ? '' : cwdOf(tx, b), host }, { agent, key, n }); });
    try {
      p = await Promise.race([turn.promise, deadline]);
    } catch (e) {
      clearTimeout(timer);
      if (e && e.code === 'left') return;
      return res.status(500).json({ error: 'the picture could not be read', code: 'unreadable' });
    }
    clearTimeout(timer);
    if (p && p.finding) turn.withdraw();   // answered at the deadline: a job that has not started leaves the queue
    if (res.writableEnded || res.destroyed) return;
    if (!p || p.finding || p.unavailable) { stats.finding++; return res.status(503).set('Retry-After', '2').json({ error: 'still finding this picture in the conversation', code: 'finding', retryMs: RETRY_MS }); }
    if (p.oldAgent) return res.status(409).json({ error: 'that machine\'s agent is older than this reader', code: 'old-agent' });
    if (p.unknown) return res.status(404).json({ error: 'no such conversation here', code: 'unknown' });
    if (p.gone) return res.status(410).json({ error: 'the picture is no longer in the conversation\'s record', code: 'gone', why: p.gone });
    const mime = mimeOf(p.mediaType);
    if (!mime) return res.status(415).json({ error: 'not a picture type shown here', code: 'type' });
    const etag = '"' + crypto.createHash('sha1').update([b, tx, agent || '', key, n, p.start || 0, p.end || 0, (p.b64 || '').length].join('|')).digest('hex').slice(0, 27) + '"';
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.setHeader('ETag', etag);
    if (String(req.headers['if-none-match'] || '') === etag) return res.status(304).end();
    stats.served++;
    if (typeof p.b64 === 'string') {   // a device's answer (or an escaped span): decoded block by block
      for (let i = 0; i < p.b64.length; i += 65536) { if (!res.write(Buffer.from(p.b64.slice(i, i + 65536), 'base64'))) await new Promise((r) => res.once('drain', r)); }
      return res.end();
    }
    let fh;
    try {
      fh = await fsp.open(p.fp, 'r');
      const st = await fh.stat();
      if (st.ino !== p.ino || st.dev !== p.dev) { await fh.close(); res.removeHeader('ETag'); res.removeHeader('Cache-Control'); return res.status(503).json({ error: 'the conversation\'s record changed — finding it again', code: 'finding', retryMs: RETRY_MS }); }
    } catch { try { await fh?.close(); } catch { } return res.status(410).json({ error: 'the picture is no longer in the conversation\'s record', code: 'gone', why: 'missing' }); }
    const rs = fh.createReadStream({ start: p.start, end: p.end - 1 });
    rs.on('error', () => res.destroy());
    res.once('close', () => rs.destroy());
    rs.pipe(base64Decoder()).pipe(res);
  });

  // ── the files a person dropped ──
  app.get('/api/chat-attachments/usage', async (req, res) => {
    try { res.json(await store.usage()); } catch (e) { res.status(500).json({ error: 'unreadable', code: 'unreadable' }); }
  });
  app.get('/api/chat-attachments/orphans', async (req, res) => {
    try { const o = await store.orphans(); res.json({ conversations: o.conversations, files: o.files, bytes: o.bytes }); } catch (e) { res.status(500).json({ error: 'unreadable', code: 'unreadable' }); }
  });
  app.post('/api/chat-attachments/orphans/remove', async (req, res) => {
    const files = Number(req.body && req.body.files), bytes = Number(req.body && req.body.bytes);
    if (!Number.isFinite(files) || !Number.isFinite(bytes)) return res.status(400).json({ error: 'name the count and the size you saw', code: 'bad_request' });
    try {
      const r = await store.removeOrphans({ files, bytes });
      if (r.changed) return res.status(409).json({ error: 'what would be removed changed — look again', code: 'changed', now: r.now });
      res.json(r);
    } catch (e) { res.status(500).json({ error: 'not removed', code: 'failed' }); }
  });
  return { stats: () => ({ ...stats, running, waiting: queue.filter((j) => !j.left).length }) };
}

module.exports = { registerChatAttachmentRoutes, base64Decoder, mimeOf, MAX_AT_ONCE, DEADLINE_MS, RETRY_MS };
