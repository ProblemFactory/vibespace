'use strict';
// ORCH — A HOOK FILE CREATED WHILE CONVERSATIONS RUN (lane hooks-create,
// 2026-10-01; the words and rules are PURE in src/hooks-late.js).
//
// The 'dir-exists' rule (src/harness-config.js) now CREATES ~/.claude/settings.json
// when the CLI never wrote one, and registers VibeSpace's hooks in it. A CLI
// process snapshots its hook configuration when it starts, so a conversation
// already running is not reached by the file. This module is told by
// ensureAgentHooks (agent-tool-generators' `onHookFileCreated`) and then:
//   · queues ONE free next-turn note per running LOCAL session of that harness
//     (session-status kind 'hooks-late' — never a billed turn; once per
//     session: `told` + the queue's replaceKind),
//   · files ONE For-you line for the owner naming how many conversations
//     predate the registration (origin `agent`), only when there is at least one.
// At boot the registration runs BEFORE the restore (server.js order), so a
// creation is held until `ready()` — called right after restoreSessions — and
// told against the restored set. It also owns the human-triggered
// POST /api/cli-config/apply (the Settings chip / Machines card "Apply"): the
// hook registration (honouring the master switch and the Remove opt-out) + the
// CLI-config plan, i.e. the boot path on demand.
const HL = require('../hooks-late.js');

function create({ activeSessions, getSessionStatus, getUserTodos, sessionStatusKey, harnesses, log = console.log, warn = console.warn }) {
  let isReady = false;
  const pending = [];
  const told = new Set();   // webui ids already told (a session is told once)

  function announce({ harness, rel, at }) {
    let h = null;
    try { h = harnesses.get(harness); } catch { h = null; }
    if (!h) { warn(`[hooks] created ~/${rel}: harness ${JSON.stringify(harness)} is not registered — nobody told`); return { told: 0 }; }
    const st = getSessionStatus(), todos = getUserTodos();
    const targets = [];
    for (const [id, s] of activeSessions) {
      if (!s || (s.backend || 'claude') !== harness) continue;
      if (s.host || s._dialDeviceId) continue;              // another machine's CLI reads its own file
      if (!HL.readsHookFile(s, h)) continue;                 // a wrapper-injected chat never read it
      if (told.has(id)) continue;
      targets.push([id, s]);
    }
    let n = 0;
    for (const [id, s] of targets) {
      try { st.pushNotice(sessionStatusKey(s, id), HL.hooksLateNotice({ webuiId: id, rel, at }), { replaceKind: true }); told.add(id); n++; }
      catch (e) { warn(`[hooks] ${id}: the late-hooks note was not queued — ${e && e.message}`); }
    }
    if (n) {
      const item = HL.forYouItem({ count: n, label: h.label || harness, rel, names: targets.map(([id, s]) => s.name || s.webuiName || id) });
      try { todos.add(HL.INBOX_KEY, { origin: 'agent', kind: 'action', urgency: 'normal', by: 'agent', sessionName: 'VibeSpace integration', text: item.text, detail: item.detail, i18n: item.i18n }); }
      catch (e) { warn(`[hooks] the For-you line was not filed — ${e && e.message}`); }
    }
    log(`[hooks] created ~/${rel}: ${n} running ${h.label || harness} session(s) predate it — each gets one free next-turn note${n ? ', the owner one For-you line' : ''}`);
    return { told: n };
  }
  function flush() { const out = []; while (pending.length) out.push(announce(pending.shift())); return out; }
  /** ensureAgentHooks' `onHookFileCreated` ({harness, file, rel, at}). */
  function noteCreated(ev) { pending.push(ev); return isReady ? flush() : null; }
  /** Boot: the live-session set is final (right after restoreSessions). */
  function ready() { isReady = true; return flush(); }

  /** POST /api/cli-config/apply — the "Apply" a missing-file chip offers (human-triggered). */
  function registerApplyRoute(app, { ensureAgentHooks, agentHooksStatus, integrationEnabled, harnessConfig, hookRegistrationSafe }) {
    app.post('/api/cli-config/apply', (req, res) => {
      if (!hookRegistrationSafe()) return res.status(409).json({ error: 'This server runs from a temporary directory and never writes the real CLI config.', code: 'unsafe_root' });
      let hooks = null;
      try { if (integrationEnabled()) hooks = ensureAgentHooks({ auto: true }); } catch (e) { hooks = { error: e.message }; }
      const cfg = harnessConfig.syncCliConfig({ reason: 'Apply' });
      const failed = [
        ...Object.entries(hooks && typeof hooks === 'object' ? hooks : {}).filter(([, v]) => v && v.ok === false && v.missing !== 'no-dir').map(([k, v]) => `${k}: ${v.error}`),
        ...((cfg && cfg.receipts) || []).filter((x) => x.state === 'error' || x.state === 'refused').map((x) => `${x.harness}.${x.key}: ${x.reason || x.state}`),
        ...(cfg && cfg.error ? [cfg.error] : []),
      ];
      res.json({ ok: !failed.length, ...(failed.length ? { error: failed.join('; ') } : {}), hooks, cliConfig: harnessConfig.cliConfigStatus(), status: agentHooksStatus() });
    });
  }

  return { noteCreated, ready, registerApplyRoute, _pending: () => pending.slice(), _told: () => [...told] };
}

module.exports = { create };
