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

/** a colour the page may wear, or null — only spaces and tabs are trimmed: a newline (or any other byte) beside a colour is NO colour
 *  (r4467: anything else writes nothing; test-viewport-class ⑤e's «#fff\n» row) */
function cleanGround(v) { const s = String(v == null ? '' : v).replace(/^[ \t]+|[ \t]+$/g, ''); return s.length <= 40 && COLOR_RE.test(s) ? s : null; }

/** a colour (this one strict rule; anything else = today's dark) → [r, g, b] */
function rgbOf(colour) {
  const g = cleanGround(colour) || DARK;
  if (g[0] === '#') { let h = g.slice(1); if (h.length <= 4) h = [...h].map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); }
  return g.match(/\d+/g).slice(0, 3).map(Number);   // rgb() / rgba(): its three channels (the rule bounds each to 0–255)
}
/** WCAG's relative luminance of [r, g, b] (0 black – 1 white) */
function luminance(rgb) { const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
/** WCAG's contrast ratio of two colours (1–21) */
function contrast(a, b) { const [x, y] = [luminance(rgbOf(a)), luminance(rgbOf(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }
/** a LIGHT ground: dark words read better on it than light ones (WCAG's crossing, luminance 0.179) */
function lightGround(ground) { const g = cleanGround(ground); return !!g && luminance(rgbOf(g)) > 0.179; }
/** THE WORDS OVER A LIGHT GROUND (r4681 required 2 — the loading screen's words were drawn for the dark ground: the stuck-start line and
 *  its Reload button, the one a person needs when the hub is silent, were near unreadable on a light one). withGround marks the loading
 *  screen data-ground="light" and darkens its text and its track; src/lib/boot-splash.js draws the line and the button in these */
const ON_LIGHT = Object.freeze({ text: '#1e293b', line: '#334155', accent: '#0f766e', track: 'rgba(15,23,42,0.12)' });

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
    .replace(/(<div id="loading-screen" style="[^"]*?)background:#0c0c18;/, `$1background:${g};`)
    .replace(/(<div id="loading-screen" style="[^"]*?)color:#e2e8f0;/, (m, a) => (lightGround(g) ? `${a}color:${ON_LIGHT.text};` : m))
    .replace('<div style="width:120px;height:3px;background:rgba(255,255,255,0.07);', (m) => (lightGround(g) ? `<div style="width:120px;height:3px;background:${ON_LIGHT.track};` : m))
    .replace('<div id="loading-screen" style="', (m) => (lightGround(g) ? '<div id="loading-screen" data-ground="light" style="' : m));
}

/** the cookie the client writes when a theme applies (a year, the whole origin, never sent cross-site) — its input is the page's
 *  computed --bg-root, whose whitespace (a stylesheet's line break) is the style's own: trimmed whole here, the cookie holds the colour */
function cookieFor(ground) { const g = cleanGround(String(ground == null ? '' : ground).trim()); return g ? `${COOKIE}=${encodeURIComponent(g)}; path=/; max-age=31536000; SameSite=Lax` : null; }

/** THE CLEARING COOKIE (r4681 required 3): a theme whose ground is no plain colour (an hsl(), a name, color-mix()) left the PREVIOUS
 *  theme's ground in the cookie, so the next launch wore it; it now clears it — the launch falls back to today's dark */
const CLEAR = `${COOKIE}=; path=/; max-age=0; SameSite=Lax`;
/** the cookie a theme's apply writes: its ground, else the clearing one */
function groundCookie(ground) { return cookieFor(ground) || CLEAR; }

module.exports = { COOKIE, DARK, COLOR_RE, CLEAR, ON_LIGHT, cleanGround, groundOf, withGround, cookieFor, groundCookie, rgbOf, luminance, contrast, lightGround };
