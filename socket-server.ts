// src/websocket/socketServer.ts

import "dotenv/config";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import { setupGracefulShutdown } from "@/lib/shutdown";
import { gameService } from "@/lib/services/game/game.service";
import { chatService } from "@/lib/services/chat/chat.service";
import { lobbyService } from "@/lib/lobby/lobby.service";
import prisma from "@/lib/prisma/client";

// Create HTTP server with health check endpoint
const httpServer = createServer((req, res) => {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Health check endpoints
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'Socket.IO Server',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      port: process.env.PORT || process.env.SOCKET_PORT || 4000
    }));
  } else if (req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'running',
      connections: io.engine.clientsCount,
      redis: 'connected'
    }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Redis client setup
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error("❌ REDIS_URL is not defined in environment variables.");
  throw new Error("❌ REDIS_URL is not defined in environment variables.");
}

console.log("✅ Redis URL configured for Socket.IO server");

const pubClient = createClient({
  url: redisUrl,
  socket: redisUrl.startsWith("rediss://")
    ? {
        tls: true,
        rejectUnauthorized: false
      }
    : undefined,
});

const subClient = pubClient.duplicate();

// Redis Pub/Sub bridge for inter-process communication
const ipcSubscriber = pubClient.duplicate();

// Add Redis error handling
pubClient.on('error', (err) => {
  console.error('❌ Redis Pub Client Error:', err.message);
});

subClient.on('error', (err) => {
  console.error('❌ Redis Sub Client Error:', err.message);
});

ipcSubscriber.on('error', (err) => {
  console.error('❌ Redis IPC Subscriber Error:', err.message);
});

// Connect Redis clients and set up the adapter
Promise.all([pubClient.connect(), subClient.connect()]).then(() => {
  io.adapter(createAdapter(pubClient, subClient));
  console.log("✅ Socket.IO is now using the Redis adapter for scaling.");

  // --- REDIS PUB/SUB BRIDGE: Forward events from Redis to Socket.IO ---
  const IPC_CHANNEL = "socket-events";
  ipcSubscriber.connect().then(() => {
    ipcSubscriber.subscribe(IPC_CHANNEL, (message) => {
      try {
        const { target, ids, event, payload } = JSON.parse(message);
        if (target === "user") {
          ids.forEach((userId: string) => {
            const sid = userSocketMap.get(userId);
            if (sid) io.to(sid).emit(event, payload);
          });
        } else if (target === "room") {
          ids.forEach((roomId: string) => {
            io.to(roomId).emit(event, payload);
          });
        } else if (target === "participant") {
          ids.forEach((participantId: string) => {
            const sid = participantSocketMap.get(participantId);
            if (sid) io.to(sid).emit(event, payload);
          });
        }
      } catch (err) {
        console.error("[SocketServer] Failed to handle IPC message:", err);
      }
    });
    console.log("✅ Socket.IO Redis Pub/Sub bridge is active.");
  });
}).catch((err) => {
  console.error("❌ Failed to connect Redis clients:", err);
});

// Socket.IO error handling
io.engine.on("connection_error", (err) => {
  console.log("[Socket Server Error] Code:", err.code);
  console.log("[Socket Server Error] Message:", err.message);
  console.log("[Socket Server Error] Context:", err.context);
});

// In-memory maps for user and participant socket IDs
const userSocketMap = new Map<string, string>();
const participantSocketMap = new Map<string, string>();

io.on("connection", (socket: Socket) => {
  // Support both modern 'auth' and legacy 'query' for userId
  const userId = (socket.handshake.auth.userId ||
    socket.handshake.query.userId) as string;

  if (typeof userId !== "string" || !userId) {
    console.warn(
      "[Socket.IO] Connection rejected: No userId provided in auth or query."
    );
    socket.disconnect(true);
    return;
  }

  userSocketMap.set(userId, socket.id);
  console.log(`[Socket.IO] User ${userId} connected with socket ${socket.id}.`);

  // Game and lobby events (existing logic)
  socket.on(
    "game:register-participant",
    (data: { participantId: string; sessionId?: string }) => {
      console.log(
        `[Socket.IO] Registering participant ${data.participantId} to socket ${socket.id}.`
      );
      if (data.participantId) {
        participantSocketMap.set(data.participantId, socket.id);
        if (data.sessionId) socket.join(data.sessionId);
      }
    }
  );

  socket.on("quickduel:request_first_question", (data) =>
    gameService.sendNextQuestion(data.sessionId, data.participantId)
  );
  socket.on("practice:next_question", (data) =>
    gameService.handleNextPracticeQuestion(data.sessionId, data.participantId)
  );
  socket.on("time_attack:request_next_question", (data) =>
    gameService.sendNextTimeAttackQuestion(data.sessionId, data.participantId)
  );

  socket.on("lobby:leave", (data) =>
    lobbyService.leaveLobby(data.roomCode, userId)
  );
  socket.on("lobby:initiate_countdown", (data) =>
    lobbyService.initiateCountdown(data.roomCode, userId)
  );
  socket.on("lobby:cancel_countdown", (data) =>
    lobbyService.cancelCountdown(data.roomCode, userId)
  );

  socket.on("answer:submit", (data) =>
    gameService.handleAnswer(
      data.sessionId,
      data.participantId,
      data.questionId,
      data.optionId
    )
  );
  socket.on("question:skip", (data) =>
    gameService.handleSkip(data.sessionId, data.participantId)
  );

  // --- Chat events ---
  socket.on("chat:join_rooms", (roomIds: string[]) => {
    if (Array.isArray(roomIds)) {
      console.log(
        `[SERVER] Received chat:join_rooms from user ${userId}. Joining rooms:`,
        roomIds
      );
      roomIds.forEach((roomId) => socket.join(roomId));
    }
  });

  socket.on(
    "chat:send_message",
    async (data: { chatRoomId: string; content: string }) => {
      try {
        // Save and get the new message from the service
        const newMessage = await chatService.sendMessage(
          userId,
          data.chatRoomId,
          data.content
        );

        // Only emit to other users in the room (not the sender)
        socket.to(data.chatRoomId).emit("chat:receive_message", newMessage);

        // Optionally, you can acknowledge to the sender if needed:
        // socket.emit('chat:message_sent', newMessage);
      } catch (error: any) {
        socket.emit("chat:error", {
          message: error.message,
          chatRoomId: data.chatRoomId,
        });
      }
    }
  );

  socket.on("chat:typing", (data: { chatRoomId: string }) => {
    // Broadcast to everyone else in the room that this user is typing
    socket.to(data.chatRoomId).emit("chat:typing_indicator", {
      chatRoomId: data.chatRoomId,
      user: { userId }, // We can get the username on the client from existing data
    });
  });
  
  socket.on(
    "chat:add_member",
    async (data: { roomId: string; userId: string }) => {
      try {
        // The user ID of the person performing the action
        const adminId = socket.handshake.auth.userId;
        console.log(
          `[Socket.IO] User ${adminId} is trying to add member ${data.userId} to room ${data.roomId}.`
        );
        if (!adminId) throw new Error("Authentication error.");

        // The service handles all logic: admin check, adding to DB
        // Assuming this service exists from our previous discussions
        const newMember = await chatService.addMemberByAdmin(
          adminId,
          data.roomId,
          data.userId
        );

        // Broadcast to the entire room that a new member has joined
        io.to(data.roomId).emit("chat:member_added", {
          roomId: data.roomId,
          newMember: {
            userId: newMember.userId,
            role: newMember.role,
            userProfile: newMember.userProfile, // Send the full profile
          },
        });

        // Also, make the new member's socket join the room if they are online
        const newMemberSocketId = userSocketMap.get(data.userId);
        if (newMemberSocketId) {
          io.sockets.sockets.get(newMemberSocketId)?.join(data.roomId);
        }
      } catch (error: any) {
        // Send an error event back ONLY to the person who tried to add the member
        socket.emit("chat:error", { message: error.message });
      }
    }
  );

  // --- ADD THIS NEW "stop_typing" LISTENER ---
  socket.on("chat:stop_typing", (data: { chatRoomId: string }) => {
    // Broadcast to everyone else that this user has stopped typing
    socket.to(data.chatRoomId).emit("chat:stop_typing_indicator", {
      chatRoomId: data.chatRoomId,
      user: { userId },
    });
  });

  socket.on("disconnect", (reason) => {
    console.log(`[Socket.IO] User ${userId} disconnected. Reason: ${reason}`);
    if (userSocketMap.get(userId) === socket.id) userSocketMap.delete(userId);
    for (const [pId, sId] of participantSocketMap.entries()) {
      if (sId === socket.id) participantSocketMap.delete(pId);
    }
  });
});

// Start the server with proper port configuration for Render
const PORT = process.env.PORT || process.env.SOCKET_PORT || 4000;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Socket.IO server listening on port ${PORT}`);
  console.log(`📡 Health check available at: http://localhost:${PORT}/health`);
  console.log(`📊 Status endpoint available at: http://localhost:${PORT}/status`);
});

setupGracefulShutdown(httpServer);
