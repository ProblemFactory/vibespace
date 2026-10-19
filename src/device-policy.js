'use strict';
/**
 * PURE (imports only src/device-acts.js; CJS — the device agent, the hub's device client, the pairing dialog and a suite
 * share one copy) — A PAIRED DEVICE CARRIES ITS OWN ALLOW LIST (lane device-allow-flags, design q-042 §3 D5, owner
 * decision ③ 2026-10-19).
 *
 * Before this lane a device trusted its hostToken-authed hub for every op. Now the device holds a closed list of FLAGS —
 * what its hub may do there — written by the person who runs the install command ON the device (`--allow run,files,…`,
 * `-Allow` on Windows → <root>/state/policy.json, 0600, through the agent's own `--write-policy`). The hub cannot widen
 * it: the device refuses a hub write / move / removal of that file by path (`policy_is_the_devices`), reads it ONCE at
 * boot, and judges every op after `authed` and before dispatch. The hub's ONE send point asks the same verdict first (a
 * refused act never travels); the device decides regardless (defence in depth).
 *   · FLAGS — run (commands; desktop apps, a browser, a Settings pane), files (write / move / remove / place / serve a
 *     file, a tunnel back to the hub — READS are facts and never gated), input (keys and pointer), socks (a SOCKS exit),
 *     lan (a socket to ANOTHER host of its network), sessions (conversations and terminals, the text posted into them,
 *     their pool orders), upgrade (the hub replaces the agent's code).
 *   · IMPLIES — a conversation runs commands and writes its own tools: `sessions` brings `run` + `files` (the dialog
 *     ticks them with it; the parser adds them).
 *   · FLAG_OF — every op of device-acts' session / act / code layers maps to exactly ONE flag; `hello` (the handshake
 *     itself — its answer carries this list) and the STOPS (ending what is open never widens anything) are ALWAYS;
 *     the read layer is never gated. scripts/test-device-policy.mjs reds a row without one. An op the table does not
 *     know needs EVERY flag (fail closed); an unknown action of a known op family takes the family's flag.
 *   · defaults — a LOCAL instance's pairing command says `--allow all`; a CLUSTER instance's (VIBESPACE_INSTANCE_NAME
 *     on the hub) `run,files,sessions,upgrade`: no socks, no LAN, no keys.
 *   · no state/policy.json = paired before this lane: everything, said so (`legacy`); an unreadable file allows only
 *     reads (`unreadable`) until the command runs again.
 *   · the refusal — `{ok:false, code:'op-not-allowed', flag, op, allow, remedy}`: the remedy is THE re-run sentence with
 *     the command's whole new list (`--allow input` alone would drop the rest).
 * What it does NOT bound: with `run` (or `sessions`) on, the hub can rewrite the file through a shell — the list then
 * bounds the honest hub's own features and its agents, and a rewrite waits for the agent's next start.
 */
const DA = require('./device-acts.js');

const FLAGS = Object.freeze(['run', 'files', 'input', 'socks', 'lan', 'sessions', 'upgrade']);
const LOCAL_DEFAULT = FLAGS;
const CLUSTER_DEFAULT = Object.freeze(['run', 'files', 'sessions', 'upgrade']);
const IMPLIES = Object.freeze({ sessions: Object.freeze(['run', 'files']) });
const FILE = 'policy.json'; // under the agent root's state/
const OWN_CODE = 'policy_is_the_devices';

// THE TABLE — a key of device-acts' TABLE (an op, or op:action) → the ONE flag it needs.
const FLAG_OF = Object.freeze({
  // ── session layer ──
  'open-session': 'sessions', 'resize-session': 'sessions', 'open-pipe-session': 'sessions', 'attach-pipe-session': 'sessions',
  'opencode-serve': 'sessions',
  'tcp-listen': 'files',          // the reverse tunnel back to THIS hub: a push mount's door, a session's API (sessions ⇒ files)
  'desktop-serve:launch': 'run', 'desktop-serve:relaunch': 'run', 'desktop-serve:fit': 'run', 'desktop-serve:keep-alive': 'run',
  'desktop-serve:pin': 'run', 'desktop-serve:app-unstage': 'run', 'desktop-serve:app-forget': 'run', 'desktop-serve:app-adopt-drift': 'run',
  // ── act layer ──
  'run-cmd': 'run', 'run-stream': 'run',
  'place-secret': 'files', 'serve-folder': 'files',
  'fs-op:write': 'files', 'fs-op:rm': 'files', 'fs-op:rename': 'files', 'fs-op:mkdir': 'files', 'fs-op:copy': 'files',
  'fs-op:move': 'files', 'fs-op:write-stream': 'files', 'design-fs:write-user': 'files',
  'input-events': 'input', 'desktop-grab': 'input', 'desktop-input': 'input',
  'serve-socks': 'socks',
  'tcp-connect': 'lan',           // another host of the device's network (its own loopback is a read — device-acts keyOf)
  'desktop-serve:app-install': 'run', 'desktop-serve:app-remove': 'run', 'desktop-serve:app-fetch': 'run',
  'browser-serve:start': 'run', 'browser-serve:remove': 'run',
  'settings-open': 'run', 'window-pin': 'run',
  'peer-post': 'sessions', 'pool-orders': 'sessions',
  // ── code layer ──
  'upgrade': 'upgrade',
});
// Never refused (a reason each — the census reads it): the handshake, and ending what is already open.
const ALWAYS = Object.freeze({
  'hello': 'the handshake itself — its answer carries this list',
  'kill-session': 'a stop', 'kill-pipe-session': 'a stop', 'tcp-unlisten': 'a stop', 'unserve-folder': 'a stop',
  'unserve-socks': 'a stop', 'desktop-serve:stop': 'a stop', 'desktop-serve:close-asked': 'a stop',
  'browser-serve:stop': 'a stop', 'browser-serve:end-daemon': 'a stop',
});
const FAMILY = Object.freeze({ 'fs-op': 'files', 'design-fs': 'files', 'desktop-serve': 'run', 'browser-serve': 'run' });

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/** A list in FLAGS order, IMPLIES applied, unknown words dropped. */
function normalize(list) {
  const set = new Set();
  for (const f of Array.isArray(list) ? list : []) if (FLAGS.includes(f)) { set.add(f); for (const g of IMPLIES[f] || []) set.add(g); }
  return FLAGS.filter((f) => set.has(f));
}
/** The `--allow` value: `all`, `none`, or flags separated by commas / spaces. → {ok, allow, all} | {ok:false, error, unknown} */
function parseAllow(text) {
  const words = String(text == null ? '' : text).toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!words.length) return { ok: false, error: `name what the hub may do here — all, none, or some of: ${FLAGS.join(', ')}`, unknown: [] };
  if (words.length === 1 && words[0] === 'all') return { ok: true, allow: FLAGS.slice(), all: true };
  if (words.length === 1 && words[0] === 'none') return { ok: true, allow: [], all: false };
  const unknown = words.filter((w) => !FLAGS.includes(w));
  if (unknown.length) return { ok: false, error: `unknown: ${unknown.join(', ')} — the flags are ${FLAGS.join(', ')} (or all / none)`, unknown };
  const allow = normalize(words);
  return { ok: true, allow, all: allow.length === FLAGS.length };
}
/** The list a pairing command says when the person changes nothing. */
const defaultAllow = ({ cluster = false } = {}) => (cluster ? CLUSTER_DEFAULT.slice() : LOCAL_DEFAULT.slice());
/** An install command's argv (`--allow x` / `--allow=x` / `-Allow x`) → its list; absent ⇒ the instance kind's default. */
function policyOf(args, { cluster = false } = {}) {
  const a = Array.isArray(args) ? args.map(String) : [];
  let val = null;
  for (let i = 0; i < a.length; i++) {
    if (/^(--allow|-allow)$/i.test(a[i])) { val = a[i + 1] == null ? '' : a[i + 1]; break; }
    const m = /^--allow=(.*)$/i.exec(a[i]); if (m) { val = m[1]; break; }
  }
  if (val === null) { const allow = defaultAllow({ cluster }); return { ok: true, allow, all: allow.length === FLAGS.length, defaulted: true }; }
  return parseAllow(val);
}
/** The argument text of a list: `all` when it is every flag, else the flags joined by commas (`none` when empty). */
const allowArg = (list) => { const n = normalize(list); return n.length === FLAGS.length ? 'all' : n.length ? n.join(',') : 'none'; };
/** The flag spelling of the installer of a platform (PowerShell's scriptblock parameter on Windows). */
const allowFlagOf = (platform) => (platform === 'win32' || platform === 'win' ? '-Allow' : '--allow');
/** The JSON the installer writes (via the agent's own --write-policy). */
const fileOf = (r, { at = 0 } = {}) => ({ v: 1, allow: normalize(r && r.allow), all: !!(r && r.all), at: Number(at) || 0, by: 'install' });
/** The device's policy from its file's text: null (no file) ⇒ legacy, every flag; anything not a v1 list ⇒ unreadable. */
function readOf(text) {
  if (text == null) return { v: 1, allow: FLAGS.slice(), all: true, source: 'legacy', at: 0 };
  let j = null; try { j = JSON.parse(String(text)); } catch { j = null; }
  if (!j || typeof j !== 'object' || j.v !== 1 || !Array.isArray(j.allow) || j.allow.some((f) => !FLAGS.includes(f))) return { v: 1, allow: [], all: false, source: 'unreadable', at: 0 };
  const allow = j.all === true ? FLAGS.slice() : normalize(j.allow);
  return { v: 1, allow, all: j.all === true, source: 'install', at: Number(j.at) || 0 };
}
/** A stated policy (a hello-ack's, a host record's) bounded: → {v, allow, all, source, at} | null. */
function reportOf(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.allow)) return null;
  const source = ['install', 'legacy', 'unreadable'].includes(p.source) ? p.source : 'install';
  const allow = p.all === true ? FLAGS.slice() : normalize(p.allow);
  return { v: 1, allow, all: p.all === true || allow.length === FLAGS.length, source, at: Number(p.at) || 0 };
}
const allowSet = (p) => new Set(p && p.all === true ? FLAGS : normalize(p && p.allow));
/** Does the policy allow the flag? (no policy stated = not judged = yes) */
const allows = (p, flag) => (!p ? true : allowSet(p).has(flag));
/** The flag a request needs: null = never gated (a read, the handshake, a stop), 'all' = an op the table does not know. */
function flagOf(payload) {
  if (DA.layerOf(payload) === 'read') return null;
  const k = DA.keyOf(payload);
  if (has(ALWAYS, k)) return null;
  if (has(FLAG_OF, k)) return FLAG_OF[k];
  const fam = k.includes(':') ? k.slice(0, k.indexOf(':')) : '';
  return has(FAMILY, fam) ? FAMILY[fam] : 'all';
}
/** THE re-run sentence: the command's whole new list (the current one + what was refused). */
function remedyOf({ machine = null, allow = [], flag, platform = null } = {}) {
  const next = flag === 'all' ? FLAGS.slice() : normalize([...(allow || []), flag]);
  return `re-run the pairing command on ${machine ? JSON.stringify(String(machine).slice(0, 80)) : 'this machine'} with ${allowFlagOf(platform)} ${allowArg(next)}`;
}
/** THE verdict, on both ends. → {ok:true} | {ok:false, code:'op-not-allowed', flag, op, allow, remedy}. No policy = not judged. */
function verdict(policy, payload, { machine = null, platform = null } = {}) {
  if (!policy) return { ok: true, unjudged: true };
  const flag = flagOf(payload);
  if (!flag) return { ok: true };
  const set = allowSet(policy);
  if (flag === 'all' ? FLAGS.every((f) => set.has(f)) : set.has(flag)) return { ok: true };
  const allow = FLAGS.filter((f) => set.has(f));
  return { ok: false, code: 'op-not-allowed', flag, op: DA.keyOf(payload), allow, remedy: remedyOf({ machine, allow, flag, platform }) };
}
/** The refusal as one English sentence (the CLI, a route's error, the journal). */
function sentenceOf(v, { machine = null } = {}) {
  if (!v || v.ok) return '';
  if (v.code === OWN_CODE) return `${OWN_CODE}: ${v.path || 'state/' + FILE} is the machine's own allow list — only the pairing command, run on the machine, changes it`;
  const who = machine ? `${JSON.stringify(String(machine).slice(0, 80))}'s own` : "this machine's";
  const need = v.flag === 'all' ? 'every flag (the allow list does not know it)' : JSON.stringify(v.flag);
  return `op-not-allowed: ${v.op} needs ${need} — ${who} allow list leaves it off (it allows: ${v.allow && v.allow.length ? v.allow.join(', ') : 'nothing but reads'}); ${v.remedy}`;
}
/**
 * Would this request change the device's policy file? (the device asks before anything else — even with `files` on).
 * Lexical, on the device's own path module (handed in — PURE): `~` is its home; Windows compares case-insensitively.
 * A write / place / mkdir / stream onto the file itself; a removal / rename / move OF the file or a folder above it; a
 * rename / move / copy ONTO it (a copy onto a folder above it too).
 */
function touchesPolicy(payload, { policyFile, home = '', pathMod } = {}) {
  const P = pathMod;
  if (!P || !policyFile || !payload || typeof payload !== 'object') return false;
  const win = P.sep === '\\';
  const cmp = (s) => (win ? s.toLowerCase() : s);
  const abs = (x) => {
    let t = String(x == null ? '' : x);
    if (!t) return null;
    if (t === '~' || /^~[\\/]/.test(t)) t = P.join(home, t.slice(1));
    return P.isAbsolute(t) ? P.resolve(t) : null;
  };
  const target = cmp(P.resolve(policyFile));
  const same = (a) => !!a && cmp(a) === target;
  const above = (a) => !!a && (same(a) || target.startsWith(cmp(a).replace(/[\\/]+$/, '') + P.sep));
  const k = DA.keyOf(payload);
  if (k === 'place-secret') return same(abs(payload.path));
  if (!k.startsWith('fs-op:') || DA.layerOf(payload) === 'read') return false;
  const action = k.slice(6);
  if (action === 'write' || action === 'write-stream' || action === 'mkdir') return same(abs(payload.path));
  if (action === 'copy') return above(abs(payload.to));
  return above(abs(payload.path)) || same(abs(payload.to)); // rm / rename / move / an action not known here
}
/** The refusal of a request that touches the file. */
const ownRefusal = (path) => ({ ok: false, code: OWN_CODE, flag: null, path: path || null });

module.exports = {
  FLAGS, LOCAL_DEFAULT, CLUSTER_DEFAULT, IMPLIES, FLAG_OF, ALWAYS, FAMILY, FILE, OWN_CODE,
  normalize, parseAllow, defaultAllow, policyOf, allowArg, allowFlagOf, fileOf, readOf, reportOf, allows, flagOf,
  remedyOf, verdict, sentenceOf, touchesPolicy, ownRefusal,
};
