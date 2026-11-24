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
      try { const k = st.pushNotice(sessionStatusKey(s, id), HL.hooksLateNotice({ webuiId: id, rel, at }), { replaceKind: true }); if (k) { told.add(id); n++; } else warn(`[hooks] ${id}: the late-hooks note was not queued — the conversations' statuses could not be read; not counted as told`); }   // r3193: pushNotice answers 0 while held
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
  function registerApplyRoute(app, { ensureAgentHooks, agentHooksStatus, integrationEnabled, harnessConfig, hookRegistrationSafe, rootFactsNow = null }) {
    app.post('/api/cli-config/apply', async (req, res) => { try {   // B-1425: an async route answers a throw (500), never hangs
      if (typeof rootFactsNow === 'function') await rootFactsNow();   // B-1425: the root's true facts first (off the loop, bounded)
      if (!hookRegistrationSafe()) return res.status(409).json({ error: 'This server runs from a temporary directory and never writes the real CLI config.', code: 'unsafe_root' });
      let hooks = null;
      try { if (integrationEnabled()) hooks = await ensureAgentHooks({ auto: true }); } catch (e) { hooks = { error: e.message }; }
      const cfg = await harnessConfig.syncCliConfig({ reason: 'Apply' });
      // B-225b (主开发 r552 — a person's refused act is SAID at the press): while the SETTINGS are held both writers skip and write
      // nothing; the door answers the hold BY NAME (the store's unread refusal with the held fact), never «applied» over nothing
      const heldOf = (x) => (x && x.skipped && x.settingsHeld ? x.settingsHeld : null), held = heldOf(hooks) || heldOf(cfg);
      if (held) return res.status(503).json({ error: `the settings could not be read (${held.kind}${held.code ? ', ' + held.code : ''}) — the CLI config was not applied; nothing was written`, code: 'store_unread', held: { file: 'settings.json', kind: held.kind, code: held.code || null, since: held.since || null, rung: 'said' } });
      const saidHooks = (k) => { const v = hooks && typeof hooks === 'object' ? hooks[k] : null; return !!(v && v.ok === false && v.missing !== 'no-dir'); };   // the hooks answers this press says
      const failed = [
        ...Object.entries(hooks && typeof hooks === 'object' ? hooks : {}).filter(([k]) => saidHooks(k)).map(([k, v]) => `${k}: ${v.error || v.why || 'not applied'}`),   // r1813: a landing carries `why` (an opted-out start's removal)
        // r2844: the settings answer's failed PARTS, each ONCE (its error is their joined words — never said beside them); a hooks part the
        // CLI's hooks answer above SAID is left out. A failure with no part (no helper road, a late or broken run) is its error, unless
        // the hooks answers said those very words
        ...(cfg && cfg.error && Array.isArray(cfg.parts) && cfg.parts.length
          ? cfg.parts.filter((p) => !(p.key === 'hooks' && saidHooks(p.harness))).map((p) => `${p.harness}.${p.why}`)
          : cfg && cfg.error && !Object.keys(hooks && typeof hooks === 'object' ? hooks : {}).some((k) => saidHooks(k) && (hooks[k].error || hooks[k].why) === cfg.error) ? [cfg.error] : []),
        ...(hooks && hooks.optedOut && typeof hooks.error === 'string' ? [hooks.error] : []),   // r2345 (1): an opted-out start whose look at our rows was not read (the guard) — the press says it, never «applied» over it
      ];
      res.json({ ok: !failed.length, ...(failed.length ? { error: failed.join('; ') } : {}), hooks, cliConfig: await harnessConfig.cliConfigStatus(), status: await agentHooksStatus() });
    } catch (e) { if (!res.headersSent) res.status(500).json({ error: String((e && e.message) || e) }); } });
  }

  return { noteCreated, ready, registerApplyRoute, _pending: () => pending.slice(), _told: () => [...told] };
}

module.exports = { create };
