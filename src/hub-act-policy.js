'use strict';
/**
 * PURE (imports nothing; CJS — the hub's asker, its routes, src/exit-reach.js and the browser bundle share one copy) — ON A
 * CLUSTER INSTANCE, A HUB ACT NOBODY CLICKED ASKS THE OWNER FIRST (lane hub-act-ask, design q-042 §3 D4 the asking half, owner
 * decision ② 2026-10-19).
 *
 * Lane device-act-audit made every hub act on a paired machine name WHO asked (`by` — human / agent / job / system) at the ONE
 * send point (src/agentd/client.js), and audited it on both ends. This module decides, per act, whether it may go:
 *   · a `read` or a `session` op never asks (src/device-acts.js layers); an `act` or `code` op by a PERSON never asks (their
 *     click is the consent);
 *   · an `act` / `code` op by an agent, a background job or the hub's own upkeep (`system:`) follows the machine's THIRD list,
 *     「Hub 自动化」 (exit-reach's `hub`): nobody (refused, no card) | everyone (goes) | ask (an URGENT For-you card, 60 s);
 *   · a machine that never set the list follows the instance's default — the setting `remote.hubAutomationDefault`
 *     (auto | ask | everyone | nobody); `auto` = by the instance's kind: a CLUSTER instance (a fleet pod:
 *     VIBESPACE_INSTANCE_NAME, or the shared presets folder) asks, a LOCAL one does not;
 *   · an act whose owner grant was judged already — vibespace-exit's own two lists (`use` / `run`, with their own "ask me
 *     each time") — never asks twice (`consent`);
 *   · THE CARD is one per SUBJECT — machine × KIND (run / files / input / forward / serve / install / upgrade) × who asks
 *     (lane ledger-dedup-law r3: consent is per subject on every road): a second act of the same subject joins the card
 *     that is up; its answer settles them all and no other subject's. 60 s unanswered ⇒ refused `ask_expired`;
 *   · a background subject (system / job) that was not allowed (denied or unanswered) is refused at once for QUIET_MS on
 *     that subject — no new card (a harvest every minute is not a card every minute);
 *   · lane ledger-dedup-law F3 (B-7f9e — 958 expired cards filled a fleet owner's For-you list, 144 a day per kind per
 *     machine): a background subject's card IS ONE STANDING ITEM — its words name the CONSEQUENCE (`standingOf`: «usage of
 *     M is not being recorded» / «the device agent on M waits for an update»), it never expires, and every later refusal
 *     of that subject is counted on it in place (the count, the last time) — never a new card; it never joins a person's
 *     or an agent's card (r3).
 * Gate: scripts/test-hub-act-ask.mjs (the verdict table, the words, the fake-daemon leg, the dialog's third list).
 */

const KINDS = Object.freeze(['run', 'files', 'input', 'forward', 'serve', 'install', 'upgrade']);
const POLICIES = Object.freeze(['nobody', 'everyone', 'ask']);
const SETTING_KEY = 'remote.hubAutomationDefault';
const SETTING_VALUES = Object.freeze(['auto', 'ask', 'everyone', 'nobody']);
const INSTANCE_KINDS = Object.freeze(['cluster', 'local']);
const ASK_TTL_MS = 60000;            // the card's life (exit-reach's ASK_TTL_MS — test-hub-act-ask pins the two equal)
const QUIET_MS = 10 * 60 * 1000;     // a background subject not allowed on a key: refused at once this long
const ANSWERS = Object.freeze(['once', 'always', 'deny']);
const REFUSALS = Object.freeze(['hub_act_denied', 'ask_expired', 'ask_unfiled', 'act_without_by', 'ask_standing']);
const WAY_OUT = 'the user can change it under "Who can use it" on the machine row (Remote tab) → Hub automation';

// THE KIND of an act: its op family (src/device-acts.js keyOf spelling). An act op without a row is `run` (fail closed:
// the strongest words on the card).
const KIND_OF = Object.freeze({
  'run-cmd': 'run', 'run-stream': 'run', 'pool-orders': 'run',
  'fs-op:write': 'files', 'fs-op:rm': 'files', 'fs-op:rename': 'files', 'fs-op:mkdir': 'files', 'fs-op:copy': 'files', 'fs-op:move': 'files', 'fs-op:write-stream': 'files',
  'place-secret': 'files', 'design-fs:write-user': 'files',
  'input-events': 'input', 'desktop-grab': 'input', 'desktop-input': 'input', 'window-pin': 'input', 'settings-open': 'input', 'peer-post': 'input',
  'stream-mic:default': 'input', // lane stream-mic-road: 「设为默认麦克风」 / 「改回」 — the machine's default microphone, like a Settings pane
  'tcp-connect': 'forward', 'serve-socks': 'forward',
  'serve-folder': 'serve', 'browser-serve:start': 'serve', 'browser-serve:remove': 'serve',
  'desktop-serve:app-install': 'install', 'desktop-serve:app-remove': 'install', 'desktop-serve:app-fetch': 'install',
  'upgrade': 'upgrade',
});
/** The kind of an act's table key (device-acts keyOf). */
const kindOf = (key) => (Object.prototype.hasOwnProperty.call(KIND_OF, String(key)) ? KIND_OF[String(key)] : 'run');
/** One machine, one kind — the first two parts of a subject's key. */
const dedupKey = (hostId, kind) => `${String(hostId)}\n${KINDS.includes(kind) ? kind : 'run'}`;
/** A SUBJECT's key (lane ledger-dedup-law r2, every card r3): one machine, one kind, WHO asks (`by`) — two askers of one kind
 *  on one machine are two subjects (their own card or hold, quiet window, count, standing item, Allow once, Deny). */
const subjectKey = (hostId, kind, by) => `${dedupKey(hostId, kind)}\n${String(by || '')}`;
/** A `by`'s kind ('human' | 'agent' | 'job' | 'system') or null — the spelling src/device-acts.js validates. */
const BY_RE = /^(human|agent|job|system):[A-Za-z0-9][A-Za-z0-9._:@/+-]{0,159}$/;
const byKindOf = (by) => (typeof by === 'string' && BY_RE.test(by) ? by.slice(0, by.indexOf(':')) : null);
const background = (k) => k === 'system' || k === 'job';

/** The instance's kind: a fleet pod (VIBESPACE_INSTANCE_NAME, or the shared presets folder — mounts-plugins-wiring's
 *  clusterDeploy rule) is `cluster`; anything else `local`. */
function instanceKindOf(env = {}, { presetsDir = null } = {}) {
  return (env && typeof env.VIBESPACE_INSTANCE_NAME === 'string' && env.VIBESPACE_INSTANCE_NAME.trim()) || presetsDir ? 'cluster' : 'local';
}
/** The policy that applies to a machine → {policy, source: 'machine' | 'setting' | 'instance' | 'unreadable'}. A stored
 *  machine list wins; else the setting (auto ⇒ by the instance kind: cluster ⇒ ask, local ⇒ everyone). An unreadable
 *  stored access (exit-reach `unknown`) asks — never a silent allow. */
function policyOf({ machinePolicy = null, instanceKind = 'local', setting = 'auto' } = {}) {
  if (machinePolicy === 'unknown') return { policy: 'ask', source: 'unreadable' };
  if (POLICIES.includes(machinePolicy)) return { policy: machinePolicy, source: 'machine' };
  if (POLICIES.includes(setting)) return { policy: setting, source: 'setting' };
  return { policy: instanceKind === 'cluster' ? 'ask' : 'everyone', source: 'instance' };
}

/**
 * THE VERDICT of one act → `{verdict: 'allow' | 'ask' | 'deny', reason, kind, policy, source, code?, join?, until?}`:
 *   read / session                              ⇒ allow `layer`
 *   no valid `by`                               ⇒ deny `act_without_by` (the send point refuses it before this)
 *   by human                                    ⇒ allow `human`
 *   consent (vibespace-exit's own lists judged) ⇒ allow `consent`
 *   policy everyone                             ⇒ allow `everyone`
 *   policy nobody                               ⇒ deny `hub_act_denied` (`nobody`)
 *   policy ask + a card up for this subject     ⇒ ask, join
 *   policy ask + a background subject refused
 *     on this key in the last QUIET_MS          ⇒ deny by the last outcome (`hub_act_denied` / `ask_expired`), `quiet`
 *   policy ask                                  ⇒ ask
 * `recent` = `{outcome: 'denied' | 'expired', at}` of the key's last unallowed ask (the asker keeps it).
 */
function askVerdict({ instanceKind = 'local', by = null, layer = 'act', key = '', machinePolicy = null, setting = 'auto', consent = false, pending = false, recent = null, now = Date.now() } = {}) {
  const kind = kindOf(key);
  const { policy, source } = policyOf({ machinePolicy, instanceKind, setting });
  const base = { kind, policy, source };
  if (layer === 'read' || layer === 'session') return { verdict: 'allow', reason: 'layer', ...base };
  const bk = byKindOf(by);
  if (!bk) return { verdict: 'deny', reason: 'no-by', code: 'act_without_by', ...base };
  if (bk === 'human') return { verdict: 'allow', reason: 'human', ...base };
  if (consent) return { verdict: 'allow', reason: 'consent', ...base };
  if (policy === 'everyone') return { verdict: 'allow', reason: 'everyone', ...base };
  if (policy === 'nobody') return { verdict: 'deny', reason: 'nobody', code: 'hub_act_denied', ...base };
  if (pending) return { verdict: 'ask', reason: 'ask', join: true, ...base };
  if (background(bk) && recent && (recent.outcome === 'denied' || recent.outcome === 'expired') && Number(now) - Number(recent.at) < QUIET_MS) {
    return { verdict: 'deny', reason: 'quiet', code: recent.outcome === 'expired' ? 'ask_expired' : 'hub_act_denied', until: Number(recent.at) + QUIET_MS, ...base };
  }
  return { verdict: 'ask', reason: 'ask', join: false, ...base };
}

/** May this answer settle a card? Only a person (`by: 'user'` — a cookie route), once, within 60 s. */
function answerVerdict({ askedAt, settled = null } = {}, { answer, by, now = Date.now() } = {}) {
  if (by !== 'user') return { ok: false, code: 'human_only', error: 'only the user answers this — an agent cannot approve a hub act' };
  if (settled) return { ok: false, code: settled === 'expired' ? 'ask_expired' : 'ask_settled', error: settled === 'expired' ? 'too late — it was refused after 60 s' : 'already answered' };
  if (Number(now) - Number(askedAt) >= ASK_TTL_MS) return { ok: false, code: 'ask_expired', error: 'too late — it was refused after 60 s' };
  if (!ANSWERS.includes(answer)) return { ok: false, code: 'bad_answer', error: 'answer is once, always or deny' };
  return { ok: true, answer };
}

// ── the words ───────────────────────────────────────────────────────────────
const i18nKey = (k) => k; // the extraction marker scripts/i18n-extract.mjs reads (the keys live in the zh / ja dictionaries)
const TITLE = Object.freeze({
  run: i18nKey('{who} wants to run a command on {machine}'),
  files: i18nKey('{who} wants to change files on {machine}'),
  input: i18nKey('{who} wants to use the keyboard, mouse or windows of {machine}'),
  forward: i18nKey('{who} wants to reach other hosts through {machine}'),
  serve: i18nKey('{who} wants to share a folder or a browser from {machine}'),
  install: i18nKey('{who} wants to install or remove an app on {machine}'),
  upgrade: i18nKey('{who} wants to update the device agent on {machine}'),
});
const DETAIL_WHAT = i18nKey('It would: {summary} — asked by {by}.');
const DETAIL_HOW = i18nKey('Allow once lets it go ahead, with the other acts of this kind by {who} waiting beside it — no one else\'s. Always on this machine sets Hub automation of {machine} to Always allow — every kind and every asker, no more asks. Deny refuses it. No answer in 60 s: refused.');
const KIND_WORDS = Object.freeze({ run: 'run a command', files: 'change files', input: 'use the keyboard, mouse or windows', forward: 'reach other hosts through it', serve: 'share a folder or a browser from it', install: 'install or remove an app', upgrade: 'update its device agent' });
const fold = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const fill = (k, p) => k.replace(/\{(\w+)\}/g, (_, n) => (p[n] == null ? '' : String(p[n])));
/** Who asked, as the card says it: an agent by its conversation's name (quoted) when known, else the `by` itself
 *  (`system:usage-harvest`, `job:jb-…` — the spelling the machine's Activity… shows). */
function whoOf(by, name = null) {
  const n = fold(name, 80);
  return byKindOf(by) === 'agent' && n ? `"${n}"` : (byKindOf(by) ? String(by).slice(0, 120) : 'nobody named');
}
/** THE CARD's words → {text, detail, i18n} (the English beside its structure; the client words it in the device's language). */
function cardOf({ by, name = null, machine = '', kind = 'run', summary = '' } = {}) {
  const k = KINDS.includes(kind) ? kind : 'run';
  const p = { who: whoOf(by, name), machine: fold(machine, 80) || 'a machine', summary: fold(summary, 240) || k, by: byKindOf(by) ? String(by).slice(0, 120) : 'nobody named' };
  return { text: fill(TITLE[k], p), detail: [fill(DETAIL_WHAT, p), fill(DETAIL_HOW, p)].join('\n'), i18n: { text: { key: TITLE[k], params: { who: p.who, machine: p.machine } }, detail: [{ key: DETAIL_WHAT, params: { summary: p.summary, by: p.by } }, { key: DETAIL_HOW, params: { machine: p.machine, who: p.who } }] } };
}
// lane ledger-dedup-law F3: THE STANDING ITEM's words — the consequence first (what is not happening), then who asks, how
// often it was refused and when last, and what each answer does. The text is the item's identity (fixed at its filing: the
// SUBJECT — machine × kind × who asks, r2); the detail is re-worded in place as the count moves.
const STANDING_TITLE = Object.freeze({
  usage: i18nKey('Usage of {machine} is not being recorded — its Hub automation asks first'),
  upgrade: i18nKey('The device agent on {machine} waits for an update — its Hub automation asks first'),
  // any other subject: the card's own title for its kind ("{who} wants to … on {machine}")
});
const STANDING_DETAIL_WHO = i18nKey('Asked by {by} — its last act: {summary}. Refused {count} time(s), the last at {last}. Nothing waits on it — each later act is refused at once and counted here, never a new card.');
// lane ledger-dedup-law r9: THE STANDING ITEM IS A NOTICE — no Allow once / Always / Deny on it (r8 drew them: the decision
// row's buttons on a subject's standing state); its way out is the machine's Hub automation, where the notice opens
const STANDING_DETAIL_HOW = i18nKey('To let {by} act on {machine}, set its Hub automation to Always allow (open this notice: Machines → {machine} → Who can use it). Until then each of its acts is refused at once and counted here; ✓ hides this for a day.');
/** Which consequence a standing subject names: VibeSpace's usage harvest ⇒ `usage`; a device-agent update ⇒ `upgrade`. */
const consequenceOf = (by, kind) => (String(by || '').startsWith('system:usage-harvest') ? 'usage' : kind === 'upgrade' ? 'upgrade' : 'other');
/** THE STANDING ITEM's words → {text, detail, i18n}. `count` = refusals so far, `lastAt` = the last one (ms). */
function standingOf({ by, machine = '', kind = 'run', count = 1, lastAt = 0, consequence = null, summary = '' } = {}) {
  const k = KINDS.includes(kind) ? kind : 'run';
  const c = consequence === 'usage' || consequence === 'upgrade' || consequence === 'other' ? consequence : consequenceOf(by, k);
  const p = { machine: fold(machine, 80) || 'a machine', who: whoOf(by), by: byKindOf(by) ? String(by).slice(0, 120) : 'nobody named', summary: fold(summary, 240) || k, count: Math.max(1, Math.floor(Number(count) || 1)), last: hhmm(lastAt) };
  const title = STANDING_TITLE[c] || TITLE[k];
  return {
    consequence: c,
    text: fill(title, p),
    detail: [fill(STANDING_DETAIL_WHO, p), fill(STANDING_DETAIL_HOW, p)].join('\n'),
    i18n: { text: { key: title, params: { machine: p.machine, who: p.who } }, detail: [{ key: STANDING_DETAIL_WHO, params: { by: p.by, summary: p.summary, count: p.count, last: p.last } }, { key: STANDING_DETAIL_HOW, params: { machine: p.machine, by: p.by } }] },
  };
}
const hhmm = (t) => { const d = new Date(Number(t) || 0); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`; };
/** The refusal's sentence — what the agent's CLI, the route and the journal say (exit-proxy's grammar: what, that nothing
 *  was done, the way on — and never "retry"). */
function refusalText(code, { machine = '', kind = 'run', reason = '', until = null, error = '' } = {}) {
  const M = `"${fold(machine, 60) || 'the machine'}"`;
  const what = KIND_WORDS[KINDS.includes(kind) ? kind : 'run'];
  switch (code) {
    case 'hub_act_denied':
      if (reason === 'nobody') return `${M} does not let VibeSpace's automation ${what} there (its Hub automation list is Never) — nothing was done; do not retry: ${WAY_OUT}`;
      if (reason === 'quiet') return `the user did not allow VibeSpace to ${what} on ${M} a moment ago — nothing was done; it is not asked again until ${hhmm(until)}: ${WAY_OUT}`;
      return `the user denied it: VibeSpace may not ${what} on ${M} — nothing was done; do not retry in a loop: ${WAY_OUT}`;
    case 'ask_standing': return `VibeSpace may not ${what} on ${M} while its Hub automation asks first and nobody is there to answer — nothing was done; this refusal is counted on its notice in For you (no new card): ${WAY_OUT}`;
    case 'ask_expired':
      if (reason === 'quiet') return `nobody answered the last ask to ${what} on ${M} — refused, nothing was done; it is not asked again until ${hhmm(until)}: ${WAY_OUT}`;
      return `nobody answered within 60 s — VibeSpace did not ${what} on ${M}, nothing was done; do not retry in a loop: ask the user, or ${WAY_OUT}`;
    case 'ask_unfiled': return `to ${what} on ${M} needs the user's Allow, but the ask could not be put in front of them (For you refused it: ${fold(error, 120)}) — nothing was done`;
    case 'act_without_by': return `the act on ${M} names nobody who asked — never sent`;
    default: return fold(error || code, 300);
  }
}

module.exports = {
  KINDS, POLICIES, SETTING_KEY, SETTING_VALUES, INSTANCE_KINDS, ASK_TTL_MS, QUIET_MS, ANSWERS, REFUSALS, KIND_OF, KIND_WORDS, TITLE, DETAIL_WHAT, DETAIL_HOW, WAY_OUT,
  STANDING_TITLE, STANDING_DETAIL_WHO, STANDING_DETAIL_HOW,
  kindOf, dedupKey, subjectKey, byKindOf, instanceKindOf, policyOf, askVerdict, answerVerdict, whoOf, cardOf, refusalText, standingOf, consequenceOf, background,
};
