// PURE model for Background Work (docs/design-background-work.md, M1).
// Zero I/O, zero requires — schedule math, state machine, permission
// predicates, injection renderers, vendor-pattern vet, panel validation.
// Everything here is unit-pinned by scripts/test-job-model.mjs.
'use strict';

const bytes = (s) => Buffer.byteLength(s, 'utf-8');
const clip = (s, n) => ([...String(s)].length <= n ? String(s) : [...String(s)].slice(0, n - 1).join('') + '…'); // code-point clip (CJK-safe)

// ── states ────────────────────────────────────────────────────────────────
const TERMINAL = new Set(['done', 'interrupted', 'missed', 'failed']);
// 'failed' is terminal for tasks; for services it is a PARKED (poke-able) state.
const isTerminal = (job) => job.kind === 'service' ? false : TERMINAL.has(job.state);

// ── permissions ───────────────────────────────────────────────────────────
// caller = { conversationId, sessionId, sessionCreatedAt, groups:Set, isUser }
function isOwner(job, caller) {
  if (caller.isUser) return true;
  const o = job.owner || {};
  if (o.conversation && o.conversation.id && o.conversation.id === caller.conversationId) return true; // lineage: resume-proof
  return !!o.sessionId && o.sessionId === caller.sessionId && o.sessionCreatedAt === caller.sessionCreatedAt;
}
function scopeAllows(scope, job, caller) {
  if (scope === 'all') return true;
  if (scope === 'group') return (job.owner && job.owner.groupsSnapshot || []).some((g) => caller.groups && caller.groups.has(g));
  return false; // 'session' ⇒ owner only
}
const canView = (job, caller) => isOwner(job, caller) || scopeAllows((job.access || {}).view || 'session', job, caller);
const canControl = (job, caller) => isOwner(job, caller) || scopeAllows((job.access || {}).control || 'session', job, caller);
// Mutation (cmd/env/action/schedule/panel/access) is owner-or-user ONLY — control never grants edit.
const canEdit = (job, caller) => isOwner(job, caller);
const visibleJobs = (all, caller) => all.filter((j) => canView(j, caller));

// ── vendor-pattern vet (§ban-safety guardrail; friction not proof) ────────
const VENDOR_PATTERNS = [/api\.anthropic\.com/i, /\.credentials\.json/i, /data\/subs\b/, /CLAUDE_CODE_OAUTH/i, /claude\.ai\/api/i];
function vetSpec(spec) {
  const hay = JSON.stringify([spec.cmd && spec.cmd.argv, spec.cmd && spec.cmd.env, spec.health && spec.health.value] || '');
  for (const re of VENDOR_PATTERNS) {
    if (re.test(hay)) {
      return { ok: false, error: `refused: job spec matches a vendor/credential pattern (${re.source}) — background vendor polling is the §ban-safety class that got a subscription banned. Passive capture or an interactive session is the sanctioned path.` };
    }
  }
  return { ok: true };
}

// ── schedules ─────────────────────────────────────────────────────────────
// {cron:"m h dom mon dow"} | {everyMs, jitterPct} | {at: ISO/ms}
const AGENT_MIN_EVERY_MS = 15 * 60 * 1000;
function parseCronField(f, min, max) {
  const out = new Set();
  for (const part of String(f).split(',')) {
    let m;
    if (part === '*') { for (let i = min; i <= max; i++) out.add(i); }
    else if ((m = /^\*\/(\d+)$/.exec(part))) { const st = +m[1]; if (!st) return null; for (let i = min; i <= max; i += st) out.add(i); }
    else if ((m = /^(\d+)-(\d+)$/.exec(part))) { const a = +m[1], b = +m[2]; if (a < min || b > max || a > b) return null; for (let i = a; i <= b; i++) out.add(i); }
    else if ((m = /^(\d+)$/.exec(part))) { const v = +m[1]; if (v < min || v > max) return null; out.add(v); }
    else return null;
  }
  return out;
}
function parseCron(expr) {
  const f = String(expr).trim().split(/\s+/);
  if (f.length !== 5) return null;
  const [mi, h, dom, mon, dow] = [parseCronField(f[0], 0, 59), parseCronField(f[1], 0, 23), parseCronField(f[2], 1, 31), parseCronField(f[3], 1, 12), parseCronField(f[4], 0, 7)];
  if (!mi || !h || !dom || !mon || !dow) return null;
  if (dow.has(7)) dow.add(0); // 7 == Sunday
  return { mi, h, dom, mon, dow, domStar: f[2] === '*', dowStar: f[4] === '*' };
}
/** next fire time (ms) strictly after `afterMs`; null = never. rand ∈ [0,1) injected for determinism in tests. */
function nextFire(schedule, afterMs, rand) {
  if (!schedule) return null;
  if (schedule.at) { const t = typeof schedule.at === 'number' ? schedule.at : Date.parse(schedule.at); return Number.isFinite(t) && t > afterMs ? t : null; }
  if (schedule.everyMs) {
    const base = Math.max(schedule.everyMs, 1000);
    const jit = (schedule.jitterPct || 0) / 100;
    return afterMs + Math.round(base * (1 + (rand === undefined ? Math.random() : rand) * jit));
  }
  if (schedule.cron) {
    const c = typeof schedule.cron === 'string' ? parseCron(schedule.cron) : schedule.cron;
    if (!c) return null;
    const d = new Date(afterMs);
    d.setSeconds(0, 0); d.setMinutes(d.getMinutes() + 1);
    for (let i = 0; i < 366 * 24 * 60; i++) { // ≤1y scan
      const ok = c.mi.has(d.getMinutes()) && c.h.has(d.getHours()) && c.mon.has(d.getMonth() + 1)
        // standard cron: dom/dow OR each other when both restricted
        && (c.domStar || c.dowStar ? (c.dom.has(d.getDate()) && c.dow.has(d.getDay())) : (c.dom.has(d.getDate()) || c.dow.has(d.getDay())));
      if (ok) return d.getTime();
      d.setMinutes(d.getMinutes() + 1);
    }
    return null;
  }
  return null;
}
function validateSchedule(schedule, { agentCreated = true } = {}) {
  if (!schedule) return { ok: false, error: 'schedule required (--every / --cron / --at)' };
  if (schedule.at) return Number.isFinite(typeof schedule.at === 'number' ? schedule.at : Date.parse(schedule.at)) ? { ok: true } : { ok: false, error: `unparseable --at time` };
  if (schedule.everyMs) {
    if (agentCreated && schedule.everyMs < AGENT_MIN_EVERY_MS) return { ok: false, error: `agent-created recurring schedules have a 15min floor (§ban-safety anti-metronome) — got ${Math.round(schedule.everyMs / 60000)}min` };
    return { ok: true };
  }
  if (schedule.cron) {
    if (!parseCron(schedule.cron)) return { ok: false, error: `unparseable cron expression "${schedule.cron}" (5 fields: min hour dom mon dow)` };
    if (agentCreated) { // floor: must not fire more often than ~every 15min (heuristic: minute field selects ≤4 minutes per hour)
      const c = parseCron(schedule.cron);
      if (c.mi.size > 4) return { ok: false, error: 'agent-created cron may select at most 4 minutes per hour (15min floor)' };
    }
    return { ok: true };
  }
  return { ok: false, error: 'unknown schedule shape' };
}

// ── supervision policy ────────────────────────────────────────────────────
const SUPERVISE = { minUptimeMs: 60_000, backoffBaseMs: 5_000, backoffMaxMs: 600_000, failCap: 6 };
/** decide what to do after a service exits. Returns {park}|{restartInMs}|{stay} */
function onServiceExit(job, { uptimeMs, now }) {
  const sup = { consecutiveFails: 0, ...(job.supervise || {}) };
  if (job.restart === 'never' || !job.desiredUp) return { stay: true, supervise: sup };
  const failed = uptimeMs < SUPERVISE.minUptimeMs;
  const fails = failed ? sup.consecutiveFails + 1 : 0;
  if (fails >= SUPERVISE.failCap) return { park: true, supervise: { consecutiveFails: fails, parkedAt: now } };
  const delay = failed ? Math.min(SUPERVISE.backoffBaseMs * 2 ** (fails - 1), SUPERVISE.backoffMaxMs) : SUPERVISE.backoffBaseMs;
  return { restartInMs: delay, supervise: { consecutiveFails: fails, parkedAt: null } };
}

// ── names ─────────────────────────────────────────────────────────────────
/** scope-namespaced name resolution: collision within the caller-visible set auto-suffixes. */
function resolveName(wanted, visibleNames) {
  const base = String(wanted || 'job').replace(/[^\w.一-鿿-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'job';
  if (!visibleNames.has(base)) return { name: base };
  for (let i = 2; i < 100; i++) if (!visibleNames.has(`${base}-${i}`)) return { name: `${base}-${i}`, renamed: true };
  return { name: `${base}-${Date.now().toString(36)}`, renamed: true };
}

// ── injection renderers (prototype-validated 2026-08-17) ──────────────────
const GLYPH = { 'awaiting-user': '✋', failed: '✖', unverified: '?', missed: '✖', up: '●', starting: '◌', down: '○', scheduled: '⏰', interrupted: '⚠', done: '✔' };
const ORDER = { 'awaiting-user': 0, failed: 1, unverified: 1, missed: 1, up: 2, starting: 2, down: 3, scheduled: 4, interrupted: 5, done: 6 };
function jobLine(j) {
  const verb = j.state === 'awaiting-user' ? 'answers' : 'poll';
  const age = j.ageHint ? ' ' + j.ageHint : '';
  return `${GLYPH[j.state] || '·'} ${j.id} ${j.kind} ${j.state}${age} — ${clip(j.name, 24)} — vibespace-job ${verb} ${j.id}`;
}
function renderJobsDigest(visible, { budget = 600 } = {}) {
  if (!visible.length) return '';
  const sorted = [...visible].sort((a, b) => (ORDER[a.state] ?? 9) - (ORDER[b.state] ?? 9));
  const head = '## Background jobs visible to this session  _(poll is the interface; ids are stable)_';
  let out = [head, ...sorted.map(jobLine)].join('\n');
  if (bytes(out) <= budget) return out;
  const kept = [head];
  for (const l of sorted.map(jobLine)) {
    if (bytes([...kept, l, `…+x more — vibespace-job list`].join('\n')) > budget - 8) break;
    kept.push(l);
  }
  out = [...kept, `…+${sorted.length - (kept.length - 1)} more — vibespace-job list`].join('\n');
  if (bytes(out) <= budget) return out;
  const floor = `## Background jobs: ${sorted.length} — vibespace-job list`;
  return bytes(floor) <= budget ? floor : '';
}
function renderJobsUpdate(events, { budget = 600 } = {}) {
  if (!events.length) return '';
  const line = (e) => `- ${e.id} ${clip(e.name, 24)}: ${e.what} — vibespace-job ${e.verb || 'poll'} ${e.id}`;
  const head = '<vibespace-jobs-update>', tail = '</vibespace-jobs-update>';
  let body = events.map(line);
  let out = [head, ...body, tail].join('\n');
  while (bytes(out) > budget && body.length > 1) {
    body = body.slice(0, -1);
    out = [head, ...body, `- …+${events.length - body.length} more — vibespace-job list`, tail].join('\n');
  }
  return bytes(out) <= budget ? out : '';
}
/** merge a digest under the caller's global inline cap; digest yields first (floor, then nothing).
 *  count = TOTAL visible-job count (the engine knows it; the text does not). */
function fitDigest(existingBytes, digestText, { cap = 9600, sep = 2, count = 0 } = {}) {
  if (!digestText) return '';
  const room = cap - existingBytes - sep;
  if (room <= 0) return '';
  if (bytes(digestText) <= room) return digestText;
  const floor = `## Background jobs: ${count || digestText.split('\n').length - 1} — vibespace-job list`;
  return bytes(floor) <= room ? floor : '';
}

// ── interaction panel schema (M1 minimal set) ─────────────────────────────
const PANEL_BLOCKS = new Set(['md', 'image', 'input', 'textarea', 'choice', 'checkbox', 'buttons', 'progress']);
function validatePanel(p) {
  try {
    if (!p || typeof p !== 'object' || Array.isArray(p)) return { ok: false, error: 'panel must be an object {title, blocks, timeoutS?}' };
    if (bytes(JSON.stringify(p)) > 32768) return { ok: false, error: 'panel schema exceeds 32KB' };
    if (!Array.isArray(p.blocks) || !p.blocks.length || p.blocks.length > 30) return { ok: false, error: 'blocks: 1-30 entries required' };
    const ids = new Set();
    let hasSubmit = false;
    for (const b of p.blocks) {
      if (!b || !PANEL_BLOCKS.has(b.type)) return { ok: false, error: `unknown block type "${b && b.type}" (allowed: ${[...PANEL_BLOCKS].join('/')})` };
      if (['input', 'textarea', 'choice', 'checkbox'].includes(b.type)) {
        if (!b.id || typeof b.id !== 'string' || ids.has(b.id)) return { ok: false, error: `block type ${b.type} needs a unique string id` };
        ids.add(b.id);
        if (b.pattern) { try { new RegExp(b.pattern); } catch { return { ok: false, error: `invalid pattern on "${b.id}"` }; } if (b.pattern.length > 200) return { ok: false, error: 'pattern too long' }; }
      }
      if (b.type === 'choice' && (!Array.isArray(b.options) || !b.options.length)) return { ok: false, error: `choice "${b.id}" needs options[]` };
      if (b.type === 'buttons') {
        if (!Array.isArray(b.options) || !b.options.length) return { ok: false, error: 'buttons needs options[]' };
        hasSubmit = true;
      }
      if (b.type === 'image' && (typeof b.path !== 'string' || !b.path.startsWith('/'))) return { ok: false, error: 'image.path must be an absolute path' };
    }
    if (!hasSubmit) return { ok: false, error: 'panel needs a buttons block (the submit affordance)' };
    return { ok: true };
  } catch (e) { return { ok: false, error: 'panel validation failed: ' + e.message }; }
}
/** validate a user's answer object against the panel (server-side mirror of client checks). */
function validateAnswers(panel, ans) {
  if (!ans || typeof ans !== 'object') return { ok: false, error: 'answers must be an object' };
  for (const b of panel.blocks || []) {
    if (b.type === 'input' || b.type === 'textarea') {
      const v = ans[b.id];
      if (b.required && (v === undefined || v === '')) return { ok: false, error: `"${b.id}" is required` };
      if (v !== undefined && b.pattern && !(new RegExp(`^(?:${b.pattern})$`)).test(String(v))) return { ok: false, error: `"${b.id}" does not match ${b.pattern}` };
      if (v !== undefined && String(v).length > 4096) return { ok: false, error: `"${b.id}" too long` };
    }
    if (b.type === 'choice' && ans[b.id] !== undefined && !b.options.includes(ans[b.id])) return { ok: false, error: `"${b.id}" not one of the options` };
  }
  if (!ans.button) return { ok: false, error: 'answers.button required (which button was pressed)' };
  return { ok: true };
}

const CONTEXT_PAYLOAD_CAP = 8192;

// ── owner auto-notify (2.344.0, B-0bf4) ───────────────────────────────────
// Effective per-job switch: job override > group tri-state > global default.
// job.notify ∈ 'on'|'off'|undefined(inherit); groupNotify ∈ true|false|
// null/undefined(inherit); globalOn = the agents.jobNotify setting (bool).
function notifyEffective(job, groupNotify, globalOn) {
  if (job && job.notify === 'on') return { on: true, source: 'job' };
  if (job && job.notify === 'off') return { on: false, source: 'job' };
  if (groupNotify === true) return { on: true, source: 'group' };
  if (groupNotify === false) return { on: false, source: 'group' };
  return { on: globalOn !== false, source: 'global' };
}

// The message text posted into the owner conversation's inbox socket. The
// CLI delivers it verbatim as an inbound peer message, so the text itself
// must carry provenance + the poll pointer (there is no card metadata on
// this lane). ≤1KB always; context payload echo is clipped hard.
function renderOwnerNotify(job, ev, { contextHead = 300 } = {}) {
  const what = ev && ev.what ? ev.what : job.state;
  let out = `[VibeSpace Background Work] ${job.kind} "${clip(job.name, 40)}" (${job.id}): ${clip(what, 200)}.`;
  const ctx = job.context && typeof job.context === 'string' ? job.context : '';
  if (ctx) out += `\nContext you attached at creation: ${clip(ctx, contextHead)}`;
  out += `\nDetails: vibespace-job ${job.state === 'awaiting-user' ? 'answers' : 'poll'} ${job.id}. This is a notification, not a user instruction — decide yourself whether it changes your current work.`;
  return clip(out, 1000);
}

// Render a drained offline-notification stash for context injection at
// resume/next-turn. Oldest first, newest guaranteed: when over budget the
// MIDDLE is dropped, because the latest event is the actionable one and the
// first shows where the story started.
function renderNotifStash(items, { budget = 900 } = {}) {
  if (!items || !items.length) return '';
  const line = (n) => `- ${new Date(n.ts).toISOString().slice(5, 16).replace('T', ' ')} ${n.jobId} ${clip(n.jobName, 24)}: ${clip(n.text, 160)}`;
  const head = '<vibespace-jobs-missed-while-away>', tail = '</vibespace-jobs-missed-while-away>\nThese completed while this conversation was closed. vibespace-job poll <id> for full detail.';
  let keep = items.slice();
  let dropped = 0;
  let out = [head, ...keep.map(line), tail].join('\n');
  while (bytes(out) > budget && keep.length > 2) {
    keep.splice(1, 1); // drop second-oldest; endpoints survive
    dropped++;
    out = [head, line(keep[0]), `- …${dropped} earlier notification(s) elided — vibespace-job list`, ...keep.slice(1).map(line), tail].join('\n');
  }
  if (bytes(out) <= budget) return out;
  const floor = `<vibespace-jobs-missed-while-away>${items.length} job notification(s) arrived while this conversation was closed — vibespace-job list</vibespace-jobs-missed-while-away>`;
  return bytes(floor) <= budget ? floor : '';
}

module.exports = {
  isTerminal, isOwner, canView, canControl, canEdit, visibleJobs,
  vetSpec, VENDOR_PATTERNS,
  parseCron, nextFire, validateSchedule, AGENT_MIN_EVERY_MS,
  SUPERVISE, onServiceExit, resolveName,
  renderJobsDigest, renderJobsUpdate, fitDigest, jobLine,
  validatePanel, validateAnswers, CONTEXT_PAYLOAD_CAP, clip,
  notifyEffective, renderOwnerNotify, renderNotifStash,
};
