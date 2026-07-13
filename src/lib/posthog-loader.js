// Optional product analytics — self-hosted PostHog (or API-compatible).
// Loads ONLY when the server hands us a host+key (/api/home `posthog`;
// settings posthog.host/posthog.key or env on the server side). Session
// recording is FULLY MASKED (all inputs + all text) — the product\'s
// names-only telemetry philosophy applies: interaction shapes, never content.
export function initPosthog(cfg) {
  if (!cfg || !cfg.host || !cfg.key || window.posthog) return;
  try {
    const s = document.createElement('script');
    s.src = cfg.host.replace(/\/$/, '') + '/static/array.js';
    s.async = true;
    s.onload = () => {
      try {
        window.posthog.init(cfg.key, {
          api_host: cfg.host,
          autocapture: true,
          capture_pageview: true,
          disable_surveys: true,
          session_recording: { maskAllInputs: true, maskTextSelector: '*' },
          persistence: 'localStorage',
        });
        if (cfg.name) window.posthog.identify(cfg.name);
      } catch { /* analytics must never break the app */ }
    };
    s.onerror = () => {}; // unreachable PostHog host = silently no analytics
    document.head.appendChild(s);
  } catch { }
}
