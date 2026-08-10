import { io } from 'socket.io-client';
import { resolveSocketUrl } from '../services/api';

/**
 * One socket per audience. The token decides everything server-side, so the
 * client just supplies it in the handshake and never sends ids in payloads
 * that matter for authorization.
 */

/**
 * Where to open the websocket.
 *
 * Derived from VITE_API_URL when VITE_SOCKET_URL is not set, because on a split
 * deployment (static frontend + separate API service) "same origin" points at
 * the static host, where nothing is listening — realtime would fail silently
 * while REST kept working. `undefined` means same origin, which is correct in
 * development behind the Vite proxy and for single-service deployments.
 */
const URL = resolveSocketUrl(import.meta.env.VITE_SOCKET_URL, import.meta.env.VITE_API_URL);

const sockets = { agent: null, customer: null };

function create(token) {
  return io(URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 6000,
    timeout: 12000,
    autoConnect: true,
  });
}

export function connectAgentSocket(token) {
  if (sockets.agent?.connected && sockets.agent.auth?.token === token) return sockets.agent;
  disconnectAgentSocket();
  sockets.agent = create(token);
  return sockets.agent;
}

export function disconnectAgentSocket() {
  if (sockets.agent) {
    sockets.agent.removeAllListeners();
    sockets.agent.disconnect();
    sockets.agent = null;
  }
}

export function connectCustomerSocket(token) {
  if (sockets.customer?.connected && sockets.customer.auth?.token === token) return sockets.customer;
  disconnectCustomerSocket();
  sockets.customer = create(token);
  return sockets.customer;
}

export function disconnectCustomerSocket() {
  if (sockets.customer) {
    sockets.customer.removeAllListeners();
    sockets.customer.disconnect();
    sockets.customer = null;
  }
}

export const getAgentSocket = () => sockets.agent;
export const getCustomerSocket = () => sockets.customer;

/** Collision-resistant enough for an idempotency key without pulling in uuid. */
export function newClientMessageId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `cm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Emit with acknowledgement, as a promise.
 *
 * Rejects rather than hanging if the server never acks — the caller then falls
 * back to REST. The timeout is deliberately short: this path exists to make
 * chat feel instant, so a slow socket should hand over quickly rather than
 * leave the message stuck in "sending".
 */
export function emitWithAck(socket, event, payload, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    if (!socket || !socket.connected) {
      reject(new Error('socket_disconnected'));
      return;
    }

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('socket_ack_timeout'));
    }, timeoutMs);

    socket.emit(event, payload, (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (response?.ok) resolve(response);
      else reject(Object.assign(new Error(response?.error || 'socket_send_failed'), { response }));
    });
  });
}
