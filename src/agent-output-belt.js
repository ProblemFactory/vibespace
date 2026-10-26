'use strict';
/**
 * A SECRET IN AN OUTPUT — THE ONE BELT every store that keeps an agent's own text passes it through BEFORE it lands
 * (lane agent-output-sinks; design q-043 D3 ②③ + §5 P0-b + the brief's live-value addition). The sibling to
 * src/peer-text.js's `toAgentText` (text a PEER wrote TOWARD an agent, masked at the read door): this is the OUTBOUND
 * half — text an agent wrote (a progress note, an ask's detail, a status notice, a message, a job's output) that another
 * reader (the owner's For-you tray, a peer in the group, anyone with the disk — the incident's pod shell, a PVC snapshot)
 * will see. It must never carry a credential in the clear, so every such writer masks here first. Masked at the WRITE,
 * so a later `lock()` never has to scrub what already landed (design D3 ④–⑤; the lock's own consequences are P0-c).
 *
 * THE BELT is two scrubbers chained — it forks NEITHER (the brief: "do not fork a second scrubber"):
 *   ① the vault's LIVE-VALUE masker — src/vault-run.js `maskText` over the plaintext of the entries the vault holds that
 *      are agent-reachable (REVEALABLE engine secrets: `apikey:` today, `agent:<scope>/<name>` once vault-mint-put lands,
 *      an owner-opened run-referable entry once vault-run-door lands — `vault-inventory.js revealableOf` on the `secrets`
 *      group, which excludes exactly `host:` / `file:` — the pairing / sealed-file tokens the vault NEVER gives an agent,
 *      so they can never be in an agent's output anyway). It catches the value in every spelling of vault-run.js's ONE list,
 *      FORMS (raw / base64 / percent / JSON / hex / UTF-16 / base32, and read through quoted-printable, backslash escapes,
 *      entities, colours and wrapped lines — lane vault-scrub-forms) and leaves `[vault:<entry>]` — over a WHOLE text, so the
 *      belt keeps no window of its own. Over-masking a value an agent happened to echo is the point;
 *      under-masking leaks (exit's sentence: "a false hide costs nothing").
 *   ② the SECRET-SHAPE census — src/secret-shapes.js `redactSecrets` (R1–R8: a PEM block, a secret-named `KEY=value`, a
 *      bearer, a known prefix, a JWT, a `?token=` …): the value → `«redacted»`, the NAME stays, so a reader still sees what
 *      the line was. The same ONE rule exit output already passes (exit-reach.js).
 *
 * THE SEAM (base 2.369.326): src/vault-run.js is the PURE half of `vibespace-vault run` (sibling lane vault-run-model,
 * P0-e) and is NOT on this base yet — the brief: "reuse src/vault-run.js's maskText / formsOf … rebase onto the newest
 * release when 主开发 names it". So ① is a GUARDED require: present ⇒ live-value masking runs; absent ⇒ ② still runs (and
 * on this base there is nothing for ① to catch anyway — no agent door answers a stored value, the q-043 ① law, so an
 * agent's output holds no live vault value until the run / mint / fill doors land, each of which masks its own child).
 * When vault-run.js lands the require resolves and ① turns on with no change here.
 *
 * NOT PURE: reaches the vault through src/secret-box.js `vaultForDir(dataDir)` (the provider a door holding only its data
 * dir looks up). A writer passes its own `dataDir`; a locked / un-set-up / unregistered vault yields no live values, so
 * the belt degrades to ② — correct (no plaintext to read when locked). Gate: scripts/test-agent-output-sinks.mjs (the
 * runtime census + the two mutants), scripts/test-secret-shapes.mjs (the belt leg), scripts/test-architecture.mjs §93.
 */
const SB = require('./secret-box.js');
const VI = require('./vault-inventory.js');
const { redactSecrets } = require('./secret-shapes.js');

let VR = null, vrTried = false;
/** The sibling's PURE scrubber, required once, lazily — absent on this base (the seam above), present after the rebase. */
function vaultRun() {
  if (!vrTried) { vrTried = true; try { VR = require('./vault-run.js'); } catch { VR = null; } }
  return VR;
}

/**
 * The plaintext of every agent-reachable secret the vault holds, as `[{ label, value }]` for the live-value masker.
 * `v` = a vault provider (`SB.vaultForDir(dataDir)`); [] unless it is unlocked AND exposes `secretNames` (the provider
 * gained it for this belt — src/server/vault-engine.js). `host:` / `file:` are skipped (`revealableOf`): the vault never
 * hands them out, so an agent's output can't hold them. Each Buffer is read into a UTF-8 string and zeroed at once.
 */
function maskableSecrets(v) {
  if (!v || typeof v.secretNames !== 'function' || typeof v.secretGet !== 'function') return [];
  try { if (v.state() !== 'unlocked') return []; } catch { return []; }
  const out = [];
  let names; try { names = v.secretNames(); } catch { return []; }
  for (const row of Array.isArray(names) ? names : []) {
    const name = row && row.name;
    if (!name || !VI.revealableOf('secrets', name)) continue;   // host: / file: — never shown to an agent
    let g; try { g = v.secretGet(name); } catch { g = null; }
    if (g && g.ok && g.value != null) {
      const buf = Buffer.isBuffer(g.value) ? g.value : Buffer.from(String(g.value), 'utf8');
      const value = buf.toString('utf8');
      if (Buffer.isBuffer(g.value)) g.value.fill(0);
      if (/^web-login:/.test(name)) { let r = null; try { r = JSON.parse(value); } catch { r = null; } for (const pw of [r && r.password, r && r.previous && r.previous.password]) if (typeof pw === 'string' && pw) out.push({ label: name, value: pw }); continue; }   // lane browser-login: a web login's PASSWORD (its sealed record is JSON — the value an output could carry is the password, and the one it replaced)
      if (value) out.push({ label: name, value });
    }
  }
  return out;
}

/**
 * Mask one whole text an agent produced, bound for a store a reader will see. `dataDir` = the writer's own data dir (how
 * the belt finds the vault); omit it (or point at a locked vault) and only the shape census runs. Returns the masked
 * string — never throws (both scrubbers are internally bounded and swallow their own faults; `maskText` throws only on a
 * value under its MIN, which we filter out first).
 */
function maskForSink(text, { dataDir } = {}) {
  let s = String(text == null ? '' : text);
  if (!s) return s;
  const vr = vaultRun();
  if (vr && dataDir) {
    try {
      const v = SB.vaultForDir(dataDir);
      const secrets = maskableSecrets(v).filter((x) => Buffer.byteLength(x.value, 'utf8') >= vr.MIN_MASK_BYTES);
      if (secrets.length) s = vr.maskText(s, secrets);
    } catch { /* the shape census below still runs — the belt never loses the write */ }
  }
  try { s = redactSecrets(s).text; } catch { /* redactSecrets is internally guarded; this is belt-and-braces */ }
  return s;
}

module.exports = { maskForSink, maskableSecrets };
