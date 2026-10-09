'use strict';
/**
 * LANE BROWSER-RECIPES (2026-10-02, userR's pod) — PURE (imports only the PURE src/browser-display.js; CJS so the
 * status route, the /resolve refusal and the tools intro share ONE spelling). The incident: asked to work "in the
 * Chrome logged in as <her>", the agent ran `vibespace-browser status`, read only what it could NOT do (no profile,
 * ephemeral), launched the system chromium itself and died on "Missing X server or $DISPLAY". Every surface that tells
 * an agent what it lacks now also names the recipe (the manual's §0) — and, on a machine with no display, that only
 * `vibespace-browser` works there.
 *
 *   RECIPE_POINTER     the `status` line's pointer (a conversation on its own ephemeral browser)
 *   FIRST_VERB_NEXT    a page verb refused while this conversation has no browser yet (its first command)
 *   DESKTOP_APP_POINTER  lane e2a: the desktop-app rung's door — a clause of RECIPE_POINTER (so `status` and the first verb name it)
 *   USER_SENTENCE      the manual §0 (a)'s words to the user, verbatim (the gate pins the manual against it)
 *   INTRO_CLAUSE       the ONE clause the tools intro's Browsing line gained
 *   noDisplayRung      where a browser of this machine runs when it has NO display — from a launch's recorded fact
 *                      (it says what happened) else a probe's verdict (nothing launched yet: the launch decides)
 *   noDisplayLine      the agent's sentence for it ('' = a display is here, or nothing is known)
 *   INTRO_NO_DISPLAY   the same fact as a clause of the intro line
 *   REMOTE_POINTER / FIRST_VERB_NEXT_REMOTE / INTRO_REMOTE_CLAUSE   the same three surfaces for a conversation on ANOTHER
 *                      machine (verify r1 F1): `new` / `use` answer `remote_session` there and it has no live view — the login
 *                      needs a conversation on the VibeSpace machine; the recipe is never offered where it cannot be followed
 */
const D = require('./browser-display.js');

const MANUAL_REF = 'vibespace-docs browser §0';
// lane e2a (design-agent-browser-v2 §E2, D1): the ONE door to a desktop browser of the agent's own — the ladder's lowest rung
const DESKTOP_APP_POINTER = 'a site the agent browser cannot reach: `vibespace-browser new <label> --backend desktop-app [--url <https://…>]` opens a real desktop browser beside your chat — no CDP, you drive it with `vibespace-window` (snapshot / click / type)';
const RECIPE_POINTER = `to work in a browser the user is logged in to: \`vibespace-browser new "<site> — <user>'s login"\` + \`use\` it, then the user logs in once through the live view (the Agent browser window) ; ${DESKTOP_APP_POINTER} — ${MANUAL_REF}`;
const FIRST_VERB_NEXT = `this conversation has no browser yet — the refusal above names the next step; ${RECIPE_POINTER}. Never launch a browser yourself (chromium, google-chrome, playwright): VibeSpace cannot show it to the user`;
const USER_SENTENCE = 'Open the Agent browser window and take over to log in; I will continue once you hand it back';
const INTRO_CLAUSE = `a login the user has → \`vibespace-browser new "<site> — <user>'s login"\` + \`use\` it, and they log in once in the live view (${MANUAL_REF}) — never ask for a password`;
const INTRO_NO_DISPLAY = 'this machine has no display: only `vibespace-browser` works here (a hidden window, or headless) — never launch chromium / google-chrome / playwright yourself';
// verify r1 F1: a conversation on ANOTHER machine (an ssh host / a paired device — rung H): `new` / `use` answer `remote_session`
// there and that machine has no live view, so the recipe above cannot be followed from it — the pointer says so instead
const REMOTE_POINTER = `this conversation runs on another machine — a profile (\`new\` / \`use\`) and the live view are the VibeSpace machine's, so a login the user has cannot be made from here: ask the user for a conversation on the VibeSpace machine (${MANUAL_REF} (a)); never ask for a password`;
const FIRST_VERB_NEXT_REMOTE = `this conversation has no browser yet — the refusal above names the next step; ${REMOTE_POINTER}. Never launch a browser yourself (chromium, google-chrome, playwright): VibeSpace cannot show it to the user`;
const INTRO_REMOTE_CLAUSE = `a login the user has → not from here: this conversation runs on another machine, a profile (\`vibespace-browser new\`) and the live view are the VibeSpace machine's — ask the user for a conversation there (${MANUAL_REF}) — never ask for a password`;

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/** 'hidden-window' | 'headless' | 'either' (probed, nothing launched: the launch decides) | null (a display is here / unknown). */
function noDisplayRung({ fact = null, display = null } = {}) {
  if (isObj(fact)) {
    const c = D.factCode(fact);
    if (c === 'hidden-window' || c === 'headless') return c;
    return fact.kind === 'none' ? 'headless' : null; // no window was asked of a machine without one — it ran headless
  }
  return isObj(display) && display.kind === 'none' ? 'either' : null;
}
const RUNG_WORDS = Object.freeze({ 'hidden-window': 'a hidden window', headless: 'headless', either: 'a hidden window, or headless' });
function noDisplayLine(facts = {}) {
  const r = noDisplayRung(facts);
  return r ? `this machine has no display — only vibespace-browser works here (${RUNG_WORDS[r]}); do not launch a browser yourself: chromium, google-chrome or playwright started by hand die without a DISPLAY, and VibeSpace cannot show them to the user [no_display]` : '';
}

module.exports = { MANUAL_REF, RECIPE_POINTER, DESKTOP_APP_POINTER, FIRST_VERB_NEXT, USER_SENTENCE, INTRO_CLAUSE, INTRO_NO_DISPLAY, REMOTE_POINTER, FIRST_VERB_NEXT_REMOTE, INTRO_REMOTE_CLAUSE, noDisplayRung, noDisplayLine };
