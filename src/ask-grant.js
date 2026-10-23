'use strict';
/**
 * PURE (imports nothing; CJS so the agent route, the For-you bundle and the suites share ONE spelling) — AN ASK THAT
 * NAMES A GRANT (lane controls-that-lie, naive study round 4 on 2.369.344, R1).
 *
 * Measured: an agent that could not reach a browser profile asked `vibespace-ask "Share 'Lark (company login)' with me"
 * --options "Granted access|Send it myself"`; the tray drew «Granted access» as a button, and pressing it only TYPED
 * those two words into the chat — no grant changed, the profile stayed invisible to the conversation. The law: what you
 * approve is what runs — a button named for an action performs it or does not exist. So:
 *
 *   · `vibespace-ask "…" --grant browser:<label|id>` files an item whose action is the grant ITSELF
 *     (`{type:'browser-grant', profileId, label}` — built by the agent route from the keeper's own list, never from the
 *     agent's words); the tray draws «Let this conversation use <label>», which writes «Who can use it» through the
 *     owner's own door (GET /api/browser/profiles/:id/use + the whole-list PATCH with its `base`) and THEN answers the
 *     agent (the reply road, `grantReplyText`) with the door it now has (`vibespace-browser use <id>`);
 *   · a family whose grant has another typed road is refused BY NAME with that road (nothing filed): a channel
 *     conversation (`vibespace-channels request`, whose card's Approve grants it), a machine (the owner's «Who can use
 *     it» on the machine row — no agent-side ask exists, so the agent asks in words);
 *   · a plain `--options` label is a REPLY and reads as one («Reply: <label>», src/lib/user-todos-row.js) — it never
 *     wears an action verb.
 */

const GRANT_FAMILIES = Object.freeze(['browser', 'channel', 'machine']);
// a family the hub does not grant from an ask: the road that does, named in the refusal (nothing is filed)
const OTHER_ROADS = Object.freeze({
  channel: 'a channel conversation is asked for with `vibespace-channels request <conv> "why"` — its card in the user\'s For you has an Approve that grants it',
  machine: 'a machine is opened to a conversation only by the user (Remote tab → the machine\'s exit icon → «Who can use it») — ask in words, and say which machine and why',
});
const REF_MAX = 120;

/** `--grant <family>:<what>` → {ok, family, ref} | {ok:false, code:'bad-grant', error} (the words an agent reads). */
function parseGrantSpec(raw) {
  const s = typeof raw === 'string' ? raw.trim() : '';
  const m = /^([a-z]+):(.+)$/s.exec(s);
  if (!m) return { ok: false, code: 'bad-grant', error: `--grant takes <family>:<what> (browser:<profile label or id>) — got "${s.slice(0, 60)}"; nothing was filed` };
  const family = m[1], ref = m[2].trim();
  if (!GRANT_FAMILIES.includes(family)) return { ok: false, code: 'bad-grant', error: `--grant ${family}: unknown family (one of ${GRANT_FAMILIES.join(' / ')}); nothing was filed` };
  if (OTHER_ROADS[family]) return { ok: false, code: 'bad-grant', error: `--grant ${family}: is not granted from an ask — ${OTHER_ROADS[family]}; nothing was filed` };
  if (!ref || ref.length > REF_MAX) return { ok: false, code: 'bad-grant', error: `--grant ${family}: names no ${family === 'browser' ? 'profile' : 'target'} (1–${REF_MAX} characters); nothing was filed` };
  return { ok: true, family, ref };
}

/** The profile an ask names, from the keeper's list (`profiles` = [{id, label, ephemeral?}…]): its id exactly, else its
 *  label (case-insensitive) → {ok, profile:{id, label}} | {ok:false, code, error}. A conversation's own temporary
 *  browser has no «Who can use it» — refused by name. */
function browserGrantTarget(profiles, ref) {
  const rows = Array.isArray(profiles) ? profiles.filter((p) => p && typeof p.id === 'string') : [];
  const want = String(ref || '').trim();
  let hits = rows.filter((p) => p.id === want);
  if (!hits.length) hits = rows.filter((p) => String(p.label || '').trim().toLowerCase() === want.toLowerCase());
  if (!hits.length) return { ok: false, code: 'grant-not-found', error: `--grant browser:${want}: no browser profile has that label or id — \`vibespace-browser profiles\` lists them; nothing was filed` };
  if (hits.length > 1) return { ok: false, code: 'grant-ambiguous', error: `--grant browser:${want}: ${hits.length} profiles carry that label (${hits.map((p) => p.id).join(', ')}) — name one by its id; nothing was filed` };
  const p = hits[0];
  if (p.ephemeral) return { ok: false, code: 'grant-not-editable', error: `--grant browser:${want}: ${p.id} is a conversation's own temporary browser — it has no «Who can use it»; nothing was filed` };
  return { ok: true, profile: { id: p.id, label: String(p.label || p.id).slice(0, 120) } };
}

/** The item's fields for a resolved target: its action (the store's `normalizeAction` shape: flat strings) — the GRANT
 *  the button performs (test-approval-census row `browser-grant`). */
function grantItemFields(profile) {
  return { action: { type: 'browser-grant', profileId: String(profile.id), label: String(profile.label || profile.id).slice(0, 120) } };
}

/**
 * THE PRESS, planned: what the owner's «Who can use it» PATCH must carry so THIS conversation may use the profile.
 * `view` = GET /api/browser/profiles/:id/use's answer ({use:{mode, who:[…]}, base}); `sessionId` = the asking
 * conversation's live webui id. → {already:true} (All agents, or this conversation is on the list) |
 * {use, base} (the whole list + this conversation, as the dialog's wire rows) | {error:'unknown'|'no-session'}.
 */
function grantUseBody(view, sessionId) {
  const sid = typeof sessionId === 'string' ? sessionId : '';
  if (!sid) return { error: 'no-session' };
  const use = view && view.use && typeof view.use === 'object' ? view.use : null;
  if (!use || use.mode === 'unknown') return { error: 'unknown' };
  if (use.mode === 'all') return { already: true };
  const who = Array.isArray(use.who) ? use.who : [];
  if (who.some((w) => w && w.kind === 'session' && w.sessionId === sid)) return { already: true };
  const wire = who.map((w) => (w && w.kind === 'task' ? { kind: 'task', id: String(w.id) } : w && w.kind === 'session' && w.key ? { kind: 'session', key: String(w.key) } : null)).filter(Boolean);
  return { use: { mode: 'only', who: [...wire, { kind: 'session', session: sid }] }, base: view.base };
}

/** THE ANSWER the agent reads (agent-facing, English — the reply road quotes the item above it): the grant that ran
 *  (or that it was already open), and the door it now has. */
function grantReplyText({ label, profileId, already = false } = {}) {
  const l = String(label || profileId || ''), id = String(profileId || '');
  return (already
    ? `Already allowed — the browser profile «${l}» (${id}) was open to this conversation before you asked (\`vibespace-browser profiles\` lists what you may use).`
    : `Granted — this conversation may now use the browser profile «${l}» (${id}).`)
    + ` Attach it with \`vibespace-browser use ${id}\`.`;
}

module.exports = { GRANT_FAMILIES, OTHER_ROADS, parseGrantSpec, browserGrantTarget, grantItemFields, grantUseBody, grantReplyText };
