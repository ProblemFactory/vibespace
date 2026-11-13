// THE WALK — reader A's 23-act random walk (int359/acc-399/cut-a/drivers/walk.mjs, copied for lane queued-is-not-woke laws 2 + 3,
// SHAPE C) over every engine act that moves what waits, on the REAL groups engine + the REAL channel store. After EVERY step
// the async READING of every member (groups-engine readWaiting) is compared with the reader's ORACLE, written here from the
// group's LOG, its MARKS and its held frames only, with the reach as the report applies it NOW (an awaited reply reaches
// its asker). Per group: the count, the oldest, each sender's count and oldest; nothing for mute / ended / archived / own.
// Nothing is kept by the reading, so there is no load, no settle and no file to compare.
// usage: REPO=<repo> node scripts/wait-walk.mjs <seed> <steps> [--restart-every=N] [--trace] [--off=act,act]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const REPO = process.env.REPO || path.resolve(new URL('..', import.meta.url).pathname);
const R = (p) => require(path.join(REPO, p));
const G = R('src/channel-groups.js');
const { createChannelStore } = R('src/channel-store.js');
const GE = process.env.WALK_GE ? require(process.env.WALK_GE) : R('src/server/groups-engine.js');   // a suite's patched copy (its red control)

const args = process.argv.slice(2);
const SEED = Number(args[0] || 1), STEPS = Number(args[1] || 3000);
const RESTART_EVERY = Number((args.find((a) => a.startsWith('--restart-every=')) || '=60').split('=')[1]);
const TRACE = args.includes('--trace');
const ONLY = (args.find((a) => a.startsWith('--only=')) || '').split('=')[1] || null;   // a comma list of step indexes to replay (minimiser)
const ACTS_OFF = new Set(((args.find((a) => a.startsWith('--off=')) || '').split('=')[1] || '').split(',').filter(Boolean));
const SCR = process.env.SCR || os.tmpdir();
const J = JSON.stringify;

// ── PRNG ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(SEED);
const pick = (l) => l[Math.floor(rnd() * l.length)];
const chance = (p) => rnd() < p;

// ── the cast: 9 conversations, two harness kinds ─────────────────────────────────────────────────────────────────────────
const cidOf = (i) => `c${i}aaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`;
const CIDS = Array.from({ length: 9 }, (_, i) => cidOf(i + 1));
const KIND = Object.fromEntries(CIDS.map((c, i) => [c, i % 2 ? 'codex' : 'claude']));
const NAME = Object.fromEntries(CIDS.map((c, i) => [c, 'm' + (i + 1)]));
const state = Object.fromEntries(CIDS.map((c) => [c, 'idle']));   // idle | running | stopped | retired (resumed into a new backend id)

// ── the world ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const dir = fs.mkdtempSync(path.join(SCR, `walk-${SEED}-`));
let t = 1_800_000_000_000;
const now = () => t;
const quiet = { info() { }, warn() { }, log() { } };

// the ladder: what a wake does depends on the addressee (claude in a turn ⇒ into the turn; codex in a turn ⇒ queued behind
// it; idle ⇒ a new turn; stopped / retired ⇒ refused). Frames it queued are kept for a later carry / hand-back / drop.
const frames = [];   // {cid, gid, upTo, state: 'queued'|'restashed'}
let gen = 0;
const hooks = { carried: [], back: [], dropped: [], turn: [] };
let earlyCarry = null;   // a test hook: carry a frame BEFORE its markQueued lands (the ladder's early answer)
function ladder(g0) {
  const live = (fn) => (...a) => (gen === g0 ? fn(...a) : undefined);
  return {
    deliverToConversation: async (member, text, o) => {
      // (copied from the reader with ONE fix: its `const st = state[member]` shadowed the store `st` below, so every queued
      // wake threw at `st.groups` and no frame was ever held — the frames are exercised here)
      const was = state[member];
      if (was === 'stopped' || was === 'retired') return { ok: false, reason: 'stopped' };
      if (was === 'running' && KIND[member] === 'codex') {
        const mk = o && o.wakeMark;
        if (mk) {
          const g = st.groups.live().groups[mk.gid], m = g && G.memberOf(g, member);
          const fl = m ? Math.max(Number.isFinite(m.reportedUpTo) ? m.reportedUpTo : -Infinity, m.joinedAt - 1) : Infinity;
          const content = m ? logOf(mk.gid).filter((r) => isMsg(r) && r.author && r.author.id !== member && r.at > fl && r.at <= mk.upTo && reaches(g, m, r)).map((r) => [r.at, r.author.id]) : [];
          frames.push({ cid: member, gid: mk.gid, upTo: mk.upTo, state: 'queued', content });
          if (earlyCarry && earlyCarry()) { const f = frames.pop(); for (const h of hooks.carried) h(member, { mark: { gid: f.gid, upTo: f.upTo } }); }
        }
        return { ok: true, queued: true, since: t, lane: 'queue' };
      }
      if (was === 'running') return { ok: true, intoTurn: true, lane: 'turn' };
      state[member] = 'running';
      return { ok: true, lane: 'new-turn' };
    },
    onCarried: (fn) => hooks.carried.push(live(fn)), onHandedBack: (fn) => hooks.back.push(live(fn)), onQueuedDropped: (fn) => hooks.dropped.push(live(fn)), onTurnStarted: (fn) => hooks.turn.push(live(fn)),
    queuedEntries: () => frames.filter((f) => f.state === 'queued' || f.state === 'restashed').map((f) => ({ cid: f.cid, mark: { gid: f.gid, upTo: f.upTo } })),
    noteConversationEnded: (cid) => { for (const f of frames.filter((x) => x.cid === cid)) { f.state = 'dropped'; for (const h of hooks.dropped) h(cid, { mark: { gid: f.gid, upTo: f.upTo } }); } },
    owedEntries: () => [], parkOwedWake: () => null, wakeBlock: () => null, emitPeerCard: () => true,
  };
}
let st, eng;
function boot() {
  for (const k of Object.keys(hooks)) hooks[k] = [];
  gen++;
  st = createChannelStore({ dir: path.join(dir, 'channels'), now });
  eng = GE.create({ store: st, deliver: ladder(gen), now, roster: () => CIDS.map((c) => ({ cid: c, name: NAME[c], groups: ['tg1'], reachability: null })), groupSetting: () => 'none', log: quiet, broadcast: () => { } });
  return { reads: 0 };
}

// ── THE ORACLE (independent: the log, the marks, the held frames — and the reach rule as the report applies it NOW) ─────
const isMsg = (r) => !!r && ((r.raw && r.raw.kind) || 'message') === 'message';
function reaches(g, m, r) {
  if (m.notify !== 'mention') return true;
  if (Array.isArray(r.mentions) && r.mentions.some((x) => x && x.id === m.member)) return true;
  // an awaited reply reaches its asker (the report's `also`): the asker's open await answered, no wake carried it
  if (process.env.ORACLE_NO_AWAIT) return false;
  for (const e of Object.values(g.awaits || {})) if (e && e.by === m.member && Number.isFinite(e.answeredAt) && !Number.isFinite(e.wokeAt) && r.at > e.at && r.at <= e.answeredAt) return true;
  return false;
}
function logOf(gid) { return st.readTail(G.GROUP_ADAPTER_ID, gid, { limit: 100000 }).filter((r) => r && !(r.raw && r.raw.kind === 'cleared')); }
function oracleGroup(gid) {
  const gr = st.groups.live();
  const g = gr.groups[gid];
  const out = { m: {}, q: {} };
  if (!g || g.archivedAt || g.closed) return out;
  const L = logOf(gid);
  for (const m of g.members || []) {
    const e = (gr.ended || {})[m.member];
    if ((e && G.ENDED_WHYS.includes(e.why))) continue;
    const muted = m.notify === 'mute';
    if (muted && !process.env.ORACLE_MUTE_FRAMES) continue;
    const mine = L.filter((r) => isMsg(r) && r.author && r.author.id !== m.member && reaches(g, m, r)).sort((a, b) => a.at - b.at);
    const floor = Math.max(Number.isFinite(m.reportedUpTo) ? m.reportedUpTo : -Infinity, m.joinedAt - 1);
    const w = mine.filter((r) => r.at > floor).map((r) => [r.at, r.author.id]);
    if (w.length && !muted) out.m[m.member] = w;
    for (const q of Array.isArray(m.queued) ? m.queued : []) {
      if (!q || !(q.state === 'queued' || q.state === 'restashed')) continue;
      if (process.env.ORACLE_FRAMES === 'fixed') { const f = frames.filter((x) => x.cid === m.member && x.gid === gid && x.upTo === q.upTo).pop(); if (f && f.content.length) (out.q[m.member] || (out.q[m.member] = {}))[q.upTo] = f.content; continue; }
      const from = Math.max(Number.isFinite(q.from) ? q.from : -Infinity, m.joinedAt - 1);
      const l = mine.filter((r) => r.at > from && r.at <= q.upTo).map((r) => [r.at, r.author.id]);
      if (l.length) (out.q[m.member] || (out.q[m.member] = {}))[q.upTo] = l;
    }
  }
  return out;
}
async function compare(step) {
  const gr = st.groups.live();
  const errs = [];
  const oracle = new Map(Object.keys(gr.groups).map((gid) => [gid, oracleGroup(gid)]));
  const T = (x) => (x == null ? null : x - 1.8e12);
  for (const c of CIDS) {
    const r = await eng.readWaiting(c, { now: t, olderThan: 0 });
    const want = {};
    for (const [gid, o] of oracle) {
      const recs = [...(o.m[c] || []), ...Object.values(o.q[c] || {}).flat()];
      if (!recs.length) continue;
      const senders = {};
      for (const [at, by] of recs) { const x = senders[by] || (senders[by] = { n: 0, oldest: at }); x.n++; if (at < x.oldest) x.oldest = at; }
      want[gid] = { n: recs.length, oldest: Math.min(...recs.map((x) => x[0])), senders };
    }
    const got = Object.fromEntries(r.groups.map((g) => [g.gid, g]));
    for (const gid of new Set([...Object.keys(want), ...Object.keys(got)])) {
      const w = want[gid], g = got[gid];
      if (!w) { errs.push(`${NAME[c]} ${gid}: read ${g.n} oldest ${T(g.oldest)}, oracle nothing`); continue; }
      if (!g) { errs.push(`${NAME[c]} ${gid}: read nothing, oracle ${w.n} oldest ${T(w.oldest)}`); continue; }
      if (g.n == null) { errs.push(`${NAME[c]} ${gid}: no count said (oracle ${w.n}) — the walk's logs are inside the read's bound`); continue; }
      if (g.n !== w.n) errs.push(`${NAME[c]} ${gid}: count ${g.n} oracle ${w.n}`);
      if (g.oldest !== w.oldest) errs.push(`${NAME[c]} ${gid}: oldest ${T(g.oldest)} oracle ${T(w.oldest)}`);
      for (const by of new Set([...Object.keys(w.senders), ...Object.keys(g.senders || {})])) {
        const a = w.senders[by], b = (g.senders || {})[by];
        if (!a || !b || a.n !== b.n || a.oldest !== b.oldest) errs.push(`${NAME[c]} ${gid} sender ${NAME[by] || by}: read ${J(b)} oracle ${J(a)}`);
      }
    }
  }
  return errs;
}

// ── the acts ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const groups = () => Object.values(st.groups.live().groups);
const liveGroups = () => groups().filter((g) => !g.archivedAt && !g.closed);
const endedOf = (c) => { const e = (st.groups.live().ended || {})[c]; return e && G.ENDED_WHYS.includes(e.why) ? e : null; };
async function act(name) {
  t += 1 + Math.floor(rnd() * 90_000);
  switch (name) {
    case 'post': case 'post-wake': case 'post-at': case 'post-await': {
      const g = pick(liveGroups()); if (!g) return 'skip';
      const author = pick(g.members).member;
      if (endedOf(author)) return 'skip';
      const o = { group: g.id, from: author, text: 'w' + Math.floor(rnd() * 1e6), wake: name === 'post-wake' };
      if (name === 'post-at') { const other = pick(g.members.filter((m) => m.member !== author)); if (other) o.at = [other.member]; }
      if (name === 'post-await') o.awaitReply = true;
      const r = await eng.post(o);
      return r.ok ? `${NAME[author]}→${g.id}${o.wake ? ' --wake' : ''}${o.at ? ' @' + NAME[o.at[0]] : ''}${o.awaitReply ? ' await' : ''}` : 'refused ' + r.code;
    }
    case 'post-owner': { const g = pick(liveGroups()); if (!g) return 'skip'; const r = await eng.post({ group: g.id, from: G.OWNER, text: 'o' + Math.floor(rnd() * 1e6), wake: chance(0.3) }); return r.ok ? `owner→${g.id}` : 'refused ' + r.code; }
    case 'report': {
      const c = pick(CIDS); if (state[c] === 'retired' || endedOf(c)) return 'skip';
      const rep = eng.reportsForTurn(c); if (rep && rep.marks) await eng.commitReports(c, rep.marks);
      return `report ${NAME[c]} ${rep && rep.marks ? rep.marks.length : 0}`;
    }
    case 'run': { const c = pick(CIDS); if (state[c] === 'retired') return 'skip'; state[c] = pick(['idle', 'running', 'running', 'stopped']); for (const h of hooks.turn) if (state[c] === 'running') h(c); return `${NAME[c]} ${state[c]}`; }
    case 'carry': case 'restash': case 'drop': {
      const live = frames.filter((f) => f.state === 'queued' || f.state === 'restashed'); if (!live.length) return 'skip';
      const f = pick(live);
      if (name === 'carry') { f.state = 'carried'; for (const h of hooks.carried) h(f.cid, { mark: { gid: f.gid, upTo: f.upTo } }); }
      else if (name === 'restash') { f.state = 'restashed'; for (const h of hooks.back) h(f.cid, { mark: { gid: f.gid, upTo: f.upTo } }); }
      else { f.state = 'dropped'; for (const h of hooks.dropped) h(f.cid, { mark: { gid: f.gid, upTo: f.upTo } }); }
      return `${name} ${NAME[f.cid]} ${f.gid} ${f.upTo - 1.8e12}`;
    }
    case 'end': { const c = pick(CIDS); const why = pick(['archived', 'archived', 'gone']); const r = await eng.onConversationEnded(c, { why }); return `end ${NAME[c]} ${why} ${r.ok}`; }
    case 'revive': { const c = pick(CIDS.filter((x) => endedOf(x) && endedOf(x).why === 'archived')); if (!c) return 'skip'; const r = await eng.onConversationRevived(c); return `revive ${NAME[c]} ${r}`; }
    case 'leave': { const g = pick(liveGroups()); if (!g) return 'skip'; const m = pick(g.members).member; const r = await eng.leave({ by: m, group: g.id }); return `leave ${NAME[m]} ${g.id} ${r.ok}${r.archived ? ' archived' : ''}`; }
    case 'kick': { const g = pick(liveGroups().filter((x) => !x.pair)); if (!g) return 'skip'; const m = pick(g.members).member; const by = pick(g.members).member; const r = await eng.kick({ by, group: g.id, member: m }); return `kick ${NAME[m]} by ${NAME[by]} ${g.id} ${r.ok}`; }
    case 'invite': {
      const g = pick(liveGroups().filter((x) => !x.pair)); if (!g) return 'skip';
      const out = CIDS.filter((c) => !G.memberOf(g, c) && !endedOf(c)); if (!out.length) return 'skip';
      const c = pick(out); const by = pick(g.members).member;
      const r = await eng.invite({ by, group: g.id, members: [c], quiet: chance(0.5) });
      return `invite ${NAME[c]} → ${g.id} ${r.ok}`;
    }
    case 'archive': { if (liveGroups().length <= 2) return 'skip'; const g = pick(liveGroups()); const r = await eng.archive({ by: pick(g.members).member, group: g.id }); return `archive ${g.id} ${r.ok}`; }
    case 'create': {
      if (liveGroups().length >= 5) return 'skip';
      const pool = CIDS.filter((c) => !endedOf(c)); if (pool.length < 3) return 'skip';
      const by = pick(pool); const mem = pool.filter((c) => c !== by).sort(() => rnd() - 0.5).slice(0, 5);
      const r = await eng.create({ by, name: 'g' + Math.floor(rnd() * 1e4), members: mem, quiet: true });
      return `create ${r.ok && r.group.id}`;
    }
    case 'pair': {
      const pool = CIDS.filter((c) => !endedOf(c)); if (pool.length < 2) return 'skip';
      const a = pick(pool), b = pick(pool.filter((c) => c !== a));
      const r = await eng.findOrCreatePair(a, b);
      return `pair ${NAME[a]}-${NAME[b]} ${r && (r.group ? r.group.id : r.ok)}`;
    }
    case 'notify': {
      const g = pick(liveGroups()); if (!g) return 'skip';
      const m = pick(g.members).member; const mode = pick(['mute', 'mention', 'next-turn', 'always']);
      const r = await eng.setNotify({ by: m, group: g.id, notify: mode });
      return `notify ${NAME[m]} ${g.id} ${mode} ${r.ok}`;
    }
    case 'clear': {
      const g = pick(liveGroups()); if (!g) return 'skip';
      const L = logOf(g.id).filter(isMsg); if (!L.length) return 'skip';
      const r0 = pick(L);
      const r = await eng.clearMessages({ group: g.id, ids: [r0.vendorId] });
      return `clear ${g.id} ${r0.at - 1.8e12} ${r.ok}`;
    }
    case 'rename': { const g = pick(liveGroups().filter((x) => !x.pair)); if (!g) return 'skip'; const r = await eng.rename({ by: pick(g.members).member, group: g.id, name: 'n' + Math.floor(rnd() * 1e4) }); return `rename ${g.id} ${r.ok}`; }
    case 'resume-new-id': { const c = pick(CIDS.filter((x) => state[x] !== 'retired')); if (!c) return 'skip'; state[c] = 'retired'; return `resume ${NAME[c]} into a new backend id (the member row keeps the old id)`; }
    case 'early-carry': { earlyCarry = () => chance(0.5); return 'early carry on'; }
    case 'restart': {
      try { st.close && st.close(); } catch { }
      const r = await boot();
      return `restart (a new engine over the same store: nothing kept, nothing loaded)`;
    }
    default: return 'skip';
  }
}
const WEIGHTS = { post: 22, 'post-wake': 6, 'post-at': 6, 'post-await': 4, 'post-owner': 5, report: 14, run: 8, carry: 5, restash: 3, drop: 3, end: 2, revive: 2, leave: 2, kick: 1, invite: 4, archive: 1, create: 2, pair: 2, notify: 6, clear: 2, rename: 1, 'resume-new-id': 0.3, 'early-carry': 0.2 };
for (const k of ACTS_OFF) delete WEIGHTS[k];
const TOTAL = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
function nextAct() { let x = rnd() * TOTAL; for (const [k, w] of Object.entries(WEIGHTS)) { x -= w; if (x <= 0) return k; } return 'post'; }

// ── run ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
await boot();
// three groups × six members to begin
for (let i = 0; i < 3; i++) { const by = CIDS[i]; const mem = CIDS.filter((c) => c !== by).slice(i, i + 5); await eng.create({ by, name: 'start' + i, members: mem, quiet: true }); }
const only = ONLY ? new Set(ONLY.split(',').map(Number)) : null;
const log = [];
let firstErr = null, diverged = 0;
const counts = {};
const KINDS = {};
const STAT = { inst: 0, frames: 0, finst: 0, mention: 0 };
for (let i = 0; i < STEPS; i++) {
  const a = (RESTART_EVERY && i && i % RESTART_EVERY === 0) ? 'restart' : nextAct();
  let said;
  try { said = await act(a); } catch (e) { said = 'THREW ' + (e && e.message); }
  counts[a] = (counts[a] || 0) + 1;
  log.push(`${i} ${a}: ${said}`);
  if (TRACE) console.log(log[log.length - 1]);
  const errs = await compare(i);
  { const gr = st.groups.live(); for (const gid of Object.keys(gr.groups)) { const o = oracleGroup(gid); for (const l of Object.values(o.m)) STAT.inst += l.length; for (const fr of Object.values(o.q)) for (const l of Object.values(fr)) { STAT.frames++; STAT.finst += l.length; } } }
  if (errs.length) {
    diverged++;
    if (!firstErr) { firstErr = { step: i, act: a, said, errs }; console.log(`FIRST DIVERGENCE at step ${i} (${a}: ${said})\n  ` + errs.slice(0, 8).join('\n  ')); console.log('  the steps (last 25):\n    ' + log.slice(-25).join('\n    ')); }
    for (const e of errs) { const kind = e.replace(/\[[^\]]*\]/g, '[]').replace(/[0-9]+/g, '#').replace(/g-[0-9a-f#]+/g, 'g').replace(/m#/g, 'm'); if (!KINDS[kind]) { KINDS[kind] = { n: 0, first: i, ex: e, ctx: log.slice(-12) }; } KINDS[kind].n++; }
    if (process.env.STOP_AT_FIRST) break;
  }
}
const files = [];
console.log(J({ seed: SEED, steps: STEPS, divergedSteps: diverged, first: firstErr && { step: firstErr.step, act: firstErr.act, n: firstErr.errs.length }, counts, stat: STAT, groups: groups().length, files: files.length }));
for (const [k, v] of Object.entries(KINDS)) console.log(`KIND ${v.n}× first@${v.first}: ${k}\n   e.g. ${v.ex}${process.env.CTX ? '\n     ' + v.ctx.join('\n     ') : ''}`);
if (!process.env.KEEP) fs.rmSync(dir, { recursive: true, force: true });
