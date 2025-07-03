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

// Create HTTP server and Socket.IO server
const httpServer = createServer();
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

// Redis client setup
const redisUrl = process.env.REDIS_URL;
const pubClient = createClient({
  url: redisUrl,
  socket: redisUrl?.startsWith("rediss://")
    ? {
        tls: true,
        host: new URL(redisUrl).hostname // extract host from the URL
      }
    : undefined,
});


const subClient = pubClient.duplicate();

// Redis Pub/Sub bridge for inter-process communication
const ipcSubscriber = pubClient.duplicate();

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

// Start the server
const PORT = process.env.SOCKET_PORT || 4000;
httpServer.listen(PORT, () =>
  console.log(`🚀 Socket.IO server listening on port ${PORT}`)
);

setupGracefulShutdown(httpServer);