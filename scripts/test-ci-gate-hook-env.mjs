#!/usr/bin/env node
// test-ci-gate-hook-env — B-e381's own legs, A PART of THE RELEASE GATE'S OWN GATE (scripts/test-ci-gate.mjs: its head says what
// the gate guards and why). 主开发 r1063 (round wv9ioupy1): «no false row and no debt word on a checkout row: SPLIT» — the unit's
// legs left test-ci-gate-push §4 and test-ci-gate-tiers §8i for this suite, over the kit's pre-push hook rig (hookRig, moved there
// from -push §4, which still drives it). §A the push hook's tiers run in its OWN env (env -i, an allowlist, a private node folder)
// and every refusal it adds — no node, a root that is a link, writable by others, not one's own or unwritable, a folder holding
// more, a manager's shim, a folder made before npm came, a tier path without the bound's timeout — is DRIVEN and goes red for its
// own reason when cut · §B the push's own ALL GREEN line counts a by-name skip (r1037).
import './scratch.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { REPO, GIT_ENV, ok, tmpDirs, mktmp, commit, hookRig, report } from './ci-gate-kit.mjs';

try {

console.log('\n§A the push hook\'s tiers run in its own env — every refusal driven (B-e381 part 2, 主开发 r962 → r1063)');
{
  const { repo, ZERO, runHookRefs, runHook, hookSrc, preFixHook, hookNodeDir } = hookRig('e381-hook');
  const fastOf = (r) => r.calls.filter((c) => c.mode === 'fast');
  // B-e381 part 2 (主开发 r962): THE TIERS RUN IN THE HOOK'S OWN ENV. A push from an interactive shell — its search path carrying
  // a checkout's data/bin and the agent programs' folder, its own NODE_OPTIONS, a session token, the real turn's token, a shell's
  // own variable — must not reach a tier: every fast call and the full launcher are born under `env -i` with the allowlist (a
  // PRIVATE folder holding only node / npm / npx, then the system folders; the service env's names + TZ + the tier's knobs BY
  // NAME; VS_NO_REAL_CLI=1 and VIBESPACE_SKIP_AGENT_HOOKS=1 as the cut scripts set them), and the hook says which node and which
  // path in one line. RED: a copy of the hook with today's pass-through (no env prefix) hands the planted env through.
  {
    const realNode = fs.realpathSync(process.execPath), nodeDir = path.dirname(process.execPath);
    const shellBin = mktmp('e381-shell-bin'), agentBin = mktmp('e381-agent-bin');   // real dirs, no node in them
    const PLANT = { PATH: `${shellBin}:${agentBin}:${nodeDir}:/usr/bin:/bin`, NODE_OPTIONS: '--max-old-space-size=64', VIBESPACE_SESSION_TOKEN: 'vsst_' + 'planted', VIBESPACE_CI_OAT: 'oat-' + 'planted', E381_SHELL_ADDITION: '1', VIBESPACE_CI_FAST_LANES: '2', LC_TIME: 'C.UTF-8' };
    const keyed = new RegExp(`^${hookNodeDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/\\d+$`), hookTZ = ({ ...GIT_ENV, ...PLANT }).TZ;   // ONE folder per node, in this run's scratch
    const tierPathOf = (c) => (c && c.path ? c.path.split(':') : []);
    const clean = (c) => !!c && keyed.test(tierPathOf(c)[0]) && tierPathOf(c).slice(1).join(':') === '/usr/local/bin:/usr/bin:/bin' && !c.keys.includes('NODE_OPTIONS') && !c.keys.includes('VIBESPACE_SESSION_TOKEN') && !c.keys.includes('VIBESPACE_CI_OAT') && !c.keys.includes('E381_SHELL_ADDITION')
      && !c.keys.some((k) => /^GIT_/.test(k)) && c.keys.includes('VS_NO_REAL_CLI') && c.keys.includes('VIBESPACE_SKIP_AGENT_HOOKS') && c.keys.includes('VIBESPACE_CI_FAST_LANES') && c.keys.includes('LC_TIME') && (!hookTZ || c.keys.includes('TZ'));
    const B = commit(repo, 'src/e381.js', '//e381\n', 'E381 — a push from an interactive-looking shell');
    const rEnv = runHook(B, ZERO, PLANT);
    const fe = fastOf(rEnv)[0], he = rEnv.calls.find((c) => c.mode === 'heavy-launch');
    const said = (rEnv.out.split('\n').find((l) => l.startsWith("[ci] the tiers run in the hook's own env:")) || '');
    const privateBin = tierPathOf(fe)[0] || '', tierPath = fe ? fe.path : '';
    const linked = (() => { try { return fs.readlinkSync(path.join(privateBin, 'node')); } catch { return null; } })();
    const holds = (() => { try { return fs.readdirSync(privateBin).sort(); } catch { return []; } })();
    console.log(`    judged (the tier env): ${said} · fast PATH ${fe && fe.path} · heavy-launch PATH ${he && he.path} · fast keys ${fe ? fe.keys.join(',') : '(none)'} · ${privateBin}/node → ${linked}`);
    ok(rEnv.status === 0 && clean(fe) && clean(he) && he.path === fe.path && linked === realNode && holds.includes('node') && holds.every((n) => ['node', 'npm', 'npx'].includes(n)),
      'B-e381: a push from an interactive-looking shell — its data/bin and agent-programs dirs, NODE_OPTIONS, a session token, the real turn\'s token, a shell variable — reaches neither the fast tier nor the full launcher: both are born with a private folder holding only node (its real file) + the system folders, the service env\'s names + TZ, the tier\'s knob by name and the cut scripts\' two switches', { status: rEnv.status, fast: fe, heavy: he, linked });
    ok(said === `[ci] the tiers run in the hook's own env: node ${realNode} (${process.version}) · PATH ${tierPath}${hookTZ ? ` · TZ=${hookTZ}` : ''} (B-e381: no shell additions)`,
      'B-e381: the hook says in ONE line which node (its version) and which search path its tiers run under', said);
    const altDir = mktmp('e381-other-node'), alt = path.join(altDir, 'node');
    fs.writeFileSync(alt, `#!/bin/sh\nexec ${JSON.stringify(realNode)} "$@"\n`); fs.chmodSync(alt, 0o755);
    const rAlt = runHook(B, ZERO, { ...PLANT, PATH: `${altDir}:${PLANT.PATH}` });
    const fa = fastOf(rAlt)[0], altBin = tierPathOf(fa)[0] || '';
    ok(rAlt.status === 0 && keyed.test(altBin) && altBin !== privateBin && fs.readlinkSync(path.join(altBin, 'node')) === fs.realpathSync(alt) && fs.readlinkSync(path.join(privateBin, 'node')) === realNode,
      'B-e381: a push with ANOTHER node gets its own folder — the first one\'s link (a full tier may still run on it) is never swapped', { altBin, privateBin });
    // the folder is trusted only as it was made: a root that is a LINK, and a node's folder holding anything more, are refused
    const realRoot = mktmp('e381-real-root'), linkRoot = path.join(mktmp('e381-link-root'), 'root');
    fs.symlinkSync(realRoot, linkRoot);
    const rLink = runHook(B, ZERO, { ...PLANT, VIBESPACE_HOOK_NODE_DIR: linkRoot });
    fs.writeFileSync(path.join(privateBin, 'git'), '#!/bin/sh\n');
    const rExtra = runHook(B, ZERO, PLANT);
    fs.rmSync(path.join(privateBin, 'git'), { force: true });
    ok(rLink.status === 1 && rLink.out.includes(`[ci] REFUSED — the tiers' private node folder ${linkRoot} is a link, writable by others or not this user's own: nothing was judged — remove it (or set VIBESPACE_HOOK_NODE_DIR to a folder of your own) and push again`) && !fastOf(rLink).length
      && rExtra.status === 1 && rExtra.out.includes(`[ci] REFUSED — ${privateBin} does not hold exactly this push's node (${realNode}) and its npm / npx: nothing was judged — remove ${privateBin} and push again`) && !fastOf(rExtra).length,
      'B-e381: a private-folder root that is a link, and a node folder holding one more entry (a planted git), are REFUSED by name, each with its way out («… and push again») — no tier ran', { link: rLink.out.slice(-200), extra: rExtra.out.slice(-200) });
    // CONTROLS (r6 — each refusal cut in a copy of the hook): the root's refusal block cut ⇒ the linked root is used and the push
    // goes on; the «nothing else» arm of tier_holds cut ⇒ the folder holding the planted git is trusted and the tiers run
    const linkCut = preFixHook('e381-link-cut', [/if \[ -L "\$tier_root" \][^\n]*\n {2}echo "\[ci\] REFUSED — the tiers' private node folder[^\n]*\nfi\n/, '']);
    if (linkCut) {
      const rc = runHookRefs(`refs/heads/main ${B} refs/heads/main ${ZERO}\n`, { ...PLANT, VIBESPACE_HOOK_NODE_DIR: linkRoot }, linkCut);
      ok(rc.status === 0 && !rc.out.includes('is a link, writable by others') && fastOf(rc).length === 1 && tierPathOf(fastOf(rc)[0])[0].startsWith(linkRoot + '/'),
        'B-e381 r6 CONTROL (the root\'s refusal cut, in a copy of the hook): the linked root is used — the tiers run from a folder under the link', { status: rc.status, out: rc.out.slice(-200) });
    }
    const extraCut = preFixHook('e381-extra-cut', ['      *) return 1 ;;\n    esac\n  done\n  for e in npm npx; do', '      *) ;;\n    esac\n  done\n  for e in npm npx; do']);
    if (extraCut) {
      fs.writeFileSync(path.join(privateBin, 'git'), '#!/bin/sh\n');
      const rc = runHookRefs(`refs/heads/main ${B} refs/heads/main ${ZERO}\n`, PLANT, extraCut);
      fs.rmSync(path.join(privateBin, 'git'), { force: true });
      ok(rc.status === 0 && !rc.out.includes('does not hold exactly this push') && fastOf(rc).length === 1 && tierPathOf(fastOf(rc)[0])[0] === privateBin,
        'B-e381 r6 CONTROL (tier_holds\' «nothing else» arm cut, in a copy of the hook): the folder holding the planted git is trusted — the tiers run with it first on their path', { status: rc.status });
    }
    // r6 FOLLOW (主开发 r1121): the root's two OTHER checks and the «could not be made» refusal, each DRIVEN on the real hook, each
    // with its own cut. (The link's control above cuts the whole block: a link's own mode reads 777, so its mode test would refuse
    // it too.) As root every folder is one's own and writable — the legs cannot be driven there: a red with its reason, never a skip.
    const ROOTREF = "is a link, writable by others or not this user's own: nothing was judged — remove it (or set VIBESPACE_HOOK_NODE_DIR to a folder of your own) and push again";
    const stdinB = `refs/heads/main ${B} refs/heads/main ${ZERO}\n`;
    if (typeof process.getuid === 'function' && process.getuid() === 0) {
      ok(false, 'B-e381 r6 follow: this run is root — no folder can be another user\'s or unwritable, so the root\'s checks cannot be driven here');
    } else {
      // (a) writable by others: a real folder of this user's, mode 0777
      const wideRoot = path.join(mktmp('e381-wide-root'), 'root');
      fs.mkdirSync(wideRoot); fs.chmodSync(wideRoot, 0o777);
      const rWide = runHook(B, ZERO, { ...PLANT, VIBESPACE_HOOK_NODE_DIR: wideRoot });
      ok(rWide.status === 1 && rWide.out.includes(`[ci] REFUSED — the tiers' private node folder ${wideRoot} ${ROOTREF}`) && !fastOf(rWide).length,
        'B-e381 r6 follow: a private-folder root writable by others (0777) is REFUSED by name, with its way out — no tier ran', { status: rWide.status, out: rWide.out.slice(-200) });
      const wideCut = preFixHook('e381-wide-cut', [' || (( (8#$(stat -c %a "$tier_root" 2>/dev/null || echo 777) & 8#022) != 0 )); then', '; then']);
      if (wideCut) {
        const rc = runHookRefs(stdinB, { ...PLANT, VIBESPACE_HOOK_NODE_DIR: wideRoot }, wideCut);
        ok(rc.status === 0 && !rc.out.includes(ROOTREF) && fastOf(rc).length === 1 && tierPathOf(fastOf(rc)[0])[0].startsWith(wideRoot + '/'),
          'B-e381 r6 follow CONTROL (the mode test cut, in a copy of the hook): the 0777 root is used — the tiers run from a folder in it', { status: rc.status });
      }
      // (b) not this user's own: a system folder another user owns, writable by nobody else (never written: the hook refuses first)
      const unwritable = (d) => { try { fs.accessSync(d, fs.constants.W_OK); return false; } catch { return true; } };   // never a folder this run CAN write (a capability would let a cut control write there)
      const foreign = ['/usr', '/etc', '/'].find((d) => { try { const st = fs.lstatSync(d); return st.isDirectory() && st.uid !== process.getuid() && (st.mode & 0o022) === 0 && unwritable(d); } catch { return false; } });
      ok(!!foreign, `B-e381 r6 follow: a folder another user owns, that this run cannot write, is there to plant as the root (${foreign || 'none of /usr, /etc, /'})`);
      if (foreign) {
        const rForeign = runHook(B, ZERO, { ...PLANT, VIBESPACE_HOOK_NODE_DIR: foreign });
        ok(rForeign.status === 1 && rForeign.out.includes(`[ci] REFUSED — the tiers' private node folder ${foreign} ${ROOTREF}`) && !fastOf(rForeign).length,
          `B-e381 r6 follow: a private-folder root that is not this user's own (${foreign}) is REFUSED by name — no tier ran`, { status: rForeign.status, out: rForeign.out.slice(-200) });
        const ownCut = preFixHook('e381-own-cut', [' || [ ! -O "$tier_root" ]', '']);
        if (ownCut) {
          const rc = runHookRefs(stdinB, { ...PLANT, VIBESPACE_HOOK_NODE_DIR: foreign }, ownCut);
          ok(rc.status === 1 && !rc.out.includes(ROOTREF) && rc.out.includes(`[ci] REFUSED — the tiers' private node folder could not be made in ${foreign}: nothing was judged`),
            'B-e381 r6 follow CONTROL (the owner test cut, in a copy of the hook): the foreign root passes the root\'s checks — it fails later, for another reason (nothing can be made in it)', { status: rc.status, out: rc.out.slice(-200) });
        }
      }
      // (c) «could not be made»: a real folder of this user's that cannot be written (0500) — the root passes, its node folder cannot be made
      const roRoot = path.join(mktmp('e381-ro-root'), 'root');
      fs.mkdirSync(roRoot); fs.chmodSync(roRoot, 0o500);
      ok(unwritable(roRoot), 'B-e381 r6 follow: a 0500 folder of this user\'s is not writable to this run (the «could not be made» leg rests on it)');
      const MADE = `[ci] REFUSED — the tiers' private node folder could not be made in ${roRoot}: nothing was judged`;
      const rRo = runHook(B, ZERO, { ...PLANT, VIBESPACE_HOOK_NODE_DIR: roRoot });
      ok(rRo.status === 1 && rRo.out.includes(MADE) && !fastOf(rRo).length,
        'B-e381 r6 follow: a private-folder root that cannot be written (0500) is REFUSED by name — «could not be made», no tier ran', { status: rRo.status, out: rRo.out.slice(-200) });
      const madeCut = preFixHook('e381-made-cut', ['|| { echo "[ci] REFUSED — the tiers\' private node folder could not be made in $tier_root: nothing was judged" >&2; exit 1; }', '|| tier_new="$tier_root/.e381-not-made"']);
      if (madeCut) {
        const rc = runHookRefs(stdinB, { ...PLANT, VIBESPACE_HOOK_NODE_DIR: roRoot }, madeCut);
        ok(rc.status === 1 && !rc.out.includes('could not be made') && rc.out.includes('does not hold exactly this push\'s node'),
          'B-e381 r6 follow CONTROL (that refusal cut, in a copy of the hook): the same root fails later, for another reason (the folder it holds is not this push\'s)', { status: rc.status, out: rc.out.slice(-200) });
      }
      fs.chmodSync(roRoot, 0o700);
    }
    // the bound's own program: a tier path without `timeout` is refused by THAT name, never as a manager's shim. Driven in a copy of
    // the hook whose ONE data line — the tier path's system folders — is an empty folder; CONTROL: the same copy with the check cut
    // says the shim's words (the wrong cause, the one the check exists to name)
    const noTimeSys = mktmp('e381-no-timeout-sys');
    const PATH_LINE = 'tier_path="$tier_bin:/usr/local/bin:/usr/bin:/bin"', NOTIME_LINE = /\(PATH="\$tier_path"; type -P timeout\) >\/dev\/null 2>&1 \|\| \{ echo "\[ci\] REFUSED — timeout[^\n]*\n/;
    const noTime = preFixHook('e381-no-timeout', [PATH_LINE, `tier_path="$tier_bin:${noTimeSys}"`]);
    if (noTime) {
      const r = runHookRefs(stdinB, PLANT, noTime);
      ok(r.status === 1 && r.out.includes("[ci] REFUSED — timeout (coreutils: the bound on the version call) is not on the tiers' path (") && r.out.includes(`:${noTimeSys}): nothing was judged`) && !r.out.includes("does not run under the tiers' own env") && !fastOf(r).length,
        'B-e381 r6 follow: a tier path without the bound\'s own program (timeout) is REFUSED by THAT name — not as a manager\'s shim; no tier ran', { status: r.status, out: r.out.slice(-250) });
    }
    const noTimeCut = preFixHook('e381-no-timeout-cut', [PATH_LINE, `tier_path="$tier_bin:${noTimeSys}"`], [NOTIME_LINE, '']);
    if (noTimeCut) {
      const r = runHookRefs(stdinB, PLANT, noTimeCut);
      ok(r.status === 1 && !r.out.includes('timeout (coreutils') && r.out.includes("does not run under the tiers' own env"),
        'B-e381 r6 follow CONTROL (the check cut too): the same path is refused with the shim\'s words — the wrong cause', { status: r.status, out: r.out.slice(-200) });
    }
    // the bound itself, pinned as text (a sleeping node would cost its 10 s): the version call runs under `timeout -k 2 10`, once
    const BOUND = 'timeout -k 2 10 "$tier_bin/node" --version';
    const bounded = (src) => src.split('\n').filter((l) => l.startsWith('tier_ver="$(env -i "PATH=$tier_path"') && l.includes(BOUND)).length === 1;
    ok(bounded(hookSrc), 'B-e381 r6 follow: the banner\'s version call is bounded — `timeout -k 2 10`, on its one line');
    ok(!bounded(hookSrc.replace(BOUND, '"$tier_bin/node" --version')), 'B-e381 r6 follow CONTROL: the call without its bound is refused by the pin');
    const passThrough = preFixHook('e381-pass-through',
      ['      "${tier_env[@]}" node scripts/ci.mjs $kg || {', '      node scripts/ci.mjs $kg || {'],
      ['  "${tier_env[@]}" node scripts/ci.mjs --heavy-launch', '  node scripts/ci.mjs --heavy-launch']);
    if (passThrough) {
      const rOldEnv = runHookRefs(`refs/heads/main ${B} refs/heads/main ${ZERO}\n`, PLANT, passThrough);
      const fo = fastOf(rOldEnv)[0], ho = rOldEnv.calls.find((c) => c.mode === 'heavy-launch');
      ok(!!fo && !!ho && fo.path.startsWith(`${shellBin}:${agentBin}:`) && fo.keys.includes('NODE_OPTIONS') && fo.keys.includes('VIBESPACE_CI_OAT') && ho.keys.includes('E381_SHELL_ADDITION'),
        'B-e381 CONTROL (today\'s pass-through, in a copy of the hook): the planted shell env — its search path, NODE_OPTIONS, the tokens, the shell variable — reaches the tiers', { fast: fo && fo.path, heavy: ho && ho.keys });
    }
    // the CENSUS: every line of the hook that launches a TIER (a ci.mjs call that is no --check-heavy read) is born under tier_env —
    // a fifth launch added tomorrow without it is red by name; its control drops the prefix from the isolated call
    const tierCalls = (src) => src.split('\n').filter((l) => !/^\s*#/.test(l) && /\bnode scripts\/ci\.mjs\b/.test(l) && !/--check-heavy\b/.test(l.split('||')[0]));
    const unprefixed = (src) => tierCalls(src).filter((l) => !/"\$\{tier_env\[@\]\}" node scripts\/ci\.mjs\b/.test(l));
    // the hook's HEAD as text (its comment lines up to the first code line, the `#` margins and line breaks folded): its four phrases
    // are fixed strings (r1063 — a re-wrapped comment says the same); the control drops the last phrase's suite name
    const headText = (src) => { const ls = src.split('\n').slice(1), n = ls.findIndex((l) => !l.startsWith('#')); return ls.slice(0, n < 0 ? ls.length : n).map((l) => l.replace(/^#\s*/, '')).join(' ').replace(/\s+/g, ' '); };
    const HEAD_SAYS = ['the one real vendor turn skipped by name, as at a cut', 'nothing of ours bills a turn nobody typed', 'the turn is proven once a run by the HOSTED fast job', 'the part holding test-chat-e2e, with VIBESPACE_CI_OAT'];
    const headSays = (src) => HEAD_SAYS.every((p) => headText(src).includes(p));
    ok(headSays(hookSrc), 'B-e381 (r1037): the hook\'s head says its one real turn is skipped by name and WHERE it is still proven (the hosted fast job\'s part holding test-chat-e2e) — four phrases, fixed strings', headText(hookSrc).slice(0, 600));
    const noPart = hookSrc.replace('holding test-chat-e2e, with', 'holding the chat suite, with');
    ok(noPart !== hookSrc && !headSays(noPart), 'B-e381 CONTROL: a head that no longer names where the turn is proven is refused by the pin');
    ok(tierCalls(hookSrc).length === 4 && unprefixed(hookSrc).length === 0, `B-e381 census: the hook's tier launches are ${tierCalls(hookSrc).length} (three fast calls, the full launcher), each under tier_env`, unprefixed(hookSrc));
    const bare = hookSrc.replace('"${tier_env[@]}" node scripts/ci.mjs --isolate', 'node scripts/ci.mjs --isolate');
    ok(bare !== hookSrc && unprefixed(bare).length === 1 && /--isolate/.test(unprefixed(bare)[0]), 'B-e381 census CONTROL: the hook with the isolated call outside tier_env is refused, naming that line');
    // no node on the push's path ⇒ REFUSED by name at the hook's TOP — DRIVEN on every machine (主开发 r1039's law): a planted search
    // path holding only bash and git (the hook's first line needs git; nothing else runs before the refusal), never a node —
    // each from the system folders, else from this run's own PATH (a git under /opt is found too).
    // CONTROL: the hook with that refusal cut does not say it (its secret scan then dies on the missing node: another failure)
    const noNodeBin = mktmp('e381-no-node-bin');
    const isProgram = (f) => { try { fs.accessSync(f, fs.constants.X_OK); return fs.statSync(f).isFile(); } catch { return false; } };
    for (const t of ['bash', 'git']) { const at = ['/usr/local/bin', '/usr/bin', '/bin', ...(process.env.PATH || '').split(':').filter((d) => d.startsWith('/'))].map((d) => path.join(d, t)).find(isProgram); if (at) fs.symlinkSync(at, path.join(noNodeBin, t)); }
    const NOREF = "[ci] REFUSED — no node on this push's PATH: the gate cannot run, nothing was judged";
    const rNoNode = runHookRefs(`refs/heads/main ${B} refs/heads/main ${ZERO}\n`, { PATH: noNodeBin });
    ok(fs.existsSync(path.join(noNodeBin, 'git')) && rNoNode.status === 1 && rNoNode.out.includes(NOREF) && !rNoNode.calls.length,
      'B-e381: no node on the push\'s path is REFUSED by name at the hook\'s top — no step ran (no false GATE RED, no «could not read»), driven on every machine', { status: rNoNode.status, out: rNoNode.out.slice(-300) });
    const cutRefusal = preFixHook('e381-no-node-cut', [`command -v node >/dev/null 2>&1 || { echo "${NOREF}" >&2; exit 1; }\n`, '']);
    if (cutRefusal) {
      const rCut = runHookRefs(`refs/heads/main ${B} refs/heads/main ${ZERO}\n`, { PATH: noNodeBin }, cutRefusal);
      ok(!rCut.out.includes(NOREF) && rCut.status !== 0, 'B-e381 CONTROL (the top refusal cut, in a copy of the hook): the same push says no such words — it fails elsewhere, for another reason', { status: rCut.status, out: rCut.out.slice(-200) });
    }
    // r6 (主开发 r1063 MUST 2): THE TWO REFUSALS r5 ADDED, DRIVEN — each goes red for its own reason when its refusal is cut.
    const viaNode = (dir, body) => { const f = path.join(dir, 'node'); fs.writeFileSync(f, `#!/bin/sh\n${body}exec ${JSON.stringify(realNode)} "$@"\n`); fs.chmodSync(f, 0o755); return f; };
    // (a) a node that runs only with its manager's variable present (a version manager's shim): the push's own steps run it
    //     (the variable is set there), the tiers' own env does not ⇒ REFUSED at the banner by name, no tier ran.
    //     CONTROL: the banner's refusal cut in a copy ⇒ no such words; the tier dies inside instead (GATE RED, a red about the tree)
    const shim = viaNode(mktmp('e381-shim'), '[ -n "$E381_MANAGER" ] || { echo "no manager" >&2; exit 3; }\n');
    const SHIM_ENV = { PATH: `${path.dirname(shim)}:${nodeDir}:/usr/bin:/bin`, E381_MANAGER: '1' };
    const SHIMREF = `[ci] REFUSED — the node this push resolves (${shim} → ${fs.realpathSync(shim)}) does not run under the tiers' own env (a version manager's shim needs its manager on PATH; its --version has 10 s): point PATH at a real node and push again — nothing was judged`;
    const rShim = runHook(B, ZERO, SHIM_ENV);
    ok(rShim.status === 1 && rShim.out.includes(SHIMREF) && !fastOf(rShim).length && !rShim.calls.some((c) => c.mode === 'heavy-launch'),
      'B-e381 r6: a node that runs only with its manager\'s variable present (a shim) is REFUSED at the banner by name — no tier ran', { status: rShim.status, out: rShim.out.slice(-300) });
    const shimCut = preFixHook('e381-shim-cut', [/case "\$tier_ver" in v\[0-9\]\*\) ;; \*\) echo "\[ci\] REFUSED — the node this push resolves[^\n]*\n/, '']);
    if (shimCut) {
      const rc = runHookRefs(`refs/heads/main ${B} refs/heads/main ${ZERO}\n`, SHIM_ENV, shimCut);
      ok(rc.status === 1 && !rc.out.includes('does not run under the tiers\' own env') && /GATE RED — push blocked/.test(rc.out) && !fastOf(rc).length,
        'B-e381 r6 CONTROL (the banner\'s refusal cut, in a copy of the hook): the same push says no such words — its tier dies inside the env (GATE RED, a red about the tree)', { status: rc.status, out: rc.out.slice(-200) });
    }
    // (b) a folder made when no npm sat beside node is NOT trusted once one does ⇒ REFUSED with its way out, and the way out
    //     works (the folder removed, the next push makes it whole). CONTROL: the distrust cut in a copy ⇒ the stale folder is trusted
    const nodeW = viaNode(mktmp('e381-npm-later'), ''), realW = fs.realpathSync(nodeW);
    const NPM_ENV = { PATH: `${path.dirname(nodeW)}:${nodeDir}:/usr/bin:/bin` };
    const first = runHook(B, ZERO, NPM_ENV), madeBin = tierPathOf(fastOf(first)[0])[0] || '';
    const madeHeld = (() => { try { return fs.readdirSync(madeBin).sort().join(','); } catch { return ''; } })();
    fs.writeFileSync(path.join(path.dirname(nodeW), 'npm'), '#!/bin/sh\necho npm\n'); fs.chmodSync(path.join(path.dirname(nodeW), 'npm'), 0o755);
    const later = runHook(B, ZERO, NPM_ENV);
    const WAYOUT = `[ci] REFUSED — ${madeBin} does not hold exactly this push's node (${realW}) and its npm / npx: nothing was judged — remove ${madeBin} and push again`;
    ok(first.status === 0 && keyed.test(madeBin) && madeHeld === 'node' && later.status === 1 && later.out.includes(WAYOUT) && !fastOf(later).length,
      'B-e381 r6: a private folder made when no npm sat beside node (it holds node alone) is NOT trusted once one does — REFUSED by name with its way out («remove … and push again»), no tier ran', { first: first.status, madeHeld, later: later.status, out: later.out.slice(-300) });
    const npmCut = preFixHook('e381-npm-cut', [/ {2}for e in npm npx; do {3}# one that sits beside node NOW[^\n]*\n[^\n]*\n {2}done\n/, '']);
    if (npmCut) {
      const rc = runHookRefs(`refs/heads/main ${B} refs/heads/main ${ZERO}\n`, NPM_ENV, npmCut);
      ok(rc.status === 0 && !rc.out.includes(WAYOUT) && fastOf(rc).length === 1 && tierPathOf(fastOf(rc)[0])[0] === madeBin,
        'B-e381 r6 CONTROL (the distrust cut, in a copy of the hook): the folder made before npm came is trusted — the tiers run without the npm beside their node', { status: rc.status });
    }
    fs.rmSync(madeBin, { recursive: true, force: true });   // the way out, as the words say it
    const after = runHook(B, ZERO, NPM_ENV);
    const npmLink = (() => { try { return fs.readlinkSync(path.join(madeBin, 'npm')); } catch { return null; } })();
    ok(after.status === 0 && npmLink === path.join(path.dirname(realW), 'npm') && fastOf(after).length === 1,
      'B-e381 r6: …and the way out works — the folder removed, the next push makes it whole (node and the npm beside it)', { status: after.status, npmLink });
  }
}

// ── §B THE PUSH'S OWN ALL GREEN LINE COUNTS A BY-NAME SKIP (B-e381, 主开发 r1037; moved from test-ci-gate-tiers §8i) ──
// The hook's tiers run with VS_NO_REAL_CLI=1 (the cut scripts' switch: the one real vendor turn is skipped by name), so the push's
// own closing line says which suites were SKIPPED by name, «not run and not passed». (A red of mount-guard refusals is an
// ordinary red — 主开发 r1063's other option, taken in r6: no label and no special rule; nothing here for it.)
console.log('\n§B the push\'s own ALL GREEN line counts a by-name skip (B-e381, 主开发 r1037)');
{
  const cs = fs.readFileSync(path.join(REPO, 'scripts', 'ci.mjs'), 'utf-8');
  const greenLine = (x) => /ALL GREEN — fast gate[^\n]*\$\{skippedByName\.length \? ` — SKIPPED by name, not run and not passed: \$\{skippedByName\.join\(', '\)\}` : ''\}\$\{skipCount\(skippedLegs\)\}/.test(x);
  ok(greenLine(cs), 'B-e381 (r1037): the fast tier\'s ALL GREEN line names every suite skipped by name («not run and not passed») — the hook\'s skipped real turn is counted on the push\'s own closing line');
  ok(!greenLine(cs.replace("${skippedByName.length ? ` — SKIPPED by name, not run and not passed: ${skippedByName.join(', ')}` : ''}", '')), 'B-e381 CONTROL: the line as it was (only absent suites counted) is refused by the pin');
}

} finally {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch {} }
}
report();
