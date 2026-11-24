// Voice input · Dropline (design q-029 §1, P0 = the key tier). Nothing to install and nothing runs: the plugin is
// the on-switch + the language preference; the KEY lives in the `dropline` integration row's secret store (never in
// data/plugins.json) and the ONE vendor surface is src/server/dropline-client.js. OFF until a key is pasted, then
// ON by its toggle (owner 2026-10-12). The hub proxy /api/voice/dictate (src/routes/voice.js) reads `peek()` through
// the voiceBind hook the wiring hands in.
const VM = require('../voice-model.js');

module.exports = {
  id: 'voice-input',
  label: 'Voice input · Dropline',
  description: 'Dictate into the chat box with your own Dropline: click the microphone, speak, click again — the text lands at your cursor, written with your Dropline dictionary. Connect your Fish Audio account (or paste a Dropline key) to turn it on.',
  provides: ['dictation', 'reminders'], // reminders (lane foryou-plugin-notices): its dictionary suggestions file For-you items — ONE at a time, filed low, never pinned (lane voice-dictionary-nag)
  create(h) {
    const keyed = () => {
      const st = typeof h.opts.integrations === 'function' ? h.opts.integrations() : h.opts.integrations;
      try { const r = st && st.resolveIntegration('dropline'); if (r && r.values && r.values.apiKey) return true; } catch { }
      try { return typeof h.opts.droplineConnected === 'function' && !!h.opts.droplineConnected(); } catch { return false; } // P1: the OAuth tier
    };
    /** r3334 unit 2: the OAuth sign-in's state when it is no pair: 'unread' (held) | 'damaged' (torn bytes kept aside) | null */
    const signin = () => { try { const s = typeof h.opts.droplineSignin === 'function' ? h.opts.droplineSignin() : null; return s === 'unread' || s === 'damaged' ? s : null; } catch { return null; } };
    const verbs = {
      install() { throw new Error('nothing to install — paste your Dropline key below, then turn voice input on'); },
      start() {
        // r3334 unit 2: the sign-in HELD — said by name (never «connect your account first»); nothing is saved
        if (!keyed() && signin() === 'unread') throw Object.assign(new Error('the voice sign-in could not be read right now — nothing was changed; VibeSpace reads it again by itself'), { code: 'voice_signin_unread', status: 503 });
        if (!keyed()) throw new Error('connect your Fish Audio account or paste your Dropline key first (dropline.fish.audio/app → API keys)');
        const rec = h.rec(); rec.enabled = true; h.save(); h.notify();
        return { started: true };
      },
      stop() { const rec = h.rec(); rec.enabled = false; h.save(); h.notify(); return { stopped: true }; },
      enable(on) { return on ? verbs.start() : verbs.stop(); },
      bootReplay() { }, // nothing runs — the switch is read per dictation
      // the old /config door: the language is a SETTINGS row (All Settings › Plugins › Voice input · Dropline)
      config(patch = {}) {
        if (patch.language !== undefined) {
          if (!VM.LANGUAGES.includes(patch.language)) throw new Error(`language must be one of ${VM.LANGUAGES.join(' | ')}`);
          h.writeSettings({ language: patch.language });
        }
        h.notify();
        return { config: { language: h.setting('language') } };
      },
      status() {
        const rec = h.peek();
        const hasKey = keyed();
        return {
          installed: true, configured: hasKey, enabled: !!rec.enabled && hasKey, running: !!rec.enabled && hasKey,
          // lane vault-e2e-password-fix-r2: a sign-in the LOCKED vault keeps closed — the card says 「保险库已锁定」, never "connect"
          vaultLocked: !hasKey && (() => { try { return typeof h.opts.droplineLocked === 'function' && !!h.opts.droplineLocked(); } catch { return false; } })(),
          language: VM.languageOf(h.setting('language')), integration: 'dropline',
          signin: !hasKey ? signin() : null,   // r3334: the card says «could not be read», never «connect» (damaged: Connect is the way out)
        };
      },
    };
    // P1: the teach engine's switches are SETTINGS rows (h.settings / h.writeSettings — lane plugin-settings-p0) and
    // its state (proposals, ignores, journal) stays in rec.teach
    if (typeof h.opts.voiceBind === 'function') h.opts.voiceBind({ peek: () => h.peek(), status: () => verbs.status(), update: (fn) => { const rec = h.rec(); fn(rec); h.save(); }, settings: () => h.settings(), writeSettings: (patch) => { h.writeSettings(patch); h.notify(); } });
    return verbs;
  },
};
