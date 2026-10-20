'use strict';
// THE VAULT'S BLOCKED LIST (lane vault-locked-refusal-notice — the owner 2026-10-20: "为啥老是有 agent 和我说需要解锁 vault，这个
// 不是应该系统检测到 agent 被阻拦了然后提醒我解锁吗"). A `vault_locked` refusal IS the signal: every door that refuses one notes
// WHO it stopped and WHAT (`note`, through the engine's ONE helper `vault.blocked(actor, verb)` — src/server/vault-engine.js),
// the hub tells the owner ONCE (the one For-you item src/server/vault-hooks.js keeps refreshed + the lock strip's count),
// and the agent is told the owner already knows (`AGENT_WORDS` / `agentWords`) — it never asks them to unlock.
//   · a row per ACTOR — a NAME a person reads (a conversation's name, a machine's, a channel account's label, «the relay»,
//     «VibeSpace» for a store's own read), never a bare id (`actorName`) — with its VERBS (what it was refused:
//     `vibespace-api conversations.rename`, `device link`, `the accounts store`), its first and last refusal, how many;
//   · KEYED BY THE LOCK EPOCH (the engine's `epoch`, bumped at every unlock and lock): a note from another epoch starts the
//     list afresh, and the unlock clears it;
//   · BOUNDED: ≤ 50 actors × ≤ 8 verbs each; the rest a count (`more` = refusals past the table, `moreVerbs` on a row);
//   · `fresh` = the note changed what the owner reads (a new actor, a new verb, the first refusal past a bound) — the hub
//     refreshes its one item only then, so a door that refuses every second refreshes nothing.
// PURE: imports nothing (scripts/test-architecture.mjs PURE set).

const MAX_ACTORS = 50;
const MAX_VERBS = 8;
const NAME_MAX = 80;
const VERB_MAX = 80;
const LIST_MAX = 4;      // actors the item's one line names; the rest are its detail lines
const DETAIL_ROWS = 11;  // detail lines (the store keeps ≤ 12 i18n lines: these + the «more» line)
const HUB = 'VibeSpace';  // the hub itself — a store's own key read, a sealed file
/** An id is never a name: a uuid, a prefixed id (sess- host- dial- …), a backend:id session key, a long hex run. */
const ID_SHAPED = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?:sess|host|dial|webui|job|pf|ak|ut|g|c|T)-[\w-]{3,}|(?:claude|codex|opencode|gemini|webui|session|group):[\w.-]+|[0-9a-f]{12,})$/i;
const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
/** A NAME a person reads, or `fallback` — an empty or id-shaped string never stands for a name. */
function actorName(name, fallback = 'a conversation') {
  const s = clean(name, NAME_MAX);
  return s && !ID_SHAPED.test(s) ? s : fallback;
}

/** THE WORDS TOWARD AN AGENT (every agent-facing `vault_locked` refusal — the automation door, the vault doors, a channel's
 *  sign-in, the CLIs and the manuals): the owner already knows; the agent never asks. The code stays `vault_locked`. */
const TOLD = 'the user has already been told (their For you tray names what is waiting on it) — do not ask them to unlock it or for its password: wait, or do other work, and try again later';
const AGENT_WORDS = `the vault is locked — ${TOLD}`;
/** `what` = what waits (`every automation waits until the user unlocks it on this instance's page`). */
const agentWords = (what) => (what ? `the vault is locked — ${what}; ${TOLD}` : AGENT_WORDS);

function createBlocked() {
  let epoch = null;
  const rows = new Map();   // actor → { actor, verbs, moreVerbs, first, last, n }
  let more = 0, refusals = 0;
  const reset = (e) => { rows.clear(); more = 0; refusals = 0; epoch = e; };
  /** One refusal. → { fresh, count } (`fresh` = what the owner reads changed). */
  function note({ actor, verb, at = 0, epoch: e = null } = {}) {
    if (e !== epoch) reset(e);
    const a = actorName(actor, 'an unnamed caller');
    const v = clean(verb, VERB_MAX) || 'a stored credential';
    const t = Number(at) || 0;
    refusals++;
    let row = rows.get(a), fresh = false;
    if (!row) {
      if (rows.size >= MAX_ACTORS) { more++; return { fresh: more === 1, count: rows.size }; }
      row = { actor: a, verbs: [], moreVerbs: 0, first: t, last: t, n: 0 };
      rows.set(a, row);
      fresh = true;
    }
    row.n++; row.last = Math.max(row.last, t);
    if (!row.verbs.includes(v)) {
      if (row.verbs.length < MAX_VERBS) { row.verbs.push(v); fresh = true; } else { row.moreVerbs++; if (row.moreVerbs === 1) fresh = true; }
    }
    return { fresh, count: rows.size };
  }
  /** → { epoch, count (actors), refusals, more, actors: [{ actor, verbs, moreVerbs, first, last, n }] } — in the order they
   *  were first refused. */
  function summary() {
    return { epoch, count: rows.size, refusals, more, actors: [...rows.values()].map((r) => ({ ...r, verbs: [...r.verbs] })) };
  }
  return { note, summary, count: () => rows.size, clear: () => reset(null) };
}

/** The one item's words from a summary: `who` = the line's list (≤ LIST_MAX actors, the hub last, `…` when there are more),
 *  `lines` = one detail line per actor ({who, what} — ≤ DETAIL_ROWS) + `more` (actors past them, refusals past the table). */
function itemWords(s) {
  const all = (s && Array.isArray(s.actors) ? s.actors : []).slice();
  all.sort((x, y) => (x.actor === HUB) - (y.actor === HUB));   // stable: the named callers first, VibeSpace's own reads last
  const what = (r) => r.verbs.join(', ') + (r.moreVerbs ? ', …' : '');
  const label = (r) => `${r.actor} (${what(r)})`;
  const rest = all.length > LIST_MAX || (s && s.more > 0);
  const who = all.slice(0, LIST_MAX).map(label).join(' · ') + (rest ? ' · …' : '');
  const lines = all.slice(0, DETAIL_ROWS).map((r) => ({ who: r.actor, what: `${what(r)} · ${r.n}×` }));
  return { who: who.slice(0, 560), lines, moreActors: Math.max(0, all.length - DETAIL_ROWS), moreRefusals: (s && s.more) || 0 };
}

module.exports = { createBlocked, actorName, itemWords, agentWords, AGENT_WORDS, TOLD, HUB, MAX_ACTORS, MAX_VERBS, LIST_MAX, DETAIL_ROWS, ID_SHAPED };
