import { WebSocketServer } from 'ws';
import crypto from 'crypto';

let realtimeServer = null;
let realtimePort = 0;
const realtimeToken = crypto.randomBytes(24).toString('hex');
const clients = new Map();

function sendJson(socket, payload) {
  if (!socket || socket.readyState !== 1) return;
  socket.send(JSON.stringify(payload));
}

export function startRealtimeServer() {
  if (realtimeServer) {
    return getRealtimeConfig();
  }

  realtimeServer = new WebSocketServer({ host: '127.0.0.1', port: 0 });

  realtimeServer.on('listening', () => {
    const address = realtimeServer.address();
    realtimePort = typeof address === 'object' && address ? address.port : 0;
    console.log(`Realtime WebSocket server listening on 127.0.0.1:${realtimePort}`);
  });

  realtimeServer.on('connection', (socket, request) => {
    const url = new URL(request.url || '/', 'ws://127.0.0.1');
    if (url.searchParams.get('token') !== realtimeToken) {
      socket.close(1008, 'Unauthorized');
      return;
    }

    const userId = url.searchParams.get('userId') || '';
    const role = url.searchParams.get('role') || '';
    const clientId = crypto.randomUUID();
    clients.set(clientId, { socket, userId, role });
    sendJson(socket, { type: 'connected', at: new Date().toISOString() });

    socket.on('close', () => {
      clients.delete(clientId);
    });
  });

  realtimeServer.on('error', (error) => {
    console.error('Realtime WebSocket server error:', error);
  });

  return getRealtimeConfig();
}

export function getRealtimeConfig() {
  return {
    enabled: Boolean(realtimeServer),
    host: '127.0.0.1',
    port: realtimePort,
    token: realtimeToken
  };
}

let mobileNotifier = null;

export function setMobileNotifier(fn) {
  mobileNotifier = fn;
}

export function broadcastRealtimeEvent(payload = {}, target = {}) {
  const message = {
    ...payload,
    at: payload.at || new Date().toISOString()
  };

  for (const { socket, userId, role } of clients.values()) {
    if (target.userId && String(target.userId) !== String(userId)) continue;
    if (target.role && String(target.role) !== String(role)) continue;
    sendJson(socket, message);
  }

  if (typeof mobileNotifier === 'function') {
    try {
      mobileNotifier(payload.type || 'update', payload);
    } catch (_) {}
  }
}

export function stopRealtimeServer() {
  for (const { socket } of clients.values()) {
    try {
      socket.close();
    } catch (_) {
      // ignore close errors
    }
  }
  clients.clear();
  if (realtimeServer) {
    realtimeServer.close();
    realtimeServer = null;
    realtimePort = 0;
  }
}
