// src/lib/socket.ts
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

// A single, shared socket instance for the entire application.
// autoConnect: false gives us control over when the connection is made.
export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
});
