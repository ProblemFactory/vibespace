/**
 * THE Ctrl+G EDITOR ROUTES — POST /api/editor/open (the `code` helper inside a session shell, vsst_ auth)
 * and POST /api/editor/signal (the client's save/close). MOVED VERBATIM out of server.js (lane
 * dc-seams-server, decoupling wave 2b, review rv-server-core M9: server.js is bootstrap + wiring);
 * the one added line is the late-boot remote-fs singleton crossing as a getter (server.js idiom).
 * auth.middleware still exempts /api/editor/open by path; the pending edit rides session-meta
 * `pendingEditor` (re-broadcast on terminal attach by ws-handler).
 */
const fs = require('fs');
const { sameToken } = require('../pairing-token'); // B-8dda: a vsst_ compare in constant time

function registerEditorRoutes(app, { activeSessions, wss, WS_OPEN, readSessionMeta, writeSessionMeta, getRemoteFs }) {
// Editor: open request from the `code` helper script (via HTTP, not terminal
// output). The caller lives INSIDE the session shell — no cookie exists there,
// so auth.middleware exempts this path and WE validate the per-session vsst_
// token instead (same trust model as /api/agent/*). Without this, enabling
// password auth silently broke Ctrl+G: the script's POST got 401 and claude
// sat on "Save and close editor to continue…" forever.
app.post('/api/editor/open', (req, res) => {
  if (app.locals.authEnabled) {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    let ok = false;
    if (token && token.startsWith('vsst_')) {
      for (const [, s] of activeSessions) { if (sameToken(token, s.agentToken)) { ok = true; break; } }
    }
    if (!ok) return res.status(401).json({ error: 'unauthorized (session token required)' });
  }
  const { file, signal, sessionId } = req.body;
  // Remote Ctrl+G (B-2de8): the POST came from the fake `code` helper running
  // ON THE HOST (over the reverse tunnel) — the tmpfile + signal file live
  // there. Resolve the session's host server-side and ship it in the
  // broadcast so the client editor reads/writes/signals the right machine.
  const editorHost = (sessionId && activeSessions.get(sessionId)?.host) || null;
  // Persist the pending edit on the session + its meta: the helper script
  // waits FOREVER on the signal file while claude shows "Save and close
  // editor to continue…" — a server restart + page reload (or pod recreation
  // for remote sessions, whose helper+claude survive on the host) otherwise
  // loses the only record of it and the session silently hangs mid-turn.
  // Cleared by /api/editor/signal; re-broadcast on terminal attach.
  if (sessionId && activeSessions.has(sessionId)) {
    const s = activeSessions.get(sessionId);
    s._pendingEditor = { filePath: file, signalPath: signal, host: editorHost, at: Date.now() };
    try { if (s.sockName) writeSessionMeta(s.sockName, { ...(readSessionMeta(s.sockName) || {}), pendingEditor: s._pendingEditor }); } catch {}
  }
  // Broadcast to all WebSocket clients — include sessionId so each client opens editor on the right window
  const msg = JSON.stringify({ type: 'editor-open', filePath: file, signalPath: signal, sessionId: sessionId || null, host: editorHost });
  wss.clients.forEach(client => {
    if (client.readyState === WS_OPEN) {
      try { client.send(msg); } catch {}
    }
  });
  res.json({ success: true });
});

// Editor: signal completion (called by client when user saves/closes editor)
app.post('/api/editor/signal', async (req, res) => {
  const { signalPath, filePath, content, host } = req.body;
  const remoteFs = getRemoteFs(); // server.js defines it after these routes register
  try {
    if (host && remoteFs) {
      // remote Ctrl+G: the CLI polls the signal file ON ITS machine
      if (content !== undefined) await remoteFs.write(String(host), filePath, Buffer.from(content));
      await remoteFs.write(String(host), signalPath, Buffer.from('done'));
    } else {
      if (content !== undefined) fs.writeFileSync(filePath, content);
      fs.writeFileSync(signalPath, 'done');
    }
    // The edit is settled — drop the persisted pending-editor record so a
    // later restart/attach doesn't re-open a dead pane
    for (const [, s] of activeSessions) {
      if (s._pendingEditor?.signalPath === signalPath) {
        s._pendingEditor = null;
        try { if (s.sockName) writeSessionMeta(s.sockName, { ...(readSessionMeta(s.sockName) || {}), pendingEditor: null }); } catch {}
      }
    }
    // Broadcast editor-close to all clients so they remove the split pane
    const msg = JSON.stringify({ type: 'editor-close', filePath, signalPath });
    wss.clients.forEach(client => {
      if (client.readyState === WS_OPEN) { try { client.send(msg); } catch {} }
    });
    res.json({ success: true });
  } catch (err) { res.status(400).json({ error: err.message }); }
});
}

module.exports = { registerEditorRoutes };
