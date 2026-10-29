#!/usr/bin/env node
// ON A CLUSTER INSTANCE, A HUB ACT NOBODY CLICKED ASKS THE OWNER FIRST (lane hub-act-ask, design q-042 §3 D4 the asking half,
// owner decision ② 2026-10-19) — FAST.
//   ① THE VERDICT TABLE (PURE src/hub-act-policy.js): instance kind × who asked × the machine's list × layer, against an
//      independent reference; consent, a card up (join), the quiet window (background only), an unreadable list, the
//      setting, the instance kind's rule, every act / code row of the layer table has a KIND
//   ② the third list in PURE src/exit-reach.js: read / write / stamp / stored shape — a dialog drawn before this lane keeps its base
//   ③ the words: one title per kind, who (a conversation's name quoted, a background subject by its `by`), poisoned names
//      folded, the refusals name the dialog and never invite a retry loop; every key in the zh / ja dictionaries
//   ④ THE ONE SEND POINT over a fake daemon link + the REAL asker + the REAL For-you store: an agent's run on a cluster
//      instance is HELD (nothing sent), ONE urgent card for two acts of one SUBJECT (another conversation's: its own card —
//      lane ledger-dedup-law r3), Allow once ⇒ both run (their lines say allowed + who answered); Deny ⇒ hub_act_denied on
//      its own subject only (a background act waits on its own item); 60 s ⇒ ask_expired; a person's act / a local instance / consent / a
//      read never ask; Never ⇒ refused without a card; Always ⇒ the list written, every card of the machine settles;
//      kinds apart; the quiet window; the item closed elsewhere; the store refusing; a boot's reconcile; a gate that throws;
//      the agent update at hello (asked without holding the link, pushed over it on Allow); a RUNTIME MUTANT (no gate)
//      int316: the device's own allow list judged BEFORE the ask (no card for an act the device refuses) + 2 CONTROLs
//   ⑤ the routes: the answer is the user's (a bearer ⇒ human_only), settled / unknown by name; the dialog's GET carries the
//      list as it applies; the PATCH writes the third list alone; a list change re-judges the cards that are up
//   ⑥ the card in the For-you row (renderRow in node): its words above Allow once / Always on this machine / Deny
//   ⑦ the census: both remote device clients carry the gate, this machine's own daemon never; the gate sits at the send point
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-hub-act-ask-'));
process.setMaxListeners(64); // a For-you store per world (each hooks the process exit)
const P = require('../src/hub-act-policy.js');
const E = require('../src/exit-reach.js');
const DA = require('../src/device-acts.js');
const ASK = require('../src/server/hub-act-ask.js');
const FA = require('../src/foryou-actions.js');   // lane wake-approve-card r3: THE registry's chat cards (needsOf)
const { DeviceManager } = require('../src/agentd/client.js');
const { HostManager } = require('../src/hosts.js');
const { UserTodoManager } = require('../src/user-todos.js');

let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 1500) : '')); } };
const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8');
const tick = () => new Promise((r) => setImmediate(r));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };

console.log('— ① the verdict table');
{
  // THE REFERENCE, written from the brief (never from the module): read / session never ask; a person never asks; consent never
  // asks twice; otherwise the machine's list (not set ⇒ the setting; auto ⇒ cluster asks, local allows)
  const ref = ({ instanceKind, byKind, layer, policy, setting = 'auto' }) => {
    if (layer === 'read' || layer === 'session') return 'allow';
    if (!byKind) return 'deny';
    if (byKind === 'human') return 'allow';
    const pol = policy !== 'default' ? policy : setting !== 'auto' ? setting : instanceKind === 'cluster' ? 'ask' : 'everyone';
    return pol === 'everyone' ? 'allow' : pol === 'nobody' ? 'deny' : 'ask';
  };
  const BYS = { human: 'human:abcabcabcabc', agent: 'agent:claude:c1', job: 'job:jb-12', system: 'system:usage-harvest', '': null };
  const LAYERS = { read: 'sysinfo', session: 'open-session', act: 'run-cmd', code: 'upgrade' };
  let cells = 0; const bad = [];
  for (const instanceKind of ['cluster', 'local']) for (const [byKind, by] of Object.entries(BYS)) for (const policy of ['default', 'nobody', 'everyone', 'ask']) for (const [layer, key] of Object.entries(LAYERS)) {
    cells++;
    const v = P.askVerdict({ instanceKind, by, layer, key, machinePolicy: policy === 'default' ? null : policy });
    const want = ref({ instanceKind, byKind, layer, policy });
    if (v.verdict !== want) bad.push({ instanceKind, byKind, policy, layer, got: v.verdict, want });
  }
  ok(cells === 160 && bad.length === 0, `${cells} cells (cluster / local × human / agent / job / system / nobody × not set / Never / Always / Ask × read / session / act / code) match the reference`, bad.slice(0, 6));
  ok(P.askVerdict({ instanceKind: 'cluster', by: BYS.system, layer: 'act', key: 'run-cmd' }).verdict === 'ask' && P.askVerdict({ instanceKind: 'local', by: BYS.system, layer: 'act', key: 'run-cmd' }).verdict === 'allow', 'the owner\'s ②: a cluster instance asks by default, a local one does not');
  const s1 = P.askVerdict({ instanceKind: 'cluster', by: BYS.agent, layer: 'act', key: 'run-cmd', setting: 'everyone' }), s2 = P.askVerdict({ instanceKind: 'local', by: BYS.agent, layer: 'act', key: 'run-cmd', setting: 'ask' }), s3 = P.askVerdict({ instanceKind: 'local', by: BYS.agent, layer: 'act', key: 'run-cmd', setting: 'ask', machinePolicy: 'everyone' });
  ok(s1.verdict === 'allow' && s1.source === 'setting' && s2.verdict === 'ask' && s3.verdict === 'allow' && s3.source === 'machine', 'the setting replaces the instance\'s default; the machine\'s own list wins over both');
  const u = P.askVerdict({ instanceKind: 'local', by: BYS.agent, layer: 'act', key: 'run-cmd', machinePolicy: 'unknown' });
  ok(u.verdict === 'ask' && u.source === 'unreadable', 'an unreadable stored list ASKS (never a silent allow), even on a local instance');
  const c = P.askVerdict({ instanceKind: 'cluster', by: BYS.agent, layer: 'act', key: 'run-cmd', consent: true }), cN = P.askVerdict({ instanceKind: 'cluster', by: BYS.agent, layer: 'act', key: 'run-cmd', consent: true, machinePolicy: 'nobody' });
  ok(c.verdict === 'allow' && c.reason === 'consent' && cN.verdict === 'allow', 'consent (vibespace-exit\'s own lists judged it) never asks twice — the Hub automation list is not the exit\'s');
  const j = P.askVerdict({ instanceKind: 'cluster', by: BYS.agent, layer: 'act', key: 'run-cmd', pending: true });
  ok(j.verdict === 'ask' && j.join === true, 'a card up for the key ⇒ the act JOINS it');
  const now = 1_000_000_000;
  const q = (by, outcome, ago) => P.askVerdict({ instanceKind: 'cluster', by, layer: 'act', key: 'run-cmd', recent: { outcome, at: now - ago }, now });
  ok(q(BYS.system, 'denied', 1000).verdict === 'deny' && q(BYS.system, 'denied', 1000).code === 'hub_act_denied' && q(BYS.job, 'expired', 1000).code === 'ask_expired' && q(BYS.system, 'denied', 1000).until === now - 1000 + P.QUIET_MS,
    `the quiet window: a background subject (system / job) refused on a key is refused at once for ${P.QUIET_MS / 60000} min — by the last outcome, until when`);
  ok(q(BYS.system, 'denied', P.QUIET_MS + 1).verdict === 'ask' && q(BYS.agent, 'denied', 1000).verdict === 'ask', 'after the window it asks again; an agent\'s act always asks (no quiet window)');
  ok(P.instanceKindOf({ VIBESPACE_INSTANCE_NAME: 'alice' }) === 'cluster' && P.instanceKindOf({ VIBESPACE_INSTANCE_NAME: '  ' }) === 'local' && P.instanceKindOf({}) === 'local' && P.instanceKindOf({}, { presetsDir: '/srv/presets' }) === 'cluster',
    'the instance kind: VIBESPACE_INSTANCE_NAME or the shared presets folder ⇒ cluster (mounts-plugins-wiring\'s clusterDeploy rule)');
  const actKeys = Object.entries(DA.TABLE).filter(([, l]) => l === 'act' || l === 'code').map(([k]) => k);
  const unkinded = actKeys.filter((k) => !Object.prototype.hasOwnProperty.call(P.KIND_OF, k));
  ok(actKeys.length >= 25 && unkinded.length === 0 && Object.values(P.KIND_OF).every((k) => P.KINDS.includes(k)), `every act / code row of the layer table (${actKeys.length}) has a kind of the ${P.KINDS.length} (${P.KINDS.join(' / ')})`, unkinded);
  ok(P.kindOf('brand-new-op') === 'run' && P.kindOf('upgrade') === 'upgrade' && P.kindOf('fs-op:write-stream') === 'files' && P.kindOf('desktop-serve:app-install') === 'install' && P.kindOf('tcp-connect') === 'forward', 'an act without a kind row is `run` (the strongest words); the families as named');
  const sk = P.subjectKey;
  ok(sk('h1', 'run', 'agent:a') === sk('h1', 'run', 'agent:a') && sk('h1', 'run', 'agent:a') !== sk('h1', 'run', 'agent:b') && sk('h1', 'run', 'agent:a') !== sk('h1', 'files', 'agent:a') && sk('h1', 'run', 'agent:a') !== sk('h2', 'run', 'agent:a'), 'the card key = machine + kind + who asks (lane ledger-dedup-law r3: one card per SUBJECT)');
  ok(P.ASK_TTL_MS === E.ASK_TTL_MS && P.ASK_TTL_MS === 60000, 'the card lives 60 s — the exit ask\'s own number');
  ok(P.answerVerdict({ askedAt: 0 }, { answer: 'once', by: 'agent', now: 1 }).code === 'human_only' && P.answerVerdict({ askedAt: 0 }, { answer: 'once', by: 'user', now: 60000 }).code === 'ask_expired' && P.answerVerdict({ askedAt: 0 }, { answer: 'maybe', by: 'user', now: 1 }).code === 'bad_answer' && P.answerVerdict({ askedAt: 0, settled: 'settled' }, { answer: 'once', by: 'user', now: 1 }).code === 'ask_settled' && P.answerVerdict({ askedAt: 0 }, { answer: 'always', by: 'user', now: 1 }).ok,
    'an answer: a person only, once, within 60 s, one of once / always / deny');
}

console.log('— ② the third list in exit-reach');
{
  // lane grants-unify: a machine's two lists are rows of the grants store — the run list everyone + its ask on the record
  const RUN_ALL = { run: [{ door: 'exit', resource: 'h:run', to: [{ kind: 'everyone' }] }] };
  const a0 = E.exitAccessOf({ id: 'h', exit: { ask: true } }, RUN_ALL);
  const a1 = E.exitAccessOf({ id: 'h', exit: { ask: true, hub: { mode: 'nobody' } } }, RUN_ALL);
  const aBad = E.exitAccessOf({ id: 'h', exit: { use: { mode: 'nobody' }, run: { mode: 'nobody' }, hub: { mode: 'sometimes' } } });
  ok(a0.hub.mode === 'default' && a1.hub.mode === 'nobody' && aBad.mode === 'unknown' && E.exitAccessOf(null).hub.mode === 'default' && E.exitAccessOf({ allowExit: true }).hub.mode === 'default', 'read: not set = default, a stored mode as is, a bad stored mode makes the WHOLE access unknown (fail closed)');
  ok(E.exitStamp(a0) === E.exitStamp(E.exitAccessOf({ id: 'h', exit: { ask: true } }, RUN_ALL)) && !E.exitStamp(a0).includes('"h"') && E.exitStamp(a1).includes('["h","mode","nobody"]'),
    'the stamp gains a line only when the list is set — a dialog drawn before this lane keeps its base');
  const p1 = E.patchVerdict(a0, { hub: { mode: 'ask' }, base: E.exitStamp(a0) }, { now: 5 });
  ok(p1.ok && p1.access.hub.mode === 'ask' && p1.access.use.mode === 'nobody' && p1.access.run.mode === 'everyone' && p1.changed.hub === true, 'write: the third list alone (use / run kept)', p1);
  const st = E.storedExit(p1.access);
  ok(st.hub && st.hub.mode === 'ask' && E.exitAccessOf({ exit: st }, RUN_ALL).hub.mode === 'ask' && !('hub' in E.storedExit(a0)), 'the stored shape carries `hub` only when set; it reads back');
  const p2 = E.patchVerdict(E.exitAccessOf({ exit: st }, RUN_ALL), { run: { mode: 'nobody' } }, { now: 6 });
  ok(p2.ok && p2.access.hub.mode === 'ask' && E.storedExit(p2.access).hub.mode === 'ask', 'a use / run save KEEPS the third list (hosts.setExitAccess replaces `exit` whole)');
  const b1 = E.patchVerdict(a0, { hub: { mode: 'only' } }), b2 = E.patchVerdict(a0, { hub: 'ask' }), b3 = E.patchVerdict(a0, { hub: { mode: 'ask' }, base: E.exitStamp(a1) }), b4 = E.patchVerdict(aBad, { hub: { mode: 'ask' } });
  ok(b1.code === 'bad_mode' && b2.code === 'bad_grant' && b3.code === 'list_changed' && b4.code === 'bad_grant', 'refused: a mode off the three (+ default), a non-object, a stale base, the third list alone over an unreadable access', [b1.code, b2.code, b3.code, b4.code]);
  ok(E.patchVerdict(E.exitAccessOf({ exit: st }), { hub: { mode: 'default' } }).access.hub.mode === 'default' && !('hub' in E.storedExit(E.patchVerdict(E.exitAccessOf({ exit: st }), { hub: { mode: 'default' } }).access)), '`default` clears it (the instance\'s default applies again)');
  ok(JSON.stringify(E.HUB_MODES) === JSON.stringify(P.POLICIES), 'ONE spelling of the modes (exit-reach re-exports the policy module\'s)');
}

console.log('— ③ the words');
{
  const titles = P.KINDS.map((k) => P.cardOf({ by: 'system:usage-harvest', machine: 'mac1', kind: k, summary: 'x' }).text);
  ok(new Set(titles).size === 7 && titles.every((t) => t.startsWith('system:usage-harvest wants to') && t.includes('mac1')), 'one title per kind, naming who and the machine', titles);
  const RLO = String.fromCharCode(0x202e), NL = String.fromCharCode(10);
  const w = P.cardOf({ by: 'agent:claude:c1', name: `ops${RLO}evil${NL}line`, machine: `mac${NL}1`, kind: 'run', summary: `sh -c echo hi${RLO}` });
  ok(w.text === '"ops evil line" wants to run a command on mac 1' && !/[\u202e\n]/.test(w.i18n.text.params.who + w.i18n.text.params.machine) && w.detail.includes('It would: sh -c echo hi') && w.detail.includes('asked by agent:claude:c1') && w.i18n.detail.length === 2,
    'an agent by its conversation\'s name (quoted); a name / machine / summary with hidden characters or line breaks folded', w);
  ok(P.cardOf({ by: 'agent:claude:c1', machine: 'm', kind: 'run' }).text.startsWith('agent:claude:c1 wants') && P.whoOf('job:jb-1') === 'job:jb-1' && P.whoOf('root') === 'nobody named', 'an unknown conversation / a job / a system subject by its `by` (the Activity… spelling)');
  const r1 = P.refusalText('hub_act_denied', { machine: 'mac1', kind: 'files', reason: 'nobody' }), r2 = P.refusalText('hub_act_denied', { machine: 'mac1', kind: 'run' }), r3 = P.refusalText('ask_expired', { machine: 'mac1', kind: 'upgrade' }), r4 = P.refusalText('ask_expired', { machine: 'mac1', kind: 'run', reason: 'quiet', until: Date.UTC(2026, 9, 19, 12, 30) });
  ok([r1, r2, r3, r4].every((r) => r.includes('"mac1"') && r.includes('Hub automation') && /nothing was done/.test(r)) && /do not retry/.test(r1 + r2 + r3) && r4.includes('12:30 UTC') && r1.includes('Never'),
    'every refusal names the machine, that nothing was done, the way on (Who can use it → Hub automation) — and says not to retry in a loop', [r1, r2, r3, r4]);
  const zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  const keys = [...Object.values(P.TITLE), P.DETAIL_WHAT, P.DETAIL_HOW, 'Always on this machine', 'Hub automation', 'Allow once', 'Always allow', 'Never', 'Ask me each time',
    'Not set — this cluster instance asks by default.', 'Not set — this local instance allows by default.', 'Not set — the default in Settings applies (Integration → Hub automation on paired machines).',
    'Always allowed on {machine} — its Hub automation is Always allow now', 'Hub automation on paired machines (default)', 'Auto (a cluster instance asks, a local one does not)'];
  const miss = keys.filter((k) => !zh.includes(JSON.stringify(k) + ':') || !ja.includes(JSON.stringify(k) + ':'));
  ok(miss.length === 0, `the card's, the dialog's and the setting's words (${keys.length} keys) are in zh and ja`, miss);
  ok(zh.includes('"Always on this machine": "这台机器总是允许"') && zh.includes('"{who} wants to run a command on {machine}": "{who} 想在 {machine} 上运行命令"'), 'the brief\'s words: 「<who> 想在 <machine> 上 <kind> … 允许一次 / 这台机器总是允许 / 拒绝」');
}

// ── the fake daemon link (test-device-acts ③'s shape) with a gate ──
const CAPS = ['run-shell', 'fs-portable', 'fs-write-stream', 'place-secret', 'input-events', 'desktop-serve', 'app-install', 'browser-serve', 'design-fs', 'peer-post', 'settings-open', 'window-pin', 'sysinfo'];
function fakeDm(actGate) {
  const lines = [], sent = [], logs = [];
  const dm = new DeviceManager({ dataDir: tmp, bundlePath: path.join(tmp, 'no-bundle.js'), version: '0', log: (...a) => logs.push(a.join(' ')), onAct: (l) => lines.push(l), actGate });
  const conn = { nextId: 1, nextChan: 2, pending: new Map(), sessions: new Map(), info: { capabilities: CAPS, platform: 'linux', posixShells: ['sh'], daemonVersion: '0' } };
  const answer = (m, extra) => { const r = conn.pending.get(m.id); if (r) { conn.pending.delete(m.id); r({ id: m.id, ...extra }); } };
  conn.mux = {
    control: (m) => {
      sent.push(m);
      setImmediate(() => {
        if (m.op === 'run-stream') { answer(m, {}); const h = conn.sessions.get(m.chan); const b = Buffer.from('streamed\n'); h.onData(b); h.onExitMsg({ code: 0, sent: b.length }); return; }
        if (m.op === 'run-cmd') return answer(m, { code: 0, stdout: 'hi\n', stderr: '' });
        if (m.op === 'fs-op' && m.action === 'stat') return answer(m, { stat: { size: 1 } });
        if (m.op === 'upgrade') return conn.mux.onControl({ op: 'upgrade-done' });
        return answer(m, { ok: true, result: { ok: true } });
      });
    },
    onControl: () => { }, data: () => true, closeChan: () => { },
  };
  dm.connect = async () => conn; dm._conn = conn;
  return { dm, lines, sent, logs, conn };
}
let wn = 0;
/** A world: a REAL HostManager with one dial machine, a REAL For-you store, the REAL asker on a fake clock, a fake link. */
function world({ instanceKind = 'cluster', hub = null, setting = 'auto', store = null } = {}) {
  const dir = path.join(tmp, `w${++wn}`); fs.mkdirSync(dir, { recursive: true });
  const hosts = new HostManager({ dataDir: dir });
  hosts.setDialToken('mac1', 'x'.repeat(64));
  const hid = hosts.findByDeviceId('mac1').id;
  if (hub) hosts.setExitAccess(hid, E.storedExit(E.patchVerdict(E.exitAccessOf(hosts.get(hid)), { hub: { mode: hub } }).access));
  const userTodos = store || new UserTodoManager({ dataDir: dir, expirySweepMs: 3600e3 });
  const timers = [];
  const clock = { t: 1_800_000_000_000 };
  const asker = ASK.create({
    hosts, userTodos, log: () => { }, now: () => clock.t, instanceKind, settingOf: (k) => (k === P.SETTING_KEY ? setting : undefined),
    setHubPolicy: (hostId, mode) => { const v = E.patchVerdict(E.exitAccessOf(hosts.get(hostId)), { hub: { mode } }, { by: 'user' }); hosts.setExitAccess(hostId, E.storedExit(v.access)); },
    nameOf: (by) => (by === 'agent:claude:c1' ? 'ops review' : null),
    timers: { set: (fn, ms) => { const h = { fn, ms, live: true }; timers.push(h); return h; }, clear: (h) => { if (h) h.live = false; } },
  });
  hosts.hubActs = asker;
  const link = fakeDm(hosts.actGateFor(hid));
  const cards = () => (userTodos.snapshot?.().open || []).filter((i) => i.action && (i.action.type === 'hub-act-ask' || i.action.type === 'hub-act-standing')); // lane ledger-dedup-law r8: a standing item has its own type
  const fire = () => { for (const h of timers.splice(0)) if (h.live) { h.live = false; h.fn(); } };
  return { hosts, hid, userTodos, asker, clock, fire, cards, ...link };
}
const codeOf = (p) => p.then(() => 'sent', (e) => (e && e.code) || 'error');
const ops = (sent) => sent.filter((m) => m.op !== 'fs-op' || m.action !== 'stat').map((m) => m.op);

console.log('— ④ THE ONE SEND POINT (a fake daemon link, the real asker and For-you store)');
{
  const w = world();
  // lane ledger-dedup-law r3: a card is ONE SUBJECT's (machine × kind × who asks) — two acts of one conversation share its
  // card; another conversation's act of the same kind is a card of its own (no answer settles another subject's act)
  const p1 = w.dm.runCmd('sh', ['-c', 'echo one'], { by: 'agent:claude:c1' });
  const p2 = w.dm.runShell('echo two', { by: 'agent:claude:c1' });
  const p2b = w.dm.runCmd('ls', [], { by: 'agent:claude:c2' });
  await settle();
  const cs = w.cards();
  const mine = w.asker.list().find((k) => k.by === 'agent:claude:c1'), theirs = w.asker.list().find((k) => k.by === 'agent:claude:c2');
  ok(w.sent.length === 0 && cs.length === 2 && mine && mine.waiting === 2 && theirs && theirs.waiting === 1, 'an agent\'s run on a cluster instance is HELD — nothing sent; two acts of ONE subject share ONE card; another conversation\'s act of that kind is its own card', { sent: w.sent, cards: cs.length, list: w.asker.list() });
  const c = cs.find((x) => x.action.askId === mine.askId);
  ok(c.urgency === 'urgent' && c.origin === 'machines' && c.kind !== 'notice' && c.action.kind === 'run' && c.action.machine === 'mac1' && c.text === '"ops review" wants to run a command on mac1' && /It would: sh -c echo one/.test(c.detail) && /with the other acts of this kind by "ops review" waiting beside it — no one else's/.test(c.detail) && /every kind and every asker/.test(c.detail) && c.expiresAt === w.clock.t + 60000 && c.i18n.text.key === P.TITLE.run,
    'the card: URGENT, origin machines, who (the conversation\'s name) + the machine + the kind, what it would do, whose acts its Allow once covers (no one else\'s), 60 s', c);
  const a = await w.asker.answer(c.action.askId, { answer: 'once', by: 'user', answeredBy: 'human:0123456789ab' });
  const r = await Promise.all([codeOf(p1), codeOf(p2)]);
  ok(a.state === 'allowed' && r.join() === 'sent,sent' && ops(w.sent).join() === 'run-cmd,run-cmd' && w.asker.list().length === 1 && w.asker.list()[0].by === 'agent:claude:c2', 'Allow once ⇒ BOTH of its acts run — the other conversation\'s act is still held on its own card', { a, r, sent: w.sent, list: w.asker.list() });
  ok(w.lines.length === 2 && w.lines.every((l) => l.ask === 'allowed' && l.answeredBy === 'human:0123456789ab' && l.ok === true && l.layer === 'act'), 'each act\'s ONE audit line carries the verdict and who answered', w.lines);
  ok(w.userTodos.get(c.id).status === 'done' && w.cards().length === 1, 'the card is resolved by the answer (the other subject\'s card stays up)');
  w.fire();
  ok(await codeOf(p2b) === 'ask_expired' && ops(w.sent).length === 2, 'the other conversation\'s act: refused by ITS card\'s 60 s, never by the first card\'s Allow');
  let again = null; try { await w.asker.answer(c.action.askId, { answer: 'deny', by: 'user' }); } catch (e) { again = e.code; }
  let guess = null; try { await w.asker.answer('nope', { answer: 'once', by: 'user' }); } catch (e) { guess = e.code; }
  let agent = null; const p3 = w.dm.runCmd('true', [], { by: 'job:jb-1' }); await settle(); try { await w.asker.answer(w.cards()[0].action.askId, { answer: 'once', by: 'agent' }); } catch (e) { agent = e.code; }
  ok(again === 'ask_settled' && guess === 'ask_unknown' && agent === 'human_only', 'a second answer ⇒ ask_settled; a guessed id ⇒ ask_unknown; an agent ⇒ human_only', [again, guess, agent]);
  w.fire(); await codeOf(p3);
}
{
  // THE DENY LEG, re-derived on the per-subject rule (lane ledger-dedup-law r3). It PINNED: an agent's act and a background
  // subject's act (system:hosts) of one kind on one machine share the agent's card, and that card's Deny refuses both — the
  // join that let a denied background subject go on the owner's Allow of an agent. It PINS NOW: the background act never
  // joins the agent's card — it is held on ITS OWN standing item; the Deny on the agent's card refuses the agent's act
  // alone; the background act is refused by ITS OWN Deny, which then holds (its next act refused at once)
  const w = world();
  const p1 = w.dm.runCmd('sh', ['-c', 'rm -rf x'], { by: 'agent:claude:c1' }), p2 = w.dm.runCmd('ls', [], { by: 'system:hosts' });
  await settle();
  const agentCard = w.cards().find((c) => !c.action.standing), item = w.cards().find((c) => c.action.standing);
  ok(agentCard && item && item.action.by === 'system:hosts' && w.asker.list().length === 2 && w.asker.list().every((k) => k.waiting === 1), 'two subjects ⇒ two asks: the agent\'s card and the background subject\'s OWN standing item, one act held on each — no join', w.asker.list());
  await w.asker.answer(agentCard.action.askId, { answer: 'deny', by: 'user', answeredBy: 'human:0123456789ab' });
  const e1 = await p1.catch((e) => e);
  let p2Done = false; p2.then(() => { p2Done = true; }, () => { p2Done = true; }); await settle();
  ok(e1.code === 'hub_act_denied' && !p2Done && w.sent.length === 0 && /the user denied it/.test(e1.message) && /Hub automation/.test(e1.message), 'Deny on the agent\'s card ⇒ the agent\'s act refused hub_act_denied (the sentence names the way on); the background act is NOT settled by it — still held on its own item; nothing sent', [e1.message, p2Done, w.sent]);
  ok(w.lines.length === 1 && w.lines[0].ok === false && w.lines[0].code === 'hub_act_denied' && w.lines[0].ask === 'denied' && w.lines[0].answeredBy === 'human:0123456789ab', 'ONE line so far: the agent\'s refused act (denied, who answered)', w.lines);
  if (item) await w.asker.answer(item.action.askId, { answer: 'deny', by: 'user', answeredBy: 'human:0123456789ab' });
  const e2 = await p2.catch((e) => e);
  const p3 = w.dm.runCmd('ls', [], { by: 'system:hosts' }).catch((e) => e); await settle(); w.fire(); // a hold (never the case here) must not hang the suite
  const e3 = await p3;
  ok(item && e2.code === 'hub_act_denied' && e3.code === 'hub_act_denied' && w.lines.length === 3 && w.lines.slice(1).every((l) => l.ask === 'denied') && w.userTodos.get(item.id).resolvedBy === 'denied' && w.sent.length === 0, 'its OWN Deny refuses the background act (its item closes, denied); the Deny HOLDS — its next act is refused at once, no hold, no card', [e2.code, e3.code, w.lines.map((l) => l.ask)]);
}
{
  const w = world();
  const p = w.dm.runStream('sh', ['-c', 'apt-get install x'], { by: 'system:desktop-access' });
  await settle();
  ok(w.cards().length === 1 && w.sent.length === 0, 'a stream act (run-stream) is held before its channel opens');
  const id = w.cards()[0].id;
  w.clock.t += 60000; w.fire();
  const e = await p.catch((x) => x);
  ok(e.code === 'ask_expired' && /nobody answered within 60 s/.test(e.message) && /do not retry in a loop/.test(e.message) && w.sent.length === 0, '60 s unanswered ⇒ ask_expired (never retried), nothing sent', e.message);
  // lane ledger-dedup-law F3: a BACKGROUND subject's card is its ONE STANDING item — the held act refused, the item stays
  const it = w.userTodos.get(id);
  ok(it.status === 'open' && it.action.standing === true && !it.expiresAt && w.lines.length === 1 && w.lines[0].ask === 'expired' && w.lines[0].op === 'run-stream', 'the held act refused (expired); its standing item stays open, no end; ONE line says so', w.lines);
  // every later act of THAT SUBJECT (machine × kind × who asks — lane ledger-dedup-law r2: another background subject is
  // another item, test-ledger-whole-law ③): refused at once, counted on the SAME item; an agent still asks
  const q = await codeOf(w.dm.runCmd('ls', [], { by: 'system:desktop-access' }));
  ok(q === 'ask_standing' && w.cards().length === 1 && w.lines[1].ask === 'standing', 'the same subject\'s next act on that key ⇒ refused at once, counted on its standing item — no new card (a harvest a minute is not a card a minute)', w.lines[1]);
  const pa = w.dm.runCmd('ls', [], { by: 'agent:claude:c1' }); await settle();
  ok(w.cards().length === 2, 'an agent\'s act on that key still asks (its own 60 s card)');
  w.clock.t += 60000; w.fire(); await codeOf(pa);
  w.clock.t += P.QUIET_MS; const qb = await codeOf(w.dm.runCmd('ls', [], { by: 'system:desktop-access' })); await settle(); w.fire();
  const st = w.cards().filter((c) => c.action.standing);
  ok(qb === 'ask_standing' && st.length === 1 && st[0].id === id && st[0].action.count === 3, 'past the quiet window it is STILL the one standing item, its count moved in place (3) — never a card every QUIET_MS', st.map((c) => c.action));
}
{
  const w = world();
  const r1 = await codeOf(w.dm.runCmd('ls', [], { by: 'human:0123456789ab' }));
  const r2 = await codeOf(w.dm.runCmd('ls', [], { by: 'agent:claude:c1', consent: true }));
  const r3 = await codeOf(w.dm.fsStat('/etc'));
  const r4 = await codeOf(w.dm.serveSocks({ by: 'agent:claude:c1', consent: true }));
  ok([r1, r2, r3, r4].join() === 'sent,sent,sent,sent' && w.cards().length === 0, 'never asked: a person\'s act, an act vibespace-exit\'s own lists judged (consent: run / use), a read', [r1, r2, r3, r4]);
  ok(w.lines.length === 3 && w.lines.every((l) => !('ask' in l)), 'their lines carry no ask (nothing was asked)', w.lines);
  const wl = world({ instanceKind: 'local' });
  const r5 = await codeOf(wl.dm.runCmd('ls', [], { by: 'system:usage-harvest' })), r6 = await codeOf(wl.dm.fsWrite('/t/a', Buffer.from('x'), { by: 'agent:claude:c1' }));
  ok(r5 === 'sent' && r6 === 'sent' && wl.cards().length === 0, 'a LOCAL instance does not ask (its default)');
  const ws = world({ instanceKind: 'local', setting: 'ask' });
  const p7 = ws.dm.runCmd('ls', [], { by: 'system:usage-harvest' }); await settle();
  ok(ws.cards().length === 1, '… unless the setting says ask'); ws.fire(); await codeOf(p7);
}
{
  const w = world({ hub: 'nobody' });
  const e = await w.dm.fsWrite('/t/a', Buffer.from('x'), { by: 'agent:claude:c1' }).catch((x) => x);
  ok(e.code === 'hub_act_denied' && /Hub automation list is Never/.test(e.message) && w.cards().length === 0 && w.sent.length === 0 && w.lines[0].ask === 'never', 'the machine\'s list Never ⇒ refused at once, no card, nothing sent (ask: never)', [e.message, w.lines]);
  const wE = world({ hub: 'everyone' });
  ok(await codeOf(wE.dm.runCmd('ls', [], { by: 'system:x' })) === 'sent' && wE.cards().length === 0, 'Always allow ⇒ it goes, no card');
}
{
  const w = world();
  const pr = w.dm.runCmd('ls', [], { by: 'agent:claude:c1' });
  const pf = w.dm.fsWrite('/t/a', Buffer.from('x'), { by: 'agent:claude:c1' });
  const pi = w.dm.inputEvents([{ t: 'key', k: 'a' }], { by: 'agent:claude:c1' });
  await settle();
  const kinds = w.cards().map((c) => c.action.kind).sort();
  ok(kinds.join() === 'files,input,run', 'kinds apart: one card per machine per KIND', kinds);
  await w.asker.answer(w.cards().find((c) => c.action.kind === 'files').action.askId, { answer: 'always', by: 'user', answeredBy: 'human:0123456789ab' });
  const r = await Promise.all([codeOf(pr), codeOf(pf), codeOf(pi)]);
  ok(r.join() === 'sent,sent,sent' && w.cards().length === 0 && E.exitAccessOf(w.hosts.get(w.hid)).hub.mode === 'everyone', 'Always on this machine ⇒ the machine\'s list written to Always allow (ONE switch, every kind) — every card of the machine settles, all three go', r);
  ok(w.lines.every((l) => l.ask === 'always' && l.answeredBy === 'human:0123456789ab'), 'their lines: always + who answered', w.lines);
  ok(await codeOf(w.dm.runCmd('ls', [], { by: 'system:x' })) === 'sent' && w.cards().length === 0, 'afterwards nothing on that machine asks');
}
{
  const w = world();
  // integration (lane ledger-dedup-law F3 / r9): a `system:` subject is a BACKGROUND subject — its ONE standing notice, no
  // decision row — so the decision row's legs ask as an agent (its act IS the 60 s card)
  const p = w.dm.placeSecret('/home/u/.tok', Buffer.from('s3cret'), { by: 'agent:claude:c1' });
  await settle();
  const c = w.cards()[0];
  ok(c && !c.detail.includes('s3cret') && /\.tok · 6 B/.test(c.detail), 'a placed secret\'s card says the path and size — never the bytes', c && c.detail);
  // lane wake-approve-card r3: A DECISION ROW HAS ITS OWN VERBS — a generic close (✓ / ✕ / Mark all seen) is refused BY NAME;
  // the ask stands until its own Deny (or its 60 s) ends it, and the item and the ask stay ONE state
  let closed = null; try { w.userTodos.setStatus(c.id, 'done', 'user'); } catch (x) { closed = x.code; }
  ok(closed === 'decision_row' && w.userTodos.get(c.id).status === 'open' && w.asker.list().length === 1, 'the card closed by another door (its ✓) ⇒ refused BY NAME (decision_row) — the ask still stands, answerable by its own verbs only', closed);
  await w.asker.answer(c.action.askId, { answer: 'deny', by: 'user', person: true }).catch(() => null);   // (a tree whose ✓ settled it already: answered)
  const e = await p.catch((x) => x);
  const rec = w.userTodos.get(c.id);
  ok(e.code === 'hub_act_denied' && w.sent.filter((m) => m.op === 'place-secret').length === 0 && rec.status === 'done' && rec.resolvedBy === 'denied' && rec.resolvedFact && rec.resolvedFact.decidedBy === 'person', 'its own Deny (the person\'s, through THE person verdict) ⇒ the act refused, the record «denied» with the person\'s mark — the item and the ask are ONE state', { code: e && e.code, rec: rec && { s: rec.status, by: rec.resolvedBy, f: rec.resolvedFact } });
}
{
  // RED CONTROL (lane wake-approve-card r3): an asker wired as the base wired it (no `aboutOf`) — the agent's card names no
  // conversation: tray-only, its chat draws nothing (what the owner saw)
  const w = world();
  const p = w.dm.runCmd('ls', [], { by: 'agent:claude:c1' }); await settle();
  const c = w.cards()[0];
  ok(c && !c.about && FA.needsOf(w.userTodos.snapshot().open, ['claude:c1']).length === 0, 'RED CONTROL: an asker without aboutOf (the base) — the agent\'s card names no conversation ⇒ tray-only, its chat draws nothing', c && c.about);
  w.fire(); await codeOf(p);
}
{
  const store = { add: () => { throw new Error('this conversation already has 20 open items'); }, onStatus: () => { }, snapshot: () => ({ open: [] }) };
  const w = world({ store });
  const e = await w.dm.runCmd('ls', [], { by: 'agent:claude:c1' }).catch((x) => x);
  ok(e.code === 'ask_unfiled' && /20 open items/.test(e.message) && w.asker.list().length === 0 && w.lines[0].ask === 'unfiled', 'For you refuses the card ⇒ refused NOW (never a silent 60 s wait)', e.message);
}
{
  const w = world();
  const p = w.dm.runCmd('ls', [], { by: 'agent:claude:c1' }); await settle();
  const stale = w.cards()[0];
  const a2 = ASK.create({ hosts: w.hosts, userTodos: w.userTodos, instanceKind: 'cluster' });
  ok(a2.reconcile() === 1 && w.userTodos.get(stale.id).status === 'done', 'a boot resolves the cards a previous process filed (their acts died with it)');
  w.fire(); await codeOf(p);
}
{
  const thrower = { check: async () => { throw new Error('boom'); }, verdict: () => { throw new Error('boom'); } };
  const link = fakeDm(thrower);
  const e = await link.dm.runCmd('ls', [], { by: 'agent:claude:c1' }).catch((x) => x);
  ok(e.code === 'hub_act_denied' && link.sent.length === 0 && link.lines[0].ask === 'error', 'a gate that throws REFUSES (fail closed), nothing sent', e && e.message);
}
console.log('  · the agent update at hello');
{
  const bundle = path.join(tmp, 'bundle.js'); fs.writeFileSync(bundle, '// a bundle\n');
  const w = world();
  w.dm._bundlePath = bundle;
  ok(w.dm._upgradeHeld('2.369.100') === 'ask', 'a version drift on a cluster instance: the update is HELD (the hello goes on with the agent as it is)');
  let destroyed = false;
  w.dm._askUpgrade('2.369.100', { mux: w.conn.mux, sock: { destroy: () => { destroyed = true; } } });
  await settle();
  ok(w.cards().length === 1 && w.cards()[0].action.kind === 'upgrade' && /The device agent on mac1 waits for an update/.test(w.cards()[0].text) && w.cards()[0].action.standing === true && w.sent.length === 0, 'ONE card (kind upgrade) — the standing item names the consequence (lane ledger-dedup-law F3) — nothing pushed yet', w.cards().map((c) => c.text));
  await w.asker.answer(w.cards()[0].action.askId, { answer: 'once', by: 'user', answeredBy: 'human:0123456789ab' });
  for (let i = 0; i < 20 && !destroyed; i++) await tick();
  const up = w.sent.filter((m) => m.op === 'upgrade');
  ok(up.length === 1 && up[0].by === 'system:device-upgrade' && destroyed && w.lines.some((l) => l.layer === 'code' && l.ask === 'allowed' && l.ok === true), 'Allow ⇒ the update pushed over the OPEN link (the code line: allowed), then the link dropped for the re-exec', { up, lines: w.lines });
  const wn2 = world({ hub: 'nobody' }); wn2.dm._bundlePath = bundle;
  ok(wn2.dm._upgradeHeld('2.369.100') === 'deny' && wn2.lines.length === 1 && wn2.lines[0].layer === 'code' && wn2.lines[0].ask === 'never' && wn2.sent.length === 0, 'Never ⇒ the agent stays as it is, ONE code line says so');
  const wl = world({ instanceKind: 'local' }); wl.dm._bundlePath = bundle;
  ok(wl.dm._upgradeHeld('2.369.100') === null && wl.cards().length === 0, 'a local instance updates at the hello as before (no card)');
  const src = read('src/agentd/client.js');
  // int316: merged with device-allow-flags (`upgrade` off = its own branch, never asked) and device-bundle-signing (only a
  // build this hub WOULD push — the signed release — is asked about)
  ok(/const held = msg\.daemonVersion !== expected && led\.tries <= 2 && DP\.allows\(pol, 'upgrade'\) && fs\.existsSync\(this\._bundlePath\) && this\._mayPush\(msg\.daemonVersion, expected\) \? this\._upgradeHeld\(msg\.daemonVersion\) : null;/.test(src) && /else if \(msg\.daemonVersion !== expected && fs\.existsSync\(this\._bundlePath\) && this\._mayPush\(msg\.daemonVersion, expected\) && !held\) \{/.test(src) && /if \(held === 'ask'\) this\._askUpgrade\(msg\.daemonVersion, \{ mux, sock, platform: msg\.platform \}\);/.test(src),
    'the hello: judged before the push, never holding the link (an ask is filed AFTER the link resolves)');
  w.fire(); wn2.fire(); wl.fire();
}
{
  // RUNTIME MUTANT: a send point without the gate — the held act is SENT and no card filed (the leg above would be RED)
  const w = world();
  const keep = DeviceManager.prototype._gate;
  DeviceManager.prototype._gate = async () => null;
  try {
    const r = await codeOf(w.dm.runCmd('ls', [], { by: 'agent:claude:c1' }));
    ok(r === 'sent' && w.cards().length === 0, 'MUTANT (no gate at the send point): the agent\'s act goes unasked — the leg sees it');
  } finally { DeviceManager.prototype._gate = keep; }
}
{
  // int316 (device-allow-flags + hub-act-ask in one release): THE DEVICE'S OWN ALLOW LIST IS JUDGED BEFORE THE OWNER IS ASKED —
  // an act the list the link stated leaves off is refused by name (op-not-allowed), NO card, nothing sent
  const listed = { v: 1, allow: ['run', 'files', 'sessions', 'upgrade'], all: false, source: 'install', at: 1 };
  const w = world(); w.conn.info.policy = listed;
  const p0 = codeOf(w.dm._request({ op: 'input-events', events: [{ type: 'key', key: 'a' }], by: 'agent:claude:c1' }));
  await settle(); const asked = w.cards().length; w.fire(); const r = await p0; // a card held it ⇒ its 60 s fire settles it
  ok(r === 'op-not-allowed' && asked === 0 && ops(w.sent).length === 0 && w.lines.length === 1 && w.lines[0].code === 'op-not-allowed',
    'an act the device\'s own list leaves off (input): refused by name BEFORE any ask — no card, nothing sent, ONE line', { r, asked, sent: ops(w.sent), lines: w.lines });
  // CONTROL: an act the list allows (run) is still asked on a cluster instance
  const p = w.dm.runCmd('ls', [], { by: 'agent:claude:c1' }); await settle();
  ok(w.cards().length === 1 && ops(w.sent).length === 0, 'CONTROL: an act the list allows (run) is still HELD and asked — one card', w.cards().map((c) => c.text));
  w.fire(); await codeOf(p);
  // CONTROL (the order as the two lanes shipped it — the ask first: no link known at the gate): the owner is asked about
  // an act the device would refuse — the leg above sees the difference
  const w2 = world(); w2.conn.info.policy = listed; w2.dm._conn = null;
  const p2 = w2.dm._request({ op: 'input-events', events: [{ type: 'key', key: 'a' }], by: 'agent:claude:c1' }); await settle();
  ok(w2.cards().length === 1, 'CONTROL (ask first): a card asks about an act the device refuses — the order is what the leg above judges', w2.cards().length);
  w2.fire(); await codeOf(p2);
}

console.log('— ⑤ the routes');
{
  const express = require('express');
  const { ExitProxyManager } = require('../src/exit-proxy.js');
  const dir = path.join(tmp, 'routes'); fs.mkdirSync(dir, { recursive: true });
  const hosts = new HostManager({ dataDir: dir });
  hosts.setDialToken('mac1', 'x'.repeat(64));
  const hid = hosts.findByDeviceId('mac1').id;
  const userTodos = new UserTodoManager({ dataDir: dir, expirySweepMs: 3600e3 });
  const activeSessions = new Map([['w1', { agentToken: 'vsst_testtoken1', backend: 'claude', claudeSessionId: 'c1', name: 's1' }]]);
  const exitProxy = new ExitProxyManager({ hosts, grants: require('../src/server/grants-store.js').create({ dataDir: dir }), dataDir: dir, userTodos, log: () => { } });   // lane grants-unify: the lists' ONE store
  const asker = ASK.wire({ hosts, userTodos, exitProxy, settingOf: () => 'auto', activeSessions, env: { VIBESPACE_INSTANCE_NAME: 'alice' }, log: () => { } });
  const link = fakeDm(hosts.actGateFor(hid));
  const app = express(); app.use(express.json());
  require('../src/server/exit-routes.js').create({ app, rootDir: REPO, AGENT_BIN_DIR: path.join(REPO, 'data/bin'), activeSessions, auth: null, wss: { clients: new Set() }, WS_OPEN: 1, bcastAll: () => { }, integrationEnabled: () => true, unpairDialDevice: () => { }, hosts, getExitProxy: () => exitProxy, getMounts: () => null, getPortForwards: () => null });
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (p, body, h = {}) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(body) });
  try {
    ok(asker.instanceKind === 'cluster' && hosts.hubActs === asker, 'wire(): a fleet pod (VIBESPACE_INSTANCE_NAME) is a cluster instance; the asker on hosts.hubActs');
    const v0 = await (await fetch(`${base}/api/hosts/${hid}/exit-access`)).json();
    ok(v0.access.hub.mode === 'default' && v0.hub.policy === 'ask' && v0.hub.source === 'instance' && v0.hub.instanceKind === 'cluster' && v0.hub.stored === null && Array.isArray(v0.hub.asks), 'the dialog\'s GET: the list not set, what applies (ask — this cluster instance\'s default) and why', v0.hub);
    const p = link.dm.runCmd('ls', [], { by: 'agent:claude:c1' }); await settle();
    const askId = asker.list()[0].askId;
    // lane wake-approve-card r3 (the owner: «这个索要通知在聊天框里完全没有»): an AGENT's act is a card in the conversation that asked
    const filedIt = (userTodos.snapshot().open || []).find((i) => i.action && i.action.askId === askId);
    ok(filedIt && filedIt.about === 'claude:c1' && filedIt.sessionKey === ASK.INBOX_KEY && FA.needsOf(userTodos.snapshot().open, ['claude:c1']).some((e) => e.item.id === filedIt.id), 'wire()\'s asker files an AGENT\'s act ABOUT the conversation that asked (`about` = its live session\'s key, claude:c1) — a card in its chat; the tray\'s Machines group as before', filedIt && { about: filedIt.about, key: filedIt.sessionKey });
    const v1 = await (await fetch(`${base}/api/hosts/${hid}/exit-access`)).json();
    ok(v1.hub.asks.length === 1 && v1.hub.asks[0].kind === 'run' && v1.hub.asks[0].waiting === 1, 'the GET counts the cards that are up');
    const b = await post(`/api/hub-acts/asks/${askId}`, { answer: 'once' }, { Authorization: 'Bearer vsst_testtoken1' });
    const bj = await post(`/api/hub-acts/asks/${askId}`, { answer: 'once', token: 'jbt_x' });
    ok(b.status === 403 && (await b.json()).code === 'human_only' && bj.status === 403, 'a bearer (vsst_ / jbt_) answering ⇒ 403 human_only — an agent never approves an act');
    const g = await fetch(`${base}/api/hub-acts/asks`, { headers: { Authorization: 'Bearer vsst_testtoken1' } });
    ok(g.status === 403, 'the list of cards is the user\'s too');
    // lane wake-approve-card r3: the door asks THE person verdict (src/routes/vault.js) — a cookie write that is not this page ⇒ cross_site
    const yx = await post(`/api/hub-acts/asks/${askId}`, { answer: 'once' });
    ok(yx.status === 403 && (await yx.json()).code === 'cross_site' && asker.list().length === 1, 'a write that is not this instance\'s page (a bare curl) ⇒ 403 cross_site — the card still up (THE person verdict, as the vault\'s doors)');
    const PAGE = { 'Sec-Fetch-Site': 'same-origin' };
    const y = yx.status === 200 ? yx : await post(`/api/hub-acts/asks/${askId}`, { answer: 'once' }, PAGE);   // (a tree whose door took the bare write: that WAS the answer)
    const yj = await y.json();
    ok(y.status === 200 && yj.state === 'allowed' && await codeOf(p) === 'sent' && link.lines.at(-1).answeredBy === 'human:local', 'the person\'s Allow once (cookie) ⇒ it runs; who answered = the sign-in\'s handle (human:local without one)', yj);
    const y2 = await post(`/api/hub-acts/asks/${askId}`, { answer: 'deny' }, PAGE), y3 = await post('/api/hub-acts/asks/0000', { answer: 'deny' }, PAGE);
    ok(y2.status === 409 && (await y2.json()).code === 'ask_settled' && y3.status === 404 && (await y3.json()).code === 'ask_unknown', 'answered again ⇒ 409 ask_settled; unknown ⇒ 404 ask_unknown');
    const pw = link.dm.runCmd('ls', [], { by: 'system:writer-sweep' }); await settle();
    const ph = await fetch(`${base}/api/hosts/${hid}/exit-access`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ hub: { mode: 'everyone' } }) });
    const phj = await ph.json();
    ok(ph.status === 200 && phj.access.hub.mode === 'everyone' && E.exitAccessOf(hosts.get(hid)).hub.mode === 'everyone' && await codeOf(pw) === 'sent', 'the PATCH writes the third list alone — and the card that was up settles by the new list (Always allow ⇒ it goes)', phj.access);
    const pb = await fetch(`${base}/api/hosts/${hid}/exit-access`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer vsst_testtoken1' }, body: JSON.stringify({ hub: { mode: 'nobody' } }) });
    ok(pb.status === 403 && E.exitAccessOf(hosts.get(hid)).hub.mode === 'everyone', 'an agent may not change the list');
    const pn = await fetch(`${base}/api/hosts/${hid}/exit-access`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ use: { mode: 'nobody' }, run: { mode: 'nobody' } }) });
    ok(pn.status === 200 && E.exitAccessOf(hosts.get(hid)).hub.mode === 'everyone', 'saving the two other lists keeps the third');
  } finally { server.close(); userTodos.stop?.(); }
}

console.log('— ⑥ the card in the For-you row');
{
  const noop = () => { };
  const mkEl = () => ({ dataset: {}, className: '', innerHTML: '', querySelector: () => null, querySelectorAll: () => [], appendChild: noop, addEventListener: noop, setAttribute: noop, classList: { add: noop, remove: noop, toggle: noop }, style: {} });
  globalThis.window = globalThis; globalThis.addEventListener = globalThis.addEventListener || noop; globalThis.removeEventListener = globalThis.removeEventListener || noop;
  globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
  globalThis.document = { createElement: mkEl, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener: noop, removeEventListener: noop, documentElement: { style: {}, lang: 'en' }, body: mkEl(), head: mkEl() };
  const R = await import(pathToFileURL(path.join(REPO, 'src/lib/user-todos-row.js')).href);
  const w = P.cardOf({ by: 'system:usage-harvest', machine: 'mac1', kind: 'files', summary: 'write /home/u/.vibespace/cursor.json · 40 B' });
  const ctx = { t: (x, p) => (p ? x.replace(/\{(\w+)\}/g, (m, k) => (p[k] !== undefined ? String(p[k]) : m)) : x), wordsOf: (i) => i.text, detailOf: (i) => i.detail, nameFor: () => 'Machines', replyState: () => ({ show: false }) };
  const html = R.renderRow({ item: { id: 'ut-h', text: w.text, detail: w.detail, urgency: 'urgent', action: { type: 'hub-act-ask', askId: 'a1', hostId: 'h', machine: 'mac1', kind: 'files' }, createdAt: Date.now() } }, ctx).innerHTML;
  const plan = html.indexOf('ut-proposal-plan'), ans = html.indexOf('ut-hub-answer');
  const btns = [...html.matchAll(/data-answer="(\w+)">([^<]+)</g)].map((m) => `${m[1]}:${m[2]}`);
  ok(plan >= 0 && ans > plan && btns.join('|') === 'once:Allow once|always:Always on this machine|deny:Deny' && /write \/home\/u\/\.vibespace\/cursor\.json/.test(html.slice(plan, ans)) && !/ut-detail-exp/.test(html), 'what it would do, whole, ABOVE Allow once / Always on this machine / Deny (never folded below)', btns);
  ok(/ut-exit-allow ut-hub-once/.test(html) && /ut-exit-allow ut-hub-always/.test(html) && /ut-exit-deny ut-hub-deny/.test(html), 'Allow once and Always are armed like every Allow (press-arm: .ut-exit-allow)');
  const done = R.renderRow({ item: { id: 'ut-h', text: w.text, detail: w.detail, status: 'done', resolvedAt: Date.now(), action: { type: 'hub-act-ask', askId: 'a1' }, createdAt: Date.now() }, resolved: true }, ctx).innerHTML;
  ok(!/data-answer="once"/.test(done), 'a resolved card offers no answer');
  ok(require('../src/inbox-reply.js').ANSWER_ACTION_TYPES.includes('hub-act-ask') && (/'hub-act-ask': 'askId'/.test(read('src/user-todos.js')) || (() => { try { return require('../src/foryou-actions.js').ACTION_IDENTITY['hub-act-ask'] === 'askId'; } catch { return false; } })()) /* lane ledger-dedup-law r8: the merge with wake-approve-card — the registry's row */, 'a typed reply never answers it (its buttons do); one item per ask');
  ok(/const hubAsk = !resolved && i\.action && \(i\.action\.type === 'hub-act-ask'/.test(read('src/lib/inbox-window-layout.js')) && /'hub-once', \.\.\.\(hubAsk\.type === 'vault-grant-ask' \? \['grant-8h'\] : hubAsk\.type === 'vault-run-ask' \? \(hubAsk\.always \? \['shape-always'\] : \[\]\) : \[hubAsk\.type === 'automation-ask' \? 'auto-always' : hubAsk\.type === 'pool-cross-provider' \? 'pool-always' : 'hub-always'\]\), 'hub-deny'/.test(read('src/lib/inbox-window-layout.js')) && /if \(a === 'hub-once' \|\| a === 'hub-always' \|\| a === 'hub-deny'/.test(read('src/lib/inbox-window.js')), /* design q-046: an automation ask shares the three buttons (its Always grants the key) */ 'the For-you window answers it too (its three buttons, the same arm)');
}

console.log('— ⑦ the census');
{
  const hostsSrc = read('src/hosts.js'), dial = read('src/server/dial-pairing.js'), srv = read('server.js'), client = read('src/agentd/client.js'), exitSrc = read('src/exit-proxy.js');
  const blocks = (s) => s.split('new DeviceManager({').slice(1).map((b) => b.split('\n    });')[0].split('\n      });')[0]);
  ok(blocks(hostsSrc).length === 1 && /actGate: this\.actGateFor\(id\)/.test(blocks(hostsSrc)[0]) && blocks(dial).length === 1 && /actGate: hosts\.actGateFor\(/.test(blocks(dial)[0]), 'both REMOTE device clients (ssh, dial) are built with the machine\'s gate');
  ok(blocks(srv).length === 1 && !/actGate/.test(blocks(srv)[0]), 'this machine\'s own daemon has none (it is the hub itself)');
  ok(/const facts = asked !== undefined \? asked : act && DA\.auditable\(payload\) \? await this\._gate\(payload, \{ consent \}\) : null;\n    const conn = await this\.connect\(\);/.test(client) && /const asked = DA\.auditable\(req\) \? await this\._gate\(req, \{ consent \}\) : null;/.test(client) && /const asked = await this\._gate\(\{ op: 'fs-op', action: 'write-stream', step: 'open'/.test(client) && /await this\._request\(\{ \.\.\.req, chan \}, \{ audit: false, asked \}\)/.test(client),
    'the gate sits at THE ONE SEND POINT (_request, before connect), before a stream\'s channel and a write-stream\'s open — and a stream\'s own request is never judged twice');
  ok((exitSrc.match(/consent: true/g) || []).length === 3, 'vibespace-exit\'s three device acts (use / run / push) carry consent — never asked twice');
  ok(/require\('\.\/src\/server\/hub-act-ask\.js'\)\.wire\(\{ hosts, userTodos, exitProxy, settingOf: \(k\) => serverSetting\(k\), activeSessions \}\)/.test(srv), 'server.js wires the asker (one line)');
  const schema = read('src/lib/settings-schema.js');
  ok(schema.includes(`'${P.SETTING_KEY}': {`) && P.SETTING_VALUES.every((v) => schema.includes(`{ value: '${v}'`)), `the setting ${P.SETTING_KEY} (${P.SETTING_VALUES.join(' / ')})`);
  ok(/name: 'test-hub-act-ask', tier: 'fast'/.test(read('scripts/ci.mjs')), 'this suite has its tier row');
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { }
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0);
