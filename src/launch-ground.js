'use strict';
// THE LAUNCH WEARS THE STORED THEME'S GROUND (B-78db, 主开发 r4463 fault 2 — the simulator: under the light theme the launch showed our dark
// ground and loading screen for about a second before a light app). The theme lives in the page's localStorage, which nothing reads before the
// first paint without a script (the page's policy: script-src 'self'; an external script before the paint would lengthen the very wait). So the
// SERVER writes it: when a theme applies, the client remembers its ground in ONE cookie (src/lib/themes.js), and the index route, which already
// rewrites the page for its ?v= stamps (server.js), writes that ground into <html>'s inline style and the loading screen's — from the very first
// paint, custom and plugin themes included. No cookie (a first launch): today's dark. PURE: no fs, no DOM.
// THE VALUE IS A COLOUR OR NOTHING: a hex or an rgb()/rgba() of plain numbers; anything else (a word, a url(), a quote, a semicolon) is refused
// — it is written into an attribute of the page every client is served.
const COOKIE = 'vs_ground';
const DARK = '#0c0c18';   // the release's own ground (public/index.html)
const CH = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';   // one rgb channel, 0–255
/** THE ONE STRICT PATTERN (主开发 r4467): a hex of 3, 4, 6 or 8 digits, or rgb() / rgba() of three 0–255 channels (and an alpha 0–1) — nothing else */
const COLOR_RE = new RegExp(`^(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|rgba?\\(\\s*${CH}\\s*,\\s*${CH}\\s*,\\s*${CH}\\s*(,\\s*(0|1|0?\\.\\d{1,4})\\s*)?\\))$`);

/** a colour the page may wear, or null */
function cleanGround(v) { const s = String(v == null ? '' : v).trim(); return s.length <= 40 && COLOR_RE.test(s) ? s : null; }

/** the Cookie header → the remembered ground, or null */
function groundOf(cookieHeader) {
  for (const part of String(cookieHeader || '').split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    if (part.slice(0, i).trim() !== COOKIE) continue;
    let v = part.slice(i + 1).trim(); try { v = decodeURIComponent(v); } catch { return null; }
    return cleanGround(v);
  }
  return null;
}

/** the page with its two launch grounds (<html>'s inline style, the loading screen's) in `ground`; unchanged without one */
function withGround(html, ground) {
  const g = cleanGround(ground);
  if (!g || g === DARK) return html;
  return String(html)
    .replace(`<html lang="en" style="background:${DARK}">`, `<html lang="en" style="background:${g}">`)
    .replace(/(<div id="loading-screen" style="[^"]*?)background:#0c0c18;/, `$1background:${g};`);
}

/** the cookie the client writes when a theme applies (a year, the whole origin, never sent cross-site) */
function cookieFor(ground) { const g = cleanGround(ground); return g ? `${COOKIE}=${encodeURIComponent(g)}; path=/; max-age=31536000; SameSite=Lax` : null; }

module.exports = { COOKIE, DARK, COLOR_RE, cleanGround, groundOf, withGround, cookieFor };
