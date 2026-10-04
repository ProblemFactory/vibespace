'use strict';
// THE EXIT CALL IN THE TRANSCRIPT (lane exit-calls-in-history, 2026-10-04 — the owner: "对话历史里的exit指令似乎没有正确识别和
// 渲染"). A `vibespace-exit` call is a MACHINE command in the chat, live AND after a rebuild. The "Machines · <machine>" card
// is a LIVE injected card (src/exit-proxy.js emitCard → message-manager injectPeerCard): it is not in the CLI's transcript,
// so a reload / page-in / resume / restart had only the generic "Bash · Input · ✓ <first line>" card. This module reads
// ONE claude Bash call — its command line and its tool_result text (stdout, then stderr, "Exit code N" first when it
// failed) — as the call it was: the machine, the verb, the user's command (whole, as the CLI sent it), and the outcome
// read from the CLI's OWN lines (data/bin/vibespace-exit: "# ran on <machine> — exit N, X s (recorded)", the transfer
// line, "vibespace-exit: <the server's refusal sentence>"). It then builds the same card words the live card carries
// (src/exit-reach.js cardText / transferCardText / outputHeads / cardOutput), so ONE call draws ONE card, the same live
// and in history. PURE: the server (the live card upgrades its own pending Bash call in place) and the bundle share it.
// NEVER GUESSES: a line the shell would expand ($, a glob, ~, a substitution), a pipe, a second command, a redirection
// other than 2>&1, an output whose last line is not the CLI's own, an exit code that disagrees with that line ⇒ null —
// the call stays a plain Bash card.
const E = require('./exit-reach.js');
const HC = require('./hidden-chars.js');

const VERBS = Object.freeze(['run', 'push', 'pull', 'list', 'runs', 'use', 'url']);
const INFO_VERBS = Object.freeze(['list', 'runs', 'use', 'url']);
const BIN = /^(?:[A-Za-z0-9_.\-/]*\/)?vibespace-exit$/;
const ENV_WORD = /^[A-Za-z_][A-Za-z0-9_]*=/;
// the CLI's own lines (data/bin/vibespace-exit — test-exit-call pins each against the file)
const WAIT_NOTES = Object.freeze(["# waiting for the user's approval (up to 60 s)…", "# waiting for the user's approval (up to 60 s) if the machine asks…"]);
const WAY_OUT_LINE = '  way out: ask the user to allow this conversation under "Who can use it" on the machine row (Remote tab)';
const REFUSAL = /^vibespace-exit(?: push)?: (.+)$/;
const RAN = /^# ran on (.+) — (?:exit (-?\d+)|timed out after \d+ s), (\d+\.\d) s(?: — OUTPUT CUT \(.*\))? \(recorded\)$/;
const EGRESS = /^# egress via "(.+)" \(socks5h, /;
const HARNESS_TAIL = /^Shell cwd was reset to \S.*$/; // claude's own note after a `cd` (never the CLI's)

/**
 * ONE shell line → its simple commands as words, or null when a word is not provably what the program received
 * (an expansion, a glob, a leading ~, a substitution, a heredoc, a redirection other than a trailing 2>&1, a pipe, `;`,
 * `||`, a background `&`, a newline, an unbalanced quote). → `[{words, op}]` where op joins it to the next ('&&' | null).
 */
function commandsOf(line) {
  const s = String(line == null ? '' : line);
  const segs = [];
  let words = [], tok = null, i = 0;
  const end = () => { if (tok !== null) words.push(tok); tok = null; };
  while (i < s.length) {
    const c = s[i];
    if (c === "'") { const j = s.indexOf("'", i + 1); if (j < 0) return null; tok = (tok || '') + s.slice(i + 1, j); i = j + 1; continue; }
    if (c === '"') {
      let j = i + 1, buf = '';
      for (; j < s.length && s[j] !== '"'; j++) {
        if (s[j] === '\\' && '$`"\\'.includes(s[j + 1] || '')) { buf += s[++j]; continue; }
        if (s[j] === '\\' && s[j + 1] === '\n') return null;
        if (s[j] === '$' || s[j] === '`') return null;
        buf += s[j];
      }
      if (j >= s.length) return null;
      tok = (tok || '') + buf; i = j + 1; continue;
    }
    if (c === '\\') { if (i + 1 >= s.length || s[i + 1] === '\n') return null; tok = (tok || '') + s[i + 1]; i += 2; continue; }
    if (c === ' ' || c === '\t') { end(); i++; continue; }
    if (c === '&' && s[i + 1] === '&') { end(); if (!words.length) return null; segs.push({ words, op: '&&' }); words = []; i += 2; continue; }
    if (c === '2' && tok === null && s.startsWith('2>&1', i) && /^(?:[ \t]|$)/.test(s.slice(i + 4, i + 5))) { words.push({ redirect: '2>&1' }); i += 4; continue; }
    if ('|;&<>()`$*?[]{}\n\r#'.includes(c)) return null;
    if (c === '~' && tok === null) return null;
    tok = (tok || '') + c; i++;
  }
  end();
  if (!words.length) return null;
  segs.push({ words, op: null });
  return segs;
}

/** The CLI's argv → `{verb, ref, …}` exactly as data/bin/vibespace-exit reads it, or null (help, a usage error, unknown). */
function argsOf(argv) {
  const [verb, ...rest] = argv;
  if (!VERBS.includes(verb)) return null;
  if (verb === 'list') return { verb };
  if (verb === 'runs') {
    const li = rest.indexOf('--limit');
    const ref = rest.filter((a, k) => a !== '--limit' && k !== (li >= 0 ? li + 1 : -1)).join(' ').trim();
    return { verb, ref };
  }
  if (verb === 'use' || verb === 'url') return { verb, ref: rest[0] || '' };
  if (verb === 'run') {
    const dd = rest.indexOf('--');
    const ref = dd >= 0 ? rest.slice(0, dd).join(' ').trim() : (rest[0] || '');
    const command = (dd >= 0 ? rest.slice(dd + 1) : rest.slice(1)).join(' ').trim();
    return command ? { verb, ref, command } : null;
  }
  const overwrite = rest.includes('--overwrite');
  const w = rest.filter((a) => a !== '--overwrite');
  if (verb === 'pull') return w.length >= 2 && w.length <= 3 ? { verb, ref: w[0], remote: w[1], local: w[2] || '', overwrite } : null;
  return w.length === 3 ? { verb, ref: w[1], remote: w[2], local: w[0], overwrite } : null;
}

/** A Bash command line → the ONE vibespace-exit call it is (behind `cd … &&`, env assignments or a path to the binary), or null. */
function exitCommandOf(line) {
  const segs = commandsOf(line);
  if (!segs) return null;
  for (let k = 0; k < segs.length - 1; k++) {
    const w = segs[k].words;
    if (!(w.length === 2 && w[0] === 'cd' && typeof w[1] === 'string')) return null;
  }
  let w = segs[segs.length - 1].words;
  if (w.length && typeof w[w.length - 1] === 'object') w = w.slice(0, -1); // a trailing 2>&1 merges what claude merges anyway
  if (w.some((x) => typeof x !== 'string')) return null;
  while (w.length && ENV_WORD.test(w[0])) w = w.slice(1);
  if (!w.length || !BIN.test(w[0])) return null;
  return argsOf(w.slice(1));
}

const lower = (s) => String(s || '').toLowerCase();
/** Is `machine` (a name the hub said) one the agent's `ref` can name? (exit-reach resolveMachine: id / name / substring) */
const refNames = (ref, machine) => !ref || lower(ref) === lower(machine) || lower(machine).includes(lower(ref)) || lower(ref).includes(lower(machine));
const shown = (s) => HC.revealHidden(String(s == null ? '' : s));
const headOf = (s, n = 80) => { const c = shown(String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ')).replace(/`/g, "'"); return c.length > n ? c.slice(0, n - 1) + '…' : c; };

/**
 * THE PARSE: a claude Bash call's command + its tool_result text (+ whether claude marked it an error) → the call, or
 * null. → `{verb, ref, command?, remote?, local?, machine, kind: 'run'|'copy'|'info', outcome: 'ok'|'exit'|'timed_out'
 * |'failed', code, ms, timedOut, truncated, said, output}` — `said` = the refusal sentence, `output` = the text the call
 * printed other than the CLI's own lines (stdout then stderr, as claude merged them).
 */
function exitCallOf(command, result, { error = false } = {}) {
  const call = exitCommandOf(command);
  if (!call || typeof result !== 'string') return null;
  let text = result.replace(/\r\n/g, '\n');
  let exitCode = 0;
  const ec = /^Exit code (\d+)(?:\n|$)/.exec(text);
  if (ec) { exitCode = Number(ec[1]); text = text.slice(ec[0].length); }
  if (!!error !== exitCode > 0) return null;   // "Exit code N" is claude's mark of a failed call — and only that
  const lines = text.split('\n');
  while (lines.length && (!lines[lines.length - 1].trim() || HARNESS_TAIL.test(lines[lines.length - 1]))) lines.pop();
  const kept = lines.filter((l) => !WAIT_NOTES.includes(l));
  const out = { ...call, machine: '', kind: call.verb === 'run' ? 'run' : INFO_VERBS.includes(call.verb) ? 'info' : 'copy', outcome: 'failed', code: null, ms: 0, timedOut: false, truncated: false, said: '', output: '' };
  // a refusal: the server's sentence (and the way out when a grant is missing) is ALL the call printed
  const way = kept.length && kept[kept.length - 1] === WAY_OUT_LINE ? 1 : 0;
  const ref0 = kept.length === 1 + way ? REFUSAL.exec(kept[0]) : null;
  if (ref0) {
    if (!exitCode) return null;
    out.said = ref0[1];
    out.code = exitCode;
    return out;
  }
  if (call.verb === 'run') {
    const last = kept.length ? kept[kept.length - 1] : '';
    const m = RAN.exec(last);
    if (!m) return null;
    const machine = m[1], timedOut = m[2] === undefined, code = timedOut ? null : Number(m[2]);
    const ms = Math.round(Number(m[3]) * 1000), truncated = / — OUTPUT CUT \(/.test(last);
    if (E.cliLine({ outcome: 'ran', code, ms, timedOut, truncated }, { machine }) !== last) return null; // the producer's own words, or not ours
    if (!refNames(call.ref, machine)) return null;
    if (exitCode !== (timedOut ? 124 : code)) return null;
    return { ...out, machine, outcome: timedOut ? 'timed_out' : code === 0 ? 'ok' : 'exit', code: timedOut ? 124 : code, ms, timedOut, truncated, output: kept.slice(0, -1).join('\n') };
  }
  if (call.verb === 'pull' || call.verb === 'push') {
    if (exitCode || kept.length !== 1) return null;
    const line = kept[0];
    const m = /^(?:pulled|pushed) .+? — ([\d.]+ \w+) \((\d+) bytes\) · (?:sha256 ([0-9a-f]{64}) verified|size verified \(the machine's agent predates sha256\)) · (\d+\.\d) s$/.exec(line);
    if (!m) return null;
    const bytes = Number(m[2]), sha256 = m[3] || null, verified = sha256 ? 'sha256' : 'size', ms = Math.round(Number(m[4]) * 1000);
    const lead = call.verb === 'pull' ? `pulled ${call.remote} from "` : `pushed `;
    if (!line.startsWith(lead)) return null;
    // the machine and the resolved local path: the ONE split that rebuilds the CLI's line exactly
    const hits = [];
    const sep = /" → /g;
    for (let mm; (mm = sep.exec(line));) {
      let machine, local, remote = call.remote;
      if (call.verb === 'pull') { machine = line.slice(lead.length, mm.index); local = line.slice(mm.index + 4).replace(/ — [\d.]+ \w+ \(\d+ bytes\) · .*$/, ''); }
      else {
        const to = line.lastIndexOf(' to "', mm.index);
        if (to < 0) continue;
        local = line.slice(lead.length, to); machine = line.slice(to + 5, mm.index);
      }
      if (E.transferCliLine({ verb: call.verb, remote, local, bytes, sha256, verified, ms }, { machine }) === line) hits.push({ machine, local });
    }
    if (hits.length !== 1 || !refNames(call.ref, hits[0].machine)) return null;
    return { ...out, machine: hits[0].machine, local: hits[0].local, outcome: 'ok', code: 0, ms, bytes, sha256, verified };
  }
  // list / runs / use / url: informational — exit 0 and what it printed
  if (exitCode) return null;
  let machine = '';
  if (call.verb === 'use') { const eg = kept.map((l) => EGRESS.exec(l)).find(Boolean); if (!eg || !refNames(call.ref, eg[1])) return null; machine = eg[1]; }
  else if (call.verb === 'url' || call.verb === 'runs') machine = call.ref || '';
  return { ...out, machine, outcome: 'ok', code: 0, output: kept.join('\n') };
}

// int209 (the integration — a lookup row read ENGLISH in a zh UI): a lookup (list / runs / use / url) has no live card and
// the CLI prints a table, not a sentence — these words are OURS, so they are keys the chat translates (chat-renderers
// renderToolMsg: t(key, params)); `said` = the hub's own refusal sentence, kept as said
const INFO_WORDS = Object.freeze({
  list: "listed the machines open to this conversation",
  runs: "listed this conversation's commands",
  runsOn: "listed this conversation's commands on {machine}",
  use: "borrowed {machine}'s network (proxy settings for one shell line)",
  url: "asked for {machine}'s proxy address",
  urlAny: "asked for the machine's proxy address",
  listFail: "could not list the machines open to this conversation — {said}",
  runsFail: "could not list this conversation's commands — {said}",
  runsOnFail: "could not list this conversation's commands on {machine} — {said}",
  useFail: "could not borrow {machine}'s network (proxy settings for one shell line) — {said}",
  urlFail: "could not ask for {machine}'s proxy address — {said}",
  urlAnyFail: "could not ask for the machine's proxy address — {said}",
});
/** A lookup's words → `{key, params}` (key = the English INFO_WORDS row; params machine / said). */
function infoWordsOf(c) {
  const machine = shown(c.machine || c.ref || '');
  const k = c.verb === 'list' ? 'list' : c.verb === 'runs' ? (machine ? 'runsOn' : 'runs') : c.verb === 'use' ? 'use' : machine ? 'url' : 'urlAny';
  return { key: INFO_WORDS[c.said ? k + 'Fail' : k], params: { machine, said: c.said ? shown(c.said) : '' } };
}

/** The card's words for a parsed call — the live card's own words (exit-reach) where the live card has them. */
function callWords(c) {
  const M = shown(c.machine || c.ref || '');
  if (c.kind === 'run') {
    // a refusal: the hub's own sentence says where (and the machine it names); the card does not guess one
    if (c.said) return `did not run \`${headOf(E.commandHeadOf(c.command))}\` — ${shown(c.said)}`;
    return E.cardText({ outcome: 'ran', cmd: c.command, code: c.timedOut ? null : c.code, ms: c.ms, timedOut: c.timedOut }, { machine: M });
  }
  if (c.kind === 'copy') {
    if (c.said) return c.verb === 'pull' ? `did not pull \`${headOf(c.remote)}\` — ${shown(c.said)}` : `did not push \`${headOf(c.local)}\` — ${shown(c.said)}`;
    return E.transferCardText({ verb: c.verb, outcome: 'done', remote: shown(c.remote), local: shown(c.local), bytes: c.bytes, sha256: c.sha256, verified: c.verified, ms: c.ms }, { machine: M });
  }
  const w = infoWordsOf(c);
  return w.key.replace(/\{(machine|said)\}/g, (_, k) => w.params[k]);
}

/**
 * The parsed call → THE Machines card it draws (the shape message-manager's injected card has: a VibeSpace notice from
 * "Machines · <machine>", the words, `exitRun` = cardOutput of the heads), plus `exitCall` = what the fold reads
 * (`{machine, verb: 'run'|'copy'|'info', outcome, code, failed}` — the machine '' when the CLI never named one: it joins
 * any machine's group). The output goes through THE heads (4 KiB, URL secrets cut, secret shapes, the belt) — `merged`:
 * claude keeps stdout and stderr as one text. null for null.
 */
function exitCallCard(c, { id = null, ts = 0 } = {}) {
  if (!c) return null;
  const failed = c.outcome !== 'ok';
  const verb = c.kind;
  const name = c.machine || (c.kind === 'info' ? '' : c.ref) || '';
  const heads = E.outputHeads({ stdout: c.output || '', stderr: '' });
  // as the live card: a command that RAN carries its output block (the whole command above it), an informational call its
  // output behind the row; a copy and a refusal are their words alone
  const exitRun = c.said || c.kind === 'copy' ? null : { ...E.cardOutput({ cmd: c.kind === 'run' ? c.command : null, code: c.kind === 'run' && !c.timedOut ? c.code : null, ms: c.ms, timedOut: c.timedOut, truncated: c.truncated, heads }), merged: true };
  return {
    id, ts, role: 'user', status: 'complete', originKind: 'peer-message', peerVia: 'notification',
    peerFrom: name ? `Machines · ${shown(name)}` : 'Machines',
    content: [{ type: 'text', text: callWords(c) }],
    ...(exitRun ? { exitRun } : {}),
    exitCall: { machine: shown(c.machine || ''), verb, cliVerb: c.verb, outcome: c.outcome, code: c.code, failed, info: verb === 'info', ...(verb === 'info' ? { words: infoWordsOf(c) } : {}) },
  };
}

/**
 * THE LIVE PAIRING (message-manager injectPeerCard): does the injected "Machines · <machine>" card with `text` (and
 * `exitRun`) belong to the PENDING Bash call `command`? Its verb, its machine (the agent's ref names it) and its command
 * (run: the whole command the hub ran; a copy: the path as the card shows it) must agree. Display only.
 */
function cardBelongsTo(command, { machine = '', text = '', exitRun = null } = {}) {
  const call = exitCommandOf(command);
  if (!call || !['run', 'pull', 'push'].includes(call.verb)) return false;
  const t = String(text || '');
  const verb = /^(ran|did not run|could not finish|could not start) /.test(t) ? 'run' : /^(pulled|did not pull) /.test(t) ? 'pull' : /^(pushed|did not push) /.test(t) ? 'push' : null;
  if (verb !== call.verb || !refNames(call.ref, machine)) return false;
  const segs = [...t.matchAll(/`([^`]*)`/g)].map((m) => m[1]);
  const quoted = segs[0];
  if (verb === 'run') {
    if (exitRun && typeof exitRun.cmd === 'string') return exitRun.cmd === E.cleanLines(call.command, E.CMD_MAX);
    const want = (/`([^`]*)`/.exec(E.cardText({ outcome: 'denied', cmd: call.command }, { machine })) || [])[1];
    return quoted !== undefined && quoted === want;
  }
  // a copy: the remote path as the agent typed it (the local one the CLI resolved — a push names it by its file name)
  const rem = headOf(call.remote).slice(0, 40);
  if (segs.some((q) => q.slice(0, 40) === rem)) return true;
  const base = headOf(String(call.local).split('/').pop() || '');
  return verb === 'push' && !!base && quoted !== undefined && (quoted === headOf(call.local) || quoted.endsWith('/' + base));
}

/** The live card's matcher, handed to message-manager with the card (server.js emitCard): `(command) => cardBelongsTo`. */
function cardMatcher(card) {
  const from = String((card && card.fromName) || '').trim();
  if (!from.startsWith('Machines · ')) return null;
  const facts = { machine: from.slice('Machines · '.length), text: String(card.text || '').trim(), exitRun: card.exitRun || null };
  return (command) => cardBelongsTo(command, facts);
}

module.exports = { cardMatcher, VERBS, INFO_VERBS, WAIT_NOTES, WAY_OUT_LINE, commandsOf, argsOf, exitCommandOf, exitCallOf, exitCallCard, callWords, INFO_WORDS, infoWordsOf, cardBelongsTo };
