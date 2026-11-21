'use strict';
// THE DOOR CLASS'S ORACLE (B3a): src/auth.js middleware() AS IT STOOD BEFORE the door class was lifted out of it — frozen
// verbatim from 22353751e (the base of B3a), so scripts/test-door-class.mjs can answer a recorded corpus of requests with
// MASTER's own gate and with today's (the middleware judging through src/door.js) and find them EQUAL. A fixture, never
// product code: it is called on a real Auth instance (`this` = that instance; its helpers are today's).
// Run as: require(this file)(Auth) → a middleware() function to .call(authInstance)
const { crossSiteVerdict, ownOriginOf } = require('../../src/write-origin.js');
module.exports = (Auth) => function () {
  const self = this;
  const shim = Object.create(self);   // the pre-B3a body read this.originVerdict, this.enabled, this.checkToken, this._slideCookie, this._logCrossSite
  shim.originVerdict = (req) => crossSiteVerdict({ method: req.method, headers: req.headers || {} }, ownOriginOf(req.headers, { encrypted: !!(req.socket && req.socket.encrypted) }));
  return ({
    middleware() {
      return (req, res, next) => {
        const p = req.path;
        // ── THE DOORS: callers that are not the owner's browser, each judged by its OWN credential — never the cookie,
        // so never the same-origin rule below (a door's refusals are its own) ──
        // WebDAV bridge authenticates with scoped Bearer mount tokens (webdav.js)
        if (p === '/dav' || p.startsWith('/dav/')) return next();
        // Agent endpoints authenticate with per-session tokens spawned into the
        // agent's env (vsst_ — see /api/agent/session-status); no cookie exists
        // inside an agent's shell, so these must bypass cookie auth.
        if (p.startsWith('/api/agent/')) return next();
        // Ctrl+G editor bridge: the fake `code` script runs inside the session
        // shell (no cookie) and sends the same vsst_ token — the ROUTE validates
        // it. Cookie-gating this silently broke Ctrl+G whenever auth was on.
        if (p === '/api/editor/open') return next();
        // Standalone device install: the agentd bundle + installer are public
        // (the bundle is not secret; the /api/agentd-dial upgrade is gated by the
        // per-device dial token). A NAT device fetches these before any cookie.
        // BOTH name generations must be exempt — the 2.154.x vibespace-device
        // rename added the canonical routes but not these exemptions, so every
        // auth-enabled instance 401'd the NEW pairing command (real Mac report).
        if (p === '/agentd.js' || p === '/agentd-install.sh' || p === '/agentd-install.ps1'
          || p === '/vibespace-device.js' || p === '/vibespace-device-install.sh' || p === '/vibespace-device-install.ps1') return next();
        if (p === '/api/agentd-dial') return next();
        // Node runtime mirror for the installer (2.246.0): the device fetches it
        // BEFORE it has any node — let alone a cookie. Read-only, allowlisted.
        if (p.startsWith('/vibespace-node/')) return next();
        // Telemetry collector ingest: remote VibeSpace instances authenticate
        // with the shared Bearer token — the ROUTE enforces it (404 when the
        // collector is off, 403 on a bad token); no cookie exists on the sender.
        if (p === '/api/telemetry/ingest') return next();
        // The maintainer hub's feedback doors (lane feedback-forward): another instance forwards an agent's report and pulls
        // the maintainer's marks back with the SAME shared Bearer token + its own origin key — the ROUTE judges both
        // (src/routes/feedback.js: the collector's verdict, 404 off / 403 bad token); no cookie exists on the sender. The
        // method is exact: PATCH /api/feedback/:id (the owner's) stays the cookie's. Pinned by test-auth's DOORS row.
        if ((req.method === 'POST' && p === '/api/feedback/forward') || (req.method === 'GET' && p === '/api/feedback/forward/marks')) return next();
        // CSP reports (lane app-page-csp, design q-043 D6): a browser posts what the app page's report-only policy would
        // block with NO cookie, and a sandboxed frame's report with `Origin: null` — so neither the cookie nor the same-origin
        // rule can judge it. The ROUTE judges its own (src/server/csp-reports.js): a report content type only (a page on
        // another site cannot send one without a preflight), 32 KB, a per-address pace. POST exactly. Pinned by test-auth's
        // DOORS row and scripts/test-csp-report.mjs.
        if (req.method === 'POST' && p === '/api/csp-report') return next();
        // THE PREVIEW'S FOLDER (lane frame-host-preview, B-5b2c): the code editor's HTML preview is an opaque frame (no
        // allow-same-origin) and its requests carry NO cookie (measured: SameSite=Lax, Sec-Fetch-Site cross-site) — its
        // page's own files come from /frame-host/f/<token>/…, the token minted on the SIGNED-IN navigation for ONE folder.
        // The ROUTE judges it (src/server/frame-host.js: a live token, a web file under that folder, no dot name, no symlink
        // out). GET exactly. Pinned by scripts/test-csp-report.mjs ⑧.
        if (req.method === 'GET' && /^\/frame-host\/f\/[A-Za-z0-9_-]{24}\//.test(p)) return next();
        // Path-mounted services (2.359.0): auth is PER MOUNT — the handler in
        // src/server/path-mounts.js enforces requestAuthed for private mounts
        // and lets `pathPublic` ones through (the shareable-link case). A
        // blanket cookie gate here would make public mounts impossible; the
        // per-mount check is pinned by scripts/test-path-mounts.mjs.
        if (p === '/svc' || p.startsWith('/svc/')) return next();
        // OTel truth ingest (2.361.0): the local claude CLI's OTLP exporter has
        // no cookie — src/server/otel-ingest.js enforces loopback remoteAddress
        // + the persisted x-vibespace-otel token as the ONLY gate (pinned by
        // scripts/test-otel-truth.mjs).
        if (p.startsWith('/otel/')) return next();
        // Published pages (2.364.0): auth is PER PAGE, same doctrine as /svc —
        // src/server/published-pages.js gates private pages via requestAuthed
        // and lets `public` ones through (the shareable-link case). Pinned by
        // scripts/test-published-pages.mjs.
        if (p.startsWith('/p/')) return next();
        // Slack consent landing (2.369.214, design 018): Slack / the relay page
        // sends the browser that pressed Allow here — often ANOTHER browser
        // profile with no cookie (a fleet user's Slack identity lives apart from
        // their SSO login), and the redirect to /login lost the code. The signed
        // STATE is the credential: src/routes/channels.js rate-limits per IP,
        // judges this boot's HMAC + age, finds a running public flow by the whole
        // state and exchanges once; the RECORD is still made by the owner's
        // cookied tab (connect {flowId}). GET + exactly /api/channels/oauth/cb/<kind>
        // — pinned by scripts/test-slack-landing-nologin.mjs.
        if (req.method === 'GET' && /^\/api\/channels\/oauth\/cb\/[^/]+$/.test(p)) return next();
        // THE WEBHOOK DOOR (lane webhook-l1-server, docs/design-webhook.zh.md §4): a caller is an external system holding its
        // own token — src/routes/webhook.js judges it (every refusal before a byte of the body). The WHOLE /hook prefix (any
        // method: a non-POST is its 405; /hook/<slug>/, /hook/<SLUG>, /hook/x/y are its misses — verify r1 #6, ONE shape), a
        // caller's GET of its own replies, and the pairing completion. Pinned by scripts/test-webhook-routes.mjs.
        if (/^\/hook(?:\/|$)/.test(p) || (req.method === 'GET' && /^\/api\/channels\/webhook\/[a-z0-9][a-z0-9-]{0,62}\/replies$/.test(p)) || (req.method === 'POST' && /^\/api\/channels\/webhook\/[a-z0-9][a-z0-9-]{0,62}\/pair$/.test(p))) return next();
        // ── THE SAME-ORIGIN RULE (lane owner-write-origin, B-6b2b): every other write rides the owner's cookie — or, on an
        // instance nobody signs in to, its open door — and must come from VibeSpace's own page; a page on another site
        // (a same-site sibling too: the fleet's pods share one domain) is refused by name, before any router ──
        const v = this.originVerdict(req);
        if (!v.ok) { this._logCrossSite(req, v); return res.status(403).json({ error: 'cross-site', origin: v.origin, own: v.own }); }
        if (!this.enabled) return next();
        // the login flow (logout revokes only the token it presents)
        if (p === '/login' || p === '/api/login' || p === '/api/clerk-login' || p === '/api/logout' || p === '/favicon.ico') return next();
        { const tok = Auth.cookieToken(req); if (this.checkToken(tok)) { this._slideCookie(req, res, tok); return next(); } }
        // Browsers navigating to pages get the login form; API calls get 401
        const wantsHtml = req.method === 'GET' && (req.headers.accept || '').includes('text/html');
        if (wantsHtml) return res.redirect('/login');
        res.status(401).json({ error: 'unauthorized' });
      };
    }
  }).middleware.call(shim);
};
