import 'dotenv/config';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { redis, redisSubscriber } from './src/lib/redis/client';
import { setupGracefulShutdown } from './src/lib/shutdown';
import { gameService } from './src/lib/services/game.service';
import prisma from './src/lib/prisma/client';

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

const userSocketMap = new Map<string, string>();
const participantSocketMap = new Map<string, string>();

async function sendNextQuestionToSocket(socket: Socket, sessionId: string, participantId: string) {
  try {
    const gameStateStr = await redis.get(`game_state:${sessionId}`);
    if (!gameStateStr) {
      console.warn(`[Socket.IO] No game state for session ${sessionId}`);
      return;
    }
    const gameState = JSON.parse(gameStateStr);
    if (Date.now() >= gameState.endTime) {
      console.warn(`[Socket.IO] Game session ${sessionId} ended`);
      return;
    }

    let questionsArr = gameState.questions[participantId] || [];
    const question = questionsArr.shift();
    gameState.questions[participantId] = questionsArr;
    await redis.set(`game_state:${sessionId}`, JSON.stringify(gameState), 'KEEPTTL');

    if (question) {
      console.log(`[Socket.IO] Emitting question:new to participant ${participantId}:`, question);
      socket.emit('question:new', question);
    } else {
      console.warn(`[Socket.IO] No more questions for participant ${participantId} in session ${sessionId}`);
      socket.emit('game:end', { reason: 'No more questions' });
    }
  } catch (error) {
    console.error(`[Socket.IO] Error sending next question:`, error);
  }
}

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
          if (socketId) {
            io.to(socketId).emit(event, payload);
            console.log(`[IPC] Emitted event "${event}" to user ${userId}`);
          } else {
            console.warn(`[IPC] No socket for user ${userId}`);
          }
        });
        break;
      case 'room':
        ids.forEach((room: string) => {
          io.to(room).emit(event, payload);
          console.log(`[IPC] Emitted event "${event}" to room ${room}`);
        });
        break;
      case 'participant':
        ids.forEach((participantId: string) => {
          const socketId = participantSocketMap.get(participantId);
          if (socketId) {
            io.to(socketId).emit(event, payload);
            console.log(`[IPC] Emitted event "${event}" to participant ${participantId}`);
          } else {
            console.warn(`[IPC] No socket for participant ${participantId}`);
          }
        });
        break;
      default:
        console.warn('[IPC] Unknown target:', target, ids, event);
    }
  } catch (error) {
    console.error('[IPC] Error processing message from Redis:', error);
  }
});

io.on('connection', (socket: Socket) => {
  const { userId } = socket.handshake.query;
  if (typeof userId === 'string') {
    userSocketMap.set(userId, socket.id);
    console.log(`[Socket.IO] User ${userId} connected with socket ${socket.id}`);
  } else {
    console.warn('[Socket.IO] No userId provided in handshake query');
  }

  socket.on('game:register-participant', (data: { participantId: string }) => {
    if (data.participantId) {
      participantSocketMap.set(data.participantId, socket.id);
      console.log(`[Socket.IO] Registered participant ${data.participantId} to socket ${socket.id}`);
    } else {
      console.warn('[Socket.IO] No participantId provided in game:register-participant');
    }
  });

  socket.on('game:join', (data) => {
    if (!data.sessionId || !data.participantId) {
      console.warn('[Socket.IO] Missing sessionId or participantId in game:join', data);
      return;
    }
    socket.join(data.sessionId);
    console.log(`[Socket.IO] Socket ${socket.id} joined session ${data.sessionId} as participant ${data.participantId}`);
    sendNextQuestionToSocket(socket, data.sessionId, data.participantId);
  });

  socket.on('answer:submit', async (data: { sessionId: string; participantId: string; questionId: string; optionId: string }) => {
    try {
      if (!data.sessionId || !data.participantId || !data.questionId || !data.optionId) {
        console.warn('[Socket.IO] Incomplete data in answer:submit', data);
        return;
      }
      console.log('[Socket.IO] Received answer:submit', data);
      await gameService.handleAnswer(data.sessionId, data.participantId, data.questionId, data.optionId);
    } catch (err) {
      console.error('[Socket.IO] Error in answer:submit:', err);
    }
  });

  socket.on('question:skip', async (data: { sessionId: string; participantId: string }) => {
    try {
      if (!data.sessionId || !data.participantId) {
        console.warn('[Socket.IO] Incomplete data in question:skip', data);
        return;
      }
      console.log('[Socket.IO] Received question:skip', data);
      await gameService.handleSkip(data.sessionId, data.participantId);
    } catch (err) {
      console.error('[Socket.IO] Error in question:skip:', err);
    }
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
