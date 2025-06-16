// src/lib/websocket/socket.service.ts

import { Server } from 'socket.io';

// This is a placeholder that will be initialized by the main socket-server.ts
class SocketService {
  public io: Server | undefined;
  // The service now manages its own maps.
  public userSocketMap = new Map<string, string>();
  public participantSocketMap = new Map<string, string>();

  public init(server: Server) {
    this.io = server;
    console.log('[SocketService] Initialized.');
  }

  emitToRoom(room: string, event: string, payload: any) {
    this.io?.to(room).emit(event, payload);
  }

  // This method now accesses its own internal map.
  emitToUsers(userIds: string[], event: string, payload: any) {
    userIds.forEach(id => {
      const socketId = this.userSocketMap.get(id);
      if (socketId) this.io?.to(socketId).emit(event, payload);
    });
  }

  // This method now accesses its own internal map.
  emitToParticipant(participantId: string, event: string, payload: any) {
    const socketId = this.participantSocketMap.get(participantId);
    if (socketId) this.io?.to(socketId).emit(event, payload);
  }
}

export const socketService = new SocketService();
