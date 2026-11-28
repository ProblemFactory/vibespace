#!/usr/bin/env node
// PURE model gate for Background Work (docs/design-background-work.md M1).
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// lane int361 (.367): the schedule legs run in a PINNED zone — America/Los_Angeles, the box's, which has both DST edges — set
// before any Date use (the runner is UTC; Node re-reads TZ on assignment). Their instants are written with explicit offsets.
process.env.TZ = 'America/Los_Angeles';
const require = createRequire(import.meta.url);
const M = require('../src/job-model.js');
const __dirname_jm = require('path').dirname(new URL(import.meta.url).pathname);
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (typeof c !== 'boolean') throw new TypeError(`ok: its condition is a ${typeof c}, not a boolean — the arguments are swapped, or a value stands where a comparison belongs`); if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e ? ' — ' + e : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const B = (s) => Buffer.byteLength(s, 'utf-8');

// ── permissions: no-oracle trio ──
const mk = (i, over = {}) => ({ id: 'jb-' + i, kind: 'task', state: 'done', name: 'job-' + i,
  owner: { conversation: { id: 'conv-A' }, sessionId: 'sess-A', sessionCreatedAt: 1, groupsSnapshot: ['T-p'] },
  access: { view: 'group' }, ...over });
const jobs = [
  mk(1, { name: 'own-private', access: { view: 'session' } }),
  mk(2, { name: 'group-vis' }),
  mk(3, { name: 'foreign-secret', access: { view: 'session' }, owner: { conversation: { id: 'conv-X' }, sessionId: 'sX', sessionCreatedAt: 5, groupsSnapshot: ['T-w'] } }),
  mk(4, { name: 'world', access: { view: 'all' }, owner: { conversation: { id: 'conv-X' }, sessionId: 'sX', sessionCreatedAt: 5, groupsSnapshot: ['T-w'] } }),
];
const resumedOwner = { conversationId: 'conv-A', sessionId: 'sess-NEW', sessionCreatedAt: 9, groups: new Set(['T-p']) };
const stranger = { conversationId: 'conv-B', sessionId: 'sB', sessionCreatedAt: 2, groups: new Set(['T-z']) };
const groupmate = { conversationId: 'conv-C', sessionId: 'sC', sessionCreatedAt: 3, groups: new Set(['T-p']) };
ok(M.visibleJobs(jobs, resumedOwner).map((j) => j.name).join() === 'own-private,group-vis,world', 'owner via conversation lineage (resumed session) sees own+group+all');
ok(M.visibleJobs(jobs, stranger).map((j) => j.name).join() === 'world', 'stranger sees only view:all');
ok(M.visibleJobs(jobs, groupmate).map((j) => j.name).join() === 'group-vis,world', 'groupmate sees group+all, never foreign session-scoped');
ok(!M.canEdit(jobs[1], groupmate) && verdictOf(M.canControl(mk(9, { access: { control: 'group' } }), groupmate)), 'edit is owner-only even where control=group');
ok(verdictOf(M.canEdit(jobs[0], { isUser: true })), 'the user always passes');
ok(verdictOf(M.isOwner(mk(9), { conversationId: 'zzz', sessionId: 'sess-A', sessionCreatedAt: 1, groups: new Set() })), 'sessionId+createdAt tuple is the secondary owner path');
ok(!M.isOwner(mk(9), { conversationId: 'zzz', sessionId: 'sess-A', sessionCreatedAt: 2, groups: new Set() }), 'collided sessionId with different createdAt is NOT owner');
// B-b461: what the design doc says is what is built — `group` reads the creator's groups AS SNAPSHOTTED AT CREATION, and a job
// whose creator was in no group falls back to nobody (never to `all`): its owner and the user see it, any other conversation not.
{
  const ungrouped = mk(10, { name: 'ungrouped', owner: { conversation: { id: 'conv-U' }, sessionId: 'sU', sessionCreatedAt: 4, groupsSnapshot: [] } });
  const loner = { conversationId: 'conv-L', sessionId: 'sL', sessionCreatedAt: 6, groups: new Set() };
  const seen = (c) => M.visibleJobs([ungrouped], c).length === 1;
  ok(!seen(stranger) && !seen(loner) && !seen(groupmate) && gateOf(seen({ isUser: true })) && verdictOf(seen({ conversationId: 'conv-U', sessionId: 'sX', sessionCreatedAt: 0, groups: new Set() })),
    'B-b461: an ungrouped creator\'s view=group job is seen by its owner (by lineage) and the user — no fallback to all');
  // «never refreshed»: the snapshot has exactly two writers, both at creation — the agent's create (the caller's groups) and the
  // user's (none); a cron's child carries its parent's owner whole. A writer anywhere else (a refresh on a mutation or a sweep)
  // is a new site here. Over src/ and the agent CLIs (data/bin).
  const SNAP = /groupsSnapshot\s*(?::(?!\s*\[\])|=(?!=))|groupsSnapshot\s*:\s*\[\]/;
  // the TRACKED tree (git ls-files), so a scratch file a developer leaves under src/ is not a site; no git ⇒ the walk of the dirs
  const root = path.join(__dirname_jm, '..');
  const ls = spawnSync('git', ['ls-files', '-z', '--', 'src', 'data/bin'], { cwd: root, encoding: 'utf8' });
  const files = ls.status === 0 ? ls.stdout.split('\0').filter((f) => f && (/\.(m?js|cjs)$/.test(f) || f.startsWith('data/bin/'))) : [];
  if (ls.status !== 0) { const walk = (d) => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { const r = d + '/' + e.name; if (e.isDirectory()) walk(r); else if (/\.(m?js|cjs)$/.test(e.name) || d === 'data/bin') files.push(r); } }; walk('src'); walk('data/bin'); }
  const sites = files.flatMap((f) => fs.readFileSync(path.join(__dirname_jm, '..', f), 'utf8').split('\n').map((l, i) => [f, i + 1, l]).filter(([, , l]) => SNAP.test(l) && !/^\s*(\/\/|\*)/.test(l)));
  const shape = sites.map(([f, , l]) => f + ': ' + (l.match(/groupsSnapshot\s*[:=][^,}\n]*/) || [''])[0].trim());
  ok(shape.length === 2 && gateOf(shape.includes('src/agent-routes.js: groupsSnapshot: [...a.caller.groups]')) && gateOf(shape.includes('src/server/jobs-wiring.js: groupsSnapshot: []'))
    && gateOf(SNAP.test('    job.owner.groupsSnapshot = [...caller.groups];')) && gateOf(SNAP.test("  owner: { createdBy: 'agent', groupsSnapshot: groupsNow() },")) && !SNAP.test('(job.owner && job.owner.groupsSnapshot || [])'),
    `B-b461: owner.groupsSnapshot is written only at creation — ${shape.join(' · ')} (CONTROL: a planted refresh assignment and a recomputed create are caught, a read is not)`);
  const doc = fs.readFileSync(path.join(__dirname_jm, '..', 'docs/design-background-work.md'), 'utf8');
  // the same words are read by agents (the manual is served at runtime) and by engineers (kb-features): neither promises them
  const others = ['docs/agent/background-work-manual.md', 'docs/kb-features.md'].map((f) => [f, fs.readFileSync(path.join(__dirname_jm, '..', f), 'utf8')]);
  // a promise may wrap across `//` comment lines inside the doc's code block: read it with the continuation markers folded
  const promises = (t) => /fallback\s+`?all`?\s+when\s+ungrouped|refreshed eagerly|surfaced for re-owning/i.test(t.replace(/\n\s*(?:\/\/)?\s*/g, ' '));
  ok(!promises(doc) && gateOf(others.every(([, txt]) => !promises(txt)))
    && gateOf(promises('    "groupsSnapshot": ["T-…"]        // refreshed eagerly on every mutation + periodic sweep'))
    && gateOf(promises('                                     // agent defaults: view=group (fallback all when\n                                     // ungrouped), control=session; user locks stick (§7)'))
    && gateOf(promises('- `view`/`control` ∈ session|group|all; agent defaults view=group (fallback\n  `all` when ungrouped), control=session. Owner = conversation-lineage match,'))
    && verdictOf(promises('  verified on the fast path; mismatch ⇒ surfaced for re-owning in the panel.')),
    'B-b461: docs/design-background-work.md, the agent manual and kb-features promise no eager groupsSnapshot refresh, no fallback to all and no re-own in the panel (CONTROL: each of the four removed lines is caught)');
}

// ── vendor vet (negative controls) ──
ok(verdictOf(M.vetSpec({ cmd: { argv: ['curl', 'https://api.anthropic.com/v1/messages', '-H', 'x-api-key: $ANTHROPIC_API_KEY'] } }).ok), 'an API call with your own key passes (owner decision, verify r3)');
ok(!M.vetSpec({ cmd: { argv: ['bash', '-c', 'jq .t ~/.claude/.credentials.json'] } }).ok, 'credential path refused');
ok(!M.vetSpec({ health: { type: 'cmd', value: 'cat data/subs/current' } }).ok, 'health probe reaching credential material refused');
ok(verdictOf(M.vetSpec({ cmd: { argv: ['npm', 'run', 'dev'] } }).ok), 'ordinary spec passes');
// B-f8c7 census (lane job-vendor-ban): EVERY command a job can run goes through the ONE vet — a planted vendor/credential
// piece in each shape is refused, its clean twin passes (a census, not a blanket refusal). Before the fix every action.task
// shape passed: the CLI's --every/--cron/--at put the command ONLY there.
{
  const sh = (bad) => ['sh', '-c', bad ? 'jq .t ~/.claude/.credentials.json' : 'curl https://example.com/health'];
  const cwd = (bad) => (bad ? '/srv/vibespace/data/subs' : '/srv/vibespace/data/logs');
  const secret = (bad) => (bad ? ['CLAUDE_CODE_OAUTH_TOKEN'] : []);   // lane job-secrets-retire: ANY named envFrom is refused (below) — the clean twin is the empty list every record carries
  const task = (t) => ({ kind: 'cron', schedule: { cron: '7 * * * *' }, action: { type: 'spawn-task', task: t } });
  const shapes = {
    'spec.cmd.argv (a plain task)': (b) => ({ kind: 'task', cmd: { argv: sh(b) } }),
    'spec.cmd.env': (b) => ({ cmd: { argv: ['./poll.sh'], env: { PROBE: sh(b)[2] } } }),
    'spec.cmd.cwd': (b) => ({ cmd: { argv: ['cat', 'current'], cwd: cwd(b) } }),
    'spec.health': (b) => ({ kind: 'service', cmd: { argv: ['npm', 'start'] }, health: { type: 'cmd', value: sh(b)[2] } }),
    'spec.envFrom (a secret NAME)': (b) => ({ cmd: { argv: ['./poll.sh'] }, envFrom: secret(b) }),
    'action.task.cmd.argv (the CLI --cron shape)': (b) => task({ cmd: { argv: sh(b), cwd: '/tmp' } }),
    'action.task.cmd.argv (the CLI --at shape)': (b) => ({ ...task({ cmd: { argv: sh(b) } }), schedule: { at: '2099-01-01T00:00:00Z' } }),
    'action.task.cmd.argv (the CLI --every shape)': (b) => ({ ...task({ cmd: { argv: sh(b) } }), schedule: { everyMs: 3600e3, jitterPct: 10 } }),
    'action.task.cmd.env': (b) => task({ cmd: { argv: ['./poll.sh'], env: { PROBE: sh(b)[2] } } }),
    'action.task.cmd.cwd': (b) => task({ cmd: { argv: ['cat', 'current'], cwd: cwd(b) } }),
    'action.task.health': (b) => task({ cmd: { argv: ['./poll.sh'] }, health: { type: 'cmd', value: sh(b)[2] } }),
    'action.task.envFrom': (b) => task({ cmd: { argv: ['./poll.sh'] }, envFrom: secret(b) }),
    'a cron CHILD record ({ ...action.task, cronParent })': (b) => ({ kind: 'task', cronParent: 'jb-p', cmd: { argv: sh(b) } }),
  };
  for (const [name, mk] of Object.entries(shapes)) {
    ok(!M.vetSpec(mk(true)).ok, `census: a vendor/credential piece in ${name} is refused`);
    ok(verdictOf(M.vetSpec(mk(false)).ok), `census: the clean twin of ${name} passes`);
  }
  ok(verdictOf(M.vetSpec({ kind: 'cron', schedule: { cron: '7 * * * *' }, action: { type: 'notify', text: 'check api.anthropic.com status page by hand' } }).ok), 'census: a notify cron runs no command — its reminder TEXT is not judged');
  // verify r3 (lane job-vendor-ban, owner decision 2026-10-03): ONLY an obvious read of a subscription sign-in is refused.
  // (a) THE CENSUS — every harness descriptor's credential facts (creds.subsDirName under data/, creds.authFile in its home and
  //     through creds.spawnEnvVar) plus the list's own entries are refused in every form a job stores: a descriptor gaining a
  //     credential path the list misses reds HERE (planted in a tree copy: codex authFile tokens.json + subsDirName gem-subs).
  const forms = {
    'a plain task': (c) => ({ kind: 'task', cmd: { argv: ['sh', '-c', c] } }),
    '--cron': (c) => task({ cmd: { argv: ['sh', '-c', c] } }),
    '--every': (c) => ({ ...task({ cmd: { argv: ['sh', '-c', c] } }), schedule: { everyMs: 1800e3, jitterPct: 20 } }),
    '--at': (c) => ({ ...task({ cmd: { argv: ['sh', '-c', c] } }), schedule: { at: Date.now() + 3600e3 } }),
    '--keep-up': (c) => ({ kind: 'service', cmd: { argv: ['sh', '-c', c] } }),
    'a cron child': (c) => ({ kind: 'task', cronParent: 'jb-p', cmd: { argv: ['sh', '-c', c] } }),
  };
  const H = require('../src/harnesses/index.js');
  const descs = Object.values(H.HARNESSES).filter((h) => h && h.creds && h.creds.authFile);
  ok(descs.length >= 2, `r3 census: ${descs.length} harness descriptors declare credentials`);
  const facts = ['cat ~/.claude/.cred*', "security find-generic-password -s 'Claude Code-credentials' -w", 'jq . ~/.local/share/opencode/auth.json',
    'CLAUDE_CODE_OAUTH_TOKEN="$T" ./poll.sh', 'curl -H "Authorization: Bearer ' + 'sk-ant-' + 'oat01-AAAA" "$U"', 'curl -d "refresh_' + 'token=' + 'sk-ant-' + 'ort01-AAAA" "$U"'];   // split at runtime: no token-shaped literal in the tree (push protection)
  for (const h of descs) {
    const c = h.creds;
    const home = typeof c.sharedHome === 'function' ? path.basename(c.sharedHome()) : `.${h.id}`;
    facts.push(`cat /srv/vs/data/${c.subsDirName}/a1/${c.authFile}`, `jq . ~/${home}/${c.authFile}`, `cat "$${c.spawnEnvVar}/${c.authFile}"`);
  }
  for (const c of facts) {
    for (const [f, mk] of Object.entries(forms)) {
      const v = M.vetSpec(mk(c));
      ok(!v.ok && verdictOf(/vendor\/credential pattern \([^)]+\)/.test(v.error)), `r3 census: "${c}" in ${f} is refused, named in words`, v.error || 'PASSES');
    }
  }
  // (b) THE PASS LEG — everything else runs in every form: any API with your own key, the vendors' hosts named without a
  //     sign-in read, `claude -p` / the Agent SDK / `codex exec` / `opencode run` on a timer, ordinary jobs.
  for (const c of ['curl -s https://api.anthropic.com/v1/messages -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-beta: prompt-caching-2024-07-31" -d @q.json',
    'curl -s https://api.openai.com/v1/responses -H "Authorization: Bearer $OPENAI_API_KEY" -d @r.json', 'python3 -c "import anthropic; print(anthropic.Anthropic().models.list())"',
    'ANTHROPIC_API_KEY="$KEY" claude -p "summarize the log"', 'claude -p hi', "node -e \"import('@anthropic-ai/claude-agent-sdk')\"", 'codex exec "summarize"', 'opencode run hi',
    'curl -s https://platform.claude.com/docs/en/api/messages', 'curl -fsSL https://claude.ai/install.sh | bash', 'curl -s https://chatgpt.com/backend-api/codex/responses',
    'git -C /srv/app pull --ff-only && npm test', 'curl -fsS https://example.com/health', 'ls ~/.claude/projects', 'claude --version'])
    for (const [f, mk] of Object.entries(forms)) ok(verdictOf(M.vetSpec(mk(c)).ok), `r3 pass leg: "${c}" in ${f} runs`, M.vetSpec(mk(c)).error);
  // THE ONE DOOR: src/jobs.js starts a process in exactly ONE place and vets there before anything else — a new run path
  // (an edit verb, a new restart policy) either goes through _spawn or reds this census; create and start answer early
  const src = fs.readFileSync(new URL('../src/jobs.js', import.meta.url), 'utf8');
  const starts = [...src.matchAll(/(?<![\w.])(spawn|spawnSync|exec|execSync|execFile|execFileSync|fork)\(/g)];
  const door = src.indexOf('\n  _spawn(job, trigger, { caller = null } = {}) {\n    const vet = M.vetSpec(job);\n    if (!vet.ok) { this._refuseRun(job, vet, trigger); throw new Error(vet.error); }\n');
  const doorEnd = src.indexOf('\n  }\n', door);
  ok(starts.length === 1 && door > 0 && starts[0].index > door && starts[0].index < doorEnd, 'census: jobs.js starts a process in ONE place, behind the vet as _spawn\'s first act', `starts=${starts.length} door=${door}`);
  ok(gateOf(/  create\(spec, caller\) \{\n[^\n]*\n    const vet = M\.vetSpec\(spec\);\n    if \(!vet\.ok\) return \{ error: vet\.error \};/.test(src)) && gateOf(/    if \(job\.kind === 'cron'\) \{\n      const vet = M\.vetSpec\(job\);[^\n]*\n      if \(!vet\.ok\) \{ this\._refuseRun\(job, vet, 'manual'\); return \{ error: vet\.error \}; \}/.test(src)) && verdictOf(/try \{ this\._spawn\(job, 'manual', \{ caller \}\); \} catch \(e\) \{ if \(e && e\.code === 'memory-budget'\) this\._undoRefusedPress\(job\); else delete job\._press; return \{ error: e\.message, \.\.\.\(e && e\.code \? \{ code: e\.code \} : \{\}\), \.\.\.\(e && e\.budget \? \{ budget: e\.budget \} : \{\}\) \}; \}/.test(src)), 'census: create vets before it touches the record; start answers a cron at once and a task/service through the door');
  ok(gateOf(/child = \{ \.\.\.a\.task, id: rid\(\)/.test(src)) && verdictOf(/return \[spec\.cmd, spec\.health, spec\.envFrom, \.\.\.\(a \? jobCommandParts\(a\.task, depth \+ 1\) : \[\]\)\];/.test(fs.readFileSync(new URL('../src/job-model.js', import.meta.url), 'utf8'))), 'census: a cron child is { ...action.task } and the vet recurses into action.task');
}

// lane job-secrets-retire (design-vault-service-secret D10): A JOB'S SECRET COMES FROM THE VAULT ONLY. The old road (envFrom
// NAMES resolved at spawn from a plaintext data/job-secrets.json into the job's ENV) is retired: a spec that names envFrom —
// itself, in its action.task, a cron child built from one — is refused BY NAME at every door the vet runs, one sentence; the
// empty list every record carries (and no field at all) runs. RED on the base: the vet passed every named envFrom.
{
  const WORDS = "envfrom_retired: a job's secret comes from the vault: --vault NAME=vault://… — see vibespace-docs jobs";
  const task = (t, schedule = { cron: '7 * * * *' }) => ({ kind: 'cron', schedule, action: { type: 'spawn-task', task: t } });
  const cmd = { argv: ['./poll.sh'] };
  const doors = {
    'a plain task': (e) => ({ kind: 'task', cmd, ...e }),
    'a service (--keep-up)': (e) => ({ kind: 'service', cmd, restart: 'always', ...e }),
    'a scheduled run (--cron: action.task)': (e) => task({ cmd, ...e }),
    'a scheduled run (--at: action.task)': (e) => task({ cmd, ...e }, { at: '2099-01-01T00:00:00Z' }),
    'a scheduled run (--every: action.task)': (e) => task({ cmd, ...e }, { everyMs: 3600e3, jitterPct: 10 }),
    'a cron CHILD record ({ ...action.task, cronParent })': (e) => ({ kind: 'task', cronParent: 'jb-p', cmd, ...e }),
    'a cron whose OWN record names it (the parent)': (e) => ({ ...task({ cmd }), ...e }),
  };
  for (const [door, mk] of Object.entries(doors)) {
    for (const [form, envFrom] of [['a list', ['PROBE_SECRET']], ['a bare string', 'PROBE_SECRET']]) {
      const v = M.vetSpec(mk({ envFrom }));
      ok(!v.ok && v.code === 'envfrom_retired' && v.error === WORDS, `envfrom_retired: ${door} naming envFrom (${form}) is refused BY NAME, one sentence`, v.error || 'PASSES');
    }
    ok(gateOf(M.vetSpec(mk({ envFrom: [] })).ok) && verdictOf(M.vetSpec(mk({})).ok), `envfrom_retired: ${door} with the empty list every record carries (or no field) runs — no migration`, M.vetSpec(mk({ envFrom: [] })).error);
  }
  const both = M.vetSpec({ kind: 'task', cmd: { argv: ['sh', '-c', 'jq .t ~/.claude/.credentials.json'] }, envFrom: ['GITHUB_TOKEN'] });
  ok(!both.ok && both.code === 'envfrom_retired', 'envfrom_retired: a spec that also reads a sign-in is named by the retired road first — one refusal, one name', both.error);
  // r2 (accept-r1 finding 2): THE MANUAL THE REFUSAL POINTS TO teaches the road it names. `vibespace-docs jobs` is resolved the
  // way the docs route resolves it (the registry's topic → its manual file); its §9 (the job's environment) says the secret
  // comes from the vault (`--vault NAME=vault://…`, the subsection «A stored secret from the vault» L1a writes under it) and
  // never teaches the retired road — no `--env-from` (a flag
  // vibespace-job never had), no «⚙→Background Work» value store, no literal-redaction promise for log tails (the redaction
  // read the deleted store), and the vetted pieces carry no envFrom row. RED on 052f524ba by those stale words.
  {
    const REG = require('../src/agent-cli-registry.js');
    const row = REG.ROWS.find((r) => r.topic === 'jobs' || (r.aliases || []).includes('jobs'));
    const file = row && [].concat(row.manual)[0];
    const man = file ? fs.readFileSync(path.join(__dirname_jm, '..', 'docs/agent', file), 'utf8') : '';
    const s9 = (man.match(/\n## 9\. [^\n]*\n([\s\S]*?)(?=\n## (?!9\. ))/) || [])[1] || '';
    ok(gateOf(/see vibespace-docs jobs$/.test(WORDS)) && file === 'background-work-manual.md' && s9.length > 200, `the refusal's pointer resolves: vibespace-docs jobs → docs/agent/${file} §9 (${s9.length} chars)`);
    ok(gateOf(/comes from the vault/.test(s9)) && gateOf(s9.includes('--vault NAME=vault://…')) && gateOf(/«A stored secret from the vault»/.test(s9)) && verdictOf(/envfrom_retired/.test(s9)), '§9 teaches the ONE road: the secret comes from the vault (--vault NAME=vault://…, «A stored secret from the vault») — a named envFrom is refused envfrom_retired');
    // r3 (review N2): …and on the PAIR the pointer points somewhere — L1a (vault-job-road) writes «### A stored secret from the
    // vault» as a subsection of §9, right under this paragraph. L0 alone has no such text: SKIPPED BY NAME there (the marker is
    // L1a's PURE module src/vault-job.js, never the heading itself), so L0 stays green and the pair is pinned
    if (!fs.existsSync(path.join(__dirname_jm, '..', 'src/vault-job.js'))) console.log('  – §9 → «A stored secret from the vault» heading leg SKIPPED BY NAME — L1a (vault-job-road) is not in this tree (src/vault-job.js absent): the subsection is its text; on the pair this leg runs');
    else {
      const at = s9.search(/^### A stored secret from the vault — `--vault NAME=vault:\/\/…`$/m), para = s9.indexOf('«A stored secret from the vault»');
      ok(at > 0 && para >= 0 && para < at && !/^#{2,3} /m.test(s9.slice(para, at)), `the pair: L1a's «### A stored secret from the vault — \`--vault NAME=vault://…\`» is IN §9, the next heading right after the paragraph that points to it (at ${at}, pointer at ${para})`);
    }
    const stale = [[/--env-from/, '`--env-from` (a flag vibespace-job never had)'], [/⚙→Background Work/, '«user manages values in ⚙→Background Work»'], [/literal-redacted|redacted from\s+log tails/, 'the literal-redaction promise for log tails'], [/an `?--env-from`? name/, 'an --env-from name as a vetted piece']];
    const found = stale.filter(([re]) => re.test(man)).map(([, what]) => what);
    ok(found.length === 0, 'the whole manual teaches none of the retired road: ' + stale.map(([, what]) => what).join(' · '), found);
  }
}

// ── schedules ──
ok(gateOf(M.parseCron('41 9 * * *')) && gateOf(M.parseCron('*/15 * * * *')) && !M.parseCron('99 * * * *') && !M.parseCron('* * * *'), 'cron parse accepts/rejects correctly');
// lane int361 (.367 pin #0): the clock is PINNED — this leg read Date.now() and went red on 2026-10-31, the eve of the fall-back
// (the next 03:00 local was 25 real hours away): a fixture that reads the real clock passes or fails by the calendar.
const base = Date.UTC(2026, 7, 17, 12, 0, 0); // Mon Aug 17 2026 05:00 PDT — far from either DST edge
const nf = M.nextFire({ cron: '0 3 * * *' }, base);
ok(nf > base && nf - base <= 24 * 3600e3 + 60e3, 'daily cron next-fire lands within 24h (a pinned clock: Aug 17 05:00 PDT)');
const d = new Date(nf); ok(d.getHours() === 3 && d.getMinutes() === 0 && d.getDate() === 18, 'daily cron fires at 03:00 local (Aug 18)');
// ── schedules across daylight saving (America/Los_Angeles 2026: spring-forward Mar 8 02:00 PST → 03:00 PDT; fall-back Nov 1
// 02:00 PDT → 01:00 PST). RED on c0faf8120 (the product): the jump leg (it skipped the day), strictly-after, the repeated-hour
// legs (a past fire, then a fire at every tick); the rest pin what it already did.
{
  const T = (iso) => Date.parse(iso); const iso = (t) => new Date(t).toISOString();
  const nx = (cron, from) => M.nextFire({ cron }, T(from));
  // jobs.js _cronTick, 30 s ticks: nextFireAt = nextFire(schedule, now(), _, null) at create / start / resume, and after every
  // fire nextFire(schedule, now(), _, the slot it fired for) — `last` seeds a schedule that already fired (a running one)
  const fires = (cron, from, to, last = null) => {
    const out = []; let next = M.nextFire({ cron }, from, undefined, last);
    for (let t = from; t <= to && next != null; t += 30e3) { if (t < next) continue; out.push(t); next = M.nextFire({ cron }, t, undefined, next); }
    return out;
  };
  ok(nx('0 3 * * *', '2026-10-31T10:00:00-07:00') === T('2026-11-01T03:00:00-08:00') && nx('0 3 * * *', '2026-10-31T03:00:00-07:00') === T('2026-10-31T03:00:00-07:00') + 25 * 3600e3,
    'fall-back: the daily 03:00 fires at 03:00 PST — 18 h after 10:00 PDT, 25 h after the day before\'s fire (never 02:00 or 04:00)');
  ok(nx('0 3 * * *', '2026-03-07T10:00:00-08:00') === T('2026-03-08T03:00:00-07:00') && nx('0 3 * * *', '2026-03-07T03:00:00-08:00') === T('2026-03-07T03:00:00-08:00') + 23 * 3600e3,
    'spring-forward: the daily 03:00 fires at 03:00 PDT — 16 h after 10:00 PST, 23 h after the day before\'s fire');
  // the integrator's ruling (10-31): a time that does not exist that day fires ONCE AT THE JUMP (03:00 PDT), as cronie / systemd do
  const jump = fires('30 2 * * *', T('2026-03-07T10:00:00-08:00'), T('2026-03-09T10:00:00-07:00'));
  ok(nx('30 2 * * *', '2026-03-07T10:00:00-08:00') === T('2026-03-08T03:00:00-07:00') && nx('30 2 * * *', '2026-03-08T01:59:00-08:00') === T('2026-03-08T03:00:00-07:00')
    && nx('30 2 * * *', '2026-03-08T03:00:00-07:00') === T('2026-03-09T02:30:00-07:00') && jump.map(iso).join() === '2026-03-08T10:00:00.000Z,2026-03-09T09:30:00.000Z',
    'spring-forward: 02:30 does not exist on Mar 8 — ONE fire at the jump (03:00 PDT, strictly after now), then Mar 9 02:30 PDT', jump.map(iso).join(' '));
  const hr = fires('0 * * * *', T('2026-03-08T00:30:00-08:00'), T('2026-03-08T04:30:00-07:00'));
  ok(hr.map(iso).join() === '2026-03-08T09:00:00.000Z,2026-03-08T10:00:00.000Z,2026-03-08T11:00:00.000Z',
    'spring-forward: hourly — the missing 02:00 meets 03:00 at the jump: ONE fire there (01:00 PST, 03:00 PDT, 04:00 PDT)', hr.map(iso).join(' '));
  const sf = fires('*/15 * * * *', T('2026-03-08T01:00:00-08:00'), T('2026-03-08T03:30:00-07:00'));
  ok(sf.map(iso).join() === ['09:15', '09:30', '09:45', '10:00', '10:15', '10:30'].map((h) => `2026-03-08T${h}:00.000Z`).join(),
    'spring-forward: */15 keeps 15 real minutes across the jump (01:45 PST ⇒ 03:00 PDT)', sf.map(iso).join(' '));
  const once = fires('30 1 * * *', T('2026-10-31T10:00:00-07:00'), T('2026-11-01T10:00:00-08:00'));
  ok(once.length === 1 && once[0] === T('2026-11-01T01:30:00-07:00'), 'fall-back: 01:30 happens twice on Nov 1 — exactly ONE fire, the first pass (01:30 PDT)', once.map(iso).join(' '));
  // RED on c0faf8120: inside the repeated hour the scan re-resolved now() to the first pass, an hour back, and answered a past fire
  const back = [];
  for (const cron of ['30 1 * * *', '59 1 * * *', '*/15 * * * *', '0 * * * *', '0 3 * * *', '30 2 * * *'])
    for (const [a, b] of [['2026-11-01T06:00:00Z', '2026-11-01T12:00:00Z'], ['2026-03-08T08:00:00Z', '2026-03-08T12:00:00Z']])
      for (let x = T(a); x <= T(b); x += 60e3)
        for (const last of [undefined, null, x - 3600e3]) { const n = M.nextFire({ cron }, x, undefined, last); if (!(n > x)) back.push(`${cron} @${iso(x)} last ${last} ⇒ ${n == null ? n : iso(n)}`); }
  ok(back.length === 0, 'nextFire is strictly after its now at every minute across both DST edges (6 crons × lastFireAt omitted / null / an hour back)', back.length + ': ' + back.slice(0, 3).join(' · '));
  // the integrator's ruling (10-31, acceptance of d69617894): a repeated time fires in the SECOND pass iff the schedule did not
  // fire it in the first — jobs.js hands the slot it fired for after a fire, null at create / start / resume
  ok(M.nextFire({ cron: '30 1 * * *' }, T('2026-11-01T01:10:00-08:00'), undefined, null) === T('2026-11-01T01:30:00-08:00'),
    'fall-back: 30 1 * * * created at 01:10 PST (its 01:30 still ahead on the wall clock) fires at 01:30 PST that day — never pushed to the next');
  ok(M.nextFire({ cron: '30 1 * * *' }, T('2026-11-01T01:30:20-07:00'), undefined, T('2026-11-01T01:30:00-07:00')) === T('2026-11-02T01:30:00-08:00'),
    'fall-back: fired at 01:30 PDT, then the tick ⇒ the next day (01:30 PST is not a second fire)');
  ok(M.nextFire({ cron: '59 1 * * *' }, T('2026-11-01T01:00:10-08:00'), undefined, T('2026-11-01T01:59:00-07:00')) === T('2026-11-02T01:59:00-08:00'),
    'fall-back: fired at 01:59 PDT, a tick at 01:00 PST ⇒ NOT 01:59 PST again — the next day');
  ok(M.nextFire({ cron: '30 1 * * *' }, T('2026-11-01T01:10:00-08:00'), undefined, null) === T('2026-11-01T01:30:00-08:00')
    && fires('30 1 * * *', T('2026-11-01T01:10:00-08:00'), T('2026-11-02T10:00:00-08:00')).map(iso).join() === '2026-11-01T09:30:00.000Z,2026-11-02T09:30:00.000Z',
    'fall-back: paused before 01:30 PDT, resumed at 01:10 PST ⇒ 01:30 PST, then Nov 2 01:30 — one fire a day');
  ok(M.nextFire({ cron: '30 1 * * *' }, T('2026-11-01T01:10:00-08:00')) === T('2026-11-02T01:30:00-08:00'),
    'fall-back: a caller that does not say lastFireAt keeps the first pass only (conservative: never a second fire)');
  const run15 = fires('*/15 * * * *', T('2026-11-01T00:40:00-07:00'), T('2026-11-01T02:20:00-08:00'), T('2026-11-01T00:30:00-07:00'));
  ok(run15.map(iso).join() === ['07:45', '08:00', '08:15', '08:30', '08:45', '10:00', '10:15'].map((h) => `2026-11-01T${h}:00.000Z`).join(),
    'fall-back: a RUNNING */15 fires each wall time once — 01:45 PDT ⇒ 02:00 PST (the repeated pass already ran; a literal «skip only the same first pass» would fire 01:00 twice)', run15.map(iso).join(' '));
  const new15 = fires('*/15 * * * *', T('2026-11-01T01:20:00-08:00'), T('2026-11-01T02:20:00-08:00'));
  ok(new15.map(iso).join() === ['09:30', '09:45', '10:00', '10:15'].map((h) => `2026-11-01T${h}:00.000Z`).join(),
    'fall-back: */15 created at 01:20 PST fires 01:30, 01:45, 02:00 PST — its second-pass times still ahead fire', new15.map(iso).join(' '));
  const storm = [];
  for (let s = T('2026-11-01T01:00:00-08:00'); s < T('2026-11-01T02:00:00-08:00'); s += 60e3)
    for (const [cron, at] of [['30 1 * * *', '01:30'], ['45 1 * * *', '01:45'], ['*/15 * * * *', null]]) {
      const f = fires(cron, s, T('2026-11-01T04:00:00-08:00'));
      const want = at && (s < T(`2026-11-01T${at}:00-08:00`) ? [T(`2026-11-01T${at}:00-08:00`)] : []);
      if (at ? f.join() !== want.join() : f.some((t, i) => i && t - f[i - 1] < 15 * 60e3)) storm.push(`${cron} from ${iso(s)}: ${f.length} fire(s)`);
    }
  ok(storm.length === 0, 'a cron created, started or resumed inside the repeated hour (01:00–01:59 PST) never fires at every tick: its 01:30 / 01:45 fires ONCE at the second pass while still ahead (none after), */15 stays 15 min apart',
    storm.length + ': ' + storm.slice(0, 3).join(' · '));
  // the wiring: jobs.js hands nextFire what it knows — the slot it fired for after a fire, null at create / start / resume; only
  // the legacy recompute (a record with no nextFireAt) says nothing (first pass only)
  const jsrc = fs.readFileSync(path.join(__dirname_jm, '..', 'src', 'jobs.js'), 'utf-8');
  const calls = (jsrc.match(/M\.nextFire\([^;]*?\)(?=;| :)/g) || []).map((c) => c.replace(/\s+/g, ' '));
  // lane lg-store-writes (the U4/U5 cure 2, met at the move): a REFUSED recurring fire (its run not on disk) moves to the slot after the one it was due for — a second «the slot it fired for» call
  const want = { 'M.nextFire(job.schedule, now(), undefined, job.nextFireAt)': 2, 'M.nextFire(job.schedule, now(), undefined, null)': 2, 'M.nextFire(job.schedule, now())': 1 };
  const got = {}; for (const c of calls) got[c] = (got[c] || 0) + 1;
  const norm = (o) => JSON.stringify(Object.entries(o).sort());
  ok(norm(got) === norm(want),
    'jobs.js: after a fire nextFire gets the slot it fired for, create / start / resume null, the legacy recompute nothing', JSON.stringify(got));
}
ok(M.nextFire({ at: Date.now() - 1000 }, Date.now()) === null, 'passed {at} never fires (missed handling is the engine)');
const e1 = M.nextFire({ everyMs: 30 * 60e3, jitterPct: 20 }, 1000, 0.5);
ok(e1 === 1000 + Math.round(30 * 60e3 * 1.1), 'everyMs jitter is deterministic under injected rand');
ok(!M.validateSchedule({ everyMs: 60e3 }).ok, '15min floor for agent-created recurring');
ok(verdictOf(M.validateSchedule({ everyMs: 60e3 }, { agentCreated: false }).ok), 'user-created bypasses the floor');
ok(!M.validateSchedule({ cron: '* * * * *' }).ok, 'every-minute cron refused for agents');

// ── supervision ──
let r = M.onServiceExit({ kind: 'service', restart: 'on-failure', desiredUp: true, supervise: { consecutiveFails: 5 } }, { uptimeMs: 3000, now: 1 });
ok(r.park === true, '6th fast crash parks the service');
r = M.onServiceExit({ kind: 'service', restart: 'on-failure', desiredUp: true, supervise: { consecutiveFails: 5 } }, { uptimeMs: 120e3, now: 1 });
ok(gateOf(r.restartInMs) && r.supervise.consecutiveFails === 0, 'uptime ≥60s resets the consecutive counter');
r = M.onServiceExit({ kind: 'service', restart: 'never', desiredUp: true, supervise: {} }, { uptimeMs: 1, now: 1 });
ok(r.stay === true, 'restart:never stays down');

// ── names ──
ok(M.resolveName('dev server!', new Set()).name === 'dev-server', 'name sanitization');
ok(M.resolveName('x', new Set(['x'])).name === 'x-2', 'collision auto-suffixes within visible scope');
// lane job-notify-user r7 (accept-r6, the second reviewer — hyg-name-cut64.cjs): the belt on the WHOLE name, THEN the slug and the
// cut — r6 cut to 64 first, so a token the cut split was below its family's length (19 of a GitHub token's 36 chars raw), and a
// `token=…` the slug turned into `token-…` was no shape at all; the cut never splits a masked run (it moves to the run's start)
{
  const R = '«redacted»', mat = (n, k = 7) => { const a = 'Q7w8E9r0T1y2U3i4O5p6A7s8D9f0G1h2J3k4L5z6X7c8V9b0N1m2'; let o = ''; for (let i = 0; i < n; i++) o += a[(i * k + 3) % a.length]; return o; };
  const GH = ['gh', 'p_'].join('') + mat(36), NPM = ['np', 'm_'].join('') + mat(36, 17);
  const rn = (w) => M.resolveName(w, new Set()).name;
  const cut41 = rn('nightly build of the whole staging stack ' + GH), cut31 = rn('publish the package to the reg ' + NPM), kv = rn('deploy TOKEN=' + mat(20, 11) + ' now');
  const at58 = rn('a'.repeat(58) + ' ' + GH + ' tail'), xox = rn('a'.repeat(50) + ' ' + ['xo', 'xb-'].join('') + '1234567890-' + mat(20));
  ok(cut41 === 'nightly-build-of-the-whole-staging-stack-ghp_' + R && cut31 === 'publish-the-package-to-the-reg-npm_' + R && !cut41.includes(mat(36).slice(0, 8)) && !cut31.includes(mat(36, 17).slice(0, 8)),
    'r7 resolveName: a token past the 64th character is belted WHOLE before the cut (the record keeps `ghp_«redacted»`, never 19 of its characters)', [cut41, cut31]);
  ok(kv === 'deploy-TOKEN-' + R + '-now' && !kv.includes(mat(20, 11)), 'r7 resolveName: the belt runs on the name AS ASKED — a `TOKEN=value` the slug would turn into `TOKEN-value` (no shape) is belted first (r9: the ONE token after the word — `now` stays)', kv);
  ok(at58 === 'a'.repeat(58) && xox === 'a'.repeat(50) && verdictOf([at58, xox].every((n) => n.length <= 64 && !n.includes('«'))),
    'r7 resolveName: the cut never splits a masked run — a cut inside `«redacted»` moves to the run\'s start, its kept head (`ghp_`, `xoxb-`) with it', [at58, xox]);
  ok(rn('dev server!') === 'dev-server' && rn('a'.repeat(70)) === 'a'.repeat(64) && rn('') === 'job' && rn('  --x--  ') === 'x' && rn(['gh', 'p_'].join('') + mat(36) + ' deploy') === 'ghp_' + R + '-deploy',
    'r7 resolveName: a name with no secret is slugged and cut as before; a token first keeps its head and the words after');
  const seen = []; const viaEngine = M.resolveName('x ' + GH, new Set(), { mask: (t) => { seen.push(t); return t.split(GH).join('[vault:gh]'); } }).name;
  ok(seen[0] === 'x ' + GH && viaEngine === 'x-vault-gh' && !viaEngine.includes(mat(36).slice(0, 8)), 'r7 resolveName: the engine\'s belt (`mask` — the vault\'s values too) runs on the WHOLE text as asked, before the slug', [seen, viaEngine]);
  // r8 (accept-r7 confirmed 0 — skeptic-name-falsepos.cjs): BY THE VALUE — r7's belt on the raw name let the WORD rules erase
  // ordinary words from the record («password reset» → `password-«redacted»`, «password change» collided into `-2`); a word rule
  // hides what follows its word only when that is value-shaped, a shape hides wherever it sits
  const WHOLE = { 'password reset': 'password-reset', 'auth: fix login flow': 'auth-fix-login-flow', 'bearer of bad news': 'bearer-of-bad-news', 'token refresh': 'token-refresh',
    'password change': 'password-change', 'nightly password rotation': 'nightly-password-rotation', 'session: cleanup old rows': 'session-cleanup-old-rows', 'token: refresh': 'token-refresh', 'passwd nightly-rotation': 'passwd-nightly-rotation' };
  const lost = Object.entries(WHOLE).filter(([w, want]) => rn(w) !== want).map(([w]) => `«${w}» → ${rn(w)}`);
  const taken = new Set([rn('password reset')]), second = M.resolveName('password change', taken);
  ok(!lost.length && second.name === 'password-change' && !second.renamed, 'r8 resolveName BY THE VALUE: a name with no secret keeps its words at the record — «password reset», «auth: fix login flow», «bearer of bad news», «token refresh» (and six more) stored whole; «password change» beside «password reset» is no collision', lost.join(' | ') || second);
  const VAL = mat(12, 5) + '!x', hid = { pw: rn('password: ' + VAL), tok: rn('token=' + GH), bearer: rn('rotate Bearer ' + mat(16, 5)), next: rn('password ' + VAL + ' rotation') };
  ok(hid.pw === 'password-' + R && hid.tok === 'token-ghp_' + R && hid.bearer === 'rotate-Bearer-' + R && hid.next === 'password-' + R + '-rotation' && !Object.values(hid).some((n) => n.includes(VAL.slice(0, 8)) || n.includes(mat(36).slice(0, 8)) || n.includes(mat(16, 5).slice(0, 8))),
    'r8 resolveName BY THE VALUE: a value-shaped value after a secret word is hidden — `password: <value>`, `token=<family>`, `Bearer <value>`, `password <value>` (the word stays, the words after it too)', hid);
  // RED CONTROL (the old word rules): the output belt as the record's belt (r7's) erases those words — each by name
  const SS = require('../src/secret-shapes.js'), old = (w) => M.resolveName(w, new Set(), { mask: (t) => SS.redactSecrets(t).text }).name;
  const oldLost = ['password reset', 'auth: fix login flow', 'token: refresh', 'check bearer rotation'].filter((w) => old(w) !== WHOLE[w]);
  ok(oldLost.length === 4, `r8 RED CONTROL: the old word rules (the output belt at the record, e6d6299e6) erase ${oldLost.map((w) => `«${w}» → ${old(w)}`).join(', ')}`, oldLost);

  // r9 THE NAME RULE (accept-r8 — the rule FIXED by the acceptance owner; kb-bugfix-invariants «不变量 (r9)»): ONCE, before the slug —
  // (a) the shape rows anywhere (a family, a JWT, a 40/64-hex digest standing alone, a 20+ run of three classes that is no date /
  // time / version / uuid / path / URL / email — never on the slug), (b) a word row hides ONLY the one token after its word and only
  // a value (8+ counting its punctuation AND two classes, or 8+ digits, or `- _ .` joining 3+ parts with a capital or a digit);
  // (c) the slug never changes what was hidden, the cut never splits it, a collision is `-2` renamed. EVERY ROW SAYS WHAT IS STORED
  const hexOf = (n, k = 7) => { let o = ''; for (let i = 0; i < n; i++) o += '0123456789abcdef'[(i * k + 5) % 16]; return o; };
  const H40 = hexOf(40), H64 = hexOf(64, 11), UUID = '550e8400-e29b-41d4-a716-446655440000', V = mat(12, 5) + '!x', V2 = mat(10, 13);
  const JWT = ['ey', 'J', 'a'.repeat(20), '.', 'ey', 'J', 'b'.repeat(20), '.', 'c'.repeat(20)].join(''), GHU = ['GH', 'P_'].join('') + mat(36), AK = ['AK', 'IA'].join('') + 'ABCDEFGH23456789';
  const PW = 'Correct-Horse-Battery-Staple', SV = mat(12, 5) + '-x';
  // r253 (round wlc6blvqo): the assignment forms' values and the fresh read's values, built at run time by joining pieces
  const H7 = ['hun', 'ter2'].join(''), LM = ['let', 'mein'].join(''), FB = ['foo', 'bared'].join(''), L16 = ['abcdefgh', 'ijklmnop'].join(''), L26 = L16 + ['qrstuvw', 'xyz'].join('');
  const S1 = ['Sum', 'mer1!'].join(''), AB = ['Ab3d', 'Ef9hXy'].join(''), KQ = ['Kq8$wZ3!pL0', '@vN6#tR2^'].join(''), UP = ['Pa', 'ss9x'].join('');
  const TABLE = [   // [why, asked, stored-as]
    ['brief: an ordinary word after password', 'password reset', 'password-reset'], ['brief', 'token refresh', 'token-refresh'], ['brief', 'auth: fix login flow', 'auth-fix-login-flow'],
    ['brief', 'bearer of bad news', 'bearer-of-bad-news'], ['brief: a Capitalized passphrase after password: (r8 kept it)', 'rotate password: ' + PW, 'rotate-password-' + R],
    ['brief: KEY= a passphrase (r8 kept it)', 'set DB_PASSWORD=Correct.Horse.Battery.Staple', 'set-DB_PASSWORD-' + R], ['brief: 8 with its ! (r8 kept 7)', 'password: Summer1!', 'password-' + R],
    ['brief', 'password Passw0rd', 'password-' + R], ['brief: 8+ digits after a secret word is a value', 'password 12345678', 'password-' + R],
    ['brief: short brand-style words (r8 erased it whole)', 'GitHub CI on macOS 15 and iOS 18 for PR 42', 'GitHub-CI-on-macOS-15-and-iOS-18-for-PR-42'],
    ['skeptic r8v-engine', 'Run e2e for PR 1234 on iOS 17 and M2 Max', 'Run-e2e-for-PR-1234-on-iOS-17-and-M2-Max'], ['skeptic r8v-runs', 'QA run 3 for PR 482 on iOS 17 and M2 Mac', 'QA-run-3-for-PR-482-on-iOS-17-and-M2-Mac'],
    ['skeptic r8v-names', 'Fix DB 42 on VM 7 in EU AZ 3 for QA 9', 'Fix-DB-42-on-VM-7-in-EU-AZ-3-for-QA-9'], ['skeptic r8v-runs', 'CI for PR 1234 on GH v2 API EU W1 to US E2', 'CI-for-PR-1234-on-GH-v2-API-EU-W1-to-US-E2'],
    ['skeptic attack40 #41', 'R2D2 C3PO BB8 K2SO v2 Q3 x9 A1 B2', 'R2D2-C3PO-BB8-K2SO-v2-Q3-x9-A1-B2'], ['skeptic edges', 'Q3 R2 v2 K8 B2 x9 A1 C3 D4 E5 F6 G7', 'Q3-R2-v2-K8-B2-x9-A1-C3-D4-E5-F6-G7'],
    ['skeptic byvalue-fp', 'QA run for PR 1234 on M2 Max and CI box', 'QA-run-for-PR-1234-on-M2-Max-and-CI-box'],
    ['skeptic: a date after the words (r7 / r8 hid the rest of the line)', 'auth: fix login flow 2026-10-29', 'auth-fix-login-flow-2026-10-29'], ['skeptic', 'token: rotate before 2026-10-30', 'token-rotate-before-2026-10-30'],
    ['skeptic: a version after the words', 'session: nightly cleanup v2.369.361', 'session-nightly-cleanup-v2.369.361'], ['skeptic: the ticket id IS the token after ticket:', 'ticket: PROJ-1234 rollout', 'ticket-' + R + '-rollout'],
    ['skeptic: a path after the words', 'key: renew ~/.ssh/config', 'key-renew-.ssh-config'], ['skeptic', 'session: refactor src/jobs.js', 'session-refactor-src-jobs.js'],
    ['skeptic: reset-v2 (8, two classes)', 'password reset-v2', 'password-' + R], ['skeptic: a date IS the token (3 parts with digits)', 'password 2026-10-29 rotation', 'password-' + R + '-rotation'],
    ['skeptic', 'auth: migrate users_v2 table', 'auth-migrate-users_v2-table'], ['skeptic', 'Bearer token-refresh-2026', 'Bearer-' + R], ['skeptic', 'sig: verify release v1.2.3-rc1', 'sig-verify-release-v1.2.3-rc1'],
    ['skeptic', 'otp: resend for user-1234', 'otp-resend-for-user-1234'], ['skeptic: a 40-hex sha standing alone', 'bisect ' + H40, 'bisect-' + R], ['skeptic: a sha joined by - (not alone; two classes)', 'bisect-' + H40, 'bisect-' + H40],
    ['skeptic: sha256:<64 hex> (one run, three classes)', 'verify sha256:' + H64, 'verify-' + R], ['a 64-hex digest standing alone', 'pull ' + H64 + ' now', 'pull-' + R + '-now'],
    ['skeptic: a uuid alone is never hidden', 'cleanup ' + UUID, 'cleanup-' + UUID], ['skeptic: a uuid IS the token after session:', 'session: ' + UUID, 'session-' + R],
    ['skeptic r8v-negatives', 'login password Correct_Horse_Battery_Staple', 'login-password-' + R], ['skeptic r8v-negatives', 'api_key=' + PW + '-Zebra', 'api_key-' + R],
    ['skeptic: hunter2! (8 with its !)', 'password: hunter2!', 'password-' + R], ['r253: a 7-letter value in its ASSIGNMENT form is hidden (the floor is for prose only)', 'password=' + H7, 'password-' + R], ['r253: …its PROSE form (a blank after the colon) keeps the word test: 7 is under the 8', 'password: ' + H7, 'password-' + H7],
    ['skeptic: fix-login-flow-2 (two classes)', 'auth: fix-login-flow-2', 'auth-' + R], ['joined lowercase words (the joiners are no class)', 'auth: fix-login-flow', 'auth-fix-login-flow'],
    ['skeptic: bearer <JWT>', 'bearer ' + JWT, 'bearer-eyJ' + R], ['skeptic: deploy_<JWT>', 'deploy_' + JWT, 'deploy_eyJ' + R], ['skeptic: a family between CJK words', '部署 ' + GH + ' 到生产', '部署-ghp_' + R + '-到生产'],
    ['skeptic: password reset for <family>', 'password reset for ' + GH, 'password-reset-for-ghp_' + R], ['skeptic: UPPER GHP_ (no family — a 40-char run)', 'deploy ' + GHU, 'deploy-' + R],
    ['skeptic: AKIA', 'rotate ' + AK, 'rotate-AKIA' + R], ['skeptic: an email IS the token after auth:', 'auth: user@example.com login', 'auth-' + R + '-login'],
    ['skeptic: a URL IS the token after session:', 'session: https://example.com/login', 'session-' + R], ['skeptic: ?token=<value>', 'check https://x.test/cb?token=' + V2, 'check-https-x.test-cb-token-' + R],
    ['skeptic: PascalCase after passphrase', 'passphrase CorrectHorseBatteryStaple', 'passphrase-' + R], ['skeptic: PascalCase after password (9, two classes)', 'password ResetFlow', 'password-' + R],
    ['skeptic', 'token: ' + ['refresh', 'v2', 'daily'].join('_'), 'token-' + R], ['camelCase, no digit (two classes)', 'rerun TestHandlerReturnsNotFound', 'rerun-TestHandlerReturnsNotFound'],
    ['camelCase with a digit: 20+, three classes — the rule hides it', 'rerun TestHandlerReturns404WhenMissing', 'rerun-' + R], ['PascalCase, no digit', 'deploy DeployServerProductionCluster', 'deploy-DeployServerProductionCluster'],
    ['PascalCase with digits — the rule hides it', 'deploy DeployServer2024ProductionCluster', 'deploy-' + R], ['camelCase words', 'fix getUserById in authService', 'fix-getUserById-in-authService'],
    ['brand names', 'deploy to PostgreSQL on AWS EKS for iPhone', 'deploy-to-PostgreSQL-on-AWS-EKS-for-iPhone'], ['brand names', 'OAuth2 login for GitHub and GitLab', 'OAuth2-login-for-GitHub-and-GitLab'],
    ['a date-time (20, three classes — never hidden)', 'backup 2026-10-29T03:26:00Z', 'backup-2026-10-29T03-26-00Z'], ['a time with its zone', 'report at 03:26:00.123+08:00 daily', 'report-at-03-26-00.123-08-00-daily'],
    ['a version', 'release 2.369.362', 'release-2.369.362'], ['a named version (three classes — never hidden)', 'ship VibeSpace-2.369.362-Linux-x64', 'ship-VibeSpace-2.369.362-Linux-x64'],
    ['a semver with a build', 'tag v1.2.3-RC.1+Build.20261029', 'tag-v1.2.3-RC.1-Build.20261029'], ['a path (never hidden)', 'tail /var/log/VibeSpace/Server-2026.log', 'tail-var-log-VibeSpace-Server-2026.log'],
    ['a Windows path', 'build C:\\Users\\Dev\\Project2026\\out', 'build-C-Users-Dev-Project2026-out'], ['an UPPER uuid', 'restore 550E8400-E29B-41D4-A716-446655440000', 'restore-550E8400-E29B-41D4-A716-446655440000'],
    ['an email (never hidden)', 'notify John.Doe2026@Example.com weekly', 'notify-John.Doe2026-Example.com-weekly'], ['a URL (never hidden)', 'mirror https://Example.com/Repo2026/archive', 'mirror-https-Example.com-Repo2026-archive'],
    ['r253: kebab-case with a plain word between its joiners is a label (the output belt\'s own run test)', 'deploy-EU-west2-canary', 'deploy-EU-west2-canary'], ['r253: …a run with no plain word between its joiners is still hidden', 'deploy ' + [mat(6), mat(6, 11), mat(6, 13)].join('-'), 'deploy-' + R], ['kebab-case, two classes', 'nightly-db-backup-2026-10-29', 'nightly-db-backup-2026-10-29'],
    ['a random 36 standing alone', 'deploy ' + mat(36), 'deploy-' + R], ['a random 14 standing alone (under 20 — kept)', 'deploy ' + V, 'deploy-' + SV],
    ['a value two words after the word (the ONE token is «fix»)', 'auth: fix ' + V, 'auth-fix-' + SV], ['the words after the token stay', 'password ' + V + ' rotation', 'password-' + R + '-rotation'],
    ['password: ⏎ a value (the token on the next line)', 'password:\n  Summer1!', 'password-' + R], ['a quoted value is ONE token', 'password: "Summer1! now"', 'password-' + R],
    ['spaced lowercase words in quotes (one class — words)', 'password: "correct horse battery staple"', 'password-correct-horse-battery-staple'], ['a reg row', '    Password    REG_SZ    rotate', 'Password-REG_SZ-rotate'],
    ['CJK words around ASCII', '每晚把生产数据库备份到AWS的S3存储桶', '每晚把生产数据库备份到AWS的S3存储桶'],
    // r10 (lane lg-recovery, B-a3fe — the r9 verdict's M1 and minors, on 2.369.413): the run is judged on its CORE (the punctuation
    // around it is no class); 8+ digits across `- _ .` after a secret word; a random run glued to a version judged on its own (the
    // version stays); R7 at a name by the release's query walk and its name grammar
    ['r10 M1: a kebab id and its comma (the comma is no class)', 'Rerun nightly-db-backup-2026-10-29, then report', 'Rerun-nightly-db-backup-2026-10-29-then-report'],
    ['r10 M1: …its colon', 'see nightly-db-backup-2026-10-29: done', 'see-nightly-db-backup-2026-10-29-done'],
    ['r10 M1: an upper-case id and its comma (no plain word: only the core decides)', 'Rerun BUILD-2026-10-29-RC1-FINAL, then report', 'Rerun-BUILD-2026-10-29-RC1-FINAL-then-report'],
    ['r10 M1: …in parens', 'run (PROJ-2026-10-29-RC1-HOTFIX) now', 'run-PROJ-2026-10-29-RC1-HOTFIX-now'], ['r10 M1: …in quotes', 'check "REL-2026-10-29-V2-CANDIDATE" today', 'check-REL-2026-10-29-V2-CANDIDATE-today'],
    ['r253: a plain word beside a key-shaped part does not spare the run', 'deploy-' + mat(36), R],
    ['r10 M1: …in parens', 'run (nightly-db-backup-2026-10-29) now', 'run-nightly-db-backup-2026-10-29-now'],
    ['r10 M1: …in quotes', 'check "build-2026-10-29-release-candidate" today', 'check-build-2026-10-29-release-candidate-today'],
    ['r10 M1: …in brackets', 'tag [release-2026-10-29-hotfix-build] now', 'tag-release-2026-10-29-hotfix-build-now'],
    ['r10 M1: a date-time in parens and a comma', 'backup (2026-10-29T03:26:00Z), done', 'backup-2026-10-29T03-26-00Z-done'],
    ['r10 M1: a named version in quotes', 'ship "VibeSpace-2.369.362-Linux-x64"', 'ship-VibeSpace-2.369.362-Linux-x64'],
    ['r10 M1: a path in parens', 'tail (/var/log/VibeSpace/Server-2026.log)', 'tail-var-log-VibeSpace-Server-2026.log'],
    ['r10 M1: a random run in parens is still hidden', 'deploy (' + mat(36) + '),', 'deploy-' + R],
    ['r10: 8 digits joined by -', 'password 1234-5678', 'password-' + R], ['r10: …by .', 'password 1234.5678', 'password-' + R], ['r10: …by _', 'password 1234_5678', 'password-' + R],
    ['r10: 7 digits joined (under 8 — kept)', 'password 1234-567', 'password-1234-567'],
    ['r10: four spaces after password (the output belt reads 1–3)', 'password    ' + S1 + 'x', 'password-' + R], ['r10: a no-break space after password', 'password\u00a0' + S1 + 'x', 'password-' + R],
    ['r10: an ideographic space after password', 'password\u3000' + S1 + 'x', 'password-' + R], ['r10: an ordinary word after four spaces stays', 'password    reset', 'password-reset'],
    ['r10: a random run glued after a version — only it is hidden', 'ship v1.2.3-' + mat(24) + ' now', 'ship-v1.2.3-' + R + '-now'],
    ['r10: …glued before it', 'ship ' + mat(24) + '@1.2.3 now', 'ship-' + R + '-1.2.3-now'],
    ['r10: …after a + build', 'tag 1.2.3+' + mat(24), 'tag-1.2.3-' + R],
    ['r10: a PUBLIC query name stays (the release\'s name grammar: a descriptor head)', 'check https://x.test/cb?token_usage=Remote2026x', 'check-https-x.test-cb-token_usage-Remote2026x'],
    // r10's fresh read (a reviewer given the code): the leaks and over-hides it found in the port, each now a row
    ['review L1: a no-break space after KEY:', 'password:\u00a0' + S1, 'password-' + R], ['review L1: …after KEY=', 'DB_PASSWORD=\u00a0' + S1, 'DB_PASSWORD-' + R],
    ['review L1: an ideographic space after KEY=', 'API_KEY=\u3000' + AB, 'API_KEY-' + R], ['review L1: a thin space after the word', 'password\u2009' + S1, 'password-' + R],
    ['review L1: a narrow no-break space', 'password\u202f' + S1, 'password-' + R], ['review L1: a no-break space after bearer', 'bearer\u00a0' + AB + '12', 'bearer-' + R],
    ['review L2: a public KEY gives its separator back (the release\'s B-be02)', 'fix: password=' + S1, 'fix-password-' + R], ['review L2', 'deploy: PASSWORD=' + S1, 'deploy-PASSWORD-' + R],
    ['review L2', 'ci= DB_PASS=' + S1 + 'x', 'ci-DB_PASS-' + R], ['review L2: an := assignment', 'password := ' + S1, 'password-' + R],
    ['review L3: a value in « » after the word', 'password «' + S1 + '»', 'password-' + R], ['review L3: …after a query head', 'check https://x.test/?password=«' + S1 + '»', 'check-https-x.test-password-' + R],
    ['review L4: a quoted value after the bare word is ONE token', 'password "Summer 1!x"', 'password-' + R],
    ['review O3: the release\'s name grammar (a descriptor head is public)', 'password_policy: MinLength12', 'password_policy-MinLength12'],
    ['review O4: a punctuated run glued after a version — the version stays', 'ship v1.2.3-' + KQ + ' now', 'ship-v1.2.3-' + R + '-now'], ['review O4: …glued before it', 'ship ' + KQ + '@1.2.3 now', 'ship-' + R + '-1.2.3-now'],
    // r253 (主开发, round wlc6blvqo — THE MUST): after an ASSIGNMENT (the holder, then `=` or `:=` with no blank), a holder query parameter
    // and the header word, ANY non-empty value is hidden, as the release did; the prose forms keep the word test
    ['r253: a credential assignment with a 7-letter value', 'migrate DB_PASSWORD=' + H7, 'migrate-DB_PASSWORD-' + R], ['r253: the flag form', 'run --password=' + H7, 'run---password-' + R],
    ['r253: a short value', 'API_KEY=' + LM, 'API_KEY-' + R], ['r253: a value of one class', 'REDIS_AUTH=' + FB, 'REDIS_AUTH-' + R], ['r253: := with no blank', 'api_key:=' + H7, 'api_key-' + R],
    ['r253: a long value of one class (an app password\'s shape)', 'SMTP_PASSWORD=' + L16 + ' mail', 'SMTP_PASSWORD-' + R + '-mail'],
    ['r253: a holder query parameter', 'curl https://h.test/cb?token=' + ['abc', '1234'].join(''), 'curl-https-h.test-cb-token-' + R],
    ['r253: the header word with a lowercase run', 'bearer ' + L26, 'bearer-' + R], ['r253: the header word\'s value whatever it is', 'check bearer rotation', 'check-bearer-' + R],
    ['r253: a PUBLIC query value that hides a userinfo (the release\'s hidesHolder)', 'x ?next=https://admin:' + UP + '@db.example/', 'x-next-' + R],
    ['r253: a spaced `=` is prose (a blank — the word test)', 'DB_PASSWORD = ' + H7, 'DB_PASSWORD-' + H7],
    ['r366 (主开发\'s ruling): a holder, a bare colon and a value with no blank is an assignment', 'password:' + H7, 'password-' + R], ['r366: …a short one', 'auth:' + ['fix'].join(''), 'auth-' + R],
    ['r366: the spaced colon stays prose', 'auth: fix', 'auth-fix'],
    ['r253: a run with plain words between its joiners', 'build-iOS17-sim-tests', 'build-iOS17-sim-tests'], ['r253: …and a version', 'Node22-Ubuntu24.04-build', 'Node22-Ubuntu24.04-build'],
  ];
  const TABLE_ROWS = 140;   // r253: the table's EXACT size — a row deleted is red by name
  const tableBad = TABLE.filter(([, asked, want]) => rn(asked) !== want).map(([why, asked, want]) => `«${asked.slice(0, 48)}» (${why}) → ${rn(asked)} (want ${want})`);
  for (const [why, asked] of TABLE) console.log(`      ${JSON.stringify(asked.length > 52 ? asked.slice(0, 44) + '…' : asked).padEnd(56)} → ${rn(asked)}   (${why})`);
  ok(TABLE.length === TABLE_ROWS && !tableBad.length, `r9 THE NAME RULE: a ${TABLE.length}-name table — every row's stored-as (the brief's examples, the skeptics' names, camelCase / PascalCase / brand names / dates / times / versions / paths / uuids / emails / URLs)${tableBad.length ? ' — ' + tableBad.join(' | ') : ''}`);
  const leakT = TABLE.filter(([, asked, want]) => want.includes(R) && [mat(36), mat(36).toUpperCase(), 'Correct-Horse', 'Correct.Horse', 'Correct_Horse', 'Summer1', 'Passw0rd', '12345678', 'hunter2', H40, H64, UUID, 'a'.repeat(20) + '.', 'PROJ-1234'].some((x) => asked.includes(x) && rn(asked).includes(x.slice(0, 7))));
  ok(!leakT.length, `r9 …no row that hides keeps a piece of what it hid (${TABLE.filter(([, , w]) => w.includes(R)).length} rows hide: a family, a passphrase, a digest, a JWT, a random run, a uuid after its word)`, leakT.map(([, a]) => rn(a)));
  // (c) the collision law: two names differing only in a hidden token are -2, renamed; a kept word is no collision
  const seen9 = new Set(), add9 = (w) => { const r = M.resolveName(w, seen9); seen9.add(r.name); return r; };
  const c9 = [add9('rotate password: ' + mat(12, 5) + '!'), add9('rotate password: ' + mat(12, 7) + '?'), add9('password reset'), add9('password change'), add9('GitHub CI on macOS 15 and iOS 18 for PR 42'), add9('QA run for PR 1234 on M2 Max and CI box')];
  ok(c9[0].name === 'rotate-password-' + R && c9[1].name === 'rotate-password-' + R + '-2' && c9[1].renamed === true && gateOf(c9.slice(2).every((r) => !r.renamed)) && c9[3].name === 'password-change',
    'r9 (c) the collision law: two names differing only in a hidden token — the second `-2`, renamed: true; «password change» beside «password reset» and two short-word names are no collision', c9.map((r) => r.name + (r.renamed ? ' (renamed)' : '')));
  // a STORED name (labelOf, a scheduled run's record — a slug): the rule without its run row — an older record of short words reads whole
  const stored9 = ['GitHub-CI-on-macOS-15-and-iOS-18-for-PR-42', 'Run-e2e-for-PR-1234-on-iOS-17-and-M2-Max', 'deploy-EU-west2-canary', 'deploy-' + mat(36)];
  ok(gateOf(stored9.every((t) => SS.redactByValue(t).text === t)) && SS.redactByValue('deploy-' + GH).text === 'deploy-ghp_' + R, 'r9 a STORED name (a slug) is never judged by the run row — an older record of short words, a kebab name, even a run reads whole; a family is still hidden', stored9.map((t) => SS.redactByValue(t).text));
  // THE MUTANTS — each RED by name
  const { mutantCopies } = await import('./mutant-copy.mjs');
  const MC9 = mutantCopies('jm-r9', path.join(__dirname_jm, '..'));
  const jmSrc = fs.readFileSync(path.join(__dirname_jm, '../src/job-model.js'), 'utf8'), ssSrc9 = fs.readFileSync(path.join(__dirname_jm, '../src/secret-shapes.js'), 'utf8');
  const SLUG_ONCE = "  const s = whole.split(R).map(slug).join(R).replace(/^-+|-+$/g, '');";
  const mSlug = jmSrc.replace(SLUG_ONCE, "  const s = mask(whole.split(R).map(slug).join(R)).replace(/^-+|-+$/g, '');"), MJ = MC9.load('src/job-model.js', mSlug, 'slug2');   // stale-pins: kept — the PLANT a red control writes in (the old form, on purpose)
  const slugRed = TABLE.filter(([, asked, want]) => MJ.resolveName(asked, new Set()).name !== want);
  ok(mSlug !== jmSrc && slugRed.length >= 7 && verdictOf(slugRed.some(([, a]) => a.startsWith('GitHub CI'))), `r9 MUTANT — the run row on the SLUG (r8's second mask): RED by name — ${slugRed.length} rows: ${slugRed.slice(0, 4).map(([, a]) => `«${a.slice(0, 32)}» → ${MJ.resolveName(a, new Set()).name}`).join(', ')}`);
  const WV = "  if (t.includes(REDACTED) || [...t].length < 8) return false;   // the length counts the token's punctuation; a token a shape row hid is no value left\n";
  const mPass = ssSrc9.replace(WV, WV + "  if (t.split(/[-_.']+/).every((w) => !w || /^(?:[a-z]+|[A-Z]+|[A-Z][a-z]+)$/.test(w))) return false;   // MUTANT: r8's plain-words exemption\n"), MS9 = MC9.load('src/secret-shapes.js', mPass, 'wordish');
  const passRed = TABLE.filter(([, asked, want]) => M.resolveName(asked, new Set(), { mask: (t) => MS9.redactByValue(t, { typed: true }).text }).name !== want);
  ok(mPass !== ssSrc9 && verdictOf(passRed.some(([, a]) => a === 'rotate password: ' + PW)), `r9 MUTANT — a Capitalized passphrase kept (r8's plain-words exemption): RED by name — ${passRed.map(([, a]) => `«${a.slice(0, 40)}» → ${M.resolveName(a, new Set(), { mask: (t) => MS9.redactByValue(t, { typed: true }).text }).name}`).join(', ')}`);
  const RUNGATE = "    if (typed) text = text.replace(NAME_RUN_RE,";
  const mRun = ssSrc9.replace(RUNGATE, "    if (true) text = text.replace(NAME_RUN_RE,"), MR9 = MC9.load('src/secret-shapes.js', mRun, 'runstored');
  const runRed = stored9.filter((t) => MR9.redactByValue(t).text !== t);
  ok(mRun !== ssSrc9 && runRed.length >= 3, `r9 MUTANT — the run row on a STORED name (labelOf): RED by name — ${runRed.map((t) => `«${t.slice(0, 32)}» → ${MR9.redactByValue(t).text}`).join(', ')}`);
  // r10 M1 MUTANT — the run's length and classes judged on the UNTRIMMED run (r9): the punctuation around a kebab id becomes a class
  const CORE_FIRST = "  if (core.length < 20 || classesOf(core) < 3 ||";
  const { anchored } = await import('./scratch.mjs');
  const mCore = anchored(ssSrc9, CORE_FIRST, "  if (run.length < 20 || classesOf(run) < 3 ||", 'r10 M1 classes on the untrimmed run'), MC10 = MC9.load('src/secret-shapes.js', mCore, 'untrimmed');
  const coreRed = TABLE.filter(([why, asked, want]) => why.startsWith('r10 M1') && M.resolveName(asked, new Set(), { mask: (t) => MC10.redactByValue(t, { typed: true }).text }).name !== want);
  ok(mCore !== ssSrc9 && coreRed.length >= 3, `r10 MUTANT — the run's classes counted on the UNTRIMMED run (r9's M1): RED by name — ${coreRed.length} rows: ${coreRed.slice(0, 4).map(([, a]) => `«${a.slice(0, 40)}» → ${M.resolveName(a, new Set(), { mask: (t) => MC10.redactByValue(t, { typed: true }).text }).name}`).join(', ')}`);
  // r253 RED CONTROL — the tip's FLOOR on ASSIGNMENTS (1851a3446): the assignment rows keep their short or one-class values
  const ASSIGN_AT = '    if (!(assign ? anyValue(inner) : wordValue(inner))) { KV_HEAD.lastIndex = Math.max(headEnd, s); continue; }';
  const QHOLD_AT = '    if (!v || !anyValue(v[0])) continue;';
  const mFloor = anchored(anchored(ssSrc9, ASSIGN_AT, '    if (!wordValue(inner)) { KV_HEAD.lastIndex = Math.max(headEnd, s); continue; }', 'r253 the floor on assignments'), QHOLD_AT, '    if (!v || !wordValue(v[0])) continue;', 'r253 the floor on a holder parameter'), MF253 = MC9.load('src/secret-shapes.js', mFloor, 'floor');   // stale-pins: kept — the PLANT a red control writes in (the tip's floor, on purpose)
  const floorRed = TABLE.filter(([why, asked, want]) => why.startsWith('r253: a') && want.includes(R) && M.resolveName(asked, new Set(), { mask: (t) => MF253.redactByValue(t, { typed: true }).text }).name !== want);
  ok(floorRed.length >= 5, `r253 RED CONTROL — the tip's value floor on assignments and holder parameters: RED by name — ${floorRed.length} rows keep their value: ${floorRed.slice(0, 5).map(([, a]) => `«${a.slice(0, 32)}» → ${M.resolveName(a, new Set(), { mask: (t) => MF253.redactByValue(t, { typed: true }).text }).name}`).join(', ')}`);
  // r10 FAIL CLOSED: the name rule never returns a name «as far as it got». ON THE PORT onto 2.369.413 its query row named a regex the
  // release had renamed: every name threw after the word rows and passed with NO run row — the suite's table went red on it. Now a
  // name the rule cannot judge is judged by the OUTPUT belt AND the name's own run row (the output belt alone keeps a random run
  // standing alone — its R8 is key material only: measured by this leg's first form), said `failed`
  const fellBack = TABLE.filter(([, asked]) => SS.redactByValue(asked, { typed: true }).failed);
  ok(!fellBack.length, `r10 …no row of the ${TABLE.length}-name table is judged by the fallback (the name rule judges every one itself)`, fellBack.map(([, a]) => a.slice(0, 40)).join(' | '));
  const QROW = '    row(nameQuery(text));';
  const mThrow = anchored(ssSrc9, QROW, '    row(nameQueryGone(text));', 'r10 a planted throw'), MT10 = MC9.load('src/secret-shapes.js', mThrow, 'throws');
  const RUN36 = 'deploy ' + mat(36), thrown = MT10.redactByValue(RUN36, { typed: true });
  console.log(`      a planted throw (the query row renamed away): ${JSON.stringify(RUN36)} → ${JSON.stringify(thrown.text)} failed=${thrown.failed}`);
  ok(mThrow !== ssSrc9 && thrown.failed === true && !thrown.text.includes(mat(36)), 'r10 a planted throw in the name rule: the name falls back to the OUTPUT belt and the name\'s run row — a random 36-run standing alone stays hidden, and the answer says failed', thrown);
  const OLD_CATCH = /  \} catch \{\n    \/\/ r10 \(B-a3fe\)[\s\S]*?\n  \}\n  return \{ text, redacted: n \};/;
  const mOld = anchored(mThrow, OLD_CATCH, '  } catch { /* a text that cannot be judged is returned as far as it got */ }\n  return { text, redacted: n };', 'r9 catch'), MO10 = MC9.load('src/secret-shapes.js', mOld, 'farasitgot');
  const oldOut = MO10.redactByValue(RUN36, { typed: true });
  console.log(`      the same throw with r9's catch: ${JSON.stringify(RUN36)} → ${JSON.stringify(oldOut.text)}`);
  // r253: a fallback is RECORDED — the belt tells its caller (jobs.js _nameWords journals it by name); the name road's own catch is the MARK
  const SS_THROWS = MC9.write('src/secret-shapes.js', mThrow, 'throws-belt'), aobSrc = fs.readFileSync(path.join(__dirname_jm, '../src/agent-output-belt.js'), 'utf8');
  const AOB = MC9.load('src/agent-output-belt.js', anchored(aobSrc, "require('./secret-shapes.js')", `require(${JSON.stringify(SS_THROWS)})`, 'r253 the belt on a throwing rule'), 'aob-throws');
  let told = 0; const toldOut = AOB.maskForSink(RUN36, { byValue: true, typed: true, onFailed: () => { told++; } });
  console.log(`      the belt on the throwing rule: ${JSON.stringify(RUN36)} → ${JSON.stringify(toldOut)}, the caller told ${told}×`);
  ok(told === 1 && !toldOut.includes(mat(36)), 'r253 a name the rule could not judge is RECORDED — maskForSink tells its caller once, the name still hidden', { told, toldOut });
  const jbSrc253 = fs.readFileSync(path.join(__dirname_jm, '../src/jobs.js'), 'utf8'), nwAt = jbSrc253.indexOf('  _nameWords(s, { typed = false } = {}) {'), nw253 = jbSrc253.slice(nwAt, jbSrc253.indexOf('\n  }\n', nwAt));
  ok(nwAt > 0 && gateOf(/onFailed: failed \}\); \} catch \(e\) \{/.test(nw253)) && gateOf(/return '«redacted»';\n    \}/.test(nw253)) && gateOf(/if \(NAME_RULE_SAID\.has\(raw\)\) return;/.test(nw253)) && gateOf(/if \(!NAME_BELT_SAID\.done\) \{ NAME_BELT_SAID\.done = true;/.test(nw253)) && verdictOf(/this\.d\.log\(`\[jobs\] the name rule could not judge a job's name/.test(nw253)),
    'r253 / r366 jobs.js _nameWords journals a fallback ONCE A NAME (never the name), a belt that cannot load ONCE A PROCESS, and answers the MARK — never the raw name', nw253.slice(0, 600));
  ok(mOld !== mThrow && verdictOf(oldOut.text.includes(mat(36))), 'r10 CONTROL — r9\'s catch («as far as it got») with the same throw passes the 36-run WHOLE (the run row never ran): the fallback is what hides it', oldOut);
}

// ── renderers (budget + no-wrap laws) ──
const many = Array.from({ length: 200 }, (_, i) => mk(i, { label: '超长中文名'.repeat(12) + i, state: ['awaiting-user', 'failed', 'up', 'scheduled', 'done'][i % 5] }));
const dig = M.renderJobsDigest(many);
ok(B(dig) <= 600 && gateOf(dig.includes('✋')) && verdictOf(dig.includes('more — vibespace-job list')), '200-job adversarial digest ≤600B, awaiting-user first');
// lane job-notify-user r6 (accept-r5 confirmed 0): the digest's rows are the ENGINE's ({id, kind, state, ageHint, label}) — a row's
// name is its `label` (labelOf's, belted whole); a record's own `name` never reaches the line, and a row with no label says its id
{ const row = { id: 'jb-0000cccc', kind: 'service', state: 'up', ageHint: '3m', name: 'deploy-ghp_' + 'RAWTAIL', label: 'deploy-ghp_«redacted»' };
  const l1 = M.jobLine(row), l2 = M.jobLine({ ...row, label: undefined }), d1 = M.renderJobsDigest([row]);
  ok(gateOf(l1.includes(' — deploy-ghp_«redacted» — ')) && !l1.includes('RAWTAIL') && gateOf(l2.includes(' — jb-0000cccc — ')) && !l2.includes('RAWTAIL') && gateOf(d1.includes('deploy-ghp_«redacted»')) && !d1.includes('RAWTAIL'),
    'r6 jobLine / renderJobsDigest: a row\'s name is its LABEL (the accessor\'s) — a record\'s raw name never reaches the line; no label ⇒ the id', [l1, l2]); }
ok(M.renderJobsDigest([]) === '' && M.renderJobsUpdate([]) === '', 'zero jobs/events ⇒ zero bytes');
const upd = M.renderJobsUpdate(Array.from({ length: 30 }, (_, i) => ({ id: 'jb-' + i, name: 'n' + i, what: 'done exit=0' })));
ok(B(upd) <= 600 && gateOf(upd.startsWith('<vibespace-jobs-update>')) && verdictOf(upd.endsWith('</vibespace-jobs-update>')), '30-event update block ≤600B, well-formed');
ok(M.fitDigest(9580, dig, { count: 200 }) === '' && verdictOf(M.fitDigest(9520, dig, { count: 200 }).startsWith('## Background jobs: 200')), 'digest yields (floor→nothing) near the 9600B cap');
ok(9520 + 2 + B(M.fitDigest(9520, dig, { count: 200 })) <= 9600, 'merged payload never trips the 10240 wrap');

// ── panel schema ──
const panel = { title: 't', blocks: [ { type: 'md', text: 'x' }, { type: 'input', id: 'code', pattern: '\\d{6}' }, { type: 'buttons', options: [{ id: 'submit', label: 'OK' }] } ] };
ok(verdictOf(M.validatePanel(panel).ok), 'valid minimal panel accepted');
ok(!M.validatePanel({ title: 't', blocks: [{ type: 'html', text: 'x' }] }).ok, 'unknown block type refused (no agent HTML)');
ok(!M.validatePanel({ title: 't', blocks: [{ type: 'md', text: 'x' }] }).ok, 'panel without buttons refused');
ok(!M.validatePanel({ title: 't', blocks: [{ type: 'image', path: 'rel.png' }, { type: 'buttons', options: [{ id: 's', label: 'k' }] }] }).ok, 'relative image path refused');
ok(verdictOf(M.validateAnswers(panel, { code: '123456', button: 'submit' }).ok), 'answers matching pattern accepted');
ok(!M.validateAnswers(panel, { code: 'abc', button: 'submit' }).ok, 'pattern-violating answer refused');
ok(!M.validateAnswers(panel, { code: '123456' }).ok, 'missing button refused');
// r6 D-F5: the answer NAMES its panel — missing ⇒ version-required, another ⇒ stale-panel, no panel ⇒ no-pending-panel
{
  const pend = { panel, version: 2 };
  const V = (a, pp = pend) => { const r = M.answerVersionVerdict(pp, a); return r.ok ? 'ok' : r.code; };
  const table = [[{ button: 's', version: 2 }, 'ok'], [{ button: 's', version: '2' }, 'ok'], [{ button: 's' }, 'version-required'], [{ button: 's', version: 0 }, 'stale-panel'], [{ button: 's', version: 1 }, 'stale-panel'], [{ button: 's', version: '2x' }, 'stale-panel'], [{ button: 's', version: 2.5 }, 'stale-panel']];
  ok(gateOf(table.every(([a, want]) => V(a) === want)) && V({ version: 2 }, null) === 'no-pending-panel', 'r6 D-F5 answerVersionVerdict: the matching panel only; a missing version is refused by name (never "accepted because absent")', JSON.stringify(table.map(([a, w]) => [a.version, V(a), w])));
  ok(M.nextInteractionSeq({ pending: { version: 1 }, answers: [] }) === 2 && M.nextInteractionSeq({ seq: 5, pending: null, answers: [{ version: 1 }] }) === 6, 'r6 D-F5 nextInteractionSeq never goes back (the seq, the pending, every answer)');
}

// ── owner auto-notify (2.344.0) ──
ok(M.notifyEffective({ notify: 'off' }, true, true).on === false && M.notifyEffective({ notify: 'off' }, true, true).source === 'job', 'job override beats group+global');
ok(M.notifyEffective({}, false, true).on === false && M.notifyEffective({}, false, true).source === 'group', 'group OFF beats global ON');
ok(M.notifyEffective({}, true, false).on === true, 'group ON beats global OFF');
ok(M.notifyEffective({}, null, undefined).on === true && M.notifyEffective({}, null, false).on === false, 'inherit falls to global; default ON');
// lane job-notify-user r2: THE ONE READER of the For-you copy (notifyUserOf) — the legacy nested read is pinned HERE, in the
// fast tier (verdict r1: cutting it left every fast suite green; only a heavy real-spawn leg saw it)
{
  const st = (t) => ({ action: { type: 'spawn-task', task: t } });
  ok(M.notifyUserOf({ notifyUser: true }) === true && M.notifyUserOf({ notifyUser: false }) === false && M.notifyUserOf({}) === false, 'notifyUserOf: the top-level field (true / false / absent)');
  ok(M.notifyUserOf(st({ notifyUser: true })) === true, 'notifyUserOf: a scheduled run an older CLI made (the flag only in its spawn-task, no top-level) ⇒ true');
  ok(M.notifyUserOf({ action: { type: 'notify', text: 'x', task: { notifyUser: true } } }) === false && M.notifyUserOf({ action: { task: { notifyUser: true } } }) === false, 'notifyUserOf: a nested field on any action but spawn-task is nobody\'s ⇒ false');
  ok(M.notifyUserOf({ notifyUser: false, ...st({ notifyUser: true }) }) === true, 'notifyUserOf: the two DISAGREE only in a record an engine ≤ 2.369.360 stored (top false beside the user\'s nested true) ⇒ true — «top-level wins» would silence it');
  ok(M.notifyUserOf({ notifyUser: true, ...st({ notifyUser: false }) }) === true, 'notifyUserOf: a top-level true beside a nested false ⇒ true (either field true)');
  ok(M.notifyUserOf({ kind: 'service', notifyUser: true }) === false && M.notifyUserOf({ kind: 'task', notifyUser: true }) === true, 'notifyUserOf: a SERVICE ⇒ false (nothing tells at its end); a task with the same field ⇒ true');
  ok(gateOf([null, undefined, 'yes', 7, []].every((x) => M.notifyUserOf(x) === false)) && M.notifyUserOf({ action: { type: 'spawn-task', task: 'x' } }) === false, 'notifyUserOf: garbage ⇒ false, never a throw');
  const sa = M.storedAction({ type: 'spawn-task', task: { cmd: { argv: ['true'] }, notifyUser: true, notifyOk: true } });
  ok(gateOf(sa) && !('notifyUser' in sa.task) && sa.task.notifyOk === true && sa.type === 'spawn-task', 'storedAction drops ONLY the wire\'s compatibility copy (the store keeps the top-level field alone)', JSON.stringify(sa));
  const na = { type: 'notify', text: 'x' };
  ok(M.storedAction(na) === na && M.storedAction(null) === null && M.storedAction(undefined) === null, 'storedAction: any other action is stored as sent; none ⇒ null');
}
// lane job-notify-user r3: THE FOR-YOU COPIES AS FIELDS (accept-r2 confirmed 0–2) — the product's sentence is a template, the
// job's NAME and the agent's --text are its fields (the store belts each on its own, never the sentence), and `fact` is
// which copy it is (the store resolves and re-files by it, never by the words)
{
  const fill = (w) => w.key.replace(/\{(\w+)\}/g, (m, k) => (w.params && w.params[k] !== undefined ? String(w.params[k]) : m));
  const j = { id: 'jb-0000aaaa', kind: 'task', name: 'refresh-token', state: 'done' };
  const end = M.forYouCopy(j, 'end', { cause: 'ok' }), endF = M.forYouCopy({ ...j, state: 'failed' }, 'end', { cause: 'error' });
  ok(end.words.key === 'Task {name}: {state} ({cause})' && end.words.params.name === 'refresh-token' && fill(end.words) === 'Task refresh-token: done (ok)' && end.urgency === 'low', 'forYouCopy end: the sentence is the TEMPLATE, the job\'s name a field (never inside the key)', JSON.stringify(end));
  ok(end.fact === 'end:done:ok' && endF.fact === 'end:failed:error' && endF.urgency === 'normal', 'forYouCopy end: done and failed are TWO facts (two items — r2 merged them when the belt read both as `token: «redacted»`)', `${end.fact} ${endF.fact}`);
  ok(M.forYouCopy(j, 'end', { cause: 'ok(until-output)' }).fact === 'end:done:ok(until-output)' && verdictOf(/^end:failed:[a-z0-9._()-]+$/.test(M.forYouCopy({ ...j, state: 'failed' }, 'end', { cause: 'Weird Cause!' }).fact)), 'forYouCopy end: a cause becomes a fact token the store accepts (until-output kept, anything else folded)');
  const ask = M.forYouCopy({ ...j, name: 'rotate-db-password' }, 'ask');
  ok(ask.fact === 'ask' && ask.words.key === '{name} needs your input' && fill(ask.words) === 'rotate-db-password needs your input', 'forYouCopy ask: fact «ask» — the resolver\'s key (r2 read /needs your input/, which the belt ate after «…-password»)', JSON.stringify(ask));
  const park = M.forYouCopy({ ...j, kind: 'service', name: 'db-password' }, 'parked'), miss = M.forYouCopy({ ...j, kind: 'cron', name: 'api-password' }, 'missed');
  ok(fill(park.words) === 'Service db-password crash-looped and was parked — vibespace-job start jb-0000aaaa to retry' && park.fact === 'parked' && fill(miss.words) === 'Scheduled job api-password MISSED its time (server was down)' && miss.fact === 'missed' && miss.urgency === 'high', 'forYouCopy parked / missed: the product\'s words in the key, the name a field', `${fill(park.words)} | ${fill(miss.words)}`);
  const fire = M.forYouCopy({ ...j, kind: 'cron', name: 'renew' }, 'fire', { text: 'Renew the auth token: run the refresh script', urgency: 'urgent' });
  ok(fire.words.key === '{text}' && fire.words.params.text === 'Renew the auth token: run the refresh script' && fire.fact === 'fire' && fire.urgency === 'urgent' && M.forYouCopy({ ...j, name: 'nm' }, 'fire', {}).words.params.text === 'nm', 'forYouCopy fire: the --text is the WHOLE field (its name when it has none), the urgency the agent\'s', JSON.stringify(fire));
  const nope = M.forYouCopy(j, 'nope');
  ok(gateOf(Object.values(M.FOR_YOU_WORDS).every((k) => !/refresh|password|token/i.test(k))) && gateOf(Object.isFrozen(M.FOR_YOU_WORDS)) && Object.keys(M.FOR_YOU_WORDS).join() === 'end,ask,parked,missed,fire,engine-failed,store-corrupt,records-unread,records-read-again,notifs-unread,notifs-lost,records-gone,records-unread-unnoted,sweep-record-unread,set-aside-other,records-held,doubt,parked-memory,refused-budget,parked-budget,away-failed,stray'
    && gateOf(nope) && nope.fact === null && nope.words === null && nope.copy === 'nope' && verdictOf(/^no For-you copy of kind «nope» — the copies are end, ask, parked, missed, fire, engine-failed, store-corrupt, records-unread, records-read-again, notifs-unread, notifs-lost, records-gone, records-unread-unnoted, sweep-record-unread, set-aside-other, records-held, doubt, parked-memory, refused-budget, parked-budget, away-failed, stray$/.test(nope.refused)),
    'FOR_YOU_WORDS: five copies + the engine\'s three notices (lane job-logs-sweep r2: records-held — a set-aside job record file holds the log clean-up; r3: set-aside-other — a file a person named so; records-unread(-unnoted) — a records read that failed, its note; r4: sweep-record-unread — the clean-up record itself cannot be read) + the stray door\'s copy (bl-jobs B-f276 remainder (5): + notifs-unread — the waiting notices\' file held), frozen, no agent word inside one; an unknown copy ⇒ a NAMED refusal (r4: null was a TypeError in _forYou)', JSON.stringify(nope));
  // B-2566: the AWAY FAILURE's copy — the job's name a field, what failed the engine's own words (exit + a cause TOKEN), the count, since when
  // (an instant: the device's clock); a renewal carries renewOnly (re-filed only while its item is open)
  {
    const T = 1790000000000, aw = M.forYouCopy({ ...j, name: 'render-7' }, 'away-failed', { exit: 1, cause: 'timeout', count: 3, since: T }), aw3 = M.forYouCopy({ ...j, name: 'render-7' }, 'away-failed', { exit: 1, cause: 'Error: frame 7 failed', count: 1, since: T }), aw2 = M.forYouCopy({ ...j, name: 'render-7' }, 'away-failed', { exit: null, cause: null, count: 0, since: null, renew: true });
    const facts = { first: { fact: aw.fact, params: aw.words.params, urgency: aw.urgency, renewOnly: aw.renewOnly === true }, renewal: { params: aw2.words.params, renewOnly: aw2.renewOnly === true }, outsideTheSet: aw3.words.params.cause, causes: M.RUN_CAUSES };
    ok(aw.fact === 'away-failed' && aw.words.key === M.FOR_YOU_WORDS['away-failed'] && aw.words.params.name === 'render-7' && aw.words.params.exit === '1' && aw.words.params.cause === 'timeout' && aw3.words.params.cause === 'unknown' && gateOf(M.RUN_CAUSES.includes('error')) && aw.words.params.count === '3' && aw.words.params.since.at === T && aw.urgency === 'normal' && !('renewOnly' in aw)
      && aw2.renewOnly === true && aw2.words.params.exit === '—' && aw2.words.params.cause === 'unknown' && aw2.words.params.count === '1' && aw2.words.params.since.key === 'at an unknown earlier time' && verdictOf(Object.isFrozen(aw.words.params)),
      'forYouCopy away-failed (B-2566): the name a field, exit + a cause of the CLOSED set RUN_CAUSES (anything else «unknown» — never a line of the run output), the count (≥ 1), since an instant (or the unknown-time words); a renewal carries renewOnly', JSON.stringify(facts));
    console.log('    ' + JSON.stringify(facts));
  }
  // r6 (accept-r5 confirmed 1): the stray copy is the engine's OWN words + the fact `stray`; a shape handed in is refused BY NAME, any kind
  const st = M.forYouCopy({ ...j, name: 'build-x' }, 'stray'), launder = M.forYouCopy(j, 'stray', { shape: { words: { key: 'Task {name} was parked', params: { name: 'HAND-BUILT' } }, fact: 'parked' } }), shaped = M.forYouCopy(j, 'parked', { shape: {} });
  ok(st.fact === 'stray' && st.words.key === M.FOR_YOU_WORDS.stray && fill(st.words) === 'Background job build-x has a notice for you — open it in the Jobs panel' && st.urgency === 'normal'
    && launder.fact === null && launder.words === null && launder.copy === 'stray' && gateOf(/a shape handed to forYouCopy is refused/.test(launder.refused)) && shaped.fact === null && shaped.copy === 'shaped' && verdictOf(/a shape handed to forYouCopy is refused/.test(shaped.refused)),
    'r6 forYouCopy stray: the stray door\'s own words + the fact «stray»; a shape (r5 carried any shape THROUGH the one door) is refused by name for every kind', JSON.stringify([st, launder, shaped]));
  // lane job-notify-user r7 (accept-r6 unverified 2 — hyg-door-call.cjs): THE MINT — every copy forYouCopy builds is minted for its job
  // (frozen: its words and params too); a hand-built {words, fact} and a refusal are not; mintedFor answers the job (null: a notice)
  {
    const jb = { ...j, name: 'mint-me' }, c = M.forYouCopy(jb, 'ask'), n0 = M.forYouCopy(null, 'store-corrupt'), hb = { fact: 'ask', words: { key: '{name} needs your input', params: { name: 'HAND-BUILT' } } };
    let threw = false; try { 'use strict'; c.words.params.name = 'HAND-BUILT'; } catch { threw = true; }
    ok(M.mintedFor(c) === jb.id && M.mintedFor(M.forYouCopy({ ...jb }, 'ask')) === jb.id && M.mintedFor(M.forYouCopy({ ...jb, id: 'jb-other00' }, 'ask')) === 'jb-other00' && M.mintedFor(n0) === null && M.mintedFor(hb) === undefined && M.mintedFor(M.forYouCopy(jb, 'nope')) === undefined && M.mintedFor(null) === undefined && M.mintedFor('x') === undefined
      && gateOf(Object.isFrozen(c)) && gateOf(Object.isFrozen(c.words)) && gateOf(Object.isFrozen(c.words.params)) && c.words.params.name === 'mint-me' && M.mintedFor({ ...c }) === undefined,
      'r7 forYouCopy MINTS each copy for its job (frozen whole — a minted copy re-worded stays the engine\'s words); a hand-built copy, a spread of a minted one and a refusal are not minted — r8: mintedFor answers the job\'s ID (the same record read twice is one job)', threw);

    // r9 (accept-r8 unverified 2 + 6): the ID is a NON-EMPTY STRING — a copy minted for a job with no id (an event row's {jobId}, a
    // record without one, id '') is minted NO_ID: equal to no job's id, to no notice's null, to no hand-built copy's undefined
    const idless = [{ jobId: 'jb-0000beef', kind: 'task', name: 'x', state: 'awaiting-user' }, { ...jb, id: '' }, { ...jb, id: 42 }].map((x) => M.mintedFor(M.forYouCopy(x, 'ask')));
    ok(gateOf(idless.every((v) => v === M.NO_ID && v !== undefined && v !== null)) && typeof M.NO_ID === 'symbol' && M.jobIdOf(jb) === jb.id && verdictOf([null, {}, { id: '' }, { id: 7 }, { jobId: 'jb-x' }].every((x) => M.jobIdOf(x) === null)),
      'r9 a copy minted for a job with NO id (none, \'\', a number) is minted NO_ID — never `undefined` (r8: the door read undefined === undefined and filed a hand-built copy), never null (an engine notice)', idless.map(String));
    const MINT_AT = "  Object.freeze(c.words); MINTED.set(Object.freeze(c), job ? jobIdOf(job) || NO_ID : null);";
    const { mutantCopies: mc9 } = await import('./mutant-copy.mjs'), jmSrc9 = fs.readFileSync(path.join(__dirname_jm, '../src/job-model.js'), 'utf8');
    const MM9 = mc9('jm-r9-mint', path.join(__dirname_jm, '..')).load('src/job-model.js', jmSrc9.replace(MINT_AT, "  Object.freeze(c.words); MINTED.set(Object.freeze(c), job ? job.id : null);"), 'mintr8');
    const mIdless = MM9.mintedFor(MM9.forYouCopy({ jobId: 'jb-0000beef', kind: 'task', name: 'x', state: 'awaiting-user' }, 'ask'));
    ok(gateOf(jmSrc9.includes(MINT_AT)) && mIdless === undefined, 'r9 MUTANT — r8\'s mint (`job ? job.id : null`): RED by name — the id-less job\'s copy reads `undefined`, the hand-built copy\'s own answer (the door could not tell them apart)', String(mIdless));
  }
  const ef = M.forYouCopy(null, 'engine-failed', { error: 'EACCES' }), sc = M.forYouCopy(null, 'store-corrupt', { file: '/data/jobs.json.corrupt-1' }), rh = M.forYouCopy(null, 'records-held', { file: '/data/jobs-archive.json.corrupt-2' });
  ok(ef.fact === 'engine-failed' && fill(ef.words) === 'Background Work engine failed to start: EACCES' && ef.urgency === 'high' && sc.fact === 'store-corrupt' && gateOf(/Its bytes were kept in \/data\/jobs\.json\.corrupt-1; old job logs are not cleaned up until that file is moved or deleted\. Once it is, the logs of the jobs only that file lists are removed 14 days after their newest file\.$/.test(fill(sc.words))) && rh.fact === 'records-held' && gateOf(/^Job records in \/data\/jobs-archive\.json\.corrupt-2 could not be read\./.test(fill(rh.words))) && rh.urgency === 'high', 'forYouCopy: the engine\'s own notices (no job — r4: through the same door)', JSON.stringify([ef, sc]));
  // THE LEGACY RUNG'S READER (r4): a ≤ .360 copy's fact read back off its own template; any other words under a job id = a fire
  const LG = [['Task nightly: failed (error)', 'jb-1', 'end:failed:error'], ['Task needs your input: done (ok)', 'jb-1', 'end:done:ok'], ['Task a: b (c): done (exit(1))', 'jb-1', 'end:done:exit(1)'],
    ['deploy needs your input', 'jb-1', 'ask'], ['Service db crash-looped and was parked — vibespace-job start jb-7 to retry', 'jb-7', 'parked'], ['Service db crash-looped and was parked — vibespace-job start jb-7 to retry', 'jb-8', 'fire'],
    ['Scheduled job x MISSED its time (server was down)', 'jb-1', 'missed'], ['renew the cert', 'jb-1', 'fire'], ['an agent\'s ask', null, null]];
  const lgBad = LG.filter(([t, id, f]) => M.legacyCopyFact(t, id) !== f).map(([t, id, f]) => `${t} (${id}) → ${M.legacyCopyFact(t, id)} ≠ ${f}`);
  ok(!lgBad.length && verdictOf(LG.filter(([, , f]) => f && f.startsWith('end:')).every(([t]) => M.legacyCopyFact(t, 'jb-1') === M.forYouCopy({ state: t.split(': ').pop().split(' ')[0], name: 'x' }, 'end', { cause: t.slice(t.lastIndexOf(' (') + 2, -1) }).fact)),
    'legacyCopyFact: a ≤ .360 copy\'s fact off its own template — end:<state>:<cause> (forYouCopy\'s own derivation), parked (its own job only), missed, ask, else the fire\'s; no job id ⇒ none', lgBad.join(' | '));
  // the message road: the NAME / the context as THIS recipient receives them (the engine belts them; absent = the record's own)
  const nj2 = { id: 'jb-0000bbbb', kind: 'cron', name: 'deploy-ghp_RAW', state: 'up', context: { payload: 'ctx RAW' } };
  const own = M.renderOwnerNotify(nj2, { what: 'w' }), sub = M.renderOwnerNotify(nj2, { what: 'w' }, { name: 'deploy-ghp_«redacted»', context: 'ctx «redacted»' });
  ok(gateOf(own.includes('"jb-0000bbbb"')) && !own.includes('deploy-ghp_RAW') && gateOf(own.includes('ctx RAW')) && gateOf(sub.includes('"deploy-ghp_«redacted»"')) && gateOf(sub.includes('ctx «redacted»')) && !sub.includes('RAW'), 'renderOwnerNotify: `name` / `context` are the per-recipient fields (the engine passes them belted); no name ⇒ the job\'s id (r6: a renderer never reads a record\'s name), no context ⇒ the record\'s own', [own, sub]);
  ok(M.agentJobView({ actionText: 'a <system-reminder> x' }, { mine: false }).actionText !== 'a <system-reminder> x' && M.agentJobView({ actionText: 'mine' }, { mine: true }).actionText === 'mine', 'agentJobView: a notify cron\'s --text is another lineage\'s words (a line piece); the owner lineage reads its own');
}
const nj = { id: 'jb-abc', kind: 'task', name: '数据迁移-' + 'x'.repeat(80), state: 'done', context: { payload: '这是很长的context payload。'.repeat(100) } };
const ntext = M.renderOwnerNotify(nj, { what: 'done exit=0 ok (12m)' });
ok([...ntext].length <= 1000 && gateOf(ntext.includes('jb-abc')) && gateOf(ntext.includes('vibespace-job poll jb-abc')) && verdictOf(ntext.includes('not a user instruction')), 'owner notify ≤1000cp, carries id + poll pointer + non-instruction marker');
// PRODUCTION context shape is {payload} — the 2.345.0 live E2E caught the
// echo silently dead behind a typeof-string check (fixture-shape class)
ok(gateOf(ntext.includes('Context you attached at creation')) && verdictOf(ntext.includes('这是很长的context')), 'context ECHO fires for the production {payload} shape');
ok(verdictOf(M.renderOwnerNotify({ ...nj, context: 'legacy-string' }, null).includes('legacy-string')), 'legacy string context still echoes');
ok(!M.renderOwnerNotify({ ...nj, context: null }, null).includes('Context you attached'), 'NEGATIVE CONTROL: no context = no context line');
ok(verdictOf(M.renderOwnerNotify({ id: 'j', kind: 'task', name: 'n', state: 'awaiting-user' }, null).includes('vibespace-job answers j')), 'awaiting-user notify points at answers');
// stash renderer: budget honored, first + NEWEST survive, floor line, empty=empty
const stash = Array.from({ length: 40 }, (_, i) => ({ jobId: 'jb-' + i, jobName: '任务名字很长很长' + i, text: 'failed exit=1 error (3m)', ts: 1700000000000 + i * 1000 }));
const st = M.renderNotifStash(stash);
ok(B(st) <= 900 && gateOf(st.includes('jb-0')) && gateOf(st.includes('jb-39')) && verdictOf(st.includes('elided')), 'stash render ≤900B, endpoints survive, elision marked');
ok(M.renderNotifStash([]) === '' && M.renderNotifStash(null) === '', 'empty stash ⇒ zero bytes');
ok(verdictOf(M.renderNotifStash(stash, { budget: 120 }).includes('40 job notification')) || M.renderNotifStash(stash, { budget: 120 }) === '', 'tiny budget falls to floor (or nothing)');
// per-job announce coalescing: a flood from ONE job takes one line; lifecycle lines survive
const flood = [
  ...Array.from({ length: 20 }, (_, i) => ({ id: 'jb-noisy', name: 'news-watch', what: `announced: 新闻条目 ${i}`, verb: 'poll' })),
  { id: 'jb-other', name: 'builder', what: 'failed exit=1 error (2m)' },
  { id: 'jb-quiet', name: 'q', what: 'announced: 单条', verb: 'poll' },
];
const cu = M.renderJobsUpdate(flood);
ok(gateOf(cu.includes('announced ×20')) && gateOf(cu.includes('新闻条目 19')) && gateOf(cu.includes('jb-other')) && verdictOf(cu.includes('failed')), 'announce flood coalesces to ×N+latest; lifecycle event survives the budget');
ok(cu.split('\n').filter((l) => l.includes('jb-noisy')).length === 1, 'the noisy job occupies exactly ONE line');
ok(gateOf(cu.includes('单条')) && !cu.includes('×1'), 'single announce renders plainly (no ×1 noise)');
const spilled = M.renderNotifStash(stash, { spillPath: '/data/job-notifications-read/conv.md' });
ok(verdictOf(spilled.includes('/data/job-notifications-read/conv.md')), 'truncated stash points at the untruncated spill file');
ok(verdictOf(M.renderNotifStash(stash, { budget: 250, spillPath: '/data/job-notifications-read/conv.md' }).includes('full history: /data')), 'floor form carries the spill path too');

// ── CLI --at wiring pins (2.361.3, the 7h-off notify-test incident): the
//    relative "+2m" form and the resolved-time echo must stay in the CLI —
//    agents think in UTC, bare datetimes parse server-local.
{
  const fs2 = require('fs');
  const path2 = require('path');
  const cli = fs2.readFileSync(path2.join(path2.dirname(new URL(import.meta.url).pathname), '..', 'data/bin/vibespace-job'), 'utf-8');
  ok(gateOf(cli.includes('const parseAt')) && verdictOf(cli.includes("(\\d+)\\s*m")), 'vibespace-job --at supports relative "+2m" forms');
  ok(verdictOf(cli.includes('next fire:')), 'vibespace-job echoes the resolved fire time on creation');
  ok(verdictOf(cli.includes('SERVER-LOCAL')), 'usage/help teaches the bare-datetime = server-local trap');
  // 2.361.4: reminder-instinct support — a scheduled bare echo/printf gets
  // per-fire notify by default, and every scheduled task creation states the
  // quiet-success semantics (the "auto-notify: ON" line alone misled agents).
  ok(gateOf(cli.includes('echoReminder')) && verdictOf(cli.includes('(echo|printf)')), 'scheduled bare echo/printf defaults notifyOk (reminder instinct)');
  ok(verdictOf(cli.includes('SUCCESSFUL fires are SILENT')), 'scheduled-task creation states per-fire semantics');
}
// ── TRIAGE (2026-09-14, design §13): acknowledgement truth table ──────────
// Every instant is DERIVED from one injected clock — a fixture may never pin
// a calendar date or depend on the time of day.
{
  const T0 = 1_700_000_000_000; // an arbitrary epoch origin; only differences matter
  const H = 3600e3, D = 86400e3;
  const failed = (over = {}) => ({ id: 'jb-f', kind: 'task', name: 'render-r3', state: 'failed', owner: { conversation: { id: 'conv-A' }, sessionId: 'sess-A', sessionCreatedAt: 1 }, runs: [{ startedAt: T0, endedAt: T0 + 60e3, exit: 1, cause: 'error' }], ...over });
  const A = (j) => M.ackState(j, T0 + D);
  ok(!A(failed()).acked && A(failed()).by === null, 'a terminal failure with no journal and no stamp is UNACKNOWLEDGED');
  ok(A(failed({ notifyLog: [{ ts: T0 + 61e3, lane: 'message', ok: true }] })).by === 'notified', 'an ok:true message delivery at/after the terminal instant acknowledges (notified)');
  ok(A(failed({ notifyLog: [{ ts: T0 + 61e3, lane: 'channel', ok: true }] })).by === 'notified' && A(failed({ notifyLog: [{ ts: T0 + 61e3, lane: 'user-inbox', ok: true }] })).by === 'notified', 'channel and user-inbox lanes reached somebody too');
  ok(!A(failed({ notifyLog: [{ ts: T0 + 61e3, lane: 'stash', ok: false, reason: 'not reachable' }] })).acked, 'a STASHED entry is NOT an acknowledgement — nobody has read it yet');
  ok(!A(failed({ notifyLog: [{ ts: T0 + 61e3, lane: 'off', ok: false }, { ts: T0 + 62e3, lane: 'suppressed', ok: false }] })).acked, "'off' / 'suppressed' delivered nothing ⇒ unacknowledged");
  ok(!A(failed({ notifyLog: [{ ts: T0 - 5e3, lane: 'message', ok: true }] })).acked, 'a delivery BEFORE the terminal instant (an earlier run) acknowledges nothing');
  ok(A(failed({ ack: { by: 'notified', at: T0 + 90e3 } })).by === 'notified' && A(failed({ ack: { by: 'notified', at: T0 + 90e3 } })).at === T0 + 90e3, 'the engine stamp from a DRAINED stash acknowledges (notified, at the drain instant)');
  ok(A(failed({ ack: { by: 'agent-read', at: T0 + 2 * H } })).by === 'agent-read' && A(failed({ ack: { by: 'user-opened', at: T0 + 2 * H } })).by === 'user-opened', 'agent-read and user-opened stamps acknowledge');
  ok(!A(failed({ ack: { by: 'user-opened', at: T0 - 1 } })).acked, 'a stamp OLDER than the terminal instant (a re-run cleared it in memory but not here) acknowledges nothing');
  ok(!A(failed({ ack: { by: 'somebody', at: T0 + H } })).acked, 'an unknown ack.by is refused (closed vocabulary)');
  ok(!A(failed({ state: 'up', runs: [{ startedAt: T0 }] })).acked && !A({ ...failed(), kind: 'service' }).acked && !A({ ...failed(), kind: 'cron', state: 'missed' }).acked, 'a running task, a parked service and a cron parent are never "acknowledged" — not one-shots / not terminal');
  ok(verdictOf(A({ ...failed(), cronParent: 'jb-parent', notifyLog: [{ ts: T0 + 61e3, lane: 'message', ok: true }] }).acked), 'a cron per-fire CHILD is a one-shot and can be acknowledged');
  ok(verdictOf(A(failed({ state: 'unverified', runs: [], createdAt: T0, ack: { by: 'user-opened', at: T0 + 1 } })).acked), 'an unverified skeleton (no run) uses createdAt as its terminal instant');
  // the journal entry's own ts is what dates a notified ack
  ok(A(failed({ notifyLog: [{ ts: T0 + 61e3, lane: 'message', ok: true }] })).at === T0 + 61e3, 'notified ack is dated by the delivery');
  // attention: the badge counts
  ok(M.attentionOf(failed(), T0 + D) === 'unacked-failure' && M.attentionOf(failed({ ack: { by: 'user-opened', at: T0 + H } }), T0 + D) === 'acked-failure', 'attentionOf: unacked vs acked failure');
  ok(M.attentionOf({ kind: 'task', state: 'awaiting-user' }) === 'awaiting' && M.attentionOf({ kind: 'task', state: 'done' }) === null && M.attentionOf({ kind: 'task', state: 'interrupted' }) === null, 'awaiting counts; done/interrupted are not attention');
  ok(M.attentionOf({ kind: 'service', state: 'failed' }) === 'unacked-failure', 'a PARKED service stays red — it cannot be acknowledged, it needs a start');
  // agent-read: owner lineage only, never a self-read
  const owner = { conversationId: 'conv-A', sessionId: 'sess-NEW', sessionCreatedAt: 9, groups: new Set(['T-1']) };
  const strangerC = { conversationId: 'conv-Z', sessionId: 'sZ', sessionCreatedAt: 3, groups: new Set(['T-1']) };
  ok(M.agentReadAcks(failed(), owner) === true, 'an owner-lineage agent read acknowledges');
  ok(M.agentReadAcks(failed(), strangerC) === false, "a stranger session's read (even a viewer) does NOT acknowledge");
  ok(M.agentReadAcks(failed(), owner, { selfJob: true }) === false, "a jbt_ job-token read of ITSELF does NOT acknowledge");
  ok(M.agentReadAcks({ ...failed(), state: 'up' }, owner) === false, 'a read of a RUNNING job acknowledges nothing');
  // archive verdict
  const V = (j, o) => M.archiveVerdict(j, { now: T0 + 25 * H, ...o });
  ok(V({ ...failed(), state: 'done' }).archive === true && V({ ...failed(), state: 'done' }).why === 'done', 'done + 25h ⇒ archive');
  ok(V({ ...failed(), state: 'done' }, { now: T0 + 23 * H }).why === 'done-too-young', 'done + 23h ⇒ stays');
  ok(V({ ...failed(), state: 'done' }, { doneAfterMs: 0 }).why === 'archive-done-off', '0 = never archive done');
  ok(V(failed(), { now: T0 + 30 * D }).why === 'unacknowledged', 'an UNACKNOWLEDGED failure never archives, at ANY age');
  ok(V(failed({ ack: { by: 'user-opened', at: T0 + H } }), { now: T0 + H + 7 * D }).archive === true, 'an acknowledged failure archives 7d after the ACK (not the failure)');
  ok(V(failed({ ack: { by: 'user-opened', at: T0 + H } }), { now: T0 + H + 7 * D - 1 }).why === 'acknowledged-too-young', '…and not one ms earlier');
  ok(V(failed({ ack: { by: 'user-opened', at: T0 + H } }), { now: T0 + 30 * D, failedAfterMs: 0 }).why === 'archive-failed-off', '0 = never archive failures');
  ok(V({ ...failed(), state: 'done' }, { alive: true }).why === 'live-process', 'a live pid never archives');
  ok(V({ ...failed(), state: 'done', interaction: { pending: { version: 1 } } }).why === 'open-interaction', 'an open interaction never archives');
  ok(V({ ...failed(), kind: 'service', state: 'failed' }).why === 'not-a-one-shot' && V({ ...failed(), kind: 'cron', state: 'done' }).why === 'not-a-one-shot', 'services and cron parents never archive');
  ok(V({ ...failed(), state: 'done', cronParent: 'jb-p' }, { cronParentActive: true }).why === 'cron-schedule-active' && V({ ...failed(), state: 'done', cronParent: 'jb-p' }, { cronParentActive: false }).archive === true, "a cron child archives only once its schedule is no longer active (the child IS the cron's run ring)");
  ok(V(failed({ state: 'interrupted' }), { now: T0 + 30 * D }).why === 'unacknowledged' && V(failed({ state: 'missed' }), { now: T0 + 30 * D }).why === 'unacknowledged', 'interrupted/missed follow the failure rule (ack required)');
  // last line
  ok(M.lastLineOf('a\nb\n\n   \n') === 'b' && M.lastLineOf('') === '' && M.lastLineOf('only\r\n') === 'only', 'lastLineOf = last NON-EMPTY line, CR stripped');
  ok([...M.lastLineOf('x\n' + 'y'.repeat(500), 200)].length === 200, 'lastLineOf clips at 200 code points');
  // held-kind typing
  ok(M.heldKind({ ok: false, refused: 'spend', reason: 'spend budget: …' }) === 'spend-cap', 'a spend refusal types spend-cap');
  ok(M.heldKind(null, 'rate floor — queued for injection instead') === 'rate-floor', 'the rate floor types rate-floor');
  // lane notify-retry (2026-10-01): "no live inbox" = the conversation is NOT RUNNING (a dead pid, a socket nobody
  // serves); `not-reachable` is reserved for an agent that was alive and did not accept the message
  ok(M.heldKind({ ok: false, reason: 'no live inbox' }) === 'not-running' && M.heldKind({ ok: false, notRunning: true, reason: 'socket error: connect ENOENT' }) === 'not-running', 'no live inbox / a typed notRunning answer is not-running');
  ok(M.heldKind({ ok: false, parked: true, reason: 'timeout' }) === 'retrying' && M.heldKind({ ok: false, lane: 'remote-message', reason: 'remote daemon could not reach the inbox' }) === 'not-reachable' && M.heldKind(null, 'unreachable') === 'not-reachable', 'a parked answer is retrying; a remote miss / anything else is not-reachable');
  ok(gateOf(M.HELD_KINDS.includes('not-running')) && verdictOf(M.HELD_KINDS.includes('retrying')), 'HELD_KINDS declares both new kinds');
  const dg = M.heldDigest(new Map([['conv-A', [{ jobId: 'jb-1', ts: 1, held: { kind: 'spend-cap', identity: 'Member A', cap: 12 } }, { jobId: 'jb-2', ts: 2, held: { kind: 'rate-floor' } }]], ['conv-B', []]]));
  ok(dg.total === 2 && dg.byConversation['conv-A'].count === 2 && dg.byConversation['conv-A'].kinds['spend-cap'] === 1 && dg.byConversation['conv-A'].reason.kind === 'rate-floor' && !dg.byConversation['conv-B'], 'heldDigest: per-conversation counts by kind, the NEWEST reason, empty queues omitted');
}

// ── TRIAGE (design §13 rules 2+3): the PURE client layout src/lib/jobs-layout.js ──
{
  const L = await import(new URL('../src/lib/jobs-layout.js', import.meta.url));
  // familyOf: the NAME FAMILY rule as a table
  const fam = [['render-r3', 'render'], ['build run', 'build'], ['export-2', 'export'], ['deploy-v1.2.3', 'deploy'], ['nightly run-2', 'nightly'], ['render-r99', 'render'], ['x-1-2', 'x'], ['job-a', 'job-a'], ['-3', '-3'], ['compile-v2', 'compile'], ['data-2026', 'data'], ['  spaced run  ', 'spaced'], ['', '']];
  for (const [inp, want] of fam) ok(L.familyOf(inp) === want, `familyOf(${JSON.stringify(inp)}) = ${JSON.stringify(want)}`, L.familyOf(inp));
  // badgeCounts / badgeText: the ONE counter
  const snap = (over) => ({ kind: 'task', state: 'failed', ack: { acked: false, by: null, at: null }, ...over });
  const jobs = [
    snap({ id: 'a' }), snap({ id: 'b', ack: { acked: true, by: 'notified', at: 1 } }), snap({ id: 'c', state: 'awaiting-user' }),
    snap({ id: 'd', state: 'up' }), snap({ id: 'e', state: 'done' }), snap({ id: 'f', kind: 'service', state: 'failed' }), snap({ id: 'g', state: 'interrupted' }), snap({ id: 'h', state: 'missed' }),
  ];
  const c = L.badgeCounts(jobs);
  ok(c.unackedFailed === 3 && c.ackedFailed === 1 && c.awaiting === 1 && c.running === 1 && c.attention === 4 && c.failed === 4 && c.total === 8, 'badgeCounts: unacked (incl. a parked service + a missed cron child) / acked / awaiting / running / attention', c);
  ok(L.badgeText(c).text === '4!' && L.badgeText(c).tone === 'danger', 'badgeText: unacked ⇒ red N!');
  ok(L.badgeText(L.badgeCounts([snap({ id: 'b', ack: { acked: true, by: 'notified', at: 1 } }), snap({ id: 'c', state: 'awaiting-user' })])).text === '1?', 'badgeText: only acked failures + awaiting ⇒ amber 1? (acknowledged failures are never red)');
  ok(L.badgeText(L.badgeCounts([snap({ id: 'b', ack: { acked: true, by: 'user-opened', at: 1 } }), snap({ id: 'd', state: 'up' })])).text === '1' && L.badgeText(L.badgeCounts([])).text === '', 'badgeText: nothing red/amber ⇒ the running count, else empty');
  // foldTasks: owner session → family; defaults; persisted folds applied AFTER
  const os = (cid, sid) => ({ ownerSession: { conversationId: cid, sessionId: sid } });
  const tasks = [
    snap({ id: '1', name: 'render-r1', ...os('conv-A', 'sess-1'), run: { endedAt: 100 } }),
    snap({ id: '2', name: 'render-r2', ...os('conv-A', 'sess-1'), run: { endedAt: 200 }, ack: { acked: true, by: 'notified', at: 1 } }),
    snap({ id: '3', name: 'export-1', state: 'done', ...os('conv-A', 'sess-1'), run: { endedAt: 300 } }),
    snap({ id: '4', name: 'export-2', state: 'done', ...os('conv-B', 'sess-2'), run: { endedAt: 50 } }),
    snap({ id: '5', name: 'build run', state: 'up', ...os('conv-B', 'sess-2'), run: { startedAt: 400 } }),
    snap({ id: '6', name: 'manual-1', state: 'done', ownerSession: { conversationId: null, sessionId: null }, run: { endedAt: 10 } }),
    snap({ id: '7', name: 'qr', state: 'awaiting-user', ...os(null, 'sess-9'), run: { startedAt: 500 } }),
  ];
  const lay = L.foldTasks(tasks, { sessionNames: { 'conv-A': 'render session A' } });
  ok(lay.sessions.map((s) => s.key).join() === 'w:sess-9,s:conv-B,s:conv-A,manual', 'sessions ordered by latest activity; conversation id > webui id > manual as the key', lay.sessions.map((s) => s.key));
  ok(lay.sessions.find((s) => s.key === 's:conv-A').label.text === 'render session A' && lay.sessions.find((s) => s.key === 's:conv-A').label.kind === 'name', 'a known session gets its display name');
  ok(lay.sessions.find((s) => s.key === 's:conv-B').label.kind === 'short' && lay.sessions.find((s) => s.key === 's:conv-B').label.text === 'conv-B' && lay.sessions.find((s) => s.key === 'manual').label.kind === 'manual', 'an unknown session gets a short id; no session ⇒ manual');
  const gA = lay.sessions.find((s) => s.key === 's:conv-A').groups;
  ok(gA.map((g) => g.family).join() === 'export,render' && gA[1].count === 2 && gA[1].failedUnacked === 1 && gA[1].failedAcked === 1, 'families inside a session: render (2: 1 unacked + 1 acked), export (1); newest first');
  ok(gA[1].defaultExpanded === true && gA[1].expanded === true, 'a group with an unacknowledged failure is EXPANDED by default');
  ok(gA[0].defaultExpanded === false && gA[0].expanded === false, 'a group of done rows is COLLAPSED by default');
  const gB = lay.sessions.find((s) => s.key === 's:conv-B').groups;
  ok(gB.find((g) => g.family === 'build').expanded === true && gB.find((g) => g.family === 'build').running === 1, 'a group holding a RUNNING job is expanded by default');
  ok(lay.sessions.find((s) => s.key === 'w:sess-9').groups[0].expanded === true, 'a group holding an awaiting-user job is expanded by default');
  ok(lay.groups.length === 6, `groups: 248 rows would become a handful — here 7 rows ⇒ ${lay.groups.length} groups`);
  // a family's fold key is a DIGEST of the family, never the job's name (lane-redact verify r6: the map is persisted in user state)
  const KR = 's:conv-A|' + L.familyKey('render'), KE = 's:conv-A|' + L.familyKey('export');
  ok(gateOf(gA.every((g) => g.key === 's:conv-A|' + L.familyKey(g.family) && !g.key.includes(g.family))) && gateOf(L.isFoldKey(KR)) && !L.isFoldKey('s:conv-A|render') && gateOf(L.isFoldKey('s:conv-A')) && verdictOf(L.isFoldKey('manual')), 'a family group\'s key is <session key>|f:<digest> — no job name in the persisted fold map; an older build\'s <session>|<name> key is not a key this build keeps');
  const lay2 = L.foldTasks(tasks, { expanded: { [KR]: false, [KE]: true, 'stale|key': true }, sessionNames: {} });
  const gA2 = lay2.sessions.find((s) => s.key === 's:conv-A').groups;
  ok(gA2.find((g) => g.family === 'render').expanded === false && gA2.find((g) => g.family === 'export').expanded === true, "the user's persisted folds OVERRIDE the defaults in both directions");
  ok(gA2.find((g) => g.family === 'render').defaultExpanded === true, '…while defaultExpanded still states what the rule alone would do');
  const pruned = L.pruneFolds({ [KR]: false, 'stale|key': true, [KE]: true }, lay2);
  ok(Object.keys(pruned).sort().join() === [KE, KR].sort().join(), 'pruneFolds drops a key no current group holds (user state stays bounded)');
  // heldText: structure in, the device's words out
  const dg = { total: 3, byConversation: { 'conv-A': { count: 3, kinds: { 'spend-cap': 3 }, reason: { kind: 'spend-cap', why: 'hour-cap', identity: 'Member A', cap: 12 } } } };
  const txt = L.heldText(dg, { t: (s, p) => s.replace(/\{(\w+)\}/g, (_, k) => p[k]) });
  ok(txt === '3 notifications held — Member A’s hourly ceiling (12) reached; delivered with the conversation’s next prompt · Settings → Spending', 'heldText (spend-cap): names the account, the ceiling and where to change it', txt);
  ok(verdictOf(/1 notification held — the 30 s per-conversation floor/.test(L.heldText({ total: 1, byConversation: { x: { count: 1, kinds: { 'rate-floor': 1 }, reason: { kind: 'rate-floor' } } } }))), 'heldText (rate-floor) with the built-in fallback t');
  ok(L.heldText(dg, { cid: 'conv-Z' }) === '' && L.heldText({ total: 0, byConversation: {} }) === '' && L.heldText(null) === '', 'nothing held for that conversation / nothing at all ⇒ empty');
  ok(verdictOf(/^3 notifications held/.test(L.heldText(dg, { cid: 'conv-A' }))), 'the per-conversation form (the chat status-bar chip) narrows to one conversation');
  // attentionOf mirrors the server's rule on snapshots
  ok(L.attentionOf(snap({ ack: { acked: true, by: 'notified', at: 1 } })) === 'acked-failure' && L.attentionOf(snap({})) === 'unacked-failure' && L.attentionOf(snap({ state: 'done' })) === null && L.attentionOf(snap({ kind: 'service', state: 'failed', ack: { acked: true } })) === 'unacked-failure', 'attentionOf reads job.ack; a parked service is always unacked');
  // WIRING PINS: both counters and the fold live in the layout module, never inline
  const panel = require('fs').readFileSync(new URL('../src/lib/jobs-panel.js', import.meta.url), 'utf-8');
  const rail = require('fs').readFileSync(new URL('../src/lib/sidebar-rail.js', import.meta.url), 'utf-8');
  ok(gateOf(/from '\.\/jobs-layout\.js'/.test(panel)) && verdictOf(/from '\.\/jobs-layout\.js'/.test(rail)), 'jobs-panel and sidebar-rail import the PURE layout');
  ok((panel.match(/badgeCounts\(jobs\)/g) || []).length === 2 && !/\['failed', 'missed', 'unverified'\]\.includes\(j\.state\)\)\.length/.test(panel) && !/\['failed', 'missed', 'unverified'\]\.includes\(j\.state\)\)\.length/.test(rail), 'the two summary sites and the rail badge use badgeCounts — the inline `bad` computation is gone from both files');
  ok(gateOf(/foldTasks\(list, \{ expanded: FOLDS \|\| \{\}, sessionNames: sessionNameMap\(app\) \}\)/.test(panel)) && gateOf(/aria-expanded/.test(panel)) && gateOf(/jobsPanelFolds/.test(panel)) && verdictOf(/pruneFolds\(/.test(panel)), 'the Tasks section folds through foldTasks, group rows carry aria-expanded, folds persist as jobsPanelFolds and are pruned on write');
  ok(verdictOf(/\/api\/jobs\/\$\{j\.id\}\/seen/.test(panel)), 'expanding a row POSTs /seen');
  ok(gateOf(/fetchJson\('\/api\/jobs\?archived=1'\)/.test(panel)) && verdictOf(/if \(!ARCHIVE_OPEN\) return;/.test(panel)), 'the Archived row fetches the archive only once opened');
  ok(gateOf(/jobs-lastline/.test(panel)) && verdictOf(/j\.run\.lastLine/.test(panel)), 'a failed row renders run.lastLine');
}

// ── TRIAGE: the ACK LANE CENSUS (verifier 2026-09-16) ────────────────────
// ACK_LANES omitted 'rpc-queue' — the codex lane — so a notification that WAS
// delivered live to a codex-owned conversation (a billed turn/start when idle,
// a steer / queue/add when busy) never acknowledged: every codex-owned failure
// stayed red on the badge for ever and was never archived (the failed clock
// starts at the ack). The set is now held by a CENSUS over the two producers
// of ok:true journal entries — every `lane: '<x>'` the delivery ladder returns
// with ok:true and every literal lane jobs.js journals with ok:true. A lane
// either of them grows must acknowledge, or this leg goes red and names it.
{
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const blank = (s) => s.replace(/^\s*\/\/.*$/gm, ''); // a census reads CODE — whole-line comments blanked first
  const ladder = blank(fs.readFileSync(path.join(ROOT, 'src/server/conversation-deliver.js'), 'utf-8'));
  const engine = blank(fs.readFileSync(path.join(ROOT, 'src/jobs.js'), 'utf-8'));
  const okLanes = new Set(), notOkLanes = new Set();
  for (const m of ladder.matchAll(/return \{ ok: true,[^}]*?lane: '([^']+)'/g)) okLanes.add(m[1]);
  for (const m of engine.matchAll(/_notifyLogPush\(job, \{ lane: '([^']+)', ok: true/g)) okLanes.add(m[1]);
  for (const m of ladder.matchAll(/return \{ ok: false,[^}]*?lane: '([^']+)'/g)) notOkLanes.add(m[1]);
  for (const m of engine.matchAll(/_notifyLogPush\(job, \{ lane: '([^']+)', ok: false/g)) notOkLanes.add(m[1]);
  const onlyNotOk = [...notOkLanes].filter((l) => !okLanes.has(l)).sort();
  console.log('  census: ok:true lanes = ' + [...okLanes].sort().join(', ') + ' | ok:false-only lanes = ' + onlyNotOk.join(', '));
  ok(okLanes.size >= 4 && gateOf(okLanes.has('rpc-queue')) && gateOf(okLanes.has('message')) && verdictOf(okLanes.has('user-inbox')), `the census sees both producers (${okLanes.size} ok:true lanes incl. rpc-queue — the incident's own)`);
  const T0 = 1_700_000_000_000, D = 86400e3;
  const failed = (lane, okv = true) => ({ id: 'jb-c', kind: 'task', state: 'failed', owner: { conversation: { id: 'conv-A' } }, runs: [{ startedAt: T0, endedAt: T0 + 60e3, exit: 1 }], notifyLog: [{ ts: T0 + 61e3, lane, ok: okv }] });
  const stranded = [...okLanes].filter((lane) => M.ackState(failed(lane), T0 + D).by !== 'notified');
  ok(stranded.length === 0, 'every lane the ladder / engine journals ok:true on ACKNOWLEDGES' + (stranded.length ? ' — stranded: ' + stranded.join(', ') : ''));
  ok(gateOf(M.ACK_LANES) && verdictOf([...M.ACK_LANES].every((l) => okLanes.has(l) || M.RETIRED_ACK_LANES?.has(l))), 'ACK_LANES names no lane nobody produces unless it is declared RETIRED (a dead entry fails too): ' + (M.ACK_LANES ? [...M.ACK_LANES].join(', ') : 'NOT EXPORTED'));
  // B-df40 (lane settings-prune): the channel rung is gone — its lane is RETIRED: nothing journals it, old entries still acknowledge
  ok(gateOf(M.RETIRED_ACK_LANES) && gateOf([...M.RETIRED_ACK_LANES].every((l) => M.ACK_LANES.has(l) && !okLanes.has(l) && !notOkLanes.has(l))) && verdictOf(M.RETIRED_ACK_LANES.has('channel')), 'a RETIRED lane (channel) is produced by nobody — ladder or engine — yet still acknowledges: ' + (M.RETIRED_ACK_LANES ? [...M.RETIRED_ACK_LANES].join(', ') : 'NOT EXPORTED'));
  ok(M.ackState(failed('channel'), T0 + D).by === 'notified', 'a journal entry written before the removal (lane channel, ok:true) still acknowledges its failure');
  ok(M.ackState(failed('rpc-queue'), T0 + D).by === 'notified', "a codex delivery (lane 'rpc-queue', ok:true) acknowledges");
  // control: the lanes that deliver NOTHING never acknowledge — not even on an entry whose ok is flipped
  ok(onlyNotOk.length >= 3 && verdictOf(['stash', 'off', 'suppressed'].every((l) => onlyNotOk.includes(l))), 'the ok:false-only lanes are exactly the non-delivering ones (stash / off / suppressed present)');
  for (const lane of ['stash', 'off', 'suppressed']) ok(gateOf(M.ACK_LANES) && !M.ACK_LANES.has(lane) && !M.ackState(failed(lane, true), T0 + D).acked, `'${lane}' never acknowledges, even on an ok:true entry`);
}


// ── SESSION FOLDS + BATCH SEEN (2.369.121, owner: 后台工作按会话折叠和批量已读) ──
{
  const L = await import(new URL('../src/lib/jobs-layout.js', import.meta.url));
  const own = (cid) => ({ ownerSession: { conversationId: cid } });
  const j = (id, state, extra = {}) => ({ id, kind: 'task', name: id.replace(/-\d+$/, ''), state, ...own('conv-A'), ...extra });
  const jobs = [
    j('fail-1', 'failed'), j('fail-2', 'failed', { ack: { acked: true, by: 'user-opened', at: 1 } }), j('done-1', 'done'), j('run-1', 'up'), j('ask-1', 'awaiting-user'),
    j('missed-1', 'missed', { archived: true }), { ...j('svc-1', 'failed'), kind: 'service' },
    { id: 'b-done', kind: 'task', name: 'b', state: 'done', ...own('conv-B') },
  ];
  ok(L.ackableIds(jobs).join() === 'fail-1,done-1,b-done', 'ackableIds = terminal one-shots not yet seen; acked / running / awaiting / archived / service excluded');
  const lay = L.foldTasks(jobs.filter((x) => !x.archived), {}); // the panel never hands archived rows to the layout
  const A = lay.sessions.find((s) => s.key === 's:conv-A'), B = lay.sessions.find((s) => s.key === 's:conv-B');
  ok(gateOf(A) && A.expanded === true && A.defaultExpanded === true && A.count === 6 && A.running === 1 && A.awaiting === 1 && A.failedUnacked === 2 && A.ackable.join() === 'fail-1,done-1', 'a session carries count/running/awaiting/failedUnacked and its ackable ids; expanded by default', A && { c: A.count, r: A.running, a: A.awaiting, f: A.failedUnacked, ack: A.ackable });
  ok(gateOf(B) && B.ackable.join() === 'b-done' && B.failedUnacked === 0, 'ackable ids are per session');
  const folded = L.foldTasks(jobs.filter((x) => !x.archived), { expanded: { 's:conv-A': false } });
  ok(folded.sessions.find((s) => s.key === 's:conv-A').expanded === false && folded.sessions.find((s) => s.key === 's:conv-B').expanded === true, 'a persisted session fold applies by the session key; other sessions untouched');
  const KF = 's:conv-A|' + L.familyKey('fail'); // the group key is a digest of the family (verify r6)
  const pruned = L.pruneFolds({ 's:conv-A': false, 's:conv-GONE': false, [KF]: true, 'zzz|old': false }, lay);
  ok(JSON.stringify(pruned) === JSON.stringify({ 's:conv-A': false, [KF]: true }), 'pruneFolds keeps live session keys and live group keys, drops the rest', pruned);
  // wiring pins (the 2.355.0 lesson)
  const panel = fs.readFileSync(new URL('../src/lib/jobs-panel.js', import.meta.url), 'utf8');
  ok(gateOf(/import \{[^}]*ackableIds[^}]*\} from '\.\/jobs-layout\.js'/.test(panel)) && gateOf(/className = 'jobs-sess-head'/.test(panel)) && gateOf(/sh\.setAttribute\('aria-expanded'/.test(panel)) && gateOf(/setFold\(sess, layout\)/.test(panel)) && verdictOf(/if \(!sess\.expanded\) continue;/.test(panel)), 'the panel: the session header is a fold button (aria-expanded, setFold by the session key) and folded sessions render no groups');
  ok(gateOf(/fetchJson\('\/api\/jobs\/seen', \{ method: 'POST'/.test(panel)) && gateOf(/seenAllButton\(sess\.ackable, refresh/.test(panel)) && verdictOf(/seenAllButton\(ackableIds\(jobs\), render\)/.test(panel)), 'the panel: "Mark all seen" per session header AND window-wide, ONE batch request each');
  const wiring = fs.readFileSync(new URL('../src/server/jobs-wiring.js', import.meta.url), 'utf8');
  ok(gateOf(/app\.post\('\/api\/jobs\/seen'/.test(wiring)) && gateOf(/jm\.markAck\(job, 'user-opened', undefined, \{ quiet: true \}\)/.test(wiring)) && gateOf(/jm\._save\(\); try \{ jm\.d\.broadcast\('jobs-updated', \{ acked \}\)/.test(wiring)) && wiring.indexOf("app.post('/api/jobs/seen'") < wiring.indexOf("app.post('/api/jobs/:id/:act'"), 'the server: POST /api/jobs/seen acknowledges each id quietly, then ONE save + ONE broadcast; registered before the per-job act route');
}

console.log('B-70f9 ② ownedJobsView — the jobs a conversation OWNS, attention first (Session Properties\' Background work list)');
{
  const jobs = [
    { id: 'j1', name: 'web', kind: 'service', state: 'up', ownerSession: { conversationId: 'c-A' } },
    { id: 'j2', name: 'build', kind: 'task', state: 'failed', ownerSession: { conversationId: 'c-A' } },
    { id: 'j3', name: 'other', kind: 'task', state: 'up', ownerSession: { conversationId: 'c-B' } },
    { id: 'j4', name: 'ask', kind: 'task', state: 'awaiting-user', owner: { conversation: { id: 'c-A' } } },
    { id: 'j5', name: 'nightly', kind: 'cron', state: 'scheduled', ownerSession: { conversationId: 'c-A' } },
    { id: 'j6', name: 'nobody', kind: 'task', state: 'up', ownerSession: { conversationId: null } },
  ];
  const v = M.ownedJobsView(jobs, 'c-A');
  ok(JSON.stringify(v.map((j) => j.id)) === '["j4","j2","j1","j5"]', 'only c-A\'s jobs, attention first: waiting for you · failed · running · scheduled (the panel\'s ORDER)', v.map((j) => j.id));
  ok(v[0].words === 'waiting for you' && v[0].glyph === '✋' && v[1].words === 'failed' && v[2].words === 'running' && verdictOf(v.every((j) => typeof j.words === 'string' && j.words)), 'each row carries the panel glyph and the state as an English t() key');
  ok(M.ownedJobsView(jobs, '').length === 0 && M.ownedJobsView(null, 'c-A').length === 0 && M.ownedJobsView(jobs, 'c-none').length === 0, 'no conversation id / no list / nothing owned ⇒ empty');
  ok(Object.keys(M.STATE_WORDS).length === 11, 'every engine state has its words (11 — lane vault-job-road: + waiting, for the vault or an approval)');
  const sp = require('fs').readFileSync(require('path').join(__dirname_jm, '..', 'src/lib/session-props.js'), 'utf-8');
  ok(gateOf(/import \{ ownedJobsView \} from '\.\.\/job-model\.js';/.test(sp)) && gateOf(/const oj = ownedJobs\(conv, \(\) => \{ if \(root\.isConnected\) render\(\); \}\);/.test(sp)) && gateOf(/a\.onclick = \(\) => app\.openJobs\?\.\(\{ focusJobId: j\.id \}\);/.test(sp)) && verdictOf(/fetchJson\('\/api\/jobs'\)\.then\(\(r\) => \{\s*\n\s*if \(gen !== ownedJobsGen\) return;\s*\n\s*const rows = r && !r\.error && Array\.isArray\(r\.jobs\) \? ownedJobsView\(r\.jobs, conv\)/.test(sp)),
    'PIN: Session Properties lists the owned jobs through THE pure view (memoised ask of /api/jobs, a re-render only when the list moved) and a row opens the panel at its job');
  // G2 (for-you-jobs verify r1): "Clear content…" on a job — the server answers the cleared sentence from then on, but a
  // read begun BEFORE the clear landed after it and the memo kept the job's real name (and the window never repainted on
  // jobs-updated). Session Properties' OWN memo code, run over a stalled /api/jobs: the clear's jobs-updated drops it.
  const cut = (src) => src.slice(src.indexOf('const ownedJobsMemo = new Map();'), src.indexOf('function browserSessionsCount('));
  const run = (code) => {
    const asks = [];
    const fetchJson = () => new Promise((resolve) => asks.push(resolve));
    const api = new Function('fetchJson', 'ownedJobsView', code + '; return { ownedJobs, memo: ownedJobsMemo, drop: typeof dropOwnedJobs === "function" ? dropOwnedJobs : () => {} };')(fetchJson, M.ownedJobsView);
    return { asks, api };
  };
  const before = [{ id: 'j9', name: 'scrape the secret client list', kind: 'task', state: 'up', ownerSession: { conversationId: 'c-A' } }];
  const after = [{ id: 'j9', name: 'Content cleared', clearedAt: 1, kind: 'task', state: 'up', ownerSession: { conversationId: 'c-A' } }];
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const leg = async (code) => {
    const { asks, api } = run(code);
    api.ownedJobs('c-A', () => {});          // the window paints: read #1 is in flight
    api.drop();                              // the owner clears j9 — the clear's jobs-updated reaches the window
    asks[0]({ jobs: before });               // …and the read begun before the clear lands after it
    await tick();
    const oj = api.ownedJobs('c-A', () => {});   // the repaint the jobs-updated scheduled
    if (asks[1]) { asks[1]({ jobs: after }); await tick(); }
    const rows = (api.memo.get('c-A') || oj || {}).rows || [];
    return { asks: asks.length, names: rows.map((r) => r.name), cleared: rows.map((r) => !!r.clearedAt) };
  };
  const fixed = await leg(cut(sp));
  ok(fixed.asks === 2 && !fixed.names.includes(before[0].name) && fixed.cleared[0] === true,
    'G2: a /api/jobs read begun before a job\'s clear never paints its words — the clear\'s jobs-updated drops the memo, the stale answer is discarded, the re-ask carries clearedAt (painted as clearedText())', fixed);
  const reverted = await leg(cut(sp).replace('if (gen !== ownedJobsGen) return;', '').replace('function dropOwnedJobs() { ownedJobsGen++; ownedJobsMemo.clear(); }', 'function dropOwnedJobs() {}'));
  ok(verdictOf(reverted.names.includes(before[0].name)), 'G2 CONTROL: without the generation + the drop the cleared job\'s real name stays in the memo (no re-ask inside 15 s)', reverted);
  ok(M.ownedJobsView(after, 'c-A')[0].clearedAt === 1 && gateOf(/a\.textContent = `\$\{j\.glyph\} \$\{isCleared\(j\) \? clearedText\(\) : j\.name\} · \$\{t\(j\.words\)\}`;/.test(sp)) && verdictOf(/if \(msg\.type === 'jobs-updated'\) \{ dropOwnedJobs\(\);/.test(sp)),
    'G2 PIN: the view carries clearedAt, the row paints clearedText() for a cleared job, the window drops the memo on jobs-updated');
}

// lane job-wrapper-update-window (fb-7f7be1e24e) gave the job wrapper's protocol-1 compat — a ≤ .330 server's spec (the
// job's secrets) READ off argv for an update's window, a second door — an expiry at 2.369.340, and this row went RED there.
// Lane job-wrapper-proto1-retire (2026-10-21) removed it as scheduled: THE PIN OF THE REMOVAL. data/bin/job-wrapper.js
// holds no COMPAT_PROTO_1 and builds no spec from argv (no argvSpec, no base64 decode, no atob): a ≤ .330 caller is
// judged by its argument's SHAPE and the run ends «not started», update_window (test-jobs-engine §12 runs it on the real
// file, a canary in the spec). CONTROL: the ≤ .339 compat patched back into a copy — whole, or as one decode — is RED.
{
  const wrap = fs.readFileSync(path.join(__dirname_jm, '..', 'data', 'bin', 'job-wrapper.js'), 'utf8');
  const code = (src) => src.split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/ .*$/, '')).join('\n'); // comments out: the header RECORDS the removal
  const removed = (src) => !/\bCOMPAT_PROTO_1\b|\bargvSpec\b|\batob\(|Buffer\.from\([^\n]*?['"]base64['"]\)/.test(code(src));
  ok(verdictOf(removed(wrap)), 'the job wrapper reads no protocol-1 spec — no COMPAT_PROTO_1, no argvSpec, no base64 decode of an argument (removed at 2.369.340 as scheduled; a ≤ .330 call ends «not started», update_window)');
  const AT = 'const PROTO = 3;\n';   // lane vault-job-road: protocol 3 (the vault values on fd 3)
  const OLD = "const COMPAT_PROTO_1 = true;\nfunction argvSpec(a) { // the ≤ .330 caller's spec: base64 JSON carrying an argv — anything else is not one\n  try { const s = JSON.parse(Buffer.from(String(a), 'base64').toString('utf-8')); return s && typeof s === 'object' && Array.isArray(s.argv) ? s : null; } catch { return null; }\n}\n";
  const V1 = 'else if (v1) {';
  const plants = [
    ['the ≤ .339 compat whole (COMPAT_PROTO_1 + argvSpec)', wrap.split(AT).length === 2 ? wrap.replace(AT, AT + OLD) : ''],
    ['the flag alone', wrap.split(AT).length === 2 ? wrap.replace(AT, AT + 'const COMPAT_PROTO_1 = true;\n') : ''],
    ['one decode of the argument in the protocol-1 branch', wrap.split(V1).length === 2 ? wrap.replace(V1, "else if (v1) { spec = JSON.parse(Buffer.from(specPath, 'base64').toString('utf-8')); } else if (false) {") : ''],
  ];
  ok(verdictOf(plants.every(([, src]) => src && src !== wrap && !removed(src))), `CONTROL: each patched copy is RED — ${plants.map(([n, src]) => `${n}: ${!src ? 'ANCHOR GONE' : removed(src) ? 'GREEN (WRONG)' : 'red'}`).join('; ')}`);
}

// ── B-70f9 ① (the owner's option A, 2026-11-18): A JOB RUNS ON THE HUB'S MACHINE — where, said; a wrong machine's folder refused by name ──
console.log('B-70f9 ① a job says where it runs; a folder the hub\'s machine does not have is refused at once');
{
  const V = (o) => M.jobWhereVerdict({ hubMachine: 'hub-box', ...o });
  const here = V({ cwd: '/work/x' }), remoteOk = V({ sessionMachine: 'laptop', cwd: '/srv/shared', cwdExists: true }), missing = V({ sessionMachine: 'laptop', cwd: '/home/u/proj', cwdExists: false }), blocked = V({ sessionMachine: 'laptop', cwd: '/mnt/dav/x', cwdBlocked: true });
  ok(gateOf(here.ok) && here.words === 'runs on hub-box in /work/x', 'a conversation ON the hub\'s machine: the job runs there, said with its path', here);
  ok(gateOf(remoteOk.ok) && verdictOf(/^runs on hub-box in \/srv\/shared — not on laptop, where your conversation runs \(the path is used as it is on hub-box\)$/.test(remoteOk.words)), 'a conversation on ANOTHER machine, a folder the hub has too (a shared mount): it runs — on hub-box, said; never a guess that the two folders are one', remoteOk);
  ok(!missing.ok && missing.code === 'wrong-machine' && verdictOf(/^jobs run on hub-box, not on laptop where your conversation runs; this folder is not there: \/home\/u\/proj — nothing was created/.test(missing.error)), 'a folder the hub\'s machine does NOT have: refused at once, by name — never a job that fails later', missing);
  ok(!blocked.ok && blocked.code === 'folder-blocked' && verdictOf(/on a mount of hub-box that does not answer right now — nothing was created/.test(blocked.error)), 'a folder on a mount that does not answer: refused by name, never read', blocked);
  ok(gateOf(V({ sessionMachine: 'laptop' }).ok) && M.jobWhereVerdict({}).words === "runs on the hub's machine", 'no folder asked (a notify cron): nothing to refuse; no machine name: «the hub\'s machine»');
  // WIRING: the agent create route asks the verdict BEFORE it creates; the folder is asked only for a REMOTE conversation, through the
  // blocked-path door first, off the loop; the create and the show answers name the machine; the CLI prints both
  const ar = fs.readFileSync(path.join(__dirname_jm, '..', 'src/agent-routes.js'), 'utf8'), cli = fs.readFileSync(path.join(__dirname_jm, '..', 'data/bin/vibespace-job'), 'utf8');
  const iV = ar.indexOf('try { where = await jobWhere({ body: b, session: a.session, hubMachine }); }'), iC = ar.indexOf('const r = a.jm.create(spec, a.caller);', iV);
  ok(iV > 0 && iC > iV && gateOf(/catch \(e\) \{ return res\.status\(500\)\.json\(\{ error: `the folder check failed: /.test(ar)) && verdictOf(/if \(!where\.ok\) return res\.status\(where\.code === 'folder-blocked' \? 503 : 400\)\.json\(\{ error: where\.error, code: where\.code, machine: hubMachine \}\);/.test(ar)), 'WIRING: the route awaits src/server/job-where.js BEFORE it creates; a refusal answers 400 (a mount that does not answer 503) with its code; a check that throws is said (500) — never a request left open');
  ok(gateOf(/res\.json\(\{ machine: hubMachine, where: where\.words,/.test(ar)) && gateOf(/machine: os\.hostname\(\),   \/\/ B-70f9/.test(ar)) && gateOf(/if \(r\.where\) console\.log\(`where: \$\{r\.where\}`\);/.test(cli)) && verdictOf(/if \(r\.machine\) console\.log\(`machine: \$\{r\.machine\} \(a job runs on the hub's machine\)`\);/.test(cli)), 'WIRING: the create and the show answers name the machine; the CLI prints «where:» at a run and «machine:» at a show');
  ok(gateOf(/cwd: typeof flags\.cwd === 'string' && flags\.cwd \? require\('node:path'\)\.resolve\(flags\.cwd\) : process\.cwd\(\) \}/.test(cli)) && verdictOf(/if \(unknown\.includes\('stop-with-owner'\)\) \{ console\.error\('--stop-with-owner was retired: /.test(cli)), 'the CLI resolves --cwd WHERE THE CONVERSATION RUNS (a relative folder would name the hub\'s own), and refuses the retired flag by its own sentence');
}
// ── B-70f9 ① cure (its adversarial read r1: F1 F2 F4 F5 F15): THE CHECK, DRIVEN — src/server/job-where.js
console.log('B-70f9 ① cure: the folder check driven (the door, a schedule\'s folder, a bounded stat, a relative folder)');
{
  const JW = require('../src/server/job-where.js'), MD = require('../src/mount-door.js');
  const remote = { host: 'h-lap', hostName: 'laptop' }, task = (cwd) => ({ cmd: { argv: ['true'], ...(cwd !== undefined ? { cwd } : {}) } }), sched = (cwd) => ({ action: { type: 'spawn-task', task: { cmd: { argv: ['true'], cwd } } } });
  const calls = [], st = (ans) => (p) => { calls.push(p); return typeof ans === 'function' ? ans(p) : ans; };
  const dir = { isDirectory: () => true }, file = { isDirectory: () => false }, err = (code) => () => Promise.reject(Object.assign(new Error(code), { code }));
  const W = (o) => JW.jobWhere({ hubMachine: 'hub-box', blocked: () => false, statMs: 40, mountinfo: '', ...o });   // an empty mount table: each folder its own key (one leg's stuck stat never meets the next)
  const keepAll = setInterval(() => { }, 1000);   // stats that never settle: the suite's loop kept alive for the whole block (the hub's always is)
  const local = await W({ body: task('/work/x'), session: {}, stat: st(Promise.resolve(dir)) });
  ok(gateOf(local.ok) && local.words === 'runs on hub-box in /work/x' && !calls.length, 'a conversation on the hub\'s machine: never asked (its folder is the hub\'s)', local);
  const there = await W({ body: task('/srv/shared'), session: remote, stat: st(Promise.resolve(dir)) });
  const gone = await W({ body: task('/home/u/proj'), session: remote, stat: st(err('ENOENT')) });
  const aFile = await W({ body: task('/home/u/f.txt'), session: remote, stat: st(Promise.resolve(file)) });
  ok(gateOf(there.ok) && gateOf(/not on laptop/.test(there.words)) && !gone.ok && gone.code === 'wrong-machine' && !aFile.ok && aFile.code === 'wrong-machine', 'remote: a folder the hub has runs (said where); one it lacks — or a FILE where a folder is asked — is refused `wrong-machine`', { there, gone: gone.code, aFile: aFile.code });
  const schedGone = await W({ body: sched('/home/u/proj'), session: remote, stat: st(err('ENOENT')) });
  ok(!schedGone.ok && schedGone.code === 'wrong-machine' && JW.cwdOfBody(sched('/a')) === '/a', 'a SCHEDULE\'s task (--every / --cron / --at: the folder inside action.task) is asked too — the first cut never looked (F2)', schedGone);
  const hung = await W({ body: task('/mnt/nfs/x'), session: remote, stat: st(() => new Promise(() => { })) });   // bounded = it ANSWERS at all (the stat never settles)
  ok(!hung.ok && hung.code === 'folder-blocked', 'a stat that never answers (a mount wedged before its first strike) is BOUNDED: «does not answer right now» — never a request left open (F4)', hung);
  let asked = 0; const struck = await W({ body: task('/mnt/dav/x'), session: remote, blocked: () => '/mnt/dav', stat: () => { asked++; return Promise.resolve(dir); } });
  ok(!struck.ok && struck.code === 'folder-blocked' && asked === 0, 'a folder under a mount the door has struck: refused, NEVER asked', struck);
  const denied = await W({ body: task('/root/x'), session: remote, stat: st(err('EACCES')) });
  ok(verdictOf(denied.ok), 'EACCES decides nothing (the folder may be there): the job is created as before and its start says what it meets (F15)', denied);
  const rel = await W({ body: task('build'), session: remote, stat: st(Promise.resolve(dir)) }), none = await W({ body: task(), session: remote, stat: st(Promise.resolve(dir)) }), notify = await W({ body: { action: { type: 'notify', text: 'x' } }, session: remote, stat: st(Promise.resolve(dir)) });
  ok(!rel.ok && rel.code === 'relative-cwd' && gateOf(/«build» is a relative folder/.test(rel.error)) && !none.ok && none.code === 'relative-cwd' && verdictOf(notify.ok), 'remote: a RELATIVE folder or none would name the hub\'s own process folder — refused `relative-cwd`; a pure notify cron starts no process, nothing to ask (F5)', { rel: rel.code, none: none.code, notify: notify.ok });
  // THE DOOR ITSELF (F1): the defaults are the real door and the real stat — driven with no override
  const real = await JW.jobWhere({ body: task(path.join(__dirname_jm, 'no-such-folder-' + process.pid)), session: remote, hubMachine: 'hub-box' });
  ok(typeof MD.blocked === 'function' && !real.ok && real.code === 'wrong-machine', 'the DEFAULT door is mount-door\'s `blocked` (an export) and the default stat is fs.promises — driven with no override, a missing folder is refused', real);
  let thrown = null; try { await JW.jobWhere({ body: task('/x'), session: remote, hubMachine: 'hub-box', blocked: (p) => MD.pathBlocked(p) }); } catch (e) { thrown = e; }   // the first cut's very call
  ok(MD.pathBlocked === undefined && thrown instanceof TypeError, 'CONTROL (the first cut\'s door, mountDoor.pathBlocked — no such export): the check THROWS — what hung every remote create (the route now answers it 500 by name)');
  const all = ['src/agent-routes.js', 'src/server/job-where.js'].map((f) => fs.readFileSync(path.join(__dirname_jm, '..', f), 'utf8')).join('\n');
  ok(!/pathBlocked/.test(all), 'no caller names a door export that does not exist');
  // ── B-70f9 cure 2 (主开发 10:30Z, two «as if a must»): every throw of the create door answered; ONE stuck stat a mount
  const keep2 = setInterval(() => { }, 1000);   // stats that never settle: the suite's loop kept alive (the hub's always is)
  try {
    const answered = [], resOf = () => { const r = { headersSent: false, status(c) { r.code = c; return r; }, json(b) { r.headersSent = true; answered.push([r.code || 200, b]); return r; } }; return r; };
    const late = async (req, res) => { await Promise.resolve(); throw new Error('the engine threw after the await'); };
    const r1 = resOf(); await JW.answersEveryThrow(late, { warn() { } })({}, r1);
    const r2 = resOf(); await JW.answersEveryThrow(async (req, res) => { res.json({ success: true }); throw new Error('after the answer'); }, { warn() { } })({}, r2);
    ok(answered.length === 2 && answered[0][0] === 500 && answered[0][1].code === 'create-failed' && gateOf(/the job create failed on the hub: the engine threw after the await — `vibespace-job list --mine` says whether a job was made/.test(answered[0][1].error)) && answered[1][0] === 200, 'cure 2: the create door ANSWERS a throw after its await by name (500 create-failed, what to check) — never twice once it answered', answered);
    const r3 = resOf(); let lost = null; await late({}, r3).catch((e) => { lost = e; });
    ok(gateOf(lost) && !r3.headersSent, 'CONTROL (the bare async handler, Express 4): the throw is a rejection nobody answers — the agent\'s command waits');
    ok(gateOf(/app\.post\('\/api\/agent\/jobs', answersEveryThrow\(async function jobsCreateRoute\(req, res\) \{/.test(all)) && verdictOf(/readMembership\(req, res, answersEveryThrow\(jobsCreateRoute\), /.test(all)), 'WIRING: the agent create route IS that door — and B-55dc\'s membership read enters the named handler again THROUGH that door (a throw on the second entry is answered too)');
    const MI = '22 1 0:20 / / rw - ext4 /dev/root rw\n30 22 0:40 / /mnt/nfs rw - nfs4 srv:/x rw\n';
    let calls = []; const hung = (p) => { calls.push(p); return new Promise(() => { }); };
    const ask = (Mod, cwd, st) => Mod.jobWhere({ body: task(cwd), session: remote, hubMachine: 'hub-box', blocked: () => false, stat: st, statMs: 40, mountinfo: MI });
    const a1 = await ask(JW, '/mnt/nfs/c2-a-' + process.pid, hung), a2 = await ask(JW, '/mnt/nfs/c2-b-' + process.pid, hung), a3 = await ask(JW, '/mnt/nfs/c2-a-' + process.pid, hung);
    const onNfs = calls.length;
    const other = await ask(JW, '/srv/c2-' + process.pid, (p) => { calls.push(p); return Promise.resolve({ isDirectory: () => true }); });
    ok(gateOf([a1, a2, a3].every((v) => !v.ok && v.code === 'folder-blocked')) && onNfs === 1 && gateOf(other.ok) && calls.length === 2, 'cure 2: ONE stuck stat a mount — while a stat on /mnt/nfs is out, asks for other folders of that mount and the same folder again answer «does not answer right now» WITHOUT a second stat; another mount is asked as before', { onNfs, calls: calls.length });
    const MJ = mutantCopies('job-where-70f9', path.join(__dirname_jm, '..'));
    // RED CONTROL from the source itself (never a sha off this branch — test-ci-gate's sha law): cure 1's ask, ONE stat per ask
    const JWSRC = fs.readFileSync(path.join(__dirname_jm, '..', 'src/server/job-where.js'), 'utf8'), ONE_A = '      const r = await statOnce(key, cwd, stat, statMs);';
    ok(JWSRC.split(ONE_A).length === 2, 'control setup: the one-stat-a-mount call is in job-where.js once (the plant the control swaps)');
    const JO = MJ.load('src/server/job-where.js', editAnchor(JWSRC, ONE_A, '      const r = await within(Promise.resolve().then(() => stat(cwd)).then(classify, classifyErr), statMs);   /* MUTANT: cure 1 — a stat per ask */', "src/server/job-where.js"), 'cure1');
    calls = [];
    await ask(JO, '/mnt/nfs/c2-ca-' + process.pid, hung); await ask(JO, '/mnt/nfs/c2-cb-' + process.pid, hung); await ask(JO, '/mnt/nfs/c2-ca-' + process.pid, hung);
    ok(calls.length === 3, 'CONTROL (cure 1, its 3 s race alone, in a copy): every ask parks ONE MORE stat on the wedged mount (3 asks, 3 threads of the pool)', calls.length);
    for (const r of copiesCensus(MJ.files, MJ.dir, path.join(__dirname_jm, '..'), { minCopies: 0, label: 'B-70f9 ' })) ok(verdictOf(r.pass), r.name + (r.pass ? '' : ' — ' + r.detail));
  } finally { clearInterval(keep2); }
  ok(M.jobWhereVerdict({ hubMachine: 'hub-box', sessionMachine: 'laptop' }).words === 'runs on hub-box — not on laptop, where your conversation runs', 'cure 2: a notify-only schedule from a remote conversation has no folder — its line says no «the path is used as it is»');
  clearInterval(keepAll);
}

// ── B-70f9 ② ENDING A CONVERSATION THAT OWNS RUNNING JOBS: one non-blocking notice, «Stop these too»; the stored flag retired ──
console.log('B-70f9 ② the notice at a person\'s end / archive; the stop-with-conversation flag retired');
{
  const own = (id, name, state, cid = 'conv-a', kind = 'task') => ({ id, name, state, kind, owner: { conversation: { id: cid } } });
  const jobs = [own('jb-1', 'build', 'up'), own('jb-2', 'nightly', 'scheduled', 'conv-a', 'cron'), own('jb-3', 'old', 'done'), own('jb-4', 'theirs', 'up', 'conv-b'), own('jb-5', 'asks', 'awaiting-user')];
  const one = M.endNotice(jobs, ['conv-a']), two = M.endNotice(jobs, ['conv-a', 'conv-b']), none = M.endNotice(jobs, ['conv-z']), many = M.endNotice([1, 2, 3, 4, 5, 6].map((k) => own('jb-m' + k, 'w' + k, 'up')), 'conv-a');
  ok(gateOf(one) && one.jobs.map((j) => j.id).join() === 'jb-5,jb-1,jb-2' && one.words.key === 'Background jobs of this conversation keep running: {names}' && one.words.params.names === 'asks, build, nightly', 'endNotice: the jobs a conversation OWNS that still run (waiting for you first, a cron that will fire too) — never a finished one, never another conversation\'s', one);
  ok(gateOf(two) && two.jobs.length === 4 && gateOf(/these conversations/.test(two.words.key)) && none === null && M.endNotice(jobs, []) === null, 'several conversations (an archive of many): one notice; none running: NO notice');
  ok(many.words.params.names === 'w1, w2, w3, w4 +2' && many.jobs.length === 6, 'many jobs: four named, the rest counted — the press stops them ALL');
  const bo = M.endNotice([{ ...own('jb-b', 'svc', 'down', 'conv-a', 'service'), desiredUp: true }, { ...own('jb-s', 'stopped', 'down', 'conv-a', 'service'), desiredUp: false }], ['conv-a']);
  ok(gateOf(bo) && bo.jobs.map((j) => j.id).join() === 'jb-b', 'a service in its restart BACKOFF (down, still wanted up) will start again — named; one the person stopped is not (F13)', bo);
  const L = fs.readFileSync(path.join(__dirname_jm, '..', 'src/lib/session-lifecycle.js'), 'utf8'), tb = fs.readFileSync(path.join(__dirname_jm, '..', 'src/lib/taskbar.js'), 'utf8'), sw = fs.readFileSync(path.join(__dirname_jm, '..', 'src/lib/sidebar-workbench.js'), 'utf8'), ss = fs.readFileSync(path.join(__dirname_jm, '..', 'src/lib/sidebar-state.js'), 'utf8');
  ok((L.match(/if \(shouldKill\) this\.endConversation\(/g) || []).length === 3 && gateOf(/registerCommand\(\{ id: 'window\.terminateSession', title: \(\) => t\('Terminate session'\), run: \(c\) => c\.app\.endConversation\(c\.s\.webuiId, undefined, \{ endTree: true \}\) \}\)/.test(tb)) && gateOf(/const ended = termList\.map\(\(s\) => s\.sessionId \|\| s\.backendSessionId\);/.test(sw)) && gateOf(/ended\.push\(s\.sessionId \|\| s\.backendSessionId\);\s*\}\s*\}\s*this\.app\.noticeOwnedJobs\?\.\(ended\);/.test(sw)) && (ss.match(/this\.app\.noticeOwnedJobs\?\.\(/g) || []).length === 3, 'WIRING: every door where a PERSON ends a conversation (three window closes, the taskbar\'s Terminate, the batch bar\'s terminate-and-archive with its archive list — ONE notice) and the archive doors (the card\'s Archive, Archive project, the stopped sessions\' archive) notice its running jobs');
  const sc = fs.readFileSync(path.join(__dirname_jm, '..', 'src/lib/session-card.js'), 'utf8');
  ok((sc.match(/if \(s\.webuiId\) (c\.)?app\.endConversation\(s\.webuiId, undefined, \{ endTree: true \}\);/g) || []).length === 2 && (sc.match(/killPid\(s\.pid, s\.host\); (c\.)?app\.noticeOwnedJobs\?\.\(\[s\.sessionId\]\);/g) || []).length === 2 && !/\bkillSession\(s\.webuiId\)/.test(sc), 'WIRING (the read F3): the card menu\'s and the card detail\'s Terminate end through endConversation — the two doors a person uses most');   // stale-pins: kept — the old bare kill must be GONE from the card
  ok(gateOf(/if \(\(this\._fenceOpen \|\| 0\) > 0\) \{ this\.killSession\(webuiId, backendSessionId\); return; \}/.test(L)) && verdictOf(/q\.t = setTimeout\(\(\) => \{ const list = \[\.\.\.q\.cids\]; this\._ownedNoticeQ = null; this\._noticeOwnedNow\(list\)/.test(L)), 'a RESUME\'s own close (the fence) notices nothing (F6); the ends of one moment (a tab group\'s ✕) gather into ONE notice and ONE read (F7)');
  ok(gateOf(/this\.killSession\(webuiId, cid\);/.test(L)) && gateOf(/this\.killSession\(live\.webuiId, backendSessionId\);/.test(L)) && gateOf(/action: \{ label: t\('Stop these too'\), run: stopAll \}/.test(L)) && verdictOf(/fetchJson\(`\/api\/jobs\/\$\{encodeURIComponent\(j\.id\)\}\/stop`, \{ method: 'POST' \}\)/.test(L)), 'WIRING: a RESTART (kill → resume) stays killSession — no notice; the one press stops every named job through the user route, a failure said by count');
  // the record-clear rule (test-record-clear-census H7 + I): a clear is news to the notice
  const clearPin = (src) => /const jobs = [^\n]*clearedNow\.has\(j\.id\) && !j\.clearedAt \? \{ \.\.\.j, clearedAt: Date\.now\(\) \}/.test(src) && /if \(shown && ids && m\.cleared\.some\(\(id\) => ids\.has\(id\)\)\) \{ const st = shown\.parentNode; shown\.remove\(\);/.test(src) && /history: \{ m: t\('Background jobs keep running: \{n\}', \{ n: n\.jobs\.length \}\) \}/.test(src) && /res\.length === 1 \? t\('Stopping 1 background job'\) : t\('Stopping \{n\} background jobs', \{ n: res\.length \}\)/.test(src) && !/x\.j\.name/.test(src);
  const cl = M.endNotice([{ ...own('jb-c', 'the cleared words', 'up'), clearedAt: 1 }, own('jb-d', 'kept', 'up')], ['conv-a']);
  ok(gateOf(clearPin(L)) && gateOf(cl) && cl.words.params.names.split(', ').sort().join() === 'jb-c,kept' && !JSON.stringify(cl).includes('the cleared words'), 'THE CLEAR IS NEWS: a clear landing during the GET marks its jobs cleared before the notice (a cleared job is named by its id, never by the words cleared), one landing while it shows takes it down, the toast history keeps the head + count, a failed press is a count');
  const GUARD = "clearedNow.has(j.id) && !j.clearedAt ? { ...j, clearedAt: Date.now() } : j";
  if (!L.includes(GUARD)) ok(false, 'the anchor of the control «clear guard cut» is not in the source');
  else ok(!clearPin(L.replace(GUARD, 'j')), 'CONTROL: the clear guard cut (the answer used as it came) fails the pin');
  const js = fs.readFileSync(path.join(__dirname_jm, '..', 'src/jobs.js'), 'utf8'), ar = fs.readFileSync(path.join(__dirname_jm, '..', 'src/agent-routes.js'), 'utf8'), cli = fs.readFileSync(path.join(__dirname_jm, '..', 'data/bin/vibespace-job'), 'utf8');
  ok(!/stopWithOwner/.test(js) && !/stopWithOwner/.test(cli) && (cli.match(/stop-with-owner/g) || []).length === 2 && gateOf(/if \(unknown\.includes\('stop-with-owner'\)\) \{ console\.error\('--stop-with-owner was retired: /.test(cli)) && gateOf(/if \(b\.stopWithOwner === true\) return res\.status\(400\)\.json\(\{ error: '--stop-with-owner was retired:[^']*', code: 'retired-flag' \}\);/.test(ar)) && verdictOf(/'notifyOk', 'stopWithOwner'\]\);/.test(ar)), 'THE FLAG RETIRED (0 of 2 950 stored jobs carried it): no engine line stores or shows it, the CLI has no such flag, an older CLI\'s false passes, true is refused by name with its door');
}

// ── B-c488 (batch 8): the announce route's comment says what its code requires — control, never «any viewer» ──
{
  const ar = fs.readFileSync(path.join(__dirname_jm, '..', 'src/agent-routes.js'), 'utf8');
  const says = (t) => /else if \(act === 'announce'\) r = a\.jm\.announce\(job, req\.body\?\.text\); \/\/ in-job \(jbt_\) or a holder of CONTROL/.test(t) && /const needsControl = \[[^\]]*'announce'[^\]]*\];/.test(t) && !/announce[^\n]*any viewer/.test(t);
  ok(verdictOf(says(ar)), 'B-c488: the announce verb\'s comment names CONTROL, as its gate (needsControl) requires — never «any viewer»');
  const STALE = "// in-job (jbt_) or any viewer";   // stale-pins: kept — the control writes the stale comment back into a copy
  ok(!says(ar.replace(/\/\/ in-job \(jbt_\) or a holder of CONTROL[^\n]*/, STALE + ' — the watch-job "found something" verb')), 'CONTROL: the stale comment («any viewer») fails the check');
}
// ── B-0bda (batch 8): `vibespace-job run --name x bash /path/gate.sh` ran `sh -c bash` alone — refused by name, the quoted form given ──
{
  const ROOT0 = path.join(__dirname_jm, '..'), CLI0 = path.join(ROOT0, 'data/bin/vibespace-job');
  const env0 = { PATH: process.env.PATH, VIBESPACE_API: 'http://127.0.0.1:9', VIBESPACE_SESSION_TOKEN: 'stand-in' };   // present, never used: the refusal comes before any call
  const run0 = (file, args) => spawnSync(process.execPath, [file, ...args], { env: env0, encoding: 'utf8' });
  const r1 = run0(CLI0, ['run', '--name', 'gate', 'bash', '/srv/lane/gate.sh']);
  ok(r1.status === 2 && verdictOf(/the command must be ONE quoted string — 2 words were given \("bash" "\/srv\/lane\/gate\.sh"\) and only the first would run\. Type: vibespace-job run 'bash \/srv\/lane\/gate\.sh' \[flags\] — nothing was sent/.test(r1.stderr)), 'B-0bda: an unquoted multi-word command is REFUSED by name (exit 2, nothing sent) with the quoted form to type — never a 0-second «ok» of its first word', r1.stderr);
  // the form to type is PROVEN by a shell (the adversarial read r1: a bare join of `bash -c 'cd /x && npm test'` suggested a line that
  // runs `bash -c cd`): the outer shell reads it as ONE word, and sh -c reads that word back into exactly the words given
  const formOf = (stderr) => { const m = /Type: vibespace-job run (.*) \[flags\] — nothing was sent/.exec(stderr || ''); return m ? m[1] : null; };
  const shWords = (text) => { const r = spawnSync('sh', ['-c', 'eval "set -- $1"; for w in "$@"; do printf "%s\\0" "$w"; done', 'sh', text], { encoding: 'utf8' }); return r.status === 0 ? r.stdout.split('\0').slice(0, -1) : null; };
  const roundTrip = (stderr) => { const f = formOf(stderr), outer = f && shWords(f); return outer && outer.length === 1 ? shWords(outer[0]) : null; };
  const r2 = run0(CLI0, ['run', '--name', 'q', "it's", 'here']);
  ok(r2.status === 2 && JSON.stringify(roundTrip(r2.stderr)) === JSON.stringify(["it's", 'here']), 'B-0bda: the form to type quotes a quote as a shell needs it — read back by sh, the same two words', { stderr: r2.stderr, back: roundTrip(r2.stderr) });
  const r2b = run0(CLI0, ['run', '--name', 'g', 'bash', '-c', 'cd /x && npm test']);
  ok(r2b.status === 2 && JSON.stringify(roundTrip(r2b.stderr)) === JSON.stringify(['bash', '-c', 'cd /x && npm test']), 'B-0bda: `bash -c \'cd /x && npm test\'` unquoted — the form quotes EACH word, then the line: sh reads back bash, -c and the one script (never `bash -c cd`)', { stderr: r2b.stderr, back: roundTrip(r2b.stderr) });
  const r2c = run0(CLI0, ['run', '--name', 'g', '--notify-ok', 'bash', '/srv/gate.sh']);
  ok(r2c.status === 2 && JSON.stringify(roundTrip(r2c.stderr)) === JSON.stringify(['bash', '/srv/gate.sh']), 'B-0bda: a flag that takes no value (--notify-ok) never eats the next word — the two words are refused, with their form', r2c.stderr);
  const CSRC = fs.readFileSync(CLI0, 'utf8'), REF = '      if (!isNotify && pos.length > 2) {';
  ok(CSRC.split(REF).length === 2, 'B-0bda control setup: the refusal is one line in the CLI (the plant the control cuts)');
  const MJ0 = mutantCopies('cli-multiword-0bda', ROOT0);
  const copy = MJ0.write('data/bin/vibespace-job', CSRC.replace(REF, '      if (false /* MUTANT: the release — no refusal */) {'), 'release');
  const r3 = run0(copy, ['run', '--name', 'gate', 'bash', '/srv/lane/gate.sh']);
  // the boolean flags' control: the line that keeps them valueless cut — `--notify-ok bash /srv/gate.sh` sends /srv/gate.sh alone
  const BOOL = "    else if (BOOL_FLAGS.has(k)) flags[k] = true;\n";
  ok(CSRC.split(BOOL).length === 2, 'B-0bda control setup: the anchor of the control «a valueless flag» is in the source');
  const copyB = MJ0.write('data/bin/vibespace-job', CSRC.replace(BOOL, '    /* MUTANT: a valueless flag eats the next word */\n'), 'bool-eats');
  const r3b = run0(copyB, ['run', '--name', 'g', '--notify-ok', 'bash', '/srv/gate.sh']);
  ok(!/the command must be ONE quoted string/.test(r3b.stderr) && verdictOf(/server unreachable|ECONNREFUSED|unreachable/.test(r3b.stderr)), 'B-0bda CONTROL (valueless flags cut, in a copy): --notify-ok takes «bash» and the line goes on to SEND /srv/gate.sh alone (here it meets no hub)', r3b.stderr.slice(0, 200));
  ok(!/the command must be ONE quoted string/.test(r3.stderr) && verdictOf(/server unreachable|ECONNREFUSED|unreachable/.test(r3.stderr)), 'B-0bda CONTROL (the release\'s CLI, in a copy): the same line goes on to SEND «bash» alone (here it meets no hub)', r3.stderr.slice(0, 200));
  for (const r of copiesCensus(MJ0.files, MJ0.dir, ROOT0, { minCopies: 2, label: 'B-0bda ' })) ok(verdictOf(r.pass), r.name + (r.pass ? '' : ' — ' + r.detail));
}
console.log(fail ? `\n${fail} FAILED (${pass} passed)` : `\nALL PASS (${pass})`);
process.exit(fail ? 1 : 0); import { verdictOf, gateOf } from './lib/check.mjs';
