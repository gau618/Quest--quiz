// src/lib/lobby/lobby.service.ts

import prisma from '@/lib/prisma/client';
import { GameMode, GameStatus, Difficulty } from '@prisma/client';
import { gameService } from '@/lib/services/game.service'; // Assuming gameService path
import { socketService } from '@/lib/websocket/socket.service'; // Assuming socketService path
import { queueService } from '@/lib/queue/config'; // Assuming queueService path

/**
 * LobbyService
 * Manages the lifecycle of Group Play lobbies, including creation, joining,
 * leaving, countdown, and transition to active game state.
 * It ensures separation of concerns between lobby management and core game logic.
 */
class LobbyService {
  private static readonly ROOM_CODE_LENGTH = 6;
  private static readonly COUNTDOWN_DURATION_SECONDS = 10;
  private static readonly DEFAULT_MIN_PLAYERS = 2; // Default minimum players to start a game
  private static readonly DEFAULT_GROUP_PLAY_DURATION_MINUTES = 5; // Default game duration for Group Play

  /**
   * Generates a unique, short, alphanumeric room code.
   * Ensures the generated code does not already exist in the database.
   * @returns A unique 6-character room code.
   */
  private async generateRoomCode(): Promise<string> {
    let code: string;
    let exists: boolean;
    do {
      // Generate a random alphanumeric string, convert to uppercase, and take 6 characters
      code = Math.random().toString(36).substring(2, 2 + LobbyService.ROOM_CODE_LENGTH).toUpperCase();
      // Check if a session with this room code already exists
      const session = await prisma.gameSession.findUnique({ where: { roomCode: code } });
      exists = !!session;
    } while (exists); // Loop until a truly unique code is found
    console.log(`[LobbyService] Generated unique room code: ${code}`);
    return code;
  }

  /**
   * Creates a new Group Play lobby.
   * The host (creator) is automatically added as the first participant.
   * @param hostId The userId of the player creating the lobby.
   * @param maxPlayers The maximum number of players allowed in this lobby.
   * @param minPlayers The minimum number of players required to start the game. Defaults to 2.
   * @param difficulty The selected difficulty for the game.
   * @param durationMinutes The selected duration for the game in minutes.
   * @returns The created GameSession object including participant details.
   */
  async createLobby(hostId: string, maxPlayers: number, minPlayers: number = LobbyService.DEFAULT_MIN_PLAYERS, difficulty: Difficulty, durationMinutes: number): Promise<any> {
    console.log(`[LobbyService] Host ${hostId} initiating lobby creation. Max: ${maxPlayers}, Min: ${minPlayers}, Difficulty: ${difficulty}, Duration: ${durationMinutes}min.`);

    // Input validation
    if (maxPlayers < 2 || maxPlayers > 8) throw new Error('Max players must be between 2 and 8.');
    if (minPlayers < 2 || minPlayers > maxPlayers) throw new Error('Min players must be between 2 and max players.');
    if (!Object.values(Difficulty).includes(difficulty)) throw new Error('Invalid difficulty selected.');
    if (![1, 2, 5].includes(durationMinutes)) throw new Error('Duration must be 1, 2, or 5 minutes.');

    // Ensure host user profile exists
    const hostProfile = await prisma.userProfile.findUnique({ where: { userId: hostId } });
    if (!hostProfile) throw new Error(`User profile not found for host ID: ${hostId}.`);

    const roomCode = await this.generateRoomCode();

    const session = await prisma.gameSession.create({
      data: {
        mode: GameMode.GROUP_PLAY,
        status: GameStatus.LOBBY,
        roomCode: roomCode,
        hostId: hostId,
        minPlayers: minPlayers,
        maxPlayers: maxPlayers,
        difficulty: difficulty,
        durationMinutes: durationMinutes,
        participants: { // Automatically create the host as the first participant
          create: {
            userId: hostId,
            isBot: false,
            score: 0,
            userProfile: { connect: { userId: hostId } } // Link to existing user profile
          }
        }
      },
      include: { participants: { include: { userProfile: true } } } // Include participants for immediate return
    });

    // Notify all clients in the room (currently just the host) about the lobby state
    const lobbyState = await this.getLobbyState(session.id);
    if (lobbyState) {
      // Use emitToRoom, even if it's only the host, as it's the standard update mechanism
      socketService.emitToRoom(session.id, 'lobby:update', lobbyState);
      console.log(`[LobbyService] Lobby ${session.id} created successfully with code ${roomCode}.`);
    } else {
      console.error(`[LobbyService] Failed to retrieve lobby state after creation for session ${session.id}.`);
    }
    return session;
  }

  /**
   * Allows a player to join an existing lobby using its room code.
   * Performs validations to ensure the lobby is joinable.
   * @param userId The userId of the player attempting to join.
   * @param roomCode The unique room code of the lobby.
   * @returns The updated GameSession object.
   */
  async joinLobby(userId: string, roomCode: string): Promise<any> {
    console.log(`[LobbyService] User ${userId} attempting to join lobby with code: ${roomCode}.`);

    // Input validation
    if (!roomCode || roomCode.length !== LobbyService.ROOM_CODE_LENGTH) throw new Error('Invalid room code format.');

    // Find the lobby and include its current participants
    const session = await prisma.gameSession.findUnique({
      where: { roomCode: roomCode.toUpperCase() },
      include: { participants: true }
    });

    // Validate lobby existence and status
    if (!session) throw new Error('Lobby not found with that code.');
    if (session.mode !== GameMode.GROUP_PLAY) throw new Error('This session is not a Group Play lobby.');
    if (session.status !== GameStatus.LOBBY) throw new Error('Lobby is not open for joining.');

    // Check if lobby is full
    const currentParticipantsCount = session.participants.length;
    if (currentParticipantsCount >= (session.maxPlayers || 8)) throw new Error('Lobby is full. Cannot join.');

    // Check if user is already in the lobby
    if (session.participants.some(p => p.userId === userId)) throw new Error('You are already in this lobby.');

    // Ensure joining user profile exists
    const userProfile = await prisma.userProfile.findUnique({ where: { userId: userId } });
    if (!userProfile) throw new Error(`User profile not found for user ID: ${userId}.`);

    // Add the new participant to the lobby
    const updatedSession = await prisma.gameSession.update({
      where: { id: session.id },
      data: {
        participants: {
          create: {
            userId: userId,
            isBot: false,
            score: 0,
            userProfile: { connect: { userId: userId } }
          }
        }
      },
      include: { participants: { include: { userProfile: true } } } // Include updated participants for next step
    });

    // Notify all clients in the lobby about the updated state
    const lobbyState = await this.getLobbyState(updatedSession.id);
    if (lobbyState) {
      socketService.emitToRoom(updatedSession.id, 'lobby:update', lobbyState);
      console.log(`[LobbyService] User ${userId} successfully joined lobby ${roomCode}.`);
    }
    return updatedSession;
  }

  /**
   * Removes a player from a lobby.
   * Handles special cases like the host leaving (dissolves lobby) or
   * players leaving during a countdown (may cancel countdown).
   * @param userId The userId of the player leaving.
   * @param sessionId The ID of the GameSession (lobby).
   */
  async leaveLobby(userId: string, sessionId: string): Promise<void> {
    console.log(`[LobbyService] User ${userId} attempting to leave lobby ${sessionId}.`);

    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { participants: true }
    });

    if (!session) {
      console.warn(`[LobbyService] User ${userId} tried to leave non-existent lobby ${sessionId}.`);
      return; // Lobby doesn't exist or already dissolved
    }
    if (!session.participants.some(p => p.userId === userId)) {
      console.warn(`[LobbyService] User ${userId} not found in lobby ${sessionId}.`);
      return; // User is not in this lobby
    }

    // --- Host leaves the lobby ---
    if (session.hostId === userId) {
      console.log(`[LobbyService] Host ${userId} is leaving lobby ${sessionId}. Dissolving lobby.`);
      // If there's an active countdown, cancel it first
      if (session.status === GameStatus.READY_COUNTDOWN) {
        await this.cancelCountdownInternal(sessionId, 'Host left the lobby during countdown.');
      }
      // Dissolve the entire lobby
      await this.dissolveLobby(session.id, 'Host left the lobby.');
      return; // Processing complete for host leaving
    }

    // --- Non-host player leaves ---
    // Remove the participant
    await prisma.gameParticipant.deleteMany({
      where: { gameSessionId: sessionId, userId: userId }
    });
    console.log(`[LobbyService] User ${userId} removed from lobby ${sessionId}.`);

    // Fetch the updated session state
    const updatedSession = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { participants: true } // Need participants count
    });

    if (updatedSession) {
      // Notify remaining players about the updated lobby state
      const lobbyState = await this.getLobbyState(updatedSession.id);
      if (lobbyState) {
        socketService.emitToRoom(updatedSession.id, 'lobby:update', lobbyState);
      }

      // If lobby was in countdown and now has too few players, cancel countdown
      if (updatedSession.status === GameStatus.READY_COUNTDOWN && updatedSession.participants.length < (updatedSession.minPlayers || LobbyService.DEFAULT_MIN_PLAYERS)) {
        await this.cancelCountdownInternal(sessionId, 'Not enough players remaining.');
        console.log(`[LobbyService] Countdown for ${sessionId} cancelled: not enough players after user ${userId} left.`);
      }
    } else {
      console.warn(`[LobbyService] Lobby ${sessionId} disappeared after user ${userId} left.`);
    }
  }

  /**
   * Initiates the 10-second countdown for the game to start.
   * Only the host can call this, and there must be enough players.
   * @param hostId The userId of the host.
   * @param sessionId The ID of the GameSession (lobby).
   * @returns The updated GameSession object.
   */
  async initiateCountdown(hostId: string, sessionId: string): Promise<any> {
    console.log(`[LobbyService] Host ${hostId} requesting to initiate countdown for lobby ${sessionId}.`);

    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { participants: true } // Need participants count for validation
    });

    // Validations
    if (!session) throw new Error('Lobby not found.');
    if (session.hostId !== hostId) throw new Error('Only the host can start the game.');
    if (session.status !== GameStatus.LOBBY) throw new Error('Game cannot be started from current state. Status: ' + session.status);
    if (session.participants.length < (session.minPlayers || LobbyService.DEFAULT_MIN_PLAYERS)) {
      throw new Error(`Not enough players. Minimum ${session.minPlayers || LobbyService.DEFAULT_MIN_PLAYERS} required.`);
    }

    // Update session status and set countdown start time
    const updatedSession = await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        status: GameStatus.READY_COUNTDOWN,
        countdownStartTime: new Date(),
      }
    });

    // Dispatch BullMQ job to start game after COUNTDOWN_DURATION_SECONDS
    const jobName = `lobby-start-${updatedSession.id}`;
    await queueService.dispatch(
      'lobby-countdown-jobs', // Queue name defined in config.ts
      { sessionId: updatedSession.id },
      { delay: LobbyService.COUNTDOWN_DURATION_SECONDS * 1000, jobId: jobName }
    );
    console.log(`[LobbyService] BullMQ job '${jobName}' dispatched to start game in ${LobbyService.COUNTDOWN_DURATION_SECONDS} seconds.`);

    // Notify all clients in the room about the countdown
    socketService.emitToRoom(updatedSession.id, 'lobby:countdown_started', {
      duration: LobbyService.COUNTDOWN_DURATION_SECONDS,
      countdownStartTime: updatedSession.countdownStartTime?.toISOString(), // Send ISO string for client clock sync
    });
    console.log(`[LobbyService] Countdown initiated for lobby ${sessionId}.`);
    return updatedSession;
  }

  /**
   * Cancels an ongoing game start countdown.
   * Only the host can call this.
   * @param hostId The userId of the host.
   * @param sessionId The ID of the GameSession (lobby).
   */
  async cancelCountdown(hostId: string, sessionId: string): Promise<void> {
    console.log(`[LobbyService] Host ${hostId} attempting to cancel countdown for lobby ${sessionId}.`);

    const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });

    // Validations
    if (!session) throw new Error('Lobby not found.');
    if (session.hostId !== hostId) throw new Error('Only the host can cancel the countdown.');
    if (session.status !== GameStatus.READY_COUNTDOWN) throw new Error('No active countdown to cancel.');

    // Use internal function for consistent cancellation logic
    await this.cancelCountdownInternal(sessionId, 'Host cancelled the countdown.');
    console.log(`[LobbyService] Countdown for ${sessionId} successfully cancelled by host.`);
  }

  /**
   * Internal function to handle the actual cancellation logic for a countdown.
   * This is called by `cancelCountdown` (host action) or `leaveLobby` (automatic).
   * @param sessionId The ID of the GameSession (lobby).
   * @param reason A string indicating why the countdown was cancelled.
   */
  private async cancelCountdownInternal(sessionId: string, reason: string): Promise<void> {
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        status: GameStatus.LOBBY, // Reset status to LOBBY
        countdownStartTime: null, // Clear countdown start time
      }
    });
    // Remove the pending BullMQ job, so it doesn't try to start the game later
    await queueService.removeJob('lobby-countdown-jobs', `lobby-start-${sessionId}`);

    // Notify all clients in the room that the countdown has been cancelled
    socketService.emitToRoom(sessionId, 'lobby:countdown_cancelled', { reason: reason });
    console.log(`[LobbyService] Internal countdown cancellation for ${sessionId} due to: ${reason}`);
  }

  /**
   * Starts the Group Play game.
   * This function is primarily called by the BullMQ worker after a countdown completes.
   * It transitions the lobby to an active game session.
   * @param sessionId The ID of the GameSession (lobby).
   */
  async startGame(sessionId: string): Promise<void> {
    console.log(`[LobbyService] Attempting to start game for lobby ${sessionId} (triggered by countdown job).`);

    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { participants: true } // Include participants to check count before starting
    });

    // Perform final validations before starting the game
    if (!session) {
      console.warn(`[LobbyService] Game start aborted for ${sessionId}: Session not found.`);
      return;
    }
    if (session.status !== GameStatus.READY_COUNTDOWN) {
      console.warn(`[LobbyService] Game start aborted for ${sessionId}: Status is ${session.status}, not READY_COUNTDOWN. (Already started or cancelled?)`);
      return;
    }
    // Final check for minimum players, in case someone left right before starting
    if (session.participants.length < (session.minPlayers || LobbyService.DEFAULT_MIN_PLAYERS)) {
      console.warn(`[LobbyService] Game start aborted for ${sessionId}: Not enough players (${session.participants.length} < ${session.minPlayers || LobbyService.DEFAULT_MIN_PLAYERS}). Auto-cancelling.`);
      await this.cancelCountdownInternal(sessionId, 'Not enough players after countdown.'); // Auto-cancel and notify
      return;
    }

    // Update session status to ACTIVE and remove room code (lobby is now closed)
    const updatedSession = await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        status: GameStatus.ACTIVE, // Game is now active
        roomCode: null, // Lobby is closed, no longer joinable by code
      }
    });

    // Call gameService to set up the actual game logic and send first questions
    // gameService will emit 'group_game:started'
    await gameService.startGroupGame(updatedSession.id);

    console.log(`[LobbyService] Game successfully started for lobby ${sessionId}.`);
  }

  /**
   * Dissolves a lobby. This means deleting the GameSession and notifying clients.
   * Typically used when the host leaves, or for administrative cleanup.
   * @param sessionId The ID of the GameSession (lobby).
   * @param reason The reason for dissolving the lobby.
   */
  async dissolveLobby(sessionId: string, reason: string = 'Lobby dissolved by system.'): Promise<void> {
    console.log(`[LobbyService] Dissolving lobby ${sessionId} due to: ${reason}`);
    
    // Notify all remaining clients in the room that the lobby is dissolved
    socketService.emitToRoom(sessionId, 'lobby:dissolved', { reason: reason });

    // Delete participants and then the session from the database
    await prisma.gameParticipant.deleteMany({ where: { gameSessionId: sessionId } });
    await prisma.gameSession.delete({ where: { id: sessionId } });
    
    console.log(`[LobbyService] Lobby ${sessionId} and its participants deleted from DB.`);
  }

  /**
   * Retrieves the current state of a lobby for client display.
   * @param sessionId The ID of the GameSession (lobby).
   * @returns An object containing the lobby's current status, players, and details.
   */
  async getLobbyState(sessionId: string): Promise<any | null> {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { participants: { include: { userProfile: true } } } // Include user profiles for display names
    });
    if (!session) {
      console.warn(`[LobbyService] Attempted to get state for non-existent session: ${sessionId}.`);
      return null;
    }

    // Map participants to a lighter format for client display
    const players = session.participants.map(p => ({
      participantId: p.id,
      userId: p.userId,
      username: p.userProfile?.username || `Player ${p.id.substring(0, 4)}`, // Fallback name
      avatarUrl: p.userProfile?.avatarUrl,
      isBot: p.isBot,
    }));

    return {
      sessionId: session.id,
      roomCode: session.roomCode,
      hostId: session.hostId,
      status: session.status,
      minPlayers: session.minPlayers,
      maxPlayers: session.maxPlayers,
      difficulty: session.difficulty,
      durationMinutes: session.durationMinutes,
      players: players,
      countdownStartTime: session.countdownStartTime?.toISOString() || null, // Ensure ISO format for client
    };
  }
}

export const lobbyService = new LobbyService();
