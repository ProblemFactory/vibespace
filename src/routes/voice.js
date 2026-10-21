'use strict';
// The hub proxy of Dropline voice input (design q-029 §1). The browser records and POSTs the audio here with its
// PURE context (`ctx`, re-cut here by contextFromClient); the hub adds the token and talks to Dropline through the
// ONE vendor module (src/server/dropline-client.js). The audio stays in memory (multer memoryStorage, 8 MB cap) for
// the one request — never on disk, never in a log line.
//   GET  /api/voice/status   → {on, connected, language, account, connectVia, connectWhy}  (the microphone asks before it
//                            records; the Connect block — the sheet AND the Integrations card — reads account / connectVia /
//                            connectWhy: why Connect cannot run here, a code of the registry row's `connect.whys`)
//   POST /api/voice/dictate  multipart {audio, ctx?, uiLang?} → {text, rewrite, language, request_id}
//                            | {error:<voiceWords code>, retryAfter?} with the vendor's status (429 keeps Retry-After)
// P1 (lane voice-p1-oauth-teach) — every route below is the OWNER's (an agent's vsst_/jbt_ bearer is refused 403: a
// sign-in and a press on 加入词库 / 发送 are the person's own acts):
//   POST /api/voice/oauth/start {origin}   → {ok, url, flowId, via} | 409 {error:'needs-https'}   (the card opens url in a NEW TAB;
//                                            never gated on the plugin's switch: a person connects first, switches on after)
//   GET  /api/voice/oauth/flow/:id         → {done, ok, error}                                     (the card's wait for the landing)
//   POST /api/voice/oauth/disconnect       → {ok}   (forgotten here; Fish Audio keeps the grant until removed at fish.audio)
//   GET  /api/voice/teach                  → {settings, proposals, journal, caps}
//   POST /api/voice/teach/settings {teach?, context?, autoProject?:{cwd, on}}
//   POST /api/voice/teach/seen {conv, title, cwd, messages, uiLang}  → {proposal, auto, preview, context}  (after a dictation)
//   POST /api/voice/teach/proposal/:id {verb:'add', terms} | {verb:'ignore'}
//   POST /api/voice/teach/preview/:id {send}   (the first-time context preview's 发送 / 不发)
//   POST /api/voice/teach/word {term, verb:'add'|'ignore'}   (lane voice-dictionary-nag: the settings list's per-word 加入 / 忽略)
const express = require('express');
const multer = require('multer');
const VM = require('../voice-model.js');

const isAgentBearer = (req) => /^Bearer\s+(vsst_|jbt_)/i.test(String((req.headers && req.headers.authorization) || ''));

function create({ client, prefs = () => ({}), oauth = null, teach = null, log = console }) {
  const router = express.Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: VM.VOICE_LIMITS.maxBytes, files: 1, fields: 4, fieldSize: 64 * 1024 } });
  const status = () => {
    const p = prefs() || {};
    const c = (p.config) || {};
    return { on: !!p.enabled && client.connected(), enabled: !!p.enabled, connected: client.connected(), vaultLocked: !!(client.locked && client.locked()), language: VM.languageOf(c.language), account: client.account ? client.account() : null, teach: c.teach === true, context: c.context === true, connectVia: oauth ? oauth.callbackPlan().via : null, connectWhy: oauth ? oauth.connectWhy() : 'self-hosted' };
  };
  const owner = (fn) => async (req, res) => {
    if (isAgentBearer(req)) return res.status(403).json({ error: 'human-triggered only', code: 'agent_forbidden' });
    try { res.json(await fn(req.body || {}, req)); } catch (e) { res.status((e && e.status) || 500).json({ error: (e && e.code) || 'failed', message: String((e && e.message) || e).slice(0, 300) }); }
  };
  if (oauth) {
    router.post('/api/voice/oauth/start', owner(async (b) => {
      const r = await oauth.start({ origin: typeof b.origin === 'string' ? b.origin.slice(0, 300) : '' });
      if (!r.ok) throw Object.assign(new Error(r.message || r.why), { status: 409, code: r.why });   // the words of the row's connect.whys
      return r;
    }));
    router.get('/api/voice/oauth/flow/:id', owner(async (b, req) => {
      const st = oauth.flowStatus(String(req.params.id || '').slice(0, 80));
      return st ? { done: !!st.done, ok: !!st.done && !st.error, error: st.error || null, account: client.account() } : { done: true, ok: false, error: 'the sign-in is no longer running', account: client.account() };
    }));
    router.post('/api/voice/oauth/disconnect', owner(async () => client.disconnect()));
  }
  if (teach) {
    router.get('/api/voice/teach', owner(async () => teach.view()));
    router.post('/api/voice/teach/settings', owner(async (b) => teach.setSettings({ teach: b.teach, context: b.context, suggest: b.suggest, suggestionsMode: b.suggestionsMode, autoProject: b.autoProject })));
    router.post('/api/voice/teach/word', owner(async (b) => teach.answerWord(typeof b.term === 'string' ? b.term : '', b.verb)));
    router.post('/api/voice/teach/seen', owner(async (b) => teach.seen({ conv: b.conv, title: typeof b.title === 'string' ? b.title : '', cwd: typeof b.cwd === 'string' ? b.cwd : '', messages: Array.isArray(b.messages) ? b.messages.slice(-40) : [], groupName: typeof b.groupName === 'string' ? b.groupName : '', uiLang: b.uiLang })));
    router.post('/api/voice/teach/proposal/:id', owner(async (b, req) => (b.verb === 'add' ? teach.confirm(req.params.id, b.terms) : b.verb === 'ignore' ? teach.ignore(req.params.id) : Promise.reject(Object.assign(new Error('verb must be add or ignore'), { status: 400, code: 'bad-request' })))));
    router.post('/api/voice/teach/preview/:id', owner(async (b, req) => teach.answerPreview(req.params.id, b.send === true)));
  }
  router.get('/api/voice/status', (req, res) => res.json(status()));
  router.post('/api/voice/dictate', (req, res) => {
    upload.single('audio')(req, res, async (err) => {
      if (err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'too-long' : 'audio-invalid' });
      const st = status();
      if (!st.enabled) return res.status(409).json({ error: 'plugin-off' });
      if (!st.connected && st.vaultLocked) return res.status(423).json({ error: 'vault-locked' });   // lane vault-e2e-password-fix-r2
      if (!st.connected) return res.status(409).json({ error: 'not-connected' });
      const f = req.file;
      if (!f || !f.buffer || !f.buffer.length) return res.status(400).json({ error: 'audio-invalid' });
      try {
        const out = await client.dictate({ audio: f.buffer, mime: f.mimetype || VM.RECORDER_MIME, ctx: VM.contextFromClient(req.body && req.body.ctx), language: st.language, uiLang: req.body && req.body.uiLang });
        res.json(out);
      } catch (e) {
        if (e && e.retryAfter) res.set('Retry-After', String(e.retryAfter));
        res.status((e && e.status) || 502).json({ error: (e && e.code) || 'failed', retryAfter: (e && e.retryAfter) || null, request_id: (e && e.requestId) || null });
      }
    });
  });
  return router;
}

module.exports = { create };
