// The OPENCODE-SERVE built-in plugin (2026-09-07, owner decision; moved out of src/plugins.js by lane dc-plugins,
// 2026-10-04) — the background `opencode serve` that lets STOPPED OpenCode conversations list / open /
// resume / fork. It is DEFAULT OFF and exists as a plugin precisely so the
// user turns a third-party background daemon on DELIBERATELY (the 2.369.42
// runaway is why). This plugin is only the CONTROL SURFACE: the serve facts,
// keeper and resource guard stay in the SHARED module src/opencode-serve.js
// (ONE implementation) — here we own enabled/desiredUp/prompted, boot replay
// and the status the UI renders. Every fact (installed / running / parked /
// runaway numbers) comes from the ONE keeper there.
// The plugin contract (create(h) → verbs, the host handle h) is described in src/plugins.js.
// h.opts.opencodeServe = the SHARED serve module (injected so tests can drive a fake keeper); the installed
// singleton is resolved lazily through facts().

module.exports = {
  id: 'opencode-serve',
  label: 'OpenCode background service',
  description: 'Lists, opens, resumes and forks STOPPED OpenCode conversations. OpenCode keeps its sessions in its own database rather than in files, so VibeSpace runs `opencode serve` on 127.0.0.1 to read them. Off by default; it stops when you disable it.',
  provides: ['serve'],
  create(h) {
    const serve = h.opts.opencodeServe || require('../opencode-serve');
    const ocFacts = () => { try { return serve.facts(); } catch { return null; } };
    const ocServeState = () => { try { return ocFacts()?.state() || {}; } catch (e) { return { error: e.message }; } };
    const ocLocator = () => { const f = ocFacts(); return f && f.locator ? f.locator : null; };

    const verbs = {
      config() { throw new Error('the OpenCode background service has nothing to configure — it binds a free port on 127.0.0.1'); },

      // The OpenCode service is not a "also start it at boot" checkbox — it IS
      // the switch, and `enabled`/`desiredUp` move in LOCKSTEP. Anything else is
      // a silent no-op: an enabled-but-not-desiredUp record leaves autostart
      // false, so ticking the box would do nothing until a restart that also
      // does nothing. On ⇒ start now and at every boot; off ⇒ STOP the daemon
      // (a background process the user just turned off that keeps burning CPU
      // is the 2.369.42 shape).
      enable(enabled) { return void (enabled ? verbs.start() : verbs.stop()); },

      // enabled + desiredUp ⇒ start with the server (the keeper would also
      // start it lazily on the first discovery; replaying makes "it is on"
      // true before anyone looks). Never when the CLI is absent or the env
      // forces it off — start() says so loudly and boot replay is silent.
      bootReplay() {
        const rec = h.peek();
        if (!rec.enabled || !rec.desiredUp) return;
        try {
          const st = verbs.status();
          if (!st.installed || st.envForced === false || st.running) return;
          console.log('[plugins] boot replay: starting the OpenCode background service');
          verbs.start();
        } catch (e) { console.warn('[plugins] boot replay opencode-serve failed:', e.message); }
      },

      /** There is nothing for VibeSpace to download: the service IS the user's own
       *  `opencode` CLI. "Installed" = cli-env resolved that executable. Say how to
       *  get it instead of pretending we can (no silent failure, no dead button). */
      install() {
        const st = ocServeState();
        if (!st.installed) throw new Error('the `opencode` CLI is not on PATH — install OpenCode (https://opencode.ai), then reload this panel (or set OPENCODE_CMD and restart VibeSpace)');
        return { installed: true, version: st.version || null };
      },

      start() {
        const st = ocServeState();
        if (!st.installed) throw new Error('the `opencode` CLI is not on PATH — install OpenCode (https://opencode.ai) first');
        if (serve.serveEnvOverride() === false) throw new Error('VIBESPACE_OPENCODE_SERVE=0 is set on this instance — the OpenCode background service is forced off by the environment');
        const rec = h.rec();
        rec.enabled = true;      // Start IS the enable: autostart reads enabled && desiredUp
        rec.desiredUp = true;
        h.save();
        const loc = ocLocator();
        // the keeper's own ladder (reuse → spawn → boot wait ≤20s) runs in the
        // background; the UI shows 'starting…' from status() until it answers.
        // Dropping the facts caches is part of starting: the 10s NEGATIVE cache
        // was filled while the service was off, and without this the sidebar
        // would keep showing "no stopped conversations" after the user turned it
        // on (the cache-invalidation law — one dirty signal at the entry point).
        if (loc?.start) Promise.resolve(loc.start()).catch(() => { }).then(() => { try { ocFacts()?.invalidate?.(); } catch { } h.notify(); });
        h.notify();
        return { starting: true };
      },

      stop() {
        const rec = h.rec();
        rec.enabled = false;          // lockstep with desiredUp — ONE switch, no "enabled but off" limbo
        rec.desiredUp = false;
        h.save();
        // killRecorded: a serve we merely ADOPTED is still a VibeSpace-started
        // daemon — "off" must mean the process is gone, not "we stopped looking"
        try { ocLocator()?.stop?.({ killRecorded: true }); } catch { }
        h.notify();
        return { stopped: true };
      },

      status() {
        const rec = h.peek();
        const st = ocServeState();
        const envForced = serve.serveEnvOverride();
        const enabled = envForced === true ? true : envForced === false ? false : !!rec.enabled;
        const running = !!st.ready;
        return {
          installed: !!st.installed,
          configured: !!st.installed,
          enabled,
          desiredUp: !!rec.desiredUp,
          prompted: !!rec.promptedAt,
          envForced,                       // true = forced on, false = forced off, null = the plugin decides
          running,
          starting: !running && !st.parked && !!st.installed && !!st.autostart,
          parked: !!st.parked,
          parkedKind: st.parkedKind || null,
          port: st.port || null,
          pid: st.pid || null,
          source: st.source || null,       // 'spawned' | 'reused'
          version: st.version || null,
          cpuPct: st.cpuPct == null ? null : Math.round(st.cpuPct),
          rssMb: st.rssBytes ? Math.round(st.rssBytes / 1048576) : null,
          lastError: st.lastError || null,
          reason: running ? null : (() => { try { return ocFacts()?.reasonUnavailable?.() || null; } catch { return null; } })(),
        };
      },
    };
    return verbs;
  },
};
