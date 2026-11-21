'use strict';
// row B-437e, the files tier, U0 (lane lg-rewind, 主开发 r1080 (A)) — THE CHECKPOINT SWITCH'S VERDICT. PURE: reads nothing; its one
// import is the PURE src/cli-caps.js (the one CLI version spelling). Its own module, not cli-caps: cli-caps ships in the device
// agent's bundle (src/machine-probes.js reads its version spelling), and nothing on a device judges this measurement — the
// readers are the probe (src/claude-oat-probe.js), the release road (scripts/measure-claude-cred-read.mjs) and their suites.
const { cliVersionOf } = require('./cli-caps.js');
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isRecord = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

// ── THE CHECKPOINT SWITCH, MEASURED BEFORE IT IS SET (row B-437e, the files tier, U0 — 主开发 r1080 (A)) ──────────────────────
// On our road (claude -p, stream-json) the CLI keeps file checkpoints only when it starts with CKPT_SWITCH=true (read from
// 2.1.322's bytes: the programmatic kit's `enableFileCheckpointing` sets exactly that). The switch is the vendor kit's own name,
// so before it is set on ANY conversation the measurement (src/claude-oat-probe.js variants CKPT_VARIANTS — the same short turn
// that reads and edits one scratch note, without and with the switch, the vendor's program only against the loopback mock with
// made-up sign-in values) proves it changes NOTHING the CLI sends: every request's header names and values (the sign-in ones
// as the mock's labels; the per-request ids by name only), the body's top-level keys and its kind and identity fields, the
// count requests, and every call with its count (OTel events with their attributes, OAuth, refused escapes). ANY difference
// STOPS the tier (it goes to 主开发). Then the scratch home's checkpoint files say whether the switch did anything at all.
const CKPT_SWITCH = 'CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING';
const CKPT_VARIANTS = Object.freeze(['ckpt-off', 'ckpt-on']);
// per request or per process by nature — compared by NAME only (the mock keeps every other header's value)
const CKPT_VOLATILE = Object.freeze(['x-claude-code-session-id', 'x-client-request-id']);
// a header the mock keeps RAW (it labels only authorization and x-api-key): compared by value, its value NEVER shown
const CKPT_SECRET = Object.freeze(['cookie', 'proxy-authorization']);
// the body's top-level keys and its kind fields as the mock records them (src/claude-oat-probe.js the request record):
// systemHead = a digest of the system's FIRST block (the client's identity prefix); userId = metadata.user_id with the
// run's own session id masked (the account and the device in it compared); toolChoice / contextManagement = their values
const CKPT_BODY_KINDS = Object.freeze(['keys', 'model', 'max_tokens', 'stream', 'betas', 'thinking', 'tools', 'toolNames', 'system', 'systemHead', 'metadataKeys', 'userId', 'toolChoice', 'contextManagement']);
/** PURE — the switch measured: `off` / `on` = one run's summary {heads: [{path, headers: {name: value}, body: {…CKPT_BODY_KINDS}}],
 *  countHeads: [the count_tokens requests, the same shape], calls: [string, repeats kept — the calls, OTel events with their
 *  attributes, OAuth calls, refused escapes], files: n (checkpoint files under its scratch home), edited, turnOk} →
 *  {verdict: 'SAME' | 'DIFFERENT' | 'ALREADY-ON' | 'NO-EFFECT' | 'INCOMPLETE', stop, findings: [string], files: {off, on}}.
 *  Heads are matched by their path, stream and tool names (a side request racing the main one never reads as a difference),
 *  in order within one kind; calls by their COUNT. DIFFERENT (stop: true) = anything sent differs. A turn that did not finish
 *  is INCOMPLETE — never read as «the switch changes what is sent» */
function ckptVerdict(off, on) {
  const runOk = (r) => isRecord(r) && Array.isArray(r.heads) && Array.isArray(r.calls);
  if (!runOk(off) || !runOk(on)) return { verdict: 'INCOMPLETE', stop: false, findings: ['both runs are needed (ckpt-off, then ckpt-on, in one invocation)'], files: null };
  const files = { off: Number(off.files) || 0, on: Number(on.files) || 0 };
  if (off.turnOk !== true || on.turnOk !== true) return { verdict: 'INCOMPLETE', stop: false, findings: [`the turn did not finish (${[off.turnOk !== true ? 'without' : null, on.turnOk !== true ? 'with' : null].filter(Boolean).join(' and ')} the switch) — nothing is judged`], files };
  const show = (v) => (v === undefined ? '(none)' : String(typeof v === 'string' ? v : JSON.stringify(v)).slice(0, 120));
  const f = [];
  const kindOf = (h) => `${String((h && h.path) || '')} ${h && h.body && h.body.stream ? 'stream' : 'ns'} ${JSON.stringify((h && h.body && h.body.toolNames) || null)}`;
  const compareHeads = (A, B, what) => {
    const group = (L) => { const m = new Map(); for (const h of L) { const k = kindOf(h); if (!m.has(k)) m.set(k, []); m.get(k).push(h); } return m; };
    const ga = group(Array.isArray(A) ? A : []), gb = group(Array.isArray(B) ? B : []);
    for (const k of [...new Set([...ga.keys(), ...gb.keys()])].sort()) {
      const la = ga.get(k) || [], lb = gb.get(k) || [];
      if (la.length !== lb.length) f.push(`${what} ${k}: ${la.length} without the switch | ${lb.length} with it`);
      for (let i = 0; i < Math.min(la.length, lb.length); i++) {
        const a = la[i] || {}, b = lb[i] || {}, at = `${what} ${k} #${i + 1}`;
        const ha = isRecord(a.headers) ? a.headers : {}, hb = isRecord(b.headers) ? b.headers : {};
        for (const n of [...new Set([...Object.keys(ha), ...Object.keys(hb)])].sort()) {
          const lo = n.toLowerCase();
          if (!own(hb, n)) f.push(`${at} header only without the switch: ${n}`);
          else if (!own(ha, n)) f.push(`${at} header only with the switch: ${n}`);
          else if (!CKPT_VOLATILE.includes(lo) && String(ha[n]) !== String(hb[n])) f.push(CKPT_SECRET.includes(lo) ? `${at} header ${n} differs (its value is not shown)` : `${at} header ${n}: ${show(ha[n])} | ${show(hb[n])}`);
        }
        const ba = isRecord(a.body) ? a.body : {}, bb = isRecord(b.body) ? b.body : {};
        for (const key of CKPT_BODY_KINDS) if (JSON.stringify(ba[key]) !== JSON.stringify(bb[key])) f.push(`${at} body ${key}: ${show(ba[key])} | ${show(bb[key])}`);
      }
    }
  };
  compareHeads(off.heads, on.heads, 'request');
  compareHeads(off.countHeads, on.countHeads, 'count request');
  const tally = (L) => { const m = new Map(); for (const c of L.map(String)) m.set(c, (m.get(c) || 0) + 1); return m; };
  const ta = tally(off.calls), tb = tally(on.calls);
  for (const c of [...new Set([...ta.keys(), ...tb.keys()])].sort()) if ((ta.get(c) || 0) !== (tb.get(c) || 0)) f.push(`call ${c}: ${ta.get(c) || 0} without the switch | ${tb.get(c) || 0} with it`);
  if (f.length) return { verdict: 'DIFFERENT', stop: true, findings: f, files };
  if (!off.edited || !on.edited) return { verdict: 'INCOMPLETE', stop: false, findings: [`the turn did not edit the note (${[!off.edited ? 'without' : null, !on.edited ? 'with' : null].filter(Boolean).join(' and ')} the switch) — nothing to keep a checkpoint of`], files };
  if (files.off > 0) return { verdict: 'ALREADY-ON', stop: false, findings: [`${files.off} checkpoint file(s) WITHOUT the switch: this road keeps checkpoints already`], files };
  if (files.on === 0) return { verdict: 'NO-EFFECT', stop: false, findings: ['no checkpoint file with the switch: it does nothing on this road'], files };
  return { verdict: 'SAME', stop: false, findings: [], files };
}
/** the measured answer for one CLI version (scripts/fixtures/claude-checkpoint-switch.json, written by
 *  `measure-claude-cred-read --variant ckpt --write-ckpt-fixture`) → 'SAME' | the other verdict | null (not measured; a record
 *  under the key that names another version counts for nothing) */
function ckptSwitchOf(version, fixture) {
  const v = cliVersionOf(version);
  const rec = v && isRecord(fixture) && isRecord(fixture.versions) && own(fixture.versions, v) ? fixture.versions[v] : null;
  return isRecord(rec) && cliVersionOf(rec.cliVersion) === v && typeof rec.verdict === 'string' ? rec.verdict : null;
}

module.exports = { CKPT_SWITCH, CKPT_VARIANTS, CKPT_VOLATILE, CKPT_SECRET, CKPT_BODY_KINDS, ckptVerdict, ckptSwitchOf };
