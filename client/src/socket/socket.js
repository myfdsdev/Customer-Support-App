import { io } from 'socket.io-client';

/**
 * One socket per audience. The token decides everything server-side, so the
 * client just supplies it in the handshake and never sends ids in payloads
 * that matter for authorization.
 */

const URL = import.meta.env.VITE_SOCKET_URL || undefined; // same origin via the Vite proxy

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
