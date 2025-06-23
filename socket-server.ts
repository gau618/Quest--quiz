// src/websocket/socketServer.ts
import 'dotenv/config';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { setupGracefulShutdown } from '@/lib/shutdown';
import { gameService } from '@/lib/services/game.service'; // Corrected Path

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Configure Redis clients for the Socket.IO adapter
const pubClient = createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });
const subClient = pubClient.duplicate();

Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
  io.adapter(createAdapter(pubClient, subClient));
  console.log('✅ Socket.IO is now using the Redis adapter for scaling.');
}).catch(err => {
    console.error('❌ Failed to connect Redis clients for Socket.IO adapter:', err);
    process.exit(1);
});

const userSocketMap = new Map<string, string>();
const participantSocketMap = new Map<string, string>();

// This dedicated subscriber listens for custom application events from the game service.
const ipcSubscriber = pubClient.duplicate();
ipcSubscriber.connect();
ipcSubscriber.subscribe('socket-events', (message) => {
    try {
        const { target, ids, event, payload } = JSON.parse(message);
        console.log(`[IPC] Received event '${event}' for target '${target}' with IDs: ${ids.join(',')}`);
        switch (target) {
        case 'user':
            ids.forEach((userId: string) => {
                const socketId = userSocketMap.get(userId);
                if (socketId) {
                    io.to(socketId).emit(event, payload);
                    console.log(`[Socket.IO] Emitted '${event}' to user ${userId} (socket ${socketId}).`);
                } else {
                    console.warn(`[Socket.IO] User ${userId} not found in userSocketMap for event '${event}'.`);
                }
            });
            break;
        case 'room':
            ids.forEach((room: string) => {
                io.to(room).emit(event, payload);
                console.log(`[Socket.IO] Emitted '${event}' to room ${room}.`);
            });
            break;
        case 'participant':
            ids.forEach((participantId: string) => {
                const socketId = participantSocketMap.get(participantId);
                if (socketId) {
                    io.to(socketId).emit(event, payload);
                    console.log(`[Socket.IO] Emitted '${event}' to participant ${participantId} (socket ${socketId}).`);
                } else {
                    console.warn(`[Socket.IO] Participant ${participantId} not found in participantSocketMap for event '${event}'.`);
                }
            });
            break;
        }
    } catch (error) {
        console.error('[IPC] Error processing message from Redis:', error);
    }
});


io.on('connection', (socket: Socket) => {
  const { userId } = socket.handshake.query;
  if (typeof userId !== 'string' || !userId) {
    console.warn(`[Socket.IO] Socket ${socket.id} connected without a valid userId. Disconnecting.`);
    socket.disconnect(true);
    return;
  }
  userSocketMap.set(userId, socket.id);
  console.log(`[Socket.IO] User ${userId} connected with socket ${socket.id}. Total users: ${userSocketMap.size}`);

  // This listener is now UNIVERSAL. It works for all game modes.
  socket.on('game:register-participant', (data: { participantId: string; sessionId?: string }) => {
    console.log(`[Socket.IO] Received 'game:register-participant' from socket ${socket.id} with data:`, data);
    if (data.participantId) {
      participantSocketMap.set(data.participantId, socket.id);
      console.log(`[Socket.IO] Registered participant ${data.participantId} to socket ${socket.id}.`);
      if (data.sessionId) {
        socket.join(data.sessionId);
        console.log(`[Socket.IO] Socket ${socket.id} joined session room ${data.sessionId}.`);
      }
    } else {
      console.warn(`[Socket.IO] Received game:register-participant without participantId from socket ${socket.id}.`);
    }
  });
  

  // Event handlers that forward requests to the game service
  socket.on('practice:next_question', (data) => gameService.handleNextPracticeQuestion(data.sessionId, data.participantId));
  socket.on('answer:submit', (data) => gameService.handleAnswer(data.sessionId, data.participantId, data.questionId, data.optionId));
  socket.on('question:skip', (data) => gameService.handleSkip(data.sessionId, data.participantId));

  socket.on('disconnect', (reason) => {
    console.log(`[Socket.IO] Socket ${socket.id} disconnected. Reason: ${reason}`);
    if (userSocketMap.get(userId) === socket.id) {
      userSocketMap.delete(userId);
    }
    for (const [pId, sId] of participantSocketMap.entries()) {
      if (sId === socket.id) {
        participantSocketMap.delete(pId);
        break;
      }
    }
    console.log(`[Socket.IO] User ${userId} and their participant mappings have been cleaned up.`);
  });
});

const PORT = process.env.SOCKET_PORT || 4000;
httpServer.listen(PORT, () => console.log(`🚀 Socket.IO server listening on port ${PORT}`));
setupGracefulShutdown(httpServer);
