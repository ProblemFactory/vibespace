'use strict';
/**
 * THE REMOTE TWIN OF THE CLI LOCATION LAW (B-69ec; lane cli-shell-truth made the person's LOGIN SHELL the truth for where an
 * agent CLI is on the LOCAL road — src/server/cli-cmd.js). A paired machine (an ssh host, a dial device) ran a CLI by its
 * configured NAME through src/remote-shell.js's prelude — an EMULATED login shell (PATH + nvm.sh) — so a CLI the machine
 * user's own shell finds (an nvm other than the default, ~/.opencode/bin, a one-word installer alias) was «not found», and
 * one it does not find failed after the session had started. Now, at a remote create, THAT MACHINE's login shell is asked
 * (src/login-shell.js remoteAskScript — the same ladder, the same line per shell, a sanitized env, no tty — through the hub's
 * existing remote exec, hosts._hostShell: ssh, or the device's run op, so no device update is needed):
 *   path        ⇒ the spawn runs THAT program (an absolute path: the prelude's PATH no longer decides);
 *   none        ⇒ the create is REFUSED by name (code cli-missing, the machine and its shell named) before anything starts;
 *   unanswered  ⇒ the prelude is the FALLBACK rung (the name, as before) and the degradation is named once per answer.
 * Answers are kept per (machine, CLI): a path 10 min, an unanswered ask RECHECK_MS (a hung shell never taxes every create),
 * a `none` never (each create asks again — an install in between is seen). `census(hostId)` is the observed row Manage agents
 * shows on a host. One instance per HostManager (`remoteCliOf(hosts)`). ORCH tier.
 */
const LS = require('../login-shell');
const { buildRemoteShellPrelude } = require('../remote-shell');

const sq = (x) => `'${String(x).replace(/'/g, `'\\''`)}'`;
// THE SCRIPT RUNS UNDER sh ON EVERY ROAD: the ssh road hands it to the remote user's LOGIN shell (zsh never word-splits `$T`;
// fish / tcsh read no sh syntax) — so it is ONE `sh -c '<script>'` word, which every one of them runs as written
const underSh = (script) => `sh -c ${sq(script)}`;
// THE FALLBACK RUNG (the row: «the prelude becomes a fallback rung»): what the remote prelude's PATH holds for the name, asked
// in the same round trip — a shell holding none while the prelude has one runs the name as before (said once). ONE PRELUDE FOR
// THE ASK AND THE SPAWN (batch 63's verdict, its second must): the ask is THE spawn's own composition — src/remote-shell.js
// buildRemoteShellPrelude with the create's integration flag (the node finder and the tools exactly when the spawn has them;
// src/spawn/dial.js, src/spawn/ssh.js) — never a shorter prelude that misses what the spawn would find
const R_PRE = '__VS_RPRE__=';
const askPrelude = (integration) => buildRemoteShellPrelude({ toolsOnPath: !!integration, withNodeFinder: !!integration });
// …and run as the spawn runs it: a LOGIN sh (`sh -lc` — /etc/profile and ~/.profile read, as every spawn ladder's `sh -lc`),
// the sentinel printed INSIDE it (a profile may print; the LAST sentinel line is read)
const preludeAsk = (name, integration) => `sh -lc ${sq(`${askPrelude(integration)}printf '\\n${R_PRE}%s\\n' "$(command -v ${name} 2>/dev/null | head -n 1)"`)} </dev/null 2>/dev/null`;
const preludeOf = (out) => { const l = String(out || '').split(/\r?\n/).reverse().find((x) => x.startsWith(R_PRE)); const p = l ? l.slice(R_PRE.length).trim() : ''; return p.startsWith('/') ? p : null; };
// a found path as ONE sh word (a space, a quote or a `$` in it would break a session that had already started)
const PLAIN_PATH = /^[A-Za-z0-9_@%+=:,./-]+$/;
const shWord = (p) => (PLAIN_PATH.test(p) ? p : sq(p));
/** The program line a remote create runs for a found path: the program as one word, its own directory ahead of the rest of
 *  PATH (a `#!/usr/bin/env node` CLI the shell found beside its node runs on THAT node, not the prelude's) — `env` execs the
 *  program, so the process is the CLI itself. THE VIBESPACE TOOLS STAY FIRST (batch 63's verdict, its first must): the
 *  integrated prelude prepends ~/.vibespace/bin LAST so the agent-browser shim stays ahead of node's own bin dir
 *  (remote-shell buildRemoteShellPrelude) — with `tools` (the create's integration flag: the same prelude put it there) it
 *  stays in front of the CLI's directory too; a pristine spawn (integration off) gets none from this line, even when the
 *  machine's own PATH holds it. */
const programLine = (p, { tools = false } = {}) => `env PATH=${tools ? '"$HOME/.vibespace/bin":' : ''}${shWord(p.replace(/\/[^/]*$/, '') || '/')}:"$PATH" ${shWord(p)}`;

const RECHECK_MS = 5 * 60 * 1000; // an unanswered ask is kept 5 min: a machine whose rc hangs never taxes every create
const PATH_KEEP_MS = 10 * 60 * 1000;
const ASK_MS = 12000;

function createRemoteCli({ hostShell, log = (l) => console.log(l), now = Date.now, recheckMs = RECHECK_MS, pathKeepMs = PATH_KEEP_MS, askMs = ASK_MS } = {}) {
  if (typeof hostShell !== 'function') throw new Error('remote-cli: hostShell is required');
  const rows = new Map(); // `${hostId}\0${backend}` → { name, answer, at, pending, said }
  const keyOf = (h, backend) => `${h && h.id}\u0000${backend}`;
  const machineOf = (h) => String((h && (h.name || h.id)) || '?');
  // a row is one (machine, CLI) under ONE prelude flavor (the integration flag): an answer the other prelude gave is asked again
  const rowOf = (h, backend, name, integration = false) => { const k = keyOf(h, backend); let r = rows.get(k); if (!r || r.name !== name || r.integration !== !!integration) { r = { name, integration: !!integration, answer: null, at: -Infinity, pending: null, said: null }; rows.set(k, r); } return r; };
  /** ONE ask per (machine, CLI) in flight — creates that land together share it. */
  function ask(h, backend, name, { integration = false } = {}) {
    const r = rowOf(h, backend, name, integration);
    if (!r.pending) {
      r.pending = (async () => {
        let a;
        // the create is the consent (a person's press — or an agent's / a job's create through the same handler: the ask is fixed
        // and read-only), never a held Hub-automation ask; bounded HERE too (a road that never answers)
        const shell = (script) => Promise.race([hostShell(h, underSh(script), { timeoutMs: askMs, by: 'system:cli-where', consent: true }),
          new Promise((_, rej) => { const t = setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'timeout' })), askMs + 2000); if (t.unref) t.unref(); })]);
        let out = '';
        try { out = String(await shell(`${LS.remoteAskScript(name, { timeoutS: Math.max(1, Math.floor(askMs / 1000) - 2) })}; ${preludeAsk(name, integration)}`)); a = LS.remoteAnswer(out, name); }
        catch (e) { a = { kind: 'unanswered', why: (e && e.code) === 'timeout' ? 'timeout' : `exec:${String((e && (e.code || e.message)) || 'error').slice(0, 60)}`, shell: null, home: null }; }
        const pre = preludeOf(out);
        if (a.kind === 'none' && pre) a = { ...a, prelude: pre };
        // the installer alias's one word is the ONE path no PATH lookup vetted: it must run THERE (the local road's `usable`)
        if (a.kind === 'path' && a.via === 'alias') {
          let x = '';
          // the look always EXITS 0 (`; true`): a missing target prints nothing and its last test fails — an exec that rejects a
          // non-zero exit with no output (ssh; the parity suite's real sh) made that a throw, read below as «could not look»
          // …and it SAYS it looked (VS_X_ASKED): an exec that came back empty (a dial run that timed out on a hung mount) could not
          // look — as answered, never «missing»
          try { x = String(await shell(`[ -f ${sq(a.path)} ] && [ -x ${sq(a.path)} ] && echo VS_X_RUNS; [ -e ${sq(a.path)} ] && echo VS_X_THERE; echo VS_X_ASKED; true`)); } catch { x = 'VS_X_RUNS'; } // could not look: as answered
          if (!/VS_X_ASKED/.test(x)) x = 'VS_X_RUNS';
          if (!/VS_X_RUNS/.test(x)) a = { ...a, kind: 'none', notExecutable: a.path, dangling: /VS_X_THERE/.test(x) ? 'not-executable' : 'missing' };
        }
        r.answer = { ...a, at: now() }; r.at = now();
        const said = `${a.kind}:${a.path || a.why || ''}`;
        if (said !== r.said) { // ONE journal line per change of the answer
          r.said = said;
          const sh = a.shell ? `${machineOf(h)}'s ${LS.shellName(a.shell)}` : `${machineOf(h)}'s login shell`;
          log(a.kind === 'path' ? `[remote-cli] ${backend}: ${sh} (login shell) found '${name}' at '${a.path}'${a.via === 'alias' ? ' through its alias' : ''}`
            : a.kind === 'none' && a.prelude ? `[remote-cli] ${backend}: ${sh} (login shell) holds no program for '${name}' — the remote prelude's PATH has '${a.prelude}', which runs as before (add its directory to that shell's PATH)`
            : a.kind === 'none' ? `[remote-cli] ${backend}: ${sh} (login shell) holds no program for '${name}'`
              : `[remote-cli] ${backend}: ${sh} could not be asked where '${name}' is (${a.why}) — the remote PATH decides, as before`);
        }
        return r.answer;
      })().finally(() => { r.pending = null; });
    }
    return r.pending;
  }
  const kept = (r) => !!(r && r.answer) && (r.answer.kind === 'path' ? now() - r.at < pathKeepMs : r.answer.kind === 'unanswered' ? now() - r.at < recheckMs : false);
  /** The program a remote create runs for `name` (the CLI's configured NAME) on machine `h`: the absolute path its login shell
   *  found, or `name` (could not be asked: the prelude decides) — or a thrown refusal (code cli-missing) when it holds none. */
  async function forSpawn(h, backend, name, { integration = false } = {}) {
    if (!h || !LS.NAME_OK.test(String(name || ''))) return name; // a path / an odd name: as configured
    const r = rowOf(h, backend, name, integration);
    const a = kept(r) ? r.answer : await ask(h, backend, name, { integration });
    if (a.kind === 'path') return programLine(a.path, { tools: integration });
    if (a.kind === 'none' && a.prelude) return name; // the fallback rung: the prelude's PATH finds it — as before
    if (a.kind === 'none') {
      const sh = a.shell ? LS.shellName(a.shell) : 'sh';
      const e = new Error(a.notExecutable ? `${name} was not found as a program by the ${sh} of ${machineOf(h)} (login shell) — its alias names ${a.notExecutable}, which is ${a.dangling === 'missing' ? 'missing' : 'not executable'}`
        : `${name} was not found as a program by the ${sh} of ${machineOf(h)} (login shell)${a.wrapper ? ` — it wraps the name in ${a.wrapper.kind === 'function' ? 'a function' : 'an alias'}, which VibeSpace does not run` : ''}`);
      Object.assign(e, { code: 'cli-missing', remote: true, backend, cli: name, machine: machineOf(h), hostId: h.id, shell: sh, answer: 'none', wrapper: a.wrapper ? { kind: a.wrapper.kind, text: a.wrapper.text } : null, notExecutable: a.notExecutable || null, dangling: a.dangling || null });
      throw e;
    }
    return name;
  }
  /** THE OBSERVED ROWS of one machine (no ask): backend → { cli, answer, path, via, wrapper, shell, why, at }. */
  function census(hostId) {
    const out = {};
    for (const [k, r] of rows) {
      const [hid, backend] = k.split('\u0000');
      if (hid !== String(hostId) || !r.answer) continue;
      const a = r.answer;
      out[backend] = { cli: r.name, answer: a.kind, prelude: a.prelude || null, path: a.kind === 'path' ? a.path : null, via: a.kind === 'path' ? a.via || 'program' : null, wrapper: a.wrapper ? { kind: a.wrapper.kind, text: a.wrapper.text } : null, shell: a.shell ? LS.shellName(a.shell) : null, why: a.kind === 'unanswered' ? a.why : null, at: a.at };
    }
    return out;
  }
  return { forSpawn, ask, census };
}

/** ONE instance per HostManager (the creates and the status route share its rows). */
const INSTANCES = new WeakMap();
function remoteCliOf(hosts) {
  if (!hosts || typeof hosts._hostShell !== 'function') return null;
  let rc = INSTANCES.get(hosts);
  if (!rc) { rc = createRemoteCli({ hostShell: (h, script, o) => hosts._hostShell(h, script, o) }); INSTANCES.set(hosts, rc); }
  return rc;
}
/** THE CREATE'S ONE CALL (src/ws-create.js, the remote terminal and chat branches): the program to run for `backend` on `h` —
 *  null when the backend has no registered CLI (a shell) or the CLI is an operator's absolute command (as configured). */
async function remoteCmdFor({ hosts, h, backend, name, integrationOn = false }) {
  const rc = remoteCliOf(hosts);
  if (!rc || !h || !name || String(name).includes('/')) return null;
  return rc.forSpawn(h, backend, String(name), { integration: !!integrationOn }); // the spawn's own prelude flavor (one prelude)
}
/** The refusal as the socket carries it (the client draws the cli-missing dialog, the machine named). */
const remoteRefusal = (e, reqId) => ({ type: 'error', code: 'cli-missing', reqId, backend: e.backend, cli: e.cli, machine: e.machine, hostId: e.hostId, shell: e.shell || null, answer: 'none', wrapper: e.wrapper || null, notExecutable: e.notExecutable || null, dangling: e.dangling || null, remote: true, message: e.message });

module.exports = { createRemoteCli, remoteCliOf, remoteCmdFor, remoteRefusal, programLine, askPrelude, RECHECK_MS, PATH_KEEP_MS, ASK_MS };
