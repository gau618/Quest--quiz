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
      redisPublisher.publish('socket-events', JSON.stringify(message));
      console.log(`[SocketService] Published event to Redis: ${message.event} (Target: ${message.target}, IDs: ${message.ids.join(',')})`);
    } catch (err) {
      console.error(`[SocketService] Failed to publish event ${message.event} to Redis:`, err);
    }
  }
  
  emitToUsers(userIds: string[], event: string, payload: any) {
    this.publishEvent({ target: 'user', ids: userIds, event, payload });
  }

  emitToRoom(room: string, event: string, payload: any) {
    this.publishEvent({ target: 'room', ids: [room], event, payload });
  }
  
  emitToParticipant(participantId: string, event: string, payload: any) {
    this.publishEvent({ target: 'participant', ids: [participantId], event, payload });
  }
}

export const socketService = new SocketService();
