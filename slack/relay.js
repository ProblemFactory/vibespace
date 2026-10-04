// THE SLACK RELAY PAGE (VibeSpace design 018) — a STATIC page on an https host (the project's GitHub Pages, or a
// fleet's admin host) that Slack redirects a member to after Allow. It holds no key, verifies nothing, calls nobody and
// stores nothing: it reads the CLEAR part of `state` (`v1.<base64url {u, f, t}>.<sig>` — `u` = the VibeSpace the member
// started from) and sends the browser back to `<u>/api/channels/oauth/cb/slack?<the query verbatim>` ONLY when `u` is
// on a private network (or an https host under this page's `data-allow` suffixes); otherwise it shows the code to paste
// back. The instance checks the signature. The rule below is src/channels/slack-manifest.js `relayTargetVerdict`, kept
// equal to it by scripts/test-slack-relay.mjs (one table, both functions).
(function (root) {
  'use strict';
  var CALLBACK_PATH = '/api/channels/oauth/cb/slack';
  var PRIVATE_SUFFIXES = ['.local', '.lan', '.home', '.localhost'];
  function originOf(o) {
    if (typeof o !== 'string' || !o || o.length > 300) return null;
    var u;
    try { u = new URL(o); } catch (e) { return null; }
    if ((u.protocol !== 'http:' && u.protocol !== 'https:') || u.username || u.password || u.origin !== o) return null;
    return u.origin;
  }
  function privateHost(host) {
    var h = String(host || '').toLowerCase();
    if (h === 'localhost') return true;
    var v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
    if (v4) {
      var o = v4.slice(1).map(Number);
      if (o.some(function (x) { return x > 255; })) return false;
      return o[0] === 127 || o[0] === 10 || (o[0] === 172 && o[1] >= 16 && o[1] <= 31) || (o[0] === 192 && o[1] === 168);
    }
    if (h.charAt(0) === '[' && h.charAt(h.length - 1) === ']') { var a = h.slice(1, -1); return a === '::1' || /^f[cd][0-9a-f]{0,2}:/.test(a); }
    return PRIVATE_SUFFIXES.some(function (x) { return h.length > x.length && h.slice(-x.length) === x; });
  }
  function relayTargetVerdict(origin, opts) {
    var allow = (opts && Array.isArray(opts.allow)) ? opts.allow : [];
    var o = originOf(origin);
    if (!o) return 'show-code';
    var host = new URL(o).hostname.toLowerCase();
    if (privateHost(host)) return 'redirect';
    if (o.indexOf('https://') !== 0) return 'show-code';
    for (var i = 0; i < allow.length; i++) {
      var x = String(allow[i] || '').toLowerCase().replace(/^\.+/, '');
      if (x && /^[a-z0-9.-]{3,253}$/.test(x) && x.indexOf('.') >= 0 && (host === x || host.slice(-(x.length + 1)) === '.' + x)) return 'redirect';
    }
    return 'show-code';
  }
  /** The `u` of a state's clear part, or null (any other shape). */
  function stateOrigin(state) {
    var m = /^v1\.([A-Za-z0-9_-]{8,800})\.([A-Za-z0-9_-]{16,128})$/.exec(String(state || ''));
    if (!m) return null;
    try {
      var b = m[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b.length % 4) b += '=';
      var j = JSON.parse(atob(b));
      return j && typeof j.u === 'string' && j.u ? j.u : null;
    } catch (e) { return null; }
  }
  /** What the page does with a query: `{act:'redirect', to}` | `{act:'show-code', code}` | `{act:'denied'}` | `{act:'nothing'}`. */
  function decide(search, allow) {
    var s = String(search || '');
    var q = new URLSearchParams(s);
    var code = q.get('code'), error = q.get('error');
    var u = stateOrigin(q.get('state'));
    if (u && (code || error) && relayTargetVerdict(u, { allow: allow || [] }) === 'redirect') return { act: 'redirect', to: originOf(u) + CALLBACK_PATH + (s.charAt(0) === '?' ? s : '?' + s) };
    if (code && /^[A-Za-z0-9._-]{8,300}$/.test(code)) return { act: 'show-code', code: code };
    return { act: error ? 'denied' : 'nothing' };
  }
  root.VibeSpaceRelay = { CALLBACK_PATH: CALLBACK_PATH, PRIVATE_SUFFIXES: PRIVATE_SUFFIXES, originOf: originOf, privateHost: privateHost, relayTargetVerdict: relayTargetVerdict, stateOrigin: stateOrigin, decide: decide };
  if (typeof document === 'undefined' || !root.location) return;
  var allow = String(document.documentElement.getAttribute('data-allow') || '').split(/\s+/).filter(Boolean);
  var d = decide(root.location.search, allow);
  if (d.act === 'redirect') { root.location.replace(d.to); return; }
  var show = function (id) { var el = document.getElementById(id); if (el) el.hidden = false; };
  if (d.act === 'show-code') {
    document.getElementById('code').textContent = d.code;
    show('paste');
    document.getElementById('copy').onclick = function () {
      var done = function () { document.getElementById('copied').hidden = false; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(d.code).then(done, function () {});
    };
  } else show(d.act === 'denied' ? 'denied' : 'nothing');
})(typeof globalThis !== 'undefined' ? globalThis : this);
