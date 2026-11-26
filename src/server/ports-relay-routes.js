'use strict';
// B-73c4 (主开发 r5159 / r5162, lane nl-mounts): THE PORTS ROWS WHOSE PUBLIC ADDRESS IS STILL UP — two routes, registered from
// src/server/mounts-plugins-wiring.js (server.js gains no line):
//   POST /api/port-forward/:id/unpublish-again — «Try again» on such a row: a PERSON's press only (the tree's one verdict, src/routes/vault.js
//     personVerdict: a conversation's, a job's and an automation's sign-in are refused by name); the row leaves only when the relay
//     CONFIRMS the removal (src/port-forward.js unpublishAgain), else it stays with its new reason
//   GET /api/port-forwards/relay-files — the relay files of this home with NO owner mark and no row (written before this unit): shown once
//     as words in Ports, never touched, no press (src/port-forward.js unmarkedRelayFiles)
const { personVerdict } = require('../routes/vault.js');

const DOOR_WORDS = {
  human_only: 'only a person retries the removal of a public address — an agent, a job or an automation cannot',
  cross_site: 'only this instance\'s own page retries the removal of a public address',
};

/** the person's door: true when a person on this page pressed it, else the refusal answered (403, by name) */
function personDoor(req, res) {
  const who = personVerdict(req);
  if (who.ok) return true;
  res.set('Cache-Control', 'no-store');
  res.status(403).json({ ok: false, code: who.code, error: DOOR_WORDS[who.code] || DOOR_WORDS.cross_site });
  return false;
}

function register({ app, getPortForwards }) {
  app.post('/api/port-forward/:id/unpublish-again', async (req, res) => {
    if (!personDoor(req, res)) return;
    try { res.json(await getPortForwards().unpublishAgain(String(req.params.id))); } catch (e) { res.status((e && e.status) || 400).json({ error: (e && e.message) || String(e), ...(e && e.code ? { code: e.code } : {}) }); }
  });
  app.get('/api/port-forwards/relay-files', (req, res) => {
    let unmarked = null;
    try { const pf = getPortForwards(); unmarked = pf && typeof pf.unmarkedRelayFiles === 'function' ? pf.unmarkedRelayFiles() : null; } catch { unmarked = null; }
    res.json({ unmarked });
  });
}

module.exports = { register, personDoor, DOOR_WORDS };
