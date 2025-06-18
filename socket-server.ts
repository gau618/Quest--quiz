import 'dotenv/config';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { redisSubscriber } from './src/lib/redis/client'; // Assuming redis, redisPublisher are also from here
import { setupGracefulShutdown } from './src/lib/shutdown';
import { gameService } from './src/lib/services/game.service'; // Ensure gameService is correctly imported

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Maps to keep track of connections
const userSocketMap = new Map<string, string>();
const participantSocketMap = new Map<string, string>();

// --- FIX: REMOVED the entire buggy sendNextQuestionToSocket function. ---
// The game.service.ts now handles all question sending logic.

// Listens for events from the game service worker via Redis
redisSubscriber.subscribe('socket-events', (err) => {
  if (err) console.error('Failed to subscribe to socket-events channel', err);
  else console.log('[IPC] Subscribed to socket-events channel.');
});

redisSubscriber.on('message', (channel, message) => {
  if (channel !== 'socket-events') return;
  try {
    const { target, ids, event, payload } = JSON.parse(message);
    switch (target) {
      case 'user':
        ids.forEach((userId: string) => {
          const socketId = userSocketMap.get(userId);
          if (socketId) io.to(socketId).emit(event, payload);
        });
        break;
      case 'room':
        ids.forEach((room: string) => io.to(room).emit(event, payload));
        break;
      case 'participant':
        ids.forEach((participantId: string) => {
          const socketId = participantSocketMap.get(participantId);
          if (socketId) io.to(socketId).emit(event, payload);
        });
        break;
    }
  } catch (error) {
    console.error('[IPC] Error processing message from Redis:', error);
  }
});

// Handles new socket connections
io.on('connection', (socket: Socket) => {
  const { userId } = socket.handshake.query;
  if (typeof userId === 'string') {
    userSocketMap.set(userId, socket.id);
    console.log(`[Socket.IO] User ${userId} connected with socket ${socket.id}`);
  }

  socket.on('game:register-participant', (data: { participantId: string }) => {
    if (data.participantId) {
      participantSocketMap.set(data.participantId, socket.id);
      console.log(`[Socket.IO] Registered participant ${data.participantId} to socket ${socket.id}`);
    }
  });

  // --- FIX: The 'game:join' handler now ONLY joins the room. ---
  // It no longer contains game logic. The game.service.ts already started the game.
  socket.on('game:join', (data: { sessionId: string; participantId: string }) => {
    if (!data.sessionId || !data.participantId) return;
    socket.join(data.sessionId);
    console.log(`[Socket.IO] Socket ${socket.id} joined session ${data.sessionId}`);
  });

  // Forwards user actions to the game service worker
  socket.on('answer:submit', (data: { sessionId: string; participantId: string; questionId: string; optionId: string }) => {
    gameService.handleAnswer(data.sessionId, data.participantId, data.questionId, data.optionId);
  });

  socket.on('question:skip', (data: { sessionId: string; participantId: string }) => {
    gameService.handleSkip(data.sessionId, data.participantId);
  });

  socket.on('disconnect', () => {
    if (typeof userId === 'string') userSocketMap.delete(userId);
    for (const [pId, sId] of participantSocketMap.entries()) {
      if (sId === socket.id) {
        participantSocketMap.delete(pId);
        break;
      }
    }
    console.log(`[Socket.IO] Socket ${socket.id} disconnected`);
  });
});

const PORT = process.env.SOCKET_PORT || 4000;
httpServer.listen(PORT, () => console.log(`🚀 Socket.IO server listening on port ${PORT}`));
setupGracefulShutdown(httpServer);
