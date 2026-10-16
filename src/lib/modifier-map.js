'use strict';
// THE PRIMARY MODIFIER — PURE (imports nothing; CJS so src/browser-takeover.js — the agent-browser live view's ⌘ chords —
// requires it and esbuild bundles it into the client beside src/lib/xpra-view.js). The owner, 2026-10-16 (the follow-up of
// inc-mvaddc4m-6m0t): 「根据 host+client 两边自动判断」 — a VIEWER's primary modifier becomes the HOST's, decided from BOTH
// platforms, never by a setting or a per-window toggle. The MODIFIER is moved, so every chord follows (⌘+C / V / X / A / Z,
// ⌘+click = Ctrl+click) — never a list of letters.
//
// THE TABLE (PRIMARY_MODIFIER_ROWS: viewer × host, 4 × 4 — a row names only the modifiers it moves, with its reason):
//   viewer mac            + host linux | windows | unknown  ⇒ meta → control   (⌘ is a Mac's primary, Ctrl is theirs)
//   viewer windows|linux  + host mac                        ⇒ control → meta   (the future single-app macOS windows, q-024)
//   same family (mac with mac; windows and linux together)  ⇒ identity
//   host unknown = linux (every xpra desktop-app display is Linux today) · viewer unknown = identity (its keys as pressed)
// Control stays control (on a Mac viewer both ⌘ and Ctrl reach a Linux host as Ctrl); alt stays alt — Option is NOT
// AltGr here (xpra-html5's macOS default makes it one: Option+a stays å through the IME slots, lane xpra-ime-mac).
//
//   platformOf(s)                      → 'mac' | 'windows' | 'linux' | 'unknown' — from navigator.userAgentData.platform,
//                                        navigator.platform, a user agent, node's process.platform or one of the four words
//   primaryModifierMap({viewer, host}) → { shift, control, alt, meta }: each modifier's name on the host (frozen)
//   applyModifierMap(mods, map)        → THE ONLY TRANSFORM: a NEW modifier state (`mods` untouched; other fields such as
//                                        altGraph / capsLock / numLock pass as they are)
//   modifierKeyOf(k, map)              → a modifier KEY's own DOM spelling on the host — { key, code, keyCode } (a ⌘
//                                        keydown is a Control keydown, its side kept) — or null (no modifier key, or unmoved)
//
// THE DOORS (test-modifier-map's census: each imports this file and calls it; a second modifier table under src/ is RED):
//   src/lib/xpra-view.js       keys and pointer into an xpra app window (host = the record's platform, else unknown)
//   src/browser-takeover.js    macChord — the agent-browser live view (a Mac viewer on a non-Mac browser)

const PLATFORMS = Object.freeze(['mac', 'windows', 'linux', 'unknown']);
const MODIFIERS = Object.freeze(['shift', 'control', 'alt', 'meta']);

const row = (viewer, host, moves, why) => Object.freeze({ viewer, host, moves: Object.freeze(moves), why });
const PRIMARY_MODIFIER_ROWS = Object.freeze([
  row('mac', 'linux', { meta: 'control' }, 'a Mac\'s primary modifier is ⌘, Linux\'s is Ctrl: ⌘+C copies there, ⌘+click is Ctrl+click'),
  row('mac', 'windows', { meta: 'control' }, 'a Mac\'s primary modifier is ⌘, Windows\' is Ctrl'),
  row('mac', 'unknown', { meta: 'control' }, 'a host that names no platform is Linux — every xpra desktop-app display is'),
  row('mac', 'mac', {}, 'same family: ⌘ is ⌘ on both'),
  row('windows', 'mac', { control: 'meta' }, 'Windows\' primary modifier is Ctrl, a Mac\'s is ⌘ (single-app macOS windows, q-024)'),
  row('windows', 'linux', {}, 'same family: Ctrl is the primary on both'),
  row('windows', 'windows', {}, 'same platform'),
  row('windows', 'unknown', {}, 'an unnamed host is Linux: same family'),
  row('linux', 'mac', { control: 'meta' }, 'Linux\'s primary modifier is Ctrl, a Mac\'s is ⌘ (single-app macOS windows, q-024)'),
  row('linux', 'linux', {}, 'same platform'),
  row('linux', 'windows', {}, 'same family: Ctrl is the primary on both'),
  row('linux', 'unknown', {}, 'an unnamed host is Linux: same platform'),
  row('unknown', 'mac', {}, 'a viewer that names no platform keeps its keys as pressed'),
  row('unknown', 'linux', {}, 'a viewer that names no platform keeps its keys as pressed'),
  row('unknown', 'windows', {}, 'a viewer that names no platform keeps its keys as pressed'),
  row('unknown', 'unknown', {}, 'a viewer that names no platform keeps its keys as pressed'),
]);

/** A platform string → one of PLATFORMS. Mac first: node's 'darwin' holds "win". */
function platformOf(s) {
  const t = String(s == null ? '' : s).trim();
  if (PLATFORMS.includes(t)) return t;
  if (/mac|darwin|iphone|ipad|ipod|\bios\b/i.test(t)) return 'mac';
  if (/^win|windows/i.test(t)) return 'windows';
  if (/linux|x11|\bcros\b|chrome ?os|chromium ?os|android|bsd/i.test(t)) return 'linux';
  return 'unknown';
}

const MAPS = new Map(PRIMARY_MODIFIER_ROWS.map((r) => [`${r.viewer}>${r.host}`, Object.freeze(Object.fromEntries(MODIFIERS.map((m) => [m, r.moves[m] || m])))]));
/** The row of (viewer, host) as a whole map — each modifier's name on the host. */
function primaryModifierMap({ viewer = 'unknown', host = 'unknown' } = {}) {
  return MAPS.get(`${platformOf(viewer)}>${platformOf(host)}`);
}

/** THE ONLY TRANSFORM: each held modifier lands on its host name (two that land on one name hold it once). */
function applyModifierMap(mods, map) {
  const m = mods || {}, out = {};
  for (const k of Object.keys(m)) out[k] = MODIFIERS.includes(k) ? false : m[k];
  for (const k of MODIFIERS) if (m[k]) out[map && MODIFIERS.includes(map[k]) ? map[k] : k] = true;
  return out;
}

// a modifier key's DOM spelling: the key name, and its keyCode (`code` = the name + its side, Left / Right)
const KEY_SPELLING = Object.freeze({ shift: ['Shift', 16], control: ['Control', 17], alt: ['Alt', 18], meta: ['Meta', 91] });
const KEY_WORDS = Object.freeze({ Shift: 'shift', Control: 'control', Alt: 'alt', Meta: 'meta', OS: 'meta' });
/** A pressed modifier KEY on the host: its own modifier moved through applyModifierMap, spelled as that key. */
function modifierKeyOf(k, map) {
  const key = String((k && k.key) || ''), code = String((k && k.code) || '');
  const c = /^(Shift|Control|Alt|Meta|OS)(Left|Right)$/.exec(code);
  const own = c ? KEY_WORDS[c[1]] : (Object.hasOwn(KEY_WORDS, key) ? KEY_WORDS[key] : null);
  if (!own) return null;
  const moved = applyModifierMap({ [own]: true }, map);
  const to = MODIFIERS.find((m) => moved[m]);
  if (!to || to === own) return null;
  return { key: KEY_SPELLING[to][0], code: KEY_SPELLING[to][0] + (c ? c[2] : 'Left'), keyCode: KEY_SPELLING[to][1] };
}

module.exports = { PLATFORMS, MODIFIERS, PRIMARY_MODIFIER_ROWS, platformOf, primaryModifierMap, applyModifierMap, modifierKeyOf };
