// socket-server.ts

import 'dotenv/config';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { gameService } from './src/lib/services/game.service';
import { socketService } from './src/lib/websocket/socket.service'; // Import the service

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Initialize the shared service instance with our running server
socketService.init(io);

io.on('connection', (socket: Socket) => {
  const { userId, participantId } = socket.handshake.query;
  
  if (typeof userId === 'string') {
    socketService.userSocketMap.set(userId, socket.id);
    console.log(`[Socket.IO] User ${userId} connected with socket ${socket.id}`);
  }
  if (typeof participantId === 'string') {
    socketService.participantSocketMap.set(participantId, socket.id);
  }
  
  socket.on('game:join', (sessionId: string) => { /* ... */ });
  socket.on('answer:submit', (data: any) => { /* ... */ });
  socket.on('question:skip', (data: any) => { /* ... */ });
  
  socket.on('disconnect', () => {
    if (typeof userId === 'string') socketService.userSocketMap.delete(userId);
    if (typeof participantId === 'string') socketService.participantSocketMap.delete(participantId);
    console.log(`[Socket.IO] Socket ${socket.id} (User: ${userId}) disconnected.`);
  });
});

// ... (rest of the file, including httpServer.listen and setupGracefulShutdown)
