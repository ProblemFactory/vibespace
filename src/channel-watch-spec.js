'use strict';
// THE AGENT'S WATCH GRAMMAR (lane agent-watch-parity — the owner, 2026-10-07: "看一下这些通知功能有关的配置和参数是不是
// agent 也能调用"). PURE, CJS, DOM-free. `vibespace-channels watch <conv|account> …` used to carry a crude subset
// (mode + keywords + cap) while the owner's Notify… dialog sets every rule kind; this is the ONE door the agent's flags
// go through: flags (or a whole `--spec` JSON row) → the SAME watcher row the dialog saves ({notify, mode, filter:{match,
// rules}, digestMinutes, dailyWakeCap} + the agent's `delivery`), JUDGED BY THE DIALOG'S OWN VALIDATORS
// (channel-filter.js `validateFilter` → `validateRule` → `regexVerdict`, and `validateWatcher`) — no second schema: a
// row the dialog refuses, the agent is refused the same way, with the validator's own code and words. The server runs it
// (src/agent-routes.js watchVerb hands the raw argv here; the CLI ships to other machines and parses nothing), so the
// kinds offered are the SERVER'S version's. Authority is unchanged: access, reach and policy stay the owner's; a wake
// or a digest (billed turns) is still ONE request the user approves (src/server/channels-access.js agentWatch).
const F = require('./channel-filter.js');

const split = (v) => String(v === null || v === undefined ? '' : v).split(',').map((x) => x.trim()).filter(Boolean);
const refuse = (code, error, extra) => ({ ok: false, code, error, ...(extra || {}) });

/** THE FLAG TABLE — one row per message rule kind the CLI offers: `flag`, whether it takes a value, and the rule(s) it
 *  makes (the validator judges them). `since` = a kind that may not be on this server yet (refused by name until it is). */
const RULE_FLAGS = Object.freeze([
  { kind: 'mention', flag: '--mention', value: 'name[,name]', rules: (v) => (split(v).length ? split(v) : ['']).map((value) => ({ kind: 'mention', value })) },
  { kind: 'keyword', flag: '--keyword', value: 'word[,word]', rules: (v) => (split(v).length ? split(v) : ['']).map((value) => ({ kind: 'keyword', value })) },
  { kind: 'regex', flag: '--regex', value: 'pattern', rules: (v) => [{ kind: 'regex', value: String(v === null || v === undefined ? '' : v) }] },
  { kind: 'sender-in-group', flag: '--sender-in-group', value: 'id[,id]', rules: (v) => [{ kind: 'sender-in-group', members: split(v) }] },
  { kind: 'from-address', flag: '--from', value: 'address[,address]', rules: (v) => (split(v).length ? split(v) : ['']).map((value) => ({ kind: 'from-address', value })) },
  { kind: 'subject', flag: '--subject', value: 'words', rules: (v) => [{ kind: 'subject', value: String(v === null || v === undefined ? '' : v) }] },
  { kind: 'has-attachment', flag: '--has-attachment', value: null, rules: () => [{ kind: 'has-attachment' }] },
  { kind: 'not-contains', flag: '--not-contains', value: 'word[,word]', rules: (v) => (split(v).length ? split(v) : ['']).map((value) => ({ kind: 'not-contains', value })) },
  { kind: 'time-window', flag: '--time-window', value: 'HH:MM-HH:MM', rules: (v) => { const [from, to] = String(v || '').split('-'); return [{ kind: 'time-window', from: from || '', to: to || '' }]; } },
  { kind: 'reply-to-mine', flag: '--reply-to-mine', value: null, rules: () => [{ kind: 'reply-to-mine' }] },
  { kind: 'in-thread-with-me', flag: '--in-thread-with-me', value: null, rules: () => [{ kind: 'in-thread-with-me' }] },
  { kind: 'reply-to-sent', flag: '--reply-to-sent', value: null, since: true, rules: () => [{ kind: 'reply-to-sent' }] },
  // lane webhook-l1-server: `fact <key> == <value>` over the message's declared facts (a webhook path's mapped fields)
  { kind: 'fact', flag: '--fact', value: 'key=value', since: true, rules: (v) => { const s = String(v === null || v === undefined ? '' : v); const i = s.indexOf('='); return [{ kind: 'fact', key: i > 0 ? s.slice(0, i).trim() : '', value: i > 0 ? s.slice(i + 1) : '' }]; } },
]);
/** A RULE_KINDS entry the CLI does not offer, with the reason it says (the census: every kind = a flag or a row here). */
const NOT_OFFERED = Object.freeze({});
/** The non-rule flags (value-taking unless listed in BOOL). */
const OTHER_FLAGS = Object.freeze(['--mode', '--digest-minutes', '--cap', '--match', '--why', '--spec', '--tz-offset']);
const MODES = Object.freeze(['next-turn', 'wake', 'digest']);
const MODE_WORDS = '--mode must be next-turn (free: the news rides your next turn), wake (a billed turn now — the user approves it) or digest (a billed turn per window — the user approves it)';
const PLACEHOLDER = Object.freeze({ kind: 'agent', id: 'spec', name: null });   // the validator needs a principal; the engine sets the real one

/** The row the flags or the JSON say, judged — `{ok:true, spec}` or a refusal by name (the validator's own code + words;
 *  `flag` names the flag when the grammar can tell). The ONE judge every door uses (flags, --spec, the legacy body). */
function specVerdict(raw, { flagOf = null } = {}) {
  const a = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  if (!a) return refuse('bad-spec', '--spec must be a JSON object (the watcher row: notify, mode, filter, digestMinutes, dailyWakeCap)');
  const notify = a.notify === undefined || a.notify === null ? 'wake' : a.notify;
  const delivery = a.delivery === undefined || a.delivery === null || a.delivery === '' ? (notify === 'digest' ? 'wake' : 'next-turn') : a.delivery;
  // a digest IS a paced wake (a billed turn per window): a next-turn row never batches (the engine stashes each hit)
  if (notify === 'digest' && delivery === 'next-turn') return refuse('digest-is-a-wake', 'a digest is a paced wake (a billed turn per window) — next-turn news rides your next turn as it comes; ask --mode digest (the user approves it) or --mode next-turn', { flag: '--mode' });
  const filter = a.filter === undefined || a.filter === null ? null : a.filter;
  const mode = a.mode === undefined ? (filter ? 'filtered' : 'all') : a.mode;
  let fv = null;
  if (filter || mode === 'filtered') {
    fv = F.validateFilter(filter);   // THE DIALOG'S JUDGE (every rule kind, the regex judge, match any|every)
    if (!fv.ok) return { ...fv, ...(flagOf && fv.kind && flagOf(fv.kind) ? { flag: flagOf(fv.kind) } : {}) };
  }
  const vw = F.validateWatcher({ principal: PLACEHOLDER, notify, mode, filterId: fv ? 'inline' : null, digestMinutes: a.digestMinutes, dailyWakeCap: a.dailyWakeCap, delivery });
  if (!vw.ok) return { ...vw, ...(vw.why === 'delivery' ? { flag: '--mode' } : vw.why === 'wake-cap' ? { flag: '--cap' } : vw.why === 'digest' ? { flag: '--digest-minutes' } : {}) };
  const w = vw.watcher;
  return { ok: true, spec: { delivery: w.delivery || 'wake', notify: w.notify, mode: w.mode, ...(fv ? { filter: { match: fv.filter.match, rules: fv.filter.rules } } : {}), digestMinutes: w.digestMinutes, dailyWakeCap: w.dailyWakeCap, why: String(a.why === undefined || a.why === null ? '' : a.why).trim().slice(0, 500) } };
}

/** `watch` flags (argv after the target) → the judged row. `--spec '<json>'` carries the whole row (the CLI reads
 *  `--spec @file` itself and sends the text); only `--why` may stand beside it. */
function watchSpecFromArgs(argv) {
  const args = Array.isArray(argv) ? argv.map((x) => String(x)) : [];
  const flagOf = (kind) => { const r = RULE_FLAGS.find((x) => x.kind === kind); return r ? r.flag : null; };
  const rules = [];
  const one = {};
  let spec = null;
  for (let i = 0; i < args.length; i++) {
    const f = args[i];
    const rf = RULE_FLAGS.find((x) => x.flag === f);
    const takes = rf ? rf.value !== null : OTHER_FLAGS.includes(f);
    if (!rf && !OTHER_FLAGS.includes(f)) return refuse('unknown-flag', `${f.startsWith('--') ? 'unknown flag ' + f : 'unexpected ' + JSON.stringify(f)} — watch takes ${[...RULE_FLAGS.map((x) => x.flag), ...OTHER_FLAGS].join(' ')} (vibespace-docs channels)`, { flag: f });
    let v = null;
    if (takes) {
      if (i + 1 >= args.length || (args[i + 1].startsWith('--') && f !== '--regex')) v = '';
      else v = args[++i];
    }
    if (rf) {
      if (rf.since && !F.RULE_KINDS.includes(rf.kind)) return refuse('not-on-this-version', `${rf.flag}: the rule "${rf.kind}" is not on this version of VibeSpace`, { flag: rf.flag, kind: rf.kind });
      if (rf.kind === 'time-window' && /,/.test(v || '')) return refuse('time-window-days', '--time-window: days are not on this version — HH:MM-HH:MM only (with --tz-offset ±minutes)', { flag: rf.flag, kind: rf.kind });
      rules.push(...rf.rules(v));
      continue;
    }
    if (f === '--spec') { spec = v; continue; }
    if (f in one) return refuse('flag-twice', `${f} is given twice — say it once`, { flag: f });
    one[f] = v;
  }
  if (spec !== null) {
    if (rules.length || Object.keys(one).some((k) => k !== '--why')) return refuse('spec-alone', '--spec carries the whole row — no rule, --mode, --cap or --match flag beside it (only --why)', { flag: '--spec' });
    let obj;
    try { obj = JSON.parse(spec); } catch (e) { return refuse('bad-spec', `--spec is not JSON: ${String((e && e.message) || e).slice(0, 120)}`, { flag: '--spec' }); }
    return specVerdict(one['--why'] !== undefined && obj && typeof obj === 'object' && !Array.isArray(obj) ? { ...obj, why: one['--why'] } : obj, { flagOf });
  }
  const m = one['--mode'];
  if (m !== undefined && !MODES.includes(m)) return refuse('bad-mode', MODE_WORDS, { flag: '--mode' });
  if (one['--digest-minutes'] !== undefined && m !== 'digest') return refuse('digest-minutes-without-digest', '--digest-minutes goes with --mode digest', { flag: '--digest-minutes' });
  if (one['--tz-offset'] !== undefined) {
    const tw = rules.filter((r) => r.kind === 'time-window');
    if (!tw.length) return refuse('tz-without-window', '--tz-offset goes with --time-window', { flag: '--tz-offset' });
    for (const r of tw) r.tzOffsetMinutes = one['--tz-offset'];
  }
  if (one['--match'] !== undefined && !rules.length) return refuse('match-without-rules', '--match says how the rules combine — give at least one rule flag', { flag: '--match' });
  const num = (v) => (v === undefined ? undefined : v === '' ? NaN : Number(v));
  return specVerdict({
    notify: m === 'digest' ? 'digest' : 'wake', delivery: m === 'digest' ? 'wake' : (m || 'next-turn'),
    ...(rules.length ? { filter: { match: one['--match'] === undefined ? 'any' : one['--match'], rules } } : {}),
    ...(one['--digest-minutes'] !== undefined ? { digestMinutes: num(one['--digest-minutes']) } : {}),
    ...(one['--cap'] !== undefined ? { dailyWakeCap: num(one['--cap']) } : {}),
    why: one['--why'],
  }, { flagOf });
}

/** THE SERVER'S DOOR: a watch body → the judged row. `args` = the CLI's raw flags; `spec` = a row as JSON; else the
 *  pre-parity body `{delivery, keywords[], dailyWakeCap, why}` (an older CLI shipped to another machine) — all three
 *  through `specVerdict`. */
function watchSpecOfBody(b0) {
  const b = b0 && typeof b0 === 'object' ? b0 : {};
  if (Array.isArray(b.args)) return watchSpecFromArgs(b.args);
  if (b.spec && typeof b.spec === 'object') return specVerdict(b.why !== undefined ? { ...b.spec, why: b.why } : b.spec);
  const kws = (Array.isArray(b.keywords) ? b.keywords : []).map((x) => String(x === null || x === undefined ? '' : x).trim()).filter(Boolean);
  if (b.delivery !== undefined && b.delivery !== null && b.delivery !== '' && !MODES.includes(b.delivery)) return refuse('bad-mode', MODE_WORDS, { flag: '--mode' });
  const digest = b.delivery === 'digest';
  return specVerdict({ notify: digest ? 'digest' : 'wake', delivery: digest ? 'wake' : (b.delivery || 'next-turn'), ...(kws.length ? { filter: { match: 'any', rules: kws.map((value) => ({ kind: 'keyword', value })) } } : {}), dailyWakeCap: b.dailyWakeCap, why: b.why });
}

/** A watch row in WORDS (the CLI's --show / watches, the For-you item): how it notifies, on what, the cap. */
function watchHowWords(w) {
  if (!w) return '';
  return F.deliveryModeOf(w) === 'next-turn' ? 'on your next turn (free)' : w.notify === 'digest' ? `a digest every ${Number(w.digestMinutes) || F.DEFAULT_DIGEST_MINUTES} min (a billed turn)` : 'woken right away (a billed turn)';
}
function watchWhatWords(w, filter = null) {
  const f = filter || (w && w.filter) || null;
  if (!w || w.mode !== 'filtered') return 'every new message';
  if (!f || !Array.isArray(f.rules) || !f.rules.length) return 'messages matching a saved filter';
  return (f.match === 'every' ? 'messages matching all of: ' : 'messages matching any of: ') + f.rules.map((r) => F.ruleWhy(r)).join(f.match === 'every' ? ' and ' : ', ');
}

module.exports = { RULE_FLAGS, NOT_OFFERED, OTHER_FLAGS, MODES, MODE_WORDS, specVerdict, watchSpecFromArgs, watchSpecOfBody, watchHowWords, watchWhatWords };
