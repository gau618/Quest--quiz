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

// Whitelist of allowed events (must match socket-server.ts)
const ALLOWED_EVENTS = new Set([
    'game:started',
    'game:finished',
    'game:end',
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
    // Quick Duel
    'match:found',
    // Fastest Finger
    'ff:match_found',
    'ff:new_question',
    'ff:player_answered',
    'ff:point_awarded',
    'ff:question_timeout',
    'ff:game_end',
    // Friends
    'friend_request:new',
    'friend_request:accepted',
    'friend:new',
    'friend:removed',
]);

/**
 * Validates and sanitizes event data before publishing to Redis
 */
function validateAndSanitize(event: string, payload: any): any {
  // Check if event is whitelisted
  if (!ALLOWED_EVENTS.has(event)) {
    throw new Error(`[Notification Service] Blocked non-whitelisted event: ${event}`);
  }
  
  // Sanitize payload - remove dangerous properties
  if (!payload) return null;
  
  return JSON.parse(JSON.stringify(payload, (key, value) => {
    // Prevent prototype pollution
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return undefined;
    }
    return value;
  }));
}

export const notificationService = {
  /**
   * Publishes an event to a specific user or list of users via Redis.
   * Your socket server will catch this and emit to the correct socket(s).
   * @param userIds - A single user ID or an array of user IDs.
   * @param event - The name of the socket event (e.g., 'notification:new').
   * @param payload - The data to send.
   */
sendToUsers: (userIds: string | string[], event: string, payload: any) => {
    try {
      const ids = Array.isArray(userIds) ? userIds : [userIds];
      const sanitizedPayload = validateAndSanitize(event, payload);
      const message: IpcPayload = { target: 'user', ids, event, payload: sanitizedPayload };
      redisPublisher.publish(IPC_CHANNEL, JSON.stringify(message));
      console.log(`[Notification Service] Published '${event}' to users: ${ids.join(', ')}`);
    } catch (error) {
      console.error(`[Notification Service] Failed to publish event:`, error);
    }
  },

  /**
   * @deprecated Use 'sendToUsers' instead. This is an alias for backward compatibility.
   */
  sendToUser: function(userIds: string | string[], event: string, payload: any) {
    // --- THIS IS THE ALIAS FOR BACKWARD COMPATIBILITY ---
    console.warn("Deprecation Warning: 'sendToUser' is deprecated. Please use 'sendToUsers' instead.");
    // It simply calls the new, correctly named function.
    this.sendToUsers(userIds, event, payload);
  },



  /**
   * Publishes an event to all clients within a specific room.
   * @param roomId - The ID of the room (e.g., a chatRoomId or gameSessionId).
   * @param event - The name of the socket event.
   * @param payload - The data to send.
   */
  sendToRoom: (roomId: string, event: string, payload: any) => {
    try {
      const sanitizedPayload = validateAndSanitize(event, payload);
      const message: IpcPayload = { target: 'room', ids: [roomId], event, payload: sanitizedPayload };
      redisPublisher.publish(IPC_CHANNEL, JSON.stringify(message));
      console.log(`[Notification Service] Published '${event}' to room: ${roomId}`);
    } catch (error) {
      console.error(`[Notification Service] Failed to publish event:`, error);
    }
  },

  /**
   * Publishes an event to a specific game participant.
   * @param participantIds - A single participant ID or an array of IDs.
   * @param event - The name of the socket event.
   * @param payload - The data to send.
   */
  sendToParticipant: (participantIds: string | string[], event: string, payload: any) => {
    try {
      const ids = Array.isArray(participantIds) ? participantIds : [participantIds];
      const sanitizedPayload = validateAndSanitize(event, payload);
      const message: IpcPayload = { target: 'participant', ids, event, payload: sanitizedPayload };
      redisPublisher.publish(IPC_CHANNEL, JSON.stringify(message));
      console.log(`[Notification Service] Published '${event}' to participants: ${ids.join(', ')}`);
    } catch (error) {
      console.error(`[Notification Service] Failed to publish event:`, error);
    }
  },
};
