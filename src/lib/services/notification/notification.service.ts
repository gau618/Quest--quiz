// src/lib/services/notification.service.ts
import { redisPublisher } from '@/lib/redis/client'; // Import your configured Redis publisher client

// This is the Redis channel your socket server will subscribe to. It must be consistent.
const IPC_CHANNEL = 'socket-events';

// The structure of the message payload for our internal communication channel
interface IpcPayload {
  target: 'user' | 'room' | 'participant'; // The type of destination
  ids: string[]; // The user IDs, room IDs, or participant IDs to target
  event: string; // The name of the socket event to emit to the client
  payload: any; // The data to send with the event
}

export const notificationService = {
  /**
   * Publishes an event to a specific user or list of users via Redis.
   * Your socket server will catch this and emit to the correct socket(s).
   * @param userIds - A single user ID or an array of user IDs.
   * @param event - The name of the socket event (e.g., 'notification:new').
   * @param payload - The data to send.
   */
  sendToUser: (userIds: string | string[], event: string, payload: any) => {
    const ids = Array.isArray(userIds) ? userIds : [userIds];
    const message: IpcPayload = { target: 'user', ids, event, payload };
    redisPublisher.publish(IPC_CHANNEL, JSON.stringify(message));
    console.log(`[Notification Service] Published '${event}' to users: ${ids.join(', ')}`);
  },

  /**
   * Publishes an event to all clients within a specific room.
   * @param roomId - The ID of the room (e.g., a chatRoomId or gameSessionId).
   * @param event - The name of the socket event.
   * @param payload - The data to send.
   */
  sendToRoom: (roomId: string, event: string, payload: any) => {
    const message: IpcPayload = { target: 'room', ids: [roomId], event, payload };
    redisPublisher.publish(IPC_CHANNEL, JSON.stringify(message));
    console.log(`[Notification Service] Published '${event}' to room: ${roomId}`);
  },

  /**
   * Publishes an event to a specific game participant.
   * @param participantIds - A single participant ID or an array of IDs.
   * @param event - The name of the socket event.
   * @param payload - The data to send.
   */
  sendToParticipant: (participantIds: string | string[], event: string, payload: any) => {
    const ids = Array.isArray(participantIds) ? participantIds : [participantIds];
    const message: IpcPayload = { target: 'participant', ids, event, payload };
    redisPublisher.publish(IPC_CHANNEL, JSON.stringify(message));
    console.log(`[Notification Service] Published '${event}' to participants: ${ids.join(', ')}`);
  },
};
