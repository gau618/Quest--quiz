// src/websocket/socketServer.ts
import 'dotenv/config';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { createClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import { setupGracefulShutdown } from '@/lib/shutdown';
import { gameService } from '@/lib/services/game.service';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

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
                if (socketId) io.to(socketId).emit(event, payload);
                else console.warn(`[Socket.IO] User ${userId} not found for event '${event}'.`);
            });
            break;
        case 'room':
            ids.forEach((room: string) => io.to(room).emit(event, payload));
            break;
        case 'participant':
            ids.forEach((participantId: string) => {
                const socketId = participantSocketMap.get(participantId);
                if (socketId) io.to(socketId).emit(event, payload);
                else console.warn(`[Socket.IO] Participant ${participantId} not found for event '${event}'.`);
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
    socket.disconnect(true);
    return;
  }
  userSocketMap.set(userId, socket.id);
  console.log(`[Socket.IO] User ${userId} connected with socket ${socket.id}.`);

  socket.on('game:register-participant', (data: { participantId: string; sessionId?: string }) => {
    console.log(`[Socket.IO] Registering participant ${data.participantId} to socket ${socket.id}.`);
    if (data.participantId) {
      participantSocketMap.set(data.participantId, socket.id);
      if (data.sessionId) socket.join(data.sessionId);
    }
  });

  // --- All Game Mode Event Listeners ---
  socket.on('quickduel:request_first_question', (data) => gameService.sendNextQuestion(data.sessionId, data.participantId));
  socket.on('practice:next_question', (data) => gameService.handleNextPracticeQuestion(data.sessionId, data.participantId));
  
  // NEW LISTENER FOR TIME ATTACK
  socket.on('time_attack:request_next_question', (data: { sessionId: string; participantId: string }) => {
    console.log(`[Socket.IO] Received 'time_attack:request_next_question' for session ${data.sessionId}`);
    gameService.sendNextTimeAttackQuestion(data.sessionId, data.participantId);
  });
  
  socket.on('answer:submit', (data) => gameService.handleAnswer(data.sessionId, data.participantId, data.questionId, data.optionId));
  socket.on('question:skip', (data) => gameService.handleSkip(data.sessionId, data.participantId));

  socket.on('disconnect', (reason) => {
    console.log(`[Socket.IO] Socket ${socket.id} disconnected. Reason: ${reason}`);
    if (userSocketMap.get(userId) === socket.id) userSocketMap.delete(userId);
    for (const [pId, sId] of participantSocketMap.entries()) {
      if (sId === socket.id) participantSocketMap.delete(pId);
    }
  });
});

const PORT = process.env.SOCKET_PORT || 4000;
httpServer.listen(PORT, () => console.log(`🚀 Socket.IO server listening on port ${PORT}`));
setupGracefulShutdown(httpServer);
