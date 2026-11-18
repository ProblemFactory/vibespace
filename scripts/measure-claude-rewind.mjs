#!/usr/bin/env node
// measure-claude-rewind.mjs — B-437e: what the installed claude CLI states about its `rewind_conversation` control
// request, READ FROM ITS PROGRAM FILE AS BYTES (never run: no process, no network, no sign-in), written to
// scripts/fixtures/claude-cli/<version>-rewind-conversation.json — the captured oracle src/rewind-door.js and
// scripts/test-checkpoints.mjs are judged against (the rule for everything a CLI states about itself: a capture with
// the version it was read from, never a hand copy).
//   node scripts/measure-claude-rewind.mjs <the pinned program file, e.g. ~/.local/share/claude/versions/2.1.322> [--out <file>]
// Every fact is found by a PATTERN over the minified bundle; a pattern that finds nothing STOPS the capture by name
// (a renamed field must be re-read by a person, never guessed). Each fact keeps a short excerpt of what it was read from.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = process.argv[2];
const outArg = process.argv.indexOf('--out');
if (!bin || !fs.statSync(bin).isFile()) { console.error('usage: node scripts/measure-claude-rewind.mjs <claude program file> [--out <file>]'); process.exit(2); }
const version = path.basename(fs.realpathSync(bin));
if (!/^\d+\.\d+\.\d+$/.test(version)) { console.error(`the program file's name is no version (${version}) — pass the versioned file itself`); process.exit(2); }
const buf = fs.readFileSync(bin);
const s = buf.toString('latin1');
const need = (cond, what) => { if (!cond) { console.error(`NOT FOUND: ${what} — the bundle moved; read it by hand before writing a capture`); process.exit(3); } };
const cut = (i, n = 160) => s.slice(Math.max(0, i), Math.max(0, i) + n).replace(/[^\x20-\x7e]/g, '·');
// an object literal bound to its OWN definition: `<name>={<first key><value form>` (a minified name can recur elsewhere)
const objAt = (name, valueForm) => {
  const m = new RegExp(`(?<![\\w$.])${name.replace(/\$/g, '\\$')}=\\{[a-z_]+:${valueForm}`).exec(s);
  need(m, `the object ${name} (${valueForm})`);
  return { at: m.index, body: s.slice(m.index + name.length + 2, s.indexOf('}', m.index)) };
};

// 1. the handler: the request's fields (every `<x>.request.<field>` it reads), the done reply
const h0 = s.indexOf('.request.subtype==="rewind_conversation"');
need(h0 >= 0, 'the rewind_conversation handler');
const h1 = s.indexOf('.request.subtype==="fork_conversation"', h0);
need(h1 > h0, 'the end of the handler (the fork_conversation branch after it)');
const win = s.slice(h0, h1);
// the request is read directly (`K.request.x`) and through an alias (`Nt=K.request` … `Nt.x`)
const aliases = [...new Set([...win.matchAll(/([\w$]+)=[\w$]+\.request[,;)]/g)].map((m) => m[1]))];
const fieldReads = [...win.matchAll(/\.request\.([a-z_]+)/g)].map((m) => m[1])
  .concat(...aliases.map((al) => [...win.matchAll(new RegExp(`(?<![\\w$.])${al.replace(/\$/g, '\\$')}\\.([a-z_]+)`, 'g'))].map((m) => m[1])));
const fields = [...new Set(fieldReads)].filter((f) => f !== 'subtype').sort();
need(fields.includes('target_message_uuid') && fields.includes('last_seen_user_message_uuid'), 'the request fields target_message_uuid + last_seen_user_message_uuid');
const done = /\{rewound:!0,targetMessageUuid:[\w$]+,prefillText:[\w$]+,precedingAssistantUuid:[\w$]+(,\.\.\.[\w$]+!==void 0&&\{resolution:[\w$]+\})?\}/.exec(win);
need(done, 'the done reply {rewound:!0, targetMessageUuid, prefillText, precedingAssistantUuid}');
const doneKeys = ['rewound', 'targetMessageUuid', 'prefillText', 'precedingAssistantUuid', ...(done[1] ? ['resolution'] : [])];
// the row is written BEFORE the last check, and healed when that check fails (the transcript's twin records)
const order = /!await [\w$]+\([\w$]+\.cut,[\w$]+,[\w$]+\)\)[\s\S]{0,60}"persist_failed"[\s\S]{0,240}await ([\w$]+)\([\w$]+,[\w$]+\),[\w$]+\([\w$]+,"state_changed"\)/.exec(win);
need(order, 'the persist-then-check order (persist_failed … state_changed)');

// 2. the refused reply, its words table and the may-be-sent-again table
const ref = /function ([\w$]+)\(e,n\)\{return\{rewound:!1,prefillText:null,precedingAssistantUuid:null,error:([\w$]+)\[e\],reason:e,\.\.\.n!==void 0&&\{isolation_latch:n\}\}\}/.exec(s);
need(ref, 'the refused reply builder {rewound:!1, … error:<words>[e], reason:e, isolation_latch?}');
const words = objAt(ref[2], '"');
const reasons = Object.fromEntries([...words.body.matchAll(/([a-z_]+):"([^"]*)"/g)].map((m) => [m[1], { text: m[2] }]));
need(Object.keys(reasons).length >= 10, `the words table ${ref[2]} (${Object.keys(reasons).length} rows)`);
const firstKey = Object.keys(reasons)[0];
const rt = new RegExp(`([\\w$]+)=\\{${firstKey}:![01]`).exec(s);
need(rt, 'the may-be-sent-again table');
const retry = objAt(rt[1], '![01]');
for (const m of retry.body.matchAll(/([a-z_]+):!([01])/g)) { need(reasons[m[1]], `the retry table names a reason the words table lacks (${m[1]})`); reasons[m[1]].retry = m[2] === '0'; }
need(Object.values(reasons).every((r) => typeof r.retry === 'boolean'), 'a retry value for every reason');

// 3. the transcript row: the persisted anchor, its cutUuid flag and its default, the heal row
const k7 = /async function ([\w$]+)\(e,n,r\)\{let s=[\w$]+\(\);s\.currentSessionLeafUuid=e\?\?void 0,s\.currentSessionLeafTs=[^,]+,await s\.appendEntry\(\{type:"last-prompt",\.\.\.s\.currentSessionLastPrompt&&\{lastPrompt:s\.currentSessionLastPrompt\},leafUuid:e,explicit:!0,\.\.\.n,sessionId:[\w$]+\(\)\}/.exec(s);
need(k7, 'the persisted anchor row (last-prompt, leafUuid, explicit, …)');
const anchor = /\{rewound:!0,\.\.\.[\w$]+!==void 0&&([\w$]+)\(\)&&\{cutUuid:[\w$]+\.uuid\}\}/.exec(s);
need(anchor, 'the anchor fields {rewound:true, cutUuid when a gate says so}');
const gate = new RegExp(`function ${anchor[1].replace(/\$/g, '\\$')}\\(\\)\\{return ([\\w$]+)\\("([a-z_]+)"\\)\\}`).exec(s);
need(gate, 'the cutUuid gate flag');
const dflt = new RegExp(`function ${gate[1].replace(/\$/g, '\\$')}\\(e\\)\\{let n=[\\w$.]+;if\\(!n\\)return!0;try\\{return n\\(e,!0\\)!==!1\\}catch\\{return!0\\}\\}`).exec(s);
need(dflt, 'the flag reader (on unless the vendor says off)');
// the heal is THE function the state_changed branch awaits: its body persists the uncut tip with no anchor fields
const healFn = new RegExp(`async function ${order[1].replace(/\$/g, '\\$')}\\([\\w$]+,[\\w$]+\\)\\{[\\s\\S]{0,500}?persistLocal\\(([\\w$]+)\\.uuid,void 0\\)`).exec(s);
need(healFn, `the heal row inside ${order[1]} (the state_changed branch's own callee)`);
const heal = healFn;
// every writer of a last-prompt row, and whether it writes `explicit` (an ordinary bookkeeping row does not)
const writers = [...s.matchAll(/type:"last-prompt",[\s\S]{0,260}?sessionId:/g)].map((m) => ({ explicit: /explicit:!0/.test(m[0]), leafUuid: /leafUuid:null/.test(m[0]) ? 'null' : /leafUuid:/.test(m[0]) || /currentSessionLeafUuid/.test(m[0]) ? 'a uuid' : 'none', excerpt: cut(m.index - 20, 200) }));
need(writers.some((w) => !w.explicit) && writers.some((w) => w.explicit), 'the last-prompt writers (an ordinary one without explicit, explicit ones)');

// 4. how the request's `expires_at` is READ: the handler's check, its parser (the value's form), the clocks it compares
// with — and the local transport, whose clocks answer nothing (a local CLI never refuses a request as expired)
const exp = /let ([\w$]+)=([\w$]+)\(([\w$]+)\([\w$]+\),[\w$]+\.request\.expires_at\);if\(\1!==void 0\)\{[\w$]+\([\w$]+,\1\);continue\}/.exec(win);
need(exp, 'the expires_at check in the handler (let X=F(clocks(K), K.request.expires_at); a refusal continues)');
const expFn = new RegExp(`function ${exp[2].replace(/\$/g, '\\$')}\\(e,n,r\\)\\{let s=n===void 0\\?void 0:([\\w$]+)\\(e,n\\);[\\s\\S]{0,120}"rewind_expires_at"`).exec(s);
need(expFn, `the check ${exp[2]} (its parse of the value, logged as rewind_expires_at)`);
const parse = new RegExp(`function ${expFn[1].replace(/\$/g, '\\$')}\\(\\{storedAt:e,serviceNow:n,newestFrameAt:r\\},s\\)\\{let h=typeof s==="string"\\?([\\w$]+)\\(s\\):Number\\.NaN;if\\(Number\\.isNaN\\(h\\)\\)return\\{outcome:"unparseable"\\};let y=n\\?\\?r;if\\(y===void 0\\)return\\{outcome:"no_service_time"\\};return\\{outcome:y>h\\?"refused":"in_time"`).exec(s);
need(parse, `the parser ${expFn[1]} (a string, the service clock or the newest frame's time, else no_service_time)`);
const dateFn = new RegExp(`var ([\\w$]+)=(/\\^[^\\n;]{10,160}\\$/);function ${parse[1].replace(/\$/g, '\\$')}\\(t\\)\\{return \\1\\.test\\(t\\)\\?Date\\.parse\\(t\\):Number\\.NaN\\}`).exec(s);
need(dateFn, `the date form ${parse[1]} (a pattern, then Date.parse)`);
const clocks = new RegExp(`(?<![\\w$.])${exp[3].replace(/\$/g, '\\$')}=\\(([\\w$]+)\\)=>\\(\\{storedAt:([\\w$]+)\\(\\1\\),serviceNow:[\\w$]+\\.sessionServiceNow\\(\\),newestFrameAt:[\\w$]+\\.newestSessionStreamCreatedAt\\(\\),machineNow:Date\\.now\\(\\)\\}\\)`).exec(s);
need(clocks, `the clocks ${exp[3]} (storedAt, the session stream's serviceNow and newest frame time, machineNow)`);
// what the check RETURNS: a refusal only on «refused» (or over the hard age) — unparseable / no_service_time refuse nothing
const ret = new RegExp(`return ([\\w$]+)\\|\\|s\\?\\.outcome==="refused"\\?${ref[1].replace(/\$/g, '\\$')}\\("expired"\\):void 0\\}`).exec(s.slice(expFn.index, expFn.index + 1200));
need(ret, `what ${exp[2]} returns (the refused reply ${ref[1]}("expired") only on «refused» or the age, else nothing)`);
need((s.slice(expFn.index, expFn.index + ret.index + ret[0].length).match(/(?<![\w$.])return(?![\w$])/g) || []).length === 1, `${exp[2]} has ONE return (no earlier refusal on another outcome)`);
// the IO a CLI WITHOUT a session stream URL gets (ours: stream-json on stdin, no --sdk-url), and its clocks
// each pattern must be UNIQUE in the whole bundle (a minified name recurs across modules; a first match proves nothing)
const only = (re, what) => { const all = [...s.matchAll(new RegExp(re.source, 'g'))]; need(all.length === 1, `${what} — exactly once in the bundle (found ${all.length})`); return all[0]; };
const io = only(/if\(![\w$]+\.sdkUrl\)return new ([\w$]+)\(/, 'the IO built when there is no sdkUrl');
const ioClass = only(new RegExp(`(?<![\\w$.])class ${io[1].replace(/\$/g, '\\$')}\\{`), `the class ${io[1]}`);
// its body, brace-matched (strings and template literals skipped)
const bodyEnd = (from) => { let d = 0; for (let i = from; i < s.length; i++) { const c = s[i];
  if (c === '"' || c === "'" || c === '`') { for (i++; i < s.length && s[i] !== c; i++) if (s[i] === '\\') i++; continue; }
  if (c === '{') d++; else if (c === '}' && --d === 0) return i + 1; } return -1; };
const ioEnd = bodyEnd(ioClass.index + ioClass[0].length - 1);
need(ioEnd > ioClass.index, `the end of class ${io[1]}`);
const ioBody = s.slice(ioClass.index, ioEnd);
const local = /sessionServiceNow\(\)\{return\}sessionServiceNowAtMost\(\)\{return\}readStreamFrameAt\(\)\{return\}sessionStreamJoinedAt\(\)\{return\}newestSessionStreamCreatedAt\(\)\{return\}/.exec(ioBody);
need(local, `the clocks of ${io[1]} (no session stream: serviceNow and newestSessionStreamCreatedAt answer nothing)`);
local.index += ioClass.index;
// the check's own age limit: `let h=<age>(e),y=h!==void 0&&h><limit>` — an age only from a stored time (storedAt)
const ageAt = /let h=([\w$]+)\(e\),y=h!==void 0&&h>([\w$]+);/.exec(s.slice(expFn.index, expFn.index + 900));
need(ageAt, `the age limit inside ${exp[2]}`);
const ageFn = new RegExp(`function ${ageAt[1].replace(/\$/g, '\\$')}\\(\\{storedAt:e,serviceNow:n,newestFrameAt:r,machineNow:s\\}\\)\\{if\\(e===void 0\\)return;`).exec(s);
need(ageFn, `the age ${ageAt[1]} (none without a stored time)`);
// a minified name recurs across the bundle's modules: take the definition NEAREST before the check (its own module)
const lastBefore = (re, at, span = 3000000) => { let m = null; const o = Math.max(0, at - span); for (const x of s.slice(o, at).matchAll(re)) m = Object.assign(x, { at: o + x.index }); return m; };
const NUM = '\\d+(?:\\.\\d+)?(?:e\\d+)?';
const limAlias = lastBefore(new RegExp(`(?<![\\w$.])${ageAt[2].replace(/\$/g, '\\$')}=(${NUM}|[\\w$]+)[,;]`, 'g'), expFn.index);
const limNum = limAlias && (new RegExp(`^${NUM}$`).test(limAlias[1]) ? limAlias : lastBefore(new RegExp(`(?<![\\w$.])${limAlias[1].replace(/\$/g, '\\$')}=(${NUM})[,;]`, 'g'), expFn.index));
need(limNum, `the limit ${ageAt[2]}'s number`);
const age = { index: ageFn.index, ms: Number(limNum[1]) };
const stored = new RegExp(`function ${clocks[2].replace(/\$/g, '\\$')}\\(e\\)\\{if\\(!Object\\.hasOwn\\(e,([\\w$]+)\\)\\)return;`).exec(s);
const storedKey = stored && lastBefore(new RegExp(`(?<![\\w$.])${stored[1].replace(/\$/g, '\\$')}="([a-z_]+)"`, 'g'), stored.index, 4000);
need(stored && storedKey, `the stored time ${clocks[2]} (a session stream frame's own field)`);

const capture = {
  _note: 'MEASURED by scripts/measure-claude-rewind.mjs — never edited by hand. Read from the program file as bytes; nothing was run.',
  cli: version, programSha256: crypto.createHash('sha256').update(buf).digest('hex'), programBytes: buf.length,
  how: 'patterns over the minified bundle (each fact keeps its excerpt); the CLI was never started',
  request: { type: 'control_request', subtype: 'rewind_conversation', fields },
  reply: { done: doneKeys, refused: ['rewound', 'prefillText', 'precedingAssistantUuid', 'error', 'reason', 'isolation_latch'] },
  reasons,
  expiry: {
    field: 'expires_at', form: 'string', pattern: dateFn[2].slice(1, -1), parse: 'Date.parse', outcomes: ['unparseable', 'no_service_time', 'refused', 'in_time'],
    comparedWith: ['serviceNow', 'newestFrameAt'], refusesOn: ['refused', 'the hard age'], noRefusalOn: ['unparseable', 'no_service_time'],
    localIo: io[1], localIoWhen: 'no sdkUrl', localTransportClocks: 'none', localOutcome: 'no_service_time',
    hardAgeMs: age.ms, hardAgeCountedFrom: storedKey[1],
  },
  persist: {
    row: 'last-prompt', fields: ['type', 'lastPrompt', 'leafUuid', 'explicit', 'sessionId'], anchorFields: ['rewound', 'cutUuid'],
    cutUuidFlag: gate[2], cutUuidFlagDefault: true,
    writtenBeforeTheLastCheck: true, healRow: { row: 'last-prompt', explicit: true, rewound: false, leafUuid: 'the uncut tip', writtenBy: order[1] },
    writers: writers.map((w) => ({ explicit: w.explicit, leafUuid: w.leafUuid })),
    ordinaryRowExplicit: !writers.filter((w) => !w.explicit).length ? null : false,
  },
  excerpts: { expiry: cut(exp.index + h0, 120), expiryCheck: cut(expFn.index, 200), expiryParse: cut(parse.index, 240), expiryForm: cut(dateFn.index, 160), expiryClocks: cut(clocks.index, 200), expiryReturn: cut(expFn.index + ret.index, 120), expiryLocalIo: cut(io.index, 120), expiryLocalClass: cut(ioClass.index, 80), expiryLocal: cut(local.index, 200), expiryAge: cut(age.index, 120), expiryAgeUse: cut(expFn.index + ageAt.index, 80), expiryAgeAlias: cut(limAlias.at, 40), expiryAgeLimit: cut(limNum.at, 60), expiryStored: cut(stored.index, 120), expiryStoredKey: cut(storedKey.at, 60), handler: cut(h0 - 20), done: cut(done.index + h0), order: cut(order.index + h0, 240), refused: cut(ref.index, 200), words: cut(words.at, 200), retry: cut(retry.at, 200), row: cut(k7.index, 240), anchor: cut(anchor.index), gate: cut(gate.index), flagReaderDefaultOn: cut(dflt.index, 140), heal: cut(heal.index, 260), writers: writers.map((w) => w.excerpt) },
};
const out = outArg > 0 ? process.argv[outArg + 1] : path.join(REPO, 'scripts', 'fixtures', 'claude-cli', `${version}-rewind-conversation.json`);
fs.writeFileSync(out, JSON.stringify(capture, null, 1) + '\n');
console.log(`${out}: ${version}, ${fields.length} request fields, ${Object.keys(reasons).length} reasons, cutUuid flag ${gate[2]}, expires_at a string /${capture.expiry.pattern}/ checked only against a session stream's clock (local: ${capture.expiry.localOutcome}), hard age ${capture.expiry.hardAgeMs} ms from ${capture.expiry.hardAgeCountedFrom}`);
