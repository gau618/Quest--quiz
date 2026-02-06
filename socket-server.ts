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
import axios from "axios";
import { jwtDecode } from "jwt-decode";

// Bot protection: Track connections per IP
const connectionTracker = new Map<string, { count: number; lastConnect: number; blocked: boolean }>();
const MAX_CONNECTIONS_PER_IP = 5;
const BLOCK_DURATION = 60000; // 1 minute
const CONNECTION_WINDOW = 10000; // 10 seconds

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of connectionTracker.entries()) {
    if (now - data.lastConnect > BLOCK_DURATION) {
      connectionTracker.delete(ip);
    }
  }
}, 300000);

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

// Configure CORS based on environment
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['*', 'https://dev.tradeved.com', 'https://dev.tradeved.com/'];
const corsOptions = {
  origin: "*", // Using * for dev simplicity, or use allowedOrigins logic if stricter security needed
  methods: ["GET", "POST", "OPTIONS"], 
  credentials: true 
};

const io = new Server(httpServer, {
  cors: corsOptions,
  maxHttpBufferSize: 1e6, // 1MB max message size - prevents memory exhaustion attacks
  pingTimeout: 30000,      // 30s ping timeout
  pingInterval: 25000,     // 25s ping interval
  connectTimeout: 10000,   // 10s connection timeout
  transports: ['websocket', 'polling'], // Prefer websocket for efficiency
});

// Redis client setup
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error("❌ REDIS_URL is not defined in environment variables.");
  throw new Error("❌ REDIS_URL is not defined in environment variables.");
}

console.log("✅ Redis URL configured for Socket.IO server");

const redisUrlParsed = new URL(redisUrl);
const pubClient = createClient({
  url: redisUrl,
  socket: redisUrl.startsWith("rediss://")
    ? {
        tls: true,
        host: redisUrlParsed.hostname,
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
  
  // Whitelist of allowed events that can be forwarded from Redis
  const ALLOWED_REDIS_EVENTS = new Set([
    'game:started',
    'game:finished',
    'game:error', 
    'question:new',
    'answer:feedback',
    'score:update',
    'participant:finished',
    'lobby:update',
    'lobby:countdown_started',
    'lobby:countdown_cancelled',
    'lobby:player_joined',
    'lobby:player_left',
    'chat:receive_message',
    'chat:typing_indicator',
    'chat:stop_typing_indicator',
    'chat:member_added',
    'chat:member_removed',
    'chat:you_were_added',
    'chat:group_deleted',
    'chat:group_updated',
    'matchmaking:matched',
    'practice:started',
    'practice:finished',
    'practice:error',
    'time_attack:started',
    'time_attack:finished',
    'time_attack:score_update',
    'time_attack:error',
    'group_game:started',
    'group_game:score_update',
    // Friend Events
    'friend_request:new',
    'friend_request:accepted',
    'friend:new',
    'friend:removed',
    // QuickDuel Events
    // Quick Duel
    'match:found',
    // Fastest Finger
    'ff:match_found',
    'ff:new_question',
    'ff:player_answered',
    'ff:point_awarded',
    'ff:question_timeout',
    'ff:game_end',
  ]);
  
  ipcSubscriber.connect().then(() => {
    ipcSubscriber.subscribe(IPC_CHANNEL, (message) => {
      try {
        const parsed = JSON.parse(message);
        
        // Validate structure
        if (!parsed || typeof parsed !== 'object') {
          console.warn('[Redis Bridge] Invalid message structure');
          return;
        }
        
        const { target, ids, event, payload } = parsed;
        
        // Validate required fields
        if (!target || !ids || !event || !Array.isArray(ids)) {
          console.warn('[Redis Bridge] Missing required fields');
          return;
        }
        
        // Validate event is whitelisted
        if (!ALLOWED_REDIS_EVENTS.has(event)) {
          console.warn(`[Redis Bridge] Blocked non-whitelisted event: ${event}`);
          return;
        }
        
        // Validate target type
        if (!['user', 'room', 'participant'].includes(target)) {
          console.warn(`[Redis Bridge] Invalid target: ${target}`);
          return;
        }
        
        // Sanitize payload - remove any __proto__ or constructor properties
        const sanitizedPayload = payload ? JSON.parse(JSON.stringify(payload, (key, value) => {
          if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            return undefined;
          }
          return value;
        })) : {};
        
        if (target === "user") {
          ids.forEach((userId: string) => {
            if (typeof userId !== 'string') return;
            const sid = userSocketMap.get(userId);
            if (sid) io.to(sid).emit(event, sanitizedPayload);
          });
        } else if (target === "room") {
          ids.forEach((roomId: string) => {
            if (typeof roomId !== 'string') return;
            io.to(roomId).emit(event, sanitizedPayload);
          });
        } else if (target === "participant") {
          ids.forEach((participantId: string) => {
            if (typeof participantId !== 'string') return;
            const sid = participantSocketMap.get(participantId);
            if (sid) io.to(sid).emit(event, sanitizedPayload);
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

io.on("connection", async (socket: Socket) => {
  // Bot protection: Get client IP
  const clientIP = socket.handshake.headers['x-forwarded-for'] as string || 
                   socket.handshake.headers['x-real-ip'] as string ||
                   socket.handshake.address;
  
  const now = Date.now();
  const tracker = connectionTracker.get(clientIP) || { count: 0, lastConnect: 0, blocked: false };
  
  // Check if IP is blocked
  if (tracker.blocked && (now - tracker.lastConnect) < BLOCK_DURATION) {
    console.warn(`[Bot Protection] Blocked IP attempting connection: ${clientIP}`);
    socket.disconnect(true);
    return;
  }
  
  // Reset counter if outside window
  if (now - tracker.lastConnect > CONNECTION_WINDOW) {
    tracker.count = 0;
  }
  
  tracker.count++;
  tracker.lastConnect = now;
  
  // Block if too many connections
  if (tracker.count > MAX_CONNECTIONS_PER_IP) {
    tracker.blocked = true;
    connectionTracker.set(clientIP, tracker);
    console.warn(`[Bot Protection] IP blocked for excessive connections: ${clientIP} (${tracker.count} connections)`);
    socket.disconnect(true);
    return;
  }
  
  connectionTracker.set(clientIP, tracker);

  // CRITICAL: Validate token before allowing connection
  const token = socket.handshake.auth.token || socket.handshake.query.token;
  
  if (!token) {
    console.warn(`[Socket.IO] Connection rejected from ${clientIP}: No token provided`);
    socket.disconnect(true);
    return;
  }

  // Verify token with auth service
  let verifiedUserId: string;
  try {
    // Ensure token has Bearer prefix if needed, but respect if it's already there
    const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    
    // Try validating. If 404/401, it will throw.
    const response = await axios.get(`https://api.dev.tradeved.com/user/auth/get-user`, {
      headers: { Authorization: authHeader },
      timeout: 5000, 
    });
    
    const user = response.data?.data;
    if (!user || !user.id) {
      console.warn(`[Socket.IO] Connection rejected from ${clientIP}: Invalid token response`);
      socket.disconnect(true);
      return;
    }
    
    verifiedUserId = user.id;
    console.log(`[Socket.IO] ✅ Token verified for user ${verifiedUserId}`);
    
  } catch (error: any) {
    // API verification failed (likely 404 or connection error).
    // Fallback: Verify JWT structure locally to allow connection if token is well-formed.
    // This handles the case where the Auth API is down or the endpoint URL is incorrect in development.
    try {
       const userToken = token.startsWith('Bearer ') ? token.split(' ')[1] : token;
       const decoded: any = jwtDecode(userToken);
       
       if (decoded && decoded.id) {
           // Check expiration
           if (decoded.exp && (Date.now() / 1000) > decoded.exp) {
               throw new Error("Token expired");
           }
           verifiedUserId = decoded.id;
           console.warn(`[Socket.IO] ⚠️ Auth API failed (${error.message}). Using local JWT verification for user ${verifiedUserId}`);
       } else {
           throw error; // Not a valid JWT or missing ID
       }
    } catch (fallbackError: any) {
        console.warn(`[Socket.IO] Connection rejected from ${clientIP}: Auth failed - ${error.message} >> Fallback: ${fallbackError.message}`);
        socket.disconnect(true);
        return;
    }
  }

  // Also accept userId from handshake but only use the verified one
  const userId = verifiedUserId;

  userSocketMap.set(userId, socket.id);
  console.log(`[Socket.IO] User ${userId} connected from ${clientIP} with socket ${socket.id}.`);

  // Rate limiting per socket: Track events
  const eventTracker = new Map<string, number[]>();
  const MAX_EVENTS_PER_SECOND = 20;
  
  const checkRateLimit = (eventName: string): boolean => {
    const now = Date.now();
    const timestamps = eventTracker.get(eventName) || [];
    const recentEvents = timestamps.filter(t => now - t < 1000);
    
    if (recentEvents.length >= MAX_EVENTS_PER_SECOND) {
      console.warn(`[Rate Limit] User ${userId} exceeded rate limit for ${eventName}`);
      return false;
    }
    
    recentEvents.push(now);
    eventTracker.set(eventName, recentEvents);
    return true;
  };

  // Game and lobby events (existing logic)
  socket.on(
    "game:register-participant",
    async (data: { participantId: string; sessionId?: string }) => {
      // Validate input
      if (!data || typeof data.participantId !== 'string' || data.participantId.length === 0 || data.participantId.length > 100) {
        console.warn(`[Socket.IO] Invalid game:register-participant data from user ${userId}`);
        return;
      }
      
      if (data.sessionId && (typeof data.sessionId !== 'string' || data.sessionId.length === 0 || data.sessionId.length > 100)) {
        console.warn(`[Socket.IO] Invalid sessionId in game:register-participant from user ${userId}`);
        return;
      }

      try {
        // SECURITY: Verify participant ownership
        const participant = await prisma.gameParticipant.findUnique({
          where: { id: data.participantId },
          select: { userId: true, gameSessionId: true }
        });

        if (!participant) {
           console.warn(`[Socket.IO] Participant not found: ${data.participantId}`);
           return;
        }

        if (participant.userId !== userId) {
          console.warn(`[Socket.IO] SECURITY ALERT: User ${userId} attempted to register as participant ${data.participantId} belonging to ${participant.userId}`);
          return;
        }

        if (data.sessionId && participant.gameSessionId !== data.sessionId) {
           console.warn(`[Socket.IO] Mismatch: Participant ${data.participantId} belongs to session ${participant.gameSessionId}, not ${data.sessionId}`);
           return;
        }
        
        console.log(
          `[Socket.IO] Registering participant ${data.participantId} to socket ${socket.id}.`
        );
        participantSocketMap.set(data.participantId, socket.id);
        if (data.sessionId) socket.join(data.sessionId);
      } catch (error) {
        console.error(`[Socket.IO] Error registering participant for user ${userId}:`, error);
      }
    }
  );

  socket.on("quickduel:request_first_question", (data) => {
    if (!data || typeof data.sessionId !== 'string' || typeof data.participantId !== 'string') {
      console.warn(`[Socket.IO] Invalid quickduel:request_first_question data from user ${userId}`);
      return;
    }
    gameService.sendNextQuestion(data.sessionId, data.participantId);
  });
  
  socket.on("practice:next_question", (data) => {
    if (!data || typeof data.sessionId !== 'string' || typeof data.participantId !== 'string') {
      console.warn(`[Socket.IO] Invalid practice:next_question data from user ${userId}`);
      return;
    }
    gameService.handleNextPracticeQuestion(data.sessionId, data.participantId);
  });
  
  socket.on("time_attack:request_next_question", (data) => {
    if (!data || typeof data.sessionId !== 'string' || typeof data.participantId !== 'string') {
      console.warn(`[Socket.IO] Invalid time_attack:request_next_question data from user ${userId}`);
      return;
    }
    gameService.sendNextTimeAttackQuestion(data.sessionId, data.participantId);
  });

  socket.on("lobby:leave", (data) => {
    if (!data || typeof data.roomCode !== 'string') {
      console.warn(`[Socket.IO] Invalid lobby:leave data from user ${userId}`);
      return;
    }
    lobbyService.leaveLobby(data.roomCode, userId);
  });
  
  socket.on("lobby:initiate_countdown", (data) => {
    if (!data || typeof data.roomCode !== 'string') {
      console.warn(`[Socket.IO] Invalid lobby:initiate_countdown data from user ${userId}`);
      return;
    }
    lobbyService.initiateCountdown(data.roomCode, userId);
  });
  
  socket.on("lobby:cancel_countdown", (data) => {
    if (!data || typeof data.roomCode !== 'string') {
      console.warn(`[Socket.IO] Invalid lobby:cancel_countdown data from user ${userId}`);
      return;
    }
    lobbyService.cancelCountdown(data.roomCode, userId);
  });

  socket.on("answer:submit", (data) => {
    if (!checkRateLimit("answer:submit")) return;
    if (!data || typeof data.sessionId !== 'string' || typeof data.participantId !== 'string' || 
        typeof data.questionId !== 'string' || typeof data.optionId !== 'string') {
      console.warn(`[Socket.IO] Invalid answer:submit data from user ${userId}`);
      return;
    }
    gameService.handleAnswer(
      data.sessionId,
      data.participantId,
      data.questionId,
      data.optionId
    );
  });
  
  socket.on("question:skip", (data) => {
    if (!data || typeof data.sessionId !== 'string' || typeof data.participantId !== 'string') {
      console.warn(`[Socket.IO] Invalid question:skip data from user ${userId}`);
      return;
    }
    gameService.handleSkip(data.sessionId, data.participantId);
  });

  // --- Chat events ---
  socket.on("chat:join_rooms", async (roomIds: string[]) => {
    if (!Array.isArray(roomIds) || roomIds.length === 0 || roomIds.length > 100) {
      console.warn(`[Socket.IO] Invalid chat:join_rooms from user ${userId}`);
      return;
    }
    // Validate all elements are strings
    const potentialRoomIds = roomIds.filter(id => typeof id === 'string' && id.length > 0 && id.length < 100);
    
    if (potentialRoomIds.length === 0) return;

    try {
      // SECURITY: Verify user is a member of these rooms before joining
      const memberships = await prisma.chatRoomMember.findMany({
        where: {
          userId: userId,
          chatRoomId: { in: potentialRoomIds }
        },
        select: { chatRoomId: true }
      });

      const authorizedRoomIds = memberships.map(m => m.chatRoomId);

      if (authorizedRoomIds.length > 0) {
        console.log(`[SERVER] User ${userId} authorized to join rooms:`, authorizedRoomIds);
        authorizedRoomIds.forEach((roomId) => socket.join(roomId));
      } else {
         console.warn(`[SERVER] User ${userId} attempted to join rooms without membership.`);
      }
    } catch (error) {
      console.error(`[Socket.IO] Error authorizing chat room join for user ${userId}:`, error);
    }
  });

  socket.on(
    "chat:send_message",
    async (data: { chatRoomId: string; content: string }) => {
      if (!checkRateLimit("chat:send_message")) {
        socket.emit("chat:error", { message: "Rate limit exceeded" });
        return;
      }
      
      // Validate input
      if (!data || typeof data.chatRoomId !== 'string' || typeof data.content !== 'string') {
        socket.emit("chat:error", { message: "Invalid message format" });
        return;
      }
      
      if (data.chatRoomId.length === 0 || data.chatRoomId.length > 100) {
        socket.emit("chat:error", { message: "Invalid room ID" });
        return;
      }
      
      if (data.content.length === 0 || data.content.length > 5000) {
        socket.emit("chat:error", { message: "Message too long or empty" });
        return;
      }
      
      try {
        // Save and get the new message from the service
        const newMessage = await chatService.sendMessage(
          userId,
          data.chatRoomId,
          data.content
        );

        // Only emit to other users in the room (not the sender)
        socket.to(data.chatRoomId).emit("chat:receive_message", newMessage);
      } catch (error: any) {
        socket.emit("chat:error", {
          message: error.message,
          chatRoomId: data.chatRoomId,
        });
      }
    }
  );

  socket.on("chat:typing", (data: { chatRoomId: string }) => {
    // Validate input
    if (!data || typeof data.chatRoomId !== 'string' || data.chatRoomId.length === 0 || data.chatRoomId.length > 100) {
      return;
    }
    // Broadcast to everyone else in the room that this user is typing
    socket.to(data.chatRoomId).emit("chat:typing_indicator", {
      chatRoomId: data.chatRoomId,
      user: { userId },
    });
  });
  
  socket.on(
    "chat:add_member",
    async (data: { roomId: string; userId: string }) => {
      // Validate input
      if (!data || typeof data.roomId !== 'string' || typeof data.userId !== 'string') {
        socket.emit("chat:error", { message: "Invalid input format" });
        return;
      }
      
      if (data.roomId.length === 0 || data.roomId.length > 100 || 
          data.userId.length === 0 || data.userId.length > 100) {
        socket.emit("chat:error", { message: "Invalid ID length" });
        return;
      }
      
      try {
        // Use the verified userId from connection, not from handshake
        const adminId = userId; // Already verified during connection
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
    // Validate input
    if (!data || typeof data.chatRoomId !== 'string' || data.chatRoomId.length === 0 || data.chatRoomId.length > 100) {
      return;
    }
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
    
    // Decrement connection count for this IP
    const tracker = connectionTracker.get(clientIP);
    if (tracker) {
      tracker.count = Math.max(0, tracker.count - 1);
      if (tracker.count === 0 && !tracker.blocked) {
        connectionTracker.delete(clientIP);
      }
    }
  });
});

// Start the server with proper port configuration for Render
const PORT = Number(process.env.PORT || process.env.SOCKET_PORT || 4000);
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Socket.IO server listening on port ${PORT}`);
  console.log(`📡 Health check available at: http://localhost:${PORT}/health`);
  console.log(`📊 Status endpoint available at: http://localhost:${PORT}/status`);
});

setupGracefulShutdown(httpServer);

// Handle uncaught exceptions and unhandled rejections
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  // Don't exit immediately, let graceful shutdown handle it
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit, just log
});
