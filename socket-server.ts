// src/websocket/socketServer.ts
import 'dotenv/config'; // Load environment variables
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { redisSubscriber } from '@/lib/redis/client'; // Assuming redis, redisPublisher are also from here
import { setupGracefulShutdown } from '@/lib/shutdown';
import { gameService } from '@/lib/services/game.service'; // Ensure gameService is correctly imported

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }, // Allow all origins for development
});

// Maps to keep track of socket IDs linked to user/participant IDs
const userSocketMap = new Map<string, string>(); // userId -> socketId
const participantSocketMap = new Map<string, string>(); // participantId -> socketId

// --- IPC: Listening for events from other services via Redis Pub/Sub ---
redisSubscriber.subscribe('socket-events', (err) => {
  if (err) console.error('❌ Failed to subscribe to socket-events channel', err);
  else console.log('✅ [IPC] Subscribed to socket-events channel on Redis.');
});

redisSubscriber.on('message', (channel, message) => {
  if (channel !== 'socket-events') return; // Ensure we only process messages from our channel
  try {
    const { target, ids, event, payload } = JSON.parse(message);
    console.log(`[IPC] Received event '${event}' for target '${target}' with IDs: ${ids.join(',')}`);

    switch (target) {
      case 'user': // Emit to specific user(s)
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
      case 'room': // Emit to all clients in a specific Socket.IO room
        ids.forEach((room: string) => {
          io.to(room).emit(event, payload);
          console.log(`[Socket.IO] Emitted '${event}' to room ${room}.`);
        });
        break;
      case 'participant': // Emit to specific participant(s)
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
    console.error('[IPC] Error processing message from Redis:', error, 'Message:', message);
  }
});

// --- Socket.IO Connection and Event Handlers ---
io.on('connection', (socket: Socket) => {
  const { userId } = socket.handshake.query;
  if (typeof userId === 'string') {
    userSocketMap.set(userId, socket.id);
    console.log(`[Socket.IO] User ${userId} connected with socket ${socket.id}. Total connected users: ${userSocketMap.size}`);
  } else {
    console.warn(`[Socket.IO] Socket ${socket.id} connected without a valid userId.`);
  }

  // A client registers its participant ID after match:found
  socket.on('game:register-participant', (data: { participantId: string }) => {
    if (data.participantId) {
      participantSocketMap.set(data.participantId, socket.id);
      console.log(`[Socket.IO] Registered participant ${data.participantId} to socket ${socket.id}.`);
    } else {
      console.warn(`[Socket.IO] Received game:register-participant without participantId from socket ${socket.id}.`);
    }
  });

  // Client joins the game session room
  socket.on('game:join', (data: { sessionId: string; participantId: string }) => {
    if (!data.sessionId || !data.participantId) {
      console.warn(`[Socket.IO] Received game:join without sessionId or participantId from socket ${socket.id}.`);
      return;
    }
    socket.join(data.sessionId);
    console.log(`[Socket.IO] Socket ${socket.id} joined session room ${data.sessionId}.`);
  });

  // Handle Quick Duel and Fastest Finger answer submissions
  socket.on('answer:submit', (data: { sessionId: string; participantId: string; questionId: string; optionId: string }) => {
    console.log(`[Socket.IO] Received 'answer:submit' from participant ${data.participantId} for Q${data.questionId} in session ${data.sessionId}.`);
    // This single event handles both game modes, the gameService will route it
    gameService.handleAnswer(data.sessionId, data.participantId, data.questionId, data.optionId);
  });

  // Handle Quick Duel skip requests
  socket.on('question:skip', (data: { sessionId: string; participantId: string }) => {
    console.log(`[Socket.IO] Received 'question:skip' from participant ${data.participantId} in session ${data.sessionId}.`);
    // Only Quick Duel uses explicit skips in this implementation
    gameService.handleSkip(data.sessionId, data.participantId);
  });

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`[Socket.IO] Socket ${socket.id} disconnected. Reason: ${reason}`);
    if (typeof userId === 'string') {
      userSocketMap.delete(userId);
      console.log(`[Socket.IO] User ${userId} removed from map. Remaining users: ${userSocketMap.size}`);
    }
    // Remove participant mapping if it exists for this socket
    let removedParticipantId: string | undefined;
    for (const [pId, sId] of participantSocketMap.entries()) {
      if (sId === socket.id) {
        removedParticipantId = pId;
        participantSocketMap.delete(pId);
        break;
      }
    }
    if (removedParticipantId) {
      console.log(`[Socket.IO] Participant ${removedParticipantId} removed from map.`);
    }
  });
});

const PORT = process.env.SOCKET_PORT || 4000;
httpServer.listen(PORT, () => console.log(`🚀 Socket.IO server listening on port ${PORT}`));
setupGracefulShutdown(httpServer);
