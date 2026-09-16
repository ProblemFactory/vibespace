'use strict';
/**
 * THE GMAIL PUSH LANE — `users.watch` + a Cloud Pub/Sub PULL subscription
 * (docs/design-communication-panel.zh.md §6.4, §12.2, decision 20; P1's push
 * half, BEHIND A DEFAULT-OFF SWITCH). ORCH tier — the `live` half of
 * src/channels/gmail.js, built by that adapter's `create()` with its own
 * `api()` / token closures.
 *
 * WHAT IT IS: a pull loop, not a socket. `users.watch` tells Gmail to publish
 * a `{emailAddress, historyId}` note to a topic whenever the mailbox changes;
 * THIS instance pulls its OWN subscription of that topic (no public inbound
 * endpoint, and one subscription per instance is what makes exclusivity a
 * CONFIGURED fact here rather than a random race). A pulled message carries
 * NO mail — it is a CURSOR KICK: the engine runs a kick-origin pass and the
 * read adapter's `history.list` fetches what changed. Records therefore
 * always arrive through the poll, and a kick-origin pass attributes them to
 * push in the exclusivity measurement.
 *
 * THE COST THE DESIGN NAMES: a topic, an IAM grant (`gmail-api-push@system.
 * gserviceaccount.com` may publish to it), a subscription, the `pubsub`
 * scope on the user's token — and the watch EXPIRES SILENTLY after 7 days,
 * so it is renewed every 24 h while the lane runs. Every one of those is a
 * NAMED refusal on the adapter row when missing, never a quiet no-op.
 *
 * ACK AFTER THE ENGINE ANSWERS (fence 11): a pulled message is acknowledged
 * only after `onEvent()` resolved; a stopped lane acknowledges nothing.
 *
 * LIVENESS: every pull that ANSWERS (empty or not) is `heard` — the
 * subscription is reachable. A pull that times out is not.
 *
 * EVERY OUTBOUND HOST IS DECLARED in `EGRESS` (§3.1); the watch call itself
 * goes through the read adapter's `api()` against gmail.googleapis.com,
 * which src/channels/gmail.js declares.
 */
const { startLane } = require('./lane.js');

const PUBSUB = 'https://pubsub.googleapis.com/v1';
/** The scope the user's token must carry for THIS instance to pull. */
const PUBSUB_SCOPE = 'https://www.googleapis.com/auth/pubsub';
/** THE DECLARED EGRESS (§3.1). `www.googleapis.com` is the SCOPE identifier. */
const EGRESS = Object.freeze(['pubsub.googleapis.com', 'www.googleapis.com']);
/** The watch dies after 7 days; renew well inside that. */
const WATCH_RENEW_MS = 24 * 60 * 60 * 1000;
/** Consecutive TRANSIENT renewal failures before the lane parks (3 × 24 h
 *  leaves the watch 4 days; a REFUSED renewal parks at once). Parking hands
 *  the mailbox to the poll lane while the row says why. */
const WATCH_RENEW_MAX_FAILS = 3;
/** One pull request's bound. Pub/Sub returns as soon as a message exists. */
const PULL_TIMEOUT_MS = 75 * 1000;
const PULL_MAX = 100;
/** Backoff after a failed pull (a transport error, a 5xx), capped. */
const PULL_BACKOFF_MS = [2000, 5000, 15000, 30000, 60000];
const SUBSCRIPTION_RE = /^projects\/[^/]+\/subscriptions\/[^/]+$/;
const TOPIC_RE = /^projects\/[^/]+\/topics\/[^/]+$/;

const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); if (t.unref) t.unref(); });

/** The pulled note: base64 JSON `{emailAddress, historyId}`. */
function decodeNote(data) {
  try { return JSON.parse(Buffer.from(String(data || ''), 'base64').toString('utf-8')); } catch { return {}; }
}

/**
 * @param {object} o
 * @param {string}   o.adapterId
 * @param {function} o.api          the read adapter's authorized JSON call: (pathq, {method, json, what}) => Promise<body>
 * @param {function} o.accessToken  async () => bearer (the read adapter's, refreshed)
 * @param {function} o.tokenScopes  () => string[] the held token's scopes
 * @param {function} o.options      () => { topic, subscription } read LIVE from the record
 * @param {function} o.fetch        bounded in-process fetch (fence 3)
 */
function createGmailLive({ adapterId, api, accessToken, tokenScopes, options, fetch: fetchFn, now = () => Date.now(), log = console, reconnectMinMs, reconnectMaxMs, pullTimeoutMs = PULL_TIMEOUT_MS, watchRenewMs = WATCH_RENEW_MS } = {}) {
  for (const [k, v] of Object.entries({ api, accessToken, tokenScopes, options })) if (typeof v !== 'function') throw new Error(`createGmailLive: ${k}() is required`);
  const f = typeof fetchFn === 'function' ? fetchFn : (typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null);

  async function pubsub(method, sub, verb, body, token, signal) {
    let r;
    try {
      r = await f(`${PUBSUB}/${sub}:${verb}`, {
        method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json' },
        body: JSON.stringify(body || {}), signal: signal || AbortSignal.timeout(pullTimeoutMs),
      });
    } catch (e) { const err = new Error(`pubsub ${verb}: ${(e && e.message) || e}`); err.name = e && e.name === 'AbortError' ? 'AbortError' : 'TransportError'; throw err; }
    let parsed = null;
    try { parsed = await r.json(); } catch { parsed = null; }
    if (!r.ok) {
      const msg = (parsed && parsed.error && (parsed.error.message || parsed.error.status)) || `HTTP ${r.status}`;
      const err = new Error(`pubsub ${verb}: ${msg} (${r.status})`);
      err.status = r.status;
      if (r.status === 401 || r.status === 403 || r.status === 404) { err.permanent = true; err.code = r.status === 404 ? 'subscription-not-found' : 'pubsub-forbidden'; }
      throw err;
    }
    return parsed || {};
  }

  return {
    start({ onEvent, onState } = {}) {
      return startLane({
        name: `gmail-push:${adapterId}`, onEvent, onState, now, log, reconnectMinMs, reconnectMaxMs,
        async connect(h) {
          if (!f) { const err = new Error('no fetch available in this runtime'); err.permanent = true; err.code = 'no-fetch'; throw err; }
          const { topic, subscription } = options() || {};
          if (!topic || !subscription) { const err = new Error('Gmail push needs the Pub/Sub topic and subscription options (projects/<project>/topics/<t>, projects/<project>/subscriptions/<s>)'); err.permanent = true; err.code = 'push-not-configured'; throw err; }
          if (!TOPIC_RE.test(topic) || !SUBSCRIPTION_RE.test(subscription)) { const err = new Error(`Gmail push options are not Pub/Sub resource names: topic '${topic}', subscription '${subscription}'`); err.permanent = true; err.code = 'push-misconfigured'; throw err; }
          const scopes = tokenScopes() || [];
          if (!scopes.includes(PUBSUB_SCOPE)) { const err = new Error('the Gmail token does not carry the pubsub scope — re-authorize with push enabled so the consent includes it'); err.permanent = true; err.code = 'scope-missing'; throw err; }

          // THE WATCH, armed now and renewed daily while the lane runs. A
          // refused watch is a permanent, named refusal (the topic's IAM).
          let watch;
          try { watch = await api('/watch', { method: 'POST', json: { topicName: topic }, what: 'gmail watch' }); }
          catch (e) { const err = new Error(`users.watch refused: ${(e && e.message) || e} — grant gmail-api-push@system.gserviceaccount.com the Pub/Sub Publisher role on the topic`); err.permanent = !(e && e.retryable); err.code = 'watch-refused'; throw err; }
          let alive = true;
          let ac = new AbortController();
          let renew = null;
          // ONE way down for every ending (close(), a permanent failure, the
          // loop dying): the renewal timer is cleared with the loop — a parked
          // or reconnected lane must not keep renewing a watch nobody pulls.
          const shutdown = () => { if (!alive) return; alive = false; if (renew) clearInterval(renew); try { ac.abort(); } catch {} ac = new AbortController(); };
          let renewFails = 0;
          renew = setInterval(() => {
            if (!alive) return;
            api('/watch', { method: 'POST', json: { topicName: topic }, what: 'gmail watch renew' })
              .then((w) => { watch = w; renewFails = 0; })
              .catch((e) => {
                if (!alive) return;
                renewFails++;
                const refused = !(e && e.retryable);
                const park = refused || renewFails >= WATCH_RENEW_MAX_FAILS;
                log.warn && log.warn(`[channels] gmail-push:${adapterId}: watch renewal ${refused ? 'refused' : `failed (${renewFails} in a row)`}: ${(e && e.message) || e} (the watch expires 7 days after its last success)${park ? ' — parking the lane' : ''}`);
                if (!park) return;
                // a lane whose watch will lapse would read `live` (the pull
                // answers) while nothing is ever published: park it, by name
                const err = new Error(`users.watch renewal ${refused ? 'refused' : `failed ${renewFails}× in a row`}: ${(e && e.message) || e} — the watch expires 7 days after its last success; fix the topic's IAM grant / re-authorize, then re-declare push`);
                err.code = 'watch-renew-failed'; err.permanent = true;
                shutdown(); h.fail(err);
              });
          }, watchRenewMs);
          if (renew.unref) renew.unref();

          // THE PULL LOOP. Runs until close(); a stopped lane's pending pull
          // is aborted and nothing pulled after that is acknowledged.
          (async () => {
            let fails = 0;
            while (alive) {
              try {
                const token = await accessToken();
                const r = await pubsub('POST', subscription, 'pull', { maxMessages: PULL_MAX }, token, ac.signal);
                if (!alive) break;
                fails = 0;
                h.heard();
                const acks = [];
                for (const m of (r && r.receivedMessages) || []) {
                  const msg = (m && m.message) || {};
                  const note = decodeNote(msg.data);
                  const res = await h.event({ kind: 'kick', eventId: String(msg.messageId || m.ackId || ''), convId: null, historyId: note.historyId || null, emailAddress: note.emailAddress || null, at: now() });
                  if (res && res.ok === false && res.why === 'stopped') { alive = false; break; }
                  if (m && m.ackId) acks.push(m.ackId);
                }
                if (alive && acks.length) await pubsub('POST', subscription, 'acknowledge', { ackIds: acks }, token, AbortSignal.timeout(20000));
              } catch (e) {
                if (!alive) break;
                if (e && e.name === 'AbortError') continue;          // a bounded pull that answered nothing: not heard, not failed
                // a 401/403/404 pull is PERMANENT: park (§6.4) — reported as a
                // close it re-ran users.watch + the pull every ≤60 s forever
                if (e && e.permanent) { shutdown(); h.fail(e); break; }
                const wait = PULL_BACKOFF_MS[Math.min(fails++, PULL_BACKOFF_MS.length - 1)];
                log.warn && log.warn(`[channels] gmail-push:${adapterId}: pull failed (${(e && e.message) || e}) — retrying in ${Math.round(wait / 1000)}s`);
                await sleep(wait);
              }
            }
          })().catch((e) => { if (alive) { shutdown(); h.closed(`pull loop died: ${(e && e.message) || e}`); } });

          return {
            close() { shutdown(); },
            watch: () => watch,
          };
        },
      });
    },
  };
}

module.exports = { createGmailLive, decodeNote, EGRESS, PUBSUB_SCOPE, WATCH_RENEW_MS, WATCH_RENEW_MAX_FAILS, PULL_TIMEOUT_MS, PULL_MAX, SUBSCRIPTION_RE, TOPIC_RE };
