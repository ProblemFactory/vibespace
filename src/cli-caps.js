'use strict';
// CLI CAPABILITIES A MEASUREMENT GRANTS PER VERSION (lane pool-oat-measure, design q-035).
//
// oatInFile — may a pool member's LONG-LIVED token sit in its credential FILE
// (`claudeAiOauth.accessToken = <oat>`, a far `expiresAt`, NO refreshToken) and be
// spent by the CLI like a login? Only on a CLI version that
// scripts/measure-claude-cred-read.mjs (`--variant oat --write-fixture`, the
// loopback mock + fake tokens) measured green on the three variants the design
// leans on (§5 gate 5):
//   oat-file         every request's bearer is the file's oat; nothing refreshes; nothing writes the file
//   oat-file-401     a 401 never makes the CLI rewrite, blank or delete the file (invariant 4)
//   oat-file-switch  the pool's link moves login member → oat member → back; each next turn carries the
//                    member the link names; neither file is written
// Any other version — a newer one too — is false: the pool keeps escaping oat-only
// members (today's behavior) until someone measures that CLI.
//
// PURE: imports nothing, reads nothing — the caller hands in the parsed fixture
// (scripts/fixtures/oat-in-file.json). ONE RECORD PER MEASURED VERSION (lane oat-in-file-2-1-306,
// 2026-10-21: 2.1.296 + 2.1.306), keyed by the exact version:
//   {versions: {'2.1.296': {cliVersion, measuredAt, script, netns, variants: {name: {verdict, note}}}, '2.1.306': {…}}}
// The measurement ADDS its version's record and keeps every other one (withMeasured, the writer's
// one rule). A bare record — the one-version shape the file had until then — reads as a fixture
// of that one version.

// the six the measurement runs, in its order (the script imports this list — one spelling)
const OAT_VARIANTS = Object.freeze(['oat-file', 'oat-env', 'oat-file-401', 'oat-file-near', 'oat-file-switch', 'oat-file-scopes']);
// the three that must be PASS
const OAT_IN_FILE_GATE = Object.freeze(['oat-file', 'oat-file-401', 'oat-file-switch']);

/** '2.1.296 (Claude Code)' / 'v2.1.296' / '2.1.296' → '2.1.296'. A pre-release / build suffix is KEPT
 *  ('2.1.296-dev.1' is another build, never the measured release — pool-oat-materialize verify r1 F9);
 *  anything else → null. */
function cliVersionOf(v) {
  const m = /^\s*v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?)(?=\s|$)/.exec(String(v == null ? '' : v));
  return m ? m[1] : null;
}

const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isRecord = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const byVersion = (a, b) => a.localeCompare(b, 'en', { numeric: true });

/** the fixture's record of EXACTLY version `v` (cliVersionOf's spelling), or null: {versions} ⇒ its own
 *  entry keyed by `v`; a bare record ⇒ itself (oatInFile still checks its cliVersion). */
function recordOf(fixture, v) {
  if (!isRecord(fixture)) return null;
  if (!own(fixture, 'versions')) return fixture;
  const vs = fixture.versions;
  return isRecord(vs) && own(vs, v) && isRecord(vs[v]) ? vs[v] : null;
}

/** true only when `fixture` measured EXACTLY this CLI version string (a build suffix is another
 *  version) and named every gate variant PASS (an own property, verdict exactly 'PASS'). */
function oatInFile(version, fixture) {
  const v = cliVersionOf(version);
  if (!v) return false;
  const rec = recordOf(fixture, v);
  if (!rec || cliVersionOf(rec.cliVersion) !== v) return false;
  const vs = rec.variants;
  if (!vs || typeof vs !== 'object' || Array.isArray(vs)) return false;
  return OAT_IN_FILE_GATE.every((name) => Object.prototype.hasOwnProperty.call(vs, name) && !!vs[name] && vs[name].verdict === 'PASS');
}

/** the versions `fixture` holds a record of (each keyed by its own cliVersion), oldest first —
 *  the words "fixture: 2.1.296, 2.1.306" the store's log says beside an unmeasured CLI. */
function measuredVersions(fixture) {
  if (!isRecord(fixture)) return [];
  if (!own(fixture, 'versions')) { const v = cliVersionOf(fixture.cliVersion); return v ? [v] : []; }
  const vs = fixture.versions;
  return isRecord(vs) ? Object.keys(vs).filter((k) => isRecord(vs[k]) && cliVersionOf(vs[k].cliVersion) === k).sort(byVersion) : [];
}

/** THE WRITER'S ONE RULE (scripts/measure-claude-cred-read.mjs --write-fixture): the fixture with
 *  `record` under its exact version and EVERY other entry kept as it was — a run adds a version and
 *  never drops one; re-measuring a version replaces that version's record only. `fixture` null = no
 *  file yet; a bare record becomes the map's first entry. A new object: the input is not touched.
 *  Throws (the writer refuses before it measures, and again before it writes) on a record that names
 *  no exact version, or a fixture that is neither shape (rewriting it could drop what it holds). */
function withMeasured(fixture, record) {
  const v = isRecord(record) ? cliVersionOf(record.cliVersion) : null;
  if (!v || v !== record.cliVersion) throw new Error(`the record names no exact CLI version (${JSON.stringify(isRecord(record) ? record.cliVersion : record)})`);
  let base = {}, versions = {};
  if (fixture != null) {
    if (!isRecord(fixture)) throw new Error('the fixture is not a JSON object');
    if (own(fixture, 'versions')) {
      if (!isRecord(fixture.versions)) throw new Error('the fixture\'s versions is not a map');
      ({ versions, ...base } = fixture);
    } else {
      const k = cliVersionOf(fixture.cliVersion);
      if (!k) throw new Error(`the fixture is a record of no CLI version (${JSON.stringify(fixture.cliVersion)})`);
      versions = { [k]: fixture };
    }
  }
  const all = { ...versions, [v]: record };
  return { ...base, versions: Object.fromEntries(Object.keys(all).sort(byVersion).map((k) => [k, all[k]])) };
}

// THE HELD CLI'S ONE FOR-YOU ITEM (lane pool-silent-members R1, inc-mvsjhna7 — reworded by lane cli-self-measure, 2026-11-09).
// The hub's claude updated to a version the fixture never measured; the pool holds the members it reaches only through their
// token file. Since cli-self-measure the hub CHECKS that build itself (src/server/cli-self-measure.js, ≈ 5 min) and files
// NOTHING while the check runs inside its bound (ruling R2): this item exists only when the check runs late, failed, could not
// run or was stopped — or when the switch is off. Its words say WHICH observation differed / why it could not run and what
// the person can do; a FAIL / cannot-run / stopped item carries the «check again» press (action cli-check-again, ruling R6).
// Never «unmeasured», never «wait for the measurement», never a wall date (the owner, 2026-11-09). `i18n` carries the same
// sentences as {key, params} for zh / ja (the dict: src/lib/i18n-*.js).
const i18nKey = (s) => s;
// what the check SAW, by code (the hub derives the code from the failing gate variant's evidence)
const OBSERVATIONS = Object.freeze({
  'not-the-token': i18nKey('a request did not carry the account’s own token'),
  'refresh': i18nKey('it tried to refresh the long-lived token'),
  'rewrote': i18nKey('it rewrote the account’s credential file'),
  'no-recover': i18nKey('after a refused request it did not recover'),
  'no-follow': i18nKey('a turn after the pool moved the account did not follow the move'),
});
// why the check could not run here, by code (src/claude-oat-probe.js refusals + the hub's own)
const REASONS = Object.freeze({
  'scratch': i18nKey('this machine has no private folder outside your home and VibeSpace’s data folder for the check to run in — Claude Code reads the folders above the one it runs in'),
  'no-strace': i18nKey('this machine has no strace, which the check needs to prove nothing leaves the machine — install it (apt install strace)'),
  'strace-denied': i18nKey('this machine does not let strace trace a program (a security setting), which the check needs to prove nothing leaves the machine'),
  'managed-settings': i18nKey('/etc/claude-code exists — settings there can point Claude Code at other servers, so the check does not run here'),
  'remote-token': i18nKey('token files exist under /home/claude/.claude/remote — Claude Code would read them, so the check does not run here'),
  'foreign-token': i18nKey('a request in the check carried a token VibeSpace did not make — something on this machine hands Claude Code a credential'),
  'guarded-read': i18nKey('Claude Code read a settings or token file outside the check’s own folder'),
  'strace-old': i18nKey('the check needs strace 6.6 or newer, which takes everything it traces with it when it stops — update strace to 6.6 or newer (this one is {version})'),
  'strace-old-unread': i18nKey('the check needs strace 6.6 or newer, which takes everything it traces with it when it stops — update strace to 6.6 or newer (the strace on this machine did not say its version)'),
  'strace-old-image': i18nKey('this VibeSpace image’s strace is older than 6.6, and the check needs one that takes everything it traces with it — the next VibeSpace image brings it; until then a VibeSpace release that records Claude Code {v} places these accounts'),
  'no-setpriv': i18nKey('this machine has no setpriv (util-linux), which the check needs so that nothing it starts outlives it'),
  'trace-unparsed': i18nKey('the trace of the check had a line VibeSpace could not read, so the check proves nothing'),
  'trace-unfinished': i18nKey('the trace of the check did not account for every call: it ended early, or something the check started outlived it — so the check proves nothing'),
  'trace-oversize': i18nKey('the trace of the check grew past the size the check keeps for one run, so the check proves nothing'),
  'launcher-changed': i18nKey('the file the check starts Claude Code through was changed between two of its runs, so the check proves nothing'),
  'door': i18nKey('Claude Code used a way to reach files that the check cannot watch (such as io_uring), so the check proves nothing'),
  'child-killed': i18nKey('the check’s own process was killed before it reached a verdict (something on this machine stopped it — memory, or a person); everything it had started ended with it'),
  'timeout': i18nKey('the check did not finish in time'),
  'setup': i18nKey('the check could not set itself up on this machine'),
});
const observationText = (code) => OBSERVATIONS[code] || OBSERVATIONS['not-the-token'];
const reasonText = (code) => REASONS[code] || REASONS.setup;
/** a cannot-run reason's words + params: strace-old by machine kind (the version on a managed machine, the CLI build in an image).
 *  A version the tracer did not say is never «?» (acceptance r4 tidy 7a): the words say it did not say */
function reasonWords(local, v) {
  const code = local && local.reason;
  if (code === 'strace-old') {
    if (local.reasonMachine === 'image') return { key: REASONS['strace-old-image'], params: { v: String(v || '?') } };
    const said = typeof local.reasonVersion === 'string' && /^\d+\.\d+$/.test(local.reasonVersion) ? local.reasonVersion : null;
    return said ? { key: REASONS['strace-old'], params: { version: said } } : { key: REASONS['strace-old-unread'] };
  }
  return { key: reasonText(code) };
}
function cliUnmeasuredItem({ cli, names = [], local = null } = {}) {
  const v = cliVersionOf(cli) || String(cli || '?').slice(0, 40);
  const list = (Array.isArray(names) ? names : []).map((n) => String(n || '').slice(0, 80)).filter(Boolean);
  const n = list.length;
  const st = local && typeof local.state === 'string' ? local.state : 'none';
  const lines = [], rows = [];
  const say = (text, key, params) => { lines.push(text); rows.push(params ? { key, params } : { key }); };
  const fill = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? String(p[k]) : m));
  const head = (key, params) => ({ text: fill(key, params), key, params });
  let h, action = null;
  if (st === 'checking') {
    h = n === 1 ? head(i18nKey('Claude Code {v} is still being checked on this machine — 1 account waits for it'), { v })
      : head(i18nKey('Claude Code {v} is still being checked on this machine — {n} accounts wait for it'), { v, n });
    const p = { typ: String((local && local.typicalMin) || 5), bound: String((local && local.boundMin) || 20) };
    say(fill(i18nKey('The check usually takes about {typ} minutes; this one is taking longer and is stopped after {bound} minutes at the latest.'), p), i18nKey('The check usually takes about {typ} minutes; this one is taking longer and is stopped after {bound} minutes at the latest.'), p);
  } else if (st === 'fail') {
    h = n === 1 ? head(i18nKey('Claude Code {v} uses long-lived tokens differently: 1 account stays out of the pool'), { v })
      : head(i18nKey('Claude Code {v} uses long-lived tokens differently: {n} accounts stay out of the pool'), { v, n });
    const o = observationText(local && local.reason);
    say(fill(i18nKey('What VibeSpace saw: {what}.'), { what: o }), i18nKey('What VibeSpace saw: {what}.'), { what: { key: o } }); // a nested word: the client says it in the owner's language (saidLine)
    action = { type: 'cli-check-again', cli: v };
  } else if (st === 'cannot-run') {
    h = n === 1 ? head(i18nKey('VibeSpace could not check Claude Code {v} on this machine: 1 account stays out of the pool'), { v })
      : head(i18nKey('VibeSpace could not check Claude Code {v} on this machine: {n} accounts stay out of the pool'), { v, n });
    // the door a person HAS, per machine kind (主开发's condition 2): strace-old on a machine its owner manages names the update and
    // this machine's version; in a VibeSpace image, that the next image brings it and what places the accounts meanwhile
    const rw = reasonWords(local, v);
    say(fill(i18nKey('Why: {why}.'), { why: fill(rw.key, rw.params) }), i18nKey('Why: {why}.'), { why: rw.params ? { key: rw.key, params: rw.params } : { key: rw.key } });
    // WHAT WAS READ (the incident of 2026-11-11: the item said why in general and nothing of what) — the paths the record kept
    if (local && local.reason === 'guarded-read' && local.observation) say(fill(i18nKey('What it read: {paths}.'), { paths: String(local.observation).slice(0, 600) }), i18nKey('What it read: {paths}.'), { paths: String(local.observation).slice(0, 600) });
    action = { type: 'cli-check-again', cli: v };
  } else if (st === 'aborted') {
    h = n === 1 ? head(i18nKey('Claude Code {v} tried to connect outside this machine during the check: 1 account stays out of the pool'), { v })
      : head(i18nKey('Claude Code {v} tried to connect outside this machine during the check: {n} accounts stay out of the pool'), { v, n });
    say(i18nKey('VibeSpace stopped the check at once and does not run it again on this build by itself.'), i18nKey('VibeSpace stopped the check at once and does not run it again on this build by itself.'));
    action = { type: 'cli-check-again', cli: v };
  } else {
    h = n === 1 ? head(i18nKey('Claude Code updated to {v}; 1 account cannot be placed by the pool yet — its login is kept'), { v })
      : head(i18nKey('Claude Code updated to {v}; {n} accounts cannot be placed by the pool yet — their logins are kept'), { v, n });
  }
  say(`Accounts: ${list.join(', ')}.`, i18nKey('Accounts: {names}.'), { names: list.join(', ') });
  say('Each keeps its long-lived token in its folder, and a conversation started on it directly keeps working; the pool names it in its notices with this reason.', i18nKey('Each keeps its long-lived token in its folder, and a conversation started on it directly keeps working; the pool names it in its notices with this reason.'));
  if (st === 'checking') say(i18nKey('They rejoin the pool by themselves when the check passes. To use one now, re-login it in Manage Agents.'), i18nKey('They rejoin the pool by themselves when the check passes. To use one now, re-login it in Manage Agents.'));
  else if (action) say(i18nKey('To use one now, re-login it in Manage Agents — a full login works on any version. Changed something? Press Check again. This item also resolves itself when a VibeSpace update or a later Claude Code reads them correctly.'), i18nKey('To use one now, re-login it in Manage Agents — a full login works on any version. Changed something? Press Check again. This item also resolves itself when a VibeSpace update or a later Claude Code reads them correctly.'));
  else say(fill(i18nKey('To use one in the pool now, re-login it in Manage Agents. With «Check a new Claude Code version on this machine» on (Settings), VibeSpace checks {v} itself in about five minutes; otherwise a VibeSpace update that knows it places them, and this item resolves itself.'), { v }), i18nKey('To use one in the pool now, re-login it in Manage Agents. With «Check a new Claude Code version on this machine» on (Settings), VibeSpace checks {v} itself in about five minutes; otherwise a VibeSpace update that knows it places them, and this item resolves itself.'), { v });
  return { text: h.text, detail: lines.join('\n'), i18n: { text: { key: h.key, params: h.params }, detail: rows }, ...(action ? { action } : {}) };
}
/** the prefix every such item's text starts with — kept for the items filed before cli-self-measure (their text began so) */
const cliUnmeasuredPrefix = (v) => `The Claude CLI updated to ${cliVersionOf(v) || String(v || '?').slice(0, 40)}; `;
/** THE SPAWN REFUSAL of a pool whose members hold only our token file on a held CLI: the check and its bound while it runs */
function cliHeldSpawnText({ pool = '', cli = '', local = null } = {}) {
  const v = cliVersionOf(cli) || String(cli || '?').slice(0, 40);
  const st = local && local.state;
  if (st === 'checking') return `pool "${pool}" can't start a conversation for a few minutes: Claude Code ${v} is being checked on this machine (about ${(local && local.typicalMin) || 5} min${local && local.elapsedMin ? `, started ${local.elapsedMin} min ago` : ''}) — sign a member in to start now; conversations already running continue`;
  if (st === 'fail') return `pool "${pool}" can't start a conversation: Claude Code ${v} uses long-lived tokens differently (${observationText(local.reason)}) — sign a member in with a full login; conversations already running continue (For you says what to do)`;
  if (st === 'cannot-run' || st === 'aborted') return `pool "${pool}" can't start a conversation: VibeSpace could not check Claude Code ${v} on this machine — sign a member in with a full login; conversations already running continue (For you says why and has Check again)`;
  return `pool "${pool}" can't start a conversation: its members hold only long-lived tokens and Claude Code ${v} is not in this VibeSpace's records yet — sign a member in; conversations already running continue`;
}

// THE MINT'S OWN SCOPES (lane oat-add-door, 2.369.399 — the owner, 2026-11-13: an account added by its long-lived token may
// say its subscription type itself). The scopes a person-stated file carries are the ones the CLI's OWN mint asks for — read
// by the ONE measurement (src/claude-oat-probe.js, variant MINT_VARIANT: `claude setup-token` in a pty, its printed authorize
// URL's `scope=`; measured on 2.1.321: `user:inference` alone), never typed here. Recorded per exact version: the release road
// in scripts/fixtures/oat-mint-scopes.json ({versions: {v: {cliVersion, measuredAt, script, verdict, scopes, note}}}, written
// by withMeasured like the oat fixture), the hub's own check in its ledger (cli-self-measure: the variant's `scopes`). A version
// with neither offers only «sign in once».
const MINT_VARIANT = 'oat-mint-scopes';
const SCOPE_RE = /^[a-z][a-z0-9_.-]{0,40}(?::[a-z0-9_.-]{1,40}){0,4}$/;
/** a scope list as the grammar allows it → a new array, or null (empty, too many, a value the grammar refuses) */
function scopesOk(list) {
  if (!Array.isArray(list) || !list.length || list.length > 16) return null;
  if (!list.every((x) => typeof x === 'string' && SCOPE_RE.test(x))) return null;
  return [...new Set(list)];
}
/** THE READER of what `setup-token` prints (the probe feeds it the pty's bytes as they come): the first authorize URL, its
 *  `scope=` → {scopes, origin} or null (no URL yet, or a scope the grammar refuses — a URL cut by the screen's wrap is read
 *  whole: the terminal's escapes and every whitespace are removed first; the URL holds none). */
function mintScopesIn(text) {
  const plain = String(text == null ? '' : text).replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]/g, '').replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '').replace(/\s+/g, '');
  const m = /(https?:\/\/[A-Za-z0-9.:[\]-]{1,100})(?:\/[A-Za-z0-9._~-]{1,40}){0,4}\/oauth\/authorize\?([A-Za-z0-9%&=_.~+:-]{1,4000})/.exec(plain); // 2.1.321 prints https://claude.com/cai/oauth/authorize?… (the vendor's page — printed, never fetched here)
  if (!m) return null;
  const q = /(?:^|&)scope=([^&]*)&/.exec(m[2] + '&'); // a scope that is NOT the last parameter (2.1.321: code_challenge follows) — a last one is read up to its end
  if (!q) return null;
  let raw; try { raw = decodeURIComponent(q[1].replace(/\+/g, ' ')); } catch { return null; }
  const scopes = scopesOk(raw.split(' ').filter(Boolean));
  return scopes ? { scopes, origin: m[1] } : null;
}
/** the scopes version `version`'s mint asks for, as `fixture` recorded them (exact version, verdict PASS) → array or null */
function mintScopesOf(version, fixture) {
  const v = cliVersionOf(version);
  if (!v) return null;
  const rec = recordOf(fixture, v);
  if (!rec || cliVersionOf(rec.cliVersion) !== v || rec.verdict !== 'PASS') return null;
  return scopesOk(rec.scopes);
}

module.exports = { oatInFile, cliVersionOf, measuredVersions, withMeasured, cliUnmeasuredItem, cliUnmeasuredPrefix, cliHeldSpawnText, observationText, reasonText, reasonWords, OBSERVATIONS, REASONS, OAT_VARIANTS, OAT_IN_FILE_GATE,
  MINT_VARIANT, mintScopesIn, mintScopesOf, scopesOk };
