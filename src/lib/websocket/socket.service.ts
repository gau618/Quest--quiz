// src/lib/socket/socket.service.ts
import { redisPublisher } from '../redis/client';

interface SocketEventMessage {
  target: 'user' | 'room' | 'participant';
  ids: string[];
  event: string;
  payload: any;
}

class SocketService {
  private publishEvent(message: SocketEventMessage) {
    try {
      // Publish event details to a Redis channel.
      // The Socket.IO server subscribes to this channel to receive and emit events to clients.
      redisPublisher.publish('socket-events', JSON.stringify(message));
      console.log(`[SocketService] Published event to Redis: ${message.event} (Target: ${message.target}, IDs: ${message.ids.join(',')})`);
    } catch (err) {
      console.error(`[SocketService] Failed to publish event ${message.event} to Redis:`, err);
    }
  }
  
  // Emit event to specific user(s) identified by their user ID.
  emitToUsers(userIds: string[], event: string, payload: any) {
    this.publishEvent({ target: 'user', ids: userIds, event, payload });
  }

  // Emit event to all clients in a specific Socket.IO room (e.g., a game session).
  emitToRoom(room: string, event: string, payload: any) {
    this.publishEvent({ target: 'room', ids: [room], event, payload });
  }
  
  // Emit event to a specific participant identified by their participant ID.
  emitToParticipant(participantId: string, event: string, payload: any) {
    this.publishEvent({ target: 'participant', ids: [participantId], event, payload });
  }
}

export const socketService = new SocketService();
