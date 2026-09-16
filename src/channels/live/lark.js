'use strict';
/**
 * THE LARK LONG-CONNECTION LANE (docs/design-communication-panel.zh.md §6.4,
 * §12.1, decision 3; P1's push half). ORCH tier — the `live` half of
 * src/channels/lark.js, built by that adapter's `create()` with the closures
 * it already owns (the credential resolver, the member-name cache, the
 * record normalizer) so this file learns nothing a second way.
 *
 * TRANSPORT = THE OFFICIAL SDK (`@larksuiteoapi/node-sdk`, `WSClient`): the
 * long connection needs no public URL, is authenticated by the APP credential
 * (app id + secret from `resolveIntegration('lark')` — never process.env),
 * and is the vendor's own at-least-once channel (retries at 15 s / 5 min /
 * 1 h / 6 h, four times). The SDK is REQUIRED LAZILY: an instance without it
 * parks the lane as `unavailable` with the install line in `why`, and the
 * poll carries everything — a missing optional dependency is a named state
 * on the adapter row, never a crash at boot. The suite injects a stub SDK.
 *
 * THE ACK IS THE HANDLER'S RETURN (fence 11). The SDK answers the vendor
 * after the registered handler resolves, and this handler resolves only after
 * the engine's `onEvent()` — which appends the record to the durable log
 * BEFORE it returns. A stopped lane's handler THROWS instead, so the SDK
 * answers with an error, the vendor redelivers, and nothing is acked that
 * nobody persisted.
 *
 * WHAT THE EVENT SEES IS THE APP'S VIEW, NOT THE USER'S. `im.message.receive_v1`
 * delivers messages the app (bot) receives — chats the bot is a member of
 * and DMs to it — while the READ adapter walks everything the authorizing
 * USER can see. In a chat the bot is not in, push sees nothing and the
 * reconciliation poll sees everything first: that is exactly the miss the
 * §6.4 measurement counts, and it demotes such a deployment to kick mode by
 * itself. Add the bot to the tracked chats for push to carry content.
 *
 * LIVENESS: every event is `heard`; the underlying socket's ping/pong is
 * listened to when the SDK exposes its socket (best effort — the SDK's
 * server-configured ping interval may exceed `PUSH_HEARTBEAT_MS`, in which
 * case a quiet chat's lane reads `push-dead` between messages and polling
 * returns to the fast cadence; that is the safe direction, design §6.4).
 *
 * `EGRESS` is empty on purpose: this file constructs no HTTP request of its
 * own — the SDK does, against the host the brand names in src/channels/lark.js.
 */
const { startLane } = require('./lane.js');

const SDK_NAME = '@larksuiteoapi/node-sdk';
/** The ONE event this lane subscribes to (a v2 event; enable it in the
 *  app's Event Subscriptions with the long-connection mode). */
const EVENT = 'im.message.receive_v1';
/** THE DECLARED EGRESS (§3.1): none — the SDK owns the connection. */
const EGRESS = Object.freeze([]);
/** How long the push path waits for chat-member names before writing the
 *  record with bare ids: the ack budget is the vendor's 3 s and the record
 *  must be durable inside it. */
const NAMES_WAIT_MS = 1000;

function loadSdk(injected) {
  if (injected) return injected;
  try { return require(SDK_NAME); }
  catch (e) {
    const err = new Error(`the official Lark SDK (${SDK_NAME}) is not installed on this instance — \`npm install ${SDK_NAME}\` and restart; until then the poll carries everything`);
    err.permanent = true; err.code = 'sdk-not-installed';
    throw err;
  }
}

/** The v2 event payload → the REST `im/v1/messages` item shape the read
 *  adapter's `toRecord()` already normalizes (ONE normalizer, two arrivals). */
function eventToItem(data) {
  const e = (data && data.event) || data || {};
  const m = e.message || {};
  const s = e.sender || {};
  const sid = s.sender_id || {};
  return {
    message_id: m.message_id, chat_id: m.chat_id, create_time: m.create_time, update_time: m.update_time,
    msg_type: m.message_type, body: { content: m.content },
    parent_id: m.parent_id, root_id: m.root_id, thread_id: m.thread_id, chat_type: m.chat_type,
    sender: { id: String(sid.open_id || sid.user_id || sid.union_id || ''), sender_type: s.sender_type || 'user' },
    mentions: (Array.isArray(m.mentions) ? m.mentions : []).map((x) => ({
      key: x && x.key, name: x && x.name,
      id: x && x.id && typeof x.id === 'object' ? String(x.id.open_id || x.id.user_id || x.id.union_id || '') : String((x && x.id) || ''),
    })),
  };
}
/** The vendor's event id (v2: `header.event_id`; the SDK may flatten it). */
function eventIdOf(data) {
  const h = (data && data.header) || {};
  return String(h.event_id || (data && data.event_id) || '') || null;
}

/**
 * @param {object} o
 * @param {string}   o.adapterId
 * @param {string}   o.brand        'feishu' | 'lark' — decides the SDK domain
 * @param {function} o.credential   () => { values:{appId, appSecret}|null, why }
 * @param {function} o.toRecord     async (convId, item) => ChannelRecord
 * @param {object}   [o.sdk]        an injected SDK (the suite's stub)
 */
function createLarkLive({ adapterId, brand = 'feishu', credential, toRecord, now = () => Date.now(), log = console, sdk = null, reconnectMinMs, reconnectMaxMs } = {}) {
  if (typeof credential !== 'function' || typeof toRecord !== 'function') throw new Error('createLarkLive: credential() and toRecord() are required');
  return {
    start({ onEvent, onState } = {}) {
      return startLane({
        name: `lark:${adapterId}`, onEvent, onState, now, log, reconnectMinMs, reconnectMaxMs,
        async connect(h) {
          const cred = credential();
          if (!cred.values) { const err = new Error(`no Lark app credential: ${cred.why || 'none configured'}`); err.permanent = true; err.code = 'needs-credentials'; throw err; }
          const Lark = loadSdk(sdk);
          const domain = Lark.Domain ? (brand === 'lark' ? Lark.Domain.Lark : Lark.Domain.Feishu) : undefined;
          const client = new Lark.WSClient({
            appId: String(cred.values.appId), appSecret: String(cred.values.appSecret),
            ...(domain !== undefined ? { domain } : {}),
            ...(Lark.LoggerLevel && Lark.LoggerLevel.error !== undefined ? { loggerLevel: Lark.LoggerLevel.error } : {}),
          });
          const dispatcher = new Lark.EventDispatcher({}).register({
            [EVENT]: async (data) => {
              h.heard();
              const item = eventToItem(data);
              if (!item.message_id || !item.chat_id) return;     // not a message: acked, nothing to persist
              const convId = String(item.chat_id);
              const record = await toRecord(convId, item);
              const r = await h.event({ kind: 'record', eventId: eventIdOf(data) || `msg:${item.message_id}`, convId, record, at: now() });
              // A stopped lane answers WITHOUT persisting: refuse the ack so
              // the vendor redelivers to whoever is alive.
              if (r && r.ok === false && r.why === 'stopped') throw new Error('lane stopped before the event was persisted — not acknowledged');
              return r;
            },
          });
          await client.start({ eventDispatcher: dispatcher });
          // Ping/pong observability, best effort: the SDK's socket, when reachable.
          const sock = client.wsInstance || client.ws || client.socket || null;
          if (sock && typeof sock.on === 'function') {
            try { sock.on('pong', () => h.heard()); sock.on('ping', () => h.heard()); sock.on('close', () => h.closed('socket closed')); } catch {}
          }
          return {
            close() {
              for (const m of ['close', 'stop', 'disconnect']) {
                if (typeof client[m] === 'function') { try { client[m](); } catch {} return; }
              }
              if (sock && typeof sock.close === 'function') { try { sock.close(); } catch {} }
            },
          };
        },
      });
    },
  };
}

module.exports = { createLarkLive, eventToItem, eventIdOf, EVENT, EGRESS, SDK_NAME, NAMES_WAIT_MS };
