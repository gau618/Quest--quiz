import { io, Socket } from 'socket.io-client';

const SOCKET_URL = 'http://localhost:4000';

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
  auth: (cb) => {
    const token = localStorage.getItem('gp_token');
    const userId = localStorage.getItem('gp_userId');
    cb({ token, userId });
  },
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 3000,
});

// Connection lifecycle handlers
socket.on('connect', () => {
  console.log('[Socket] ✅ Connected to server');
});

socket.on('disconnect', (reason) => {
  console.log(`[Socket] ❌ Disconnected: ${reason}`);
});

socket.on('connect_error', (err) => {
  console.error('[Socket] ❌ Connection error:', err.message);
});

// Reconnect handlers
socket.io.on('reconnect_attempt', (attempt) => {
  console.log(`[Socket] 🔄 Reconnect attempt #${attempt}`);
});

socket.io.on('reconnect_error', (err) => {
  console.error('[Socket] ❌ Reconnect error:', err.message);
});

socket.io.on('reconnect_failed', () => {
  console.error('[Socket] ❌ Reconnect failed');
});

export default socket;
