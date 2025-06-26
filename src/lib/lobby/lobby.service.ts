// src/lib/lobby/lobby.service.ts

import prisma from "@/lib/prisma/client";
import { GameMode, GameStatus, Difficulty } from "@prisma/client";
import { gameService } from "@/lib/services/game.service"; // Ensure this path is correct
import { socketService } from "@/lib/websocket/socket.service"; // Ensure this path is correct
import { queueService } from "@/lib/queue/config"; // Ensure this path is correct

class LobbyService {
  private static readonly ROOM_CODE_LENGTH = 10;
  private static readonly COUNTDOWN_DURATION_SECONDS = 10;
  public static readonly DEFAULT_MIN_PLAYERS = 2; // Made public for access from API route

  /**
   * Generates a unique, short, alphanumeric room code.
   * @returns A unique 6-character room code.
   */
  private async generateRoomCode(): Promise<string> {
    let code: string;
    let exists: boolean;
    do {
      code = Math.random()
        .toString(36)
        .substring(2, 2 + LobbyService.ROOM_CODE_LENGTH)
        .toUpperCase();
      const session = await prisma.gameSession.findUnique({
        where: { roomCode: code },
      });
      exists = !!session;
    } while (exists);
    console.log(`[LobbyService] Generated unique room code: ${code}`);
    return code;
  }

  /**
   * Retrieves the current state of a lobby in a consistent format for the frontend.
   * This is the single source of truth for lobby data structure.
   * @param sessionId The ID of the GameSession (lobby).
   * @returns An object containing the lobby's current status, players, and details.
   */
  async getLobbyState(sessionId: string): Promise<any | null> {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { participants: { include: { userProfile: true } } },
    });
    if (!session) {
      console.warn(
        `[LobbyService] Attempted to get state for non-existent session: ${sessionId}.`
      );
      return null;
    }

    const hostProfile = await prisma.userProfile.findUnique({
      where: { userId: session.hostId! },
    });
    const hostName = hostProfile?.username || hostProfile?.name || "Host";

    const participants = session.participants.map((p) => {
      // Robustly determine username with fallbacks and bot handling
      const username = p.isBot
        ? `Bot ${p.id.substring(0, 4)}`
        : p.userProfile?.username ||
          p.userProfile?.name ||
          `Player ${p.id.substring(0, 4)}`;
      return {
        participantId: p.id, // Primary key for GameParticipant, useful for React keys
        userId: p.userId, // The actual user ID tied to UserProfile
        username: username,
        avatarUrl: p.userProfile?.avatarUrl,
        isBot: p.isBot,
      };
    });

    console.log(
      `[LobbyService] getLobbyState for session ${sessionId} found ${participants.length} participants.`
    );

    return {
      id: session.id, // Main ID for the session/lobby
      roomCode: session.roomCode,
      hostId: session.hostId, // Ensure hostId is always present
      hostName: hostName, // Ensure hostName is always present
      status: session.status,
      minPlayers: session.minPlayers,
      maxPlayers: session.maxPlayers,
      difficulty: session.difficulty,
      durationMinutes: session.durationMinutes,
      participants: participants, // Consistent format for participant list
      countdownStartTime: session.countdownStartTime?.toISOString() || null, // Ensure ISO format for client clock sync
    };
  }

  /**
   * Creates a new Group Play lobby. Host is automatically added as the first participant.
   * @param hostId ID of the user creating the lobby.
   * @param difficulty Game difficulty.
   * @param durationMinutes Game duration in minutes.
   * @param maxPlayers Maximum players allowed.
   * @param minPlayers Minimum players required (defaults to DEFAULT_MIN_PLAYERS).
   * @returns An object containing the roomCode and the full lobby state.
   */
  async createLobby(
    hostId: string,
    difficulty: Difficulty,
    durationMinutes: number,
    maxPlayers: number,
    minPlayers: number = LobbyService.DEFAULT_MIN_PLAYERS
  ): Promise<{ roomCode: string; lobby: any }> {
    console.log(
      `[LobbyService] Host ${hostId} creating lobby. Difficulty: ${difficulty}, Duration: ${durationMinutes}min, Max: ${maxPlayers}`
    );

    // Input validation (now robust for all required fields)
    if (!Object.values(Difficulty).includes(difficulty))
      throw new Error("Invalid difficulty selected.");
    if (![1,2, 5, 10].includes(durationMinutes))
      throw new Error(
        "Invalid duration selected. Must be 2, 5, or 10 minutes."
      );
    if (maxPlayers < 2 || maxPlayers > 8)
      throw new Error("Max players must be between 2 and 8.");
    if (minPlayers < 2 || minPlayers > maxPlayers)
      throw new Error("Min players must be between 2 and max players.");

    const hostProfile = await prisma.userProfile.findUnique({
      where: { userId: hostId },
    });
    if (!hostProfile)
      throw new Error(`User profile not found for host ID: ${hostId}.`);

    const roomCode = await this.generateRoomCode();

    // Use a transaction to create the GameSession and GameParticipant atomically.
    // This resolves the "Unknown argument userId" error due to @@unique constraint.
    const session = await prisma.$transaction(async (tx) => {
      const newSession = await tx.gameSession.create({
        data: {
          mode: GameMode.GROUP_PLAY,
          status: GameStatus.LOBBY,
          roomCode,
          hostId,
          minPlayers,
          maxPlayers,
          difficulty,
          durationMinutes,
        },
      });
      // Explicitly create GameParticipant.userId here as it's part of @@unique.
      await tx.gameParticipant.create({
        data: {
          gameSessionId: newSession.id,
          userId: hostId,
          isBot: false,
          score: 0,
        },
      });
      return newSession;
    });

    const lobbyState = await this.getLobbyState(session.id);
    if (lobbyState) {
      // Emit update to the client that just created the room and anyone else listening
      socketService.emitToRoom(session.id, "lobby:update", lobbyState);
      console.log(
        `[LobbyService] Lobby ${session.id} created successfully with code ${roomCode}.`
      );
    } else {
      console.error(
        `[LobbyService] Failed to retrieve lobby state after creation for session ${session.id}.`
      );
      throw new Error("Failed to create lobby state.");
    }

    // Return the full lobby state to the API route for immediate frontend update
    return { roomCode, lobby: lobbyState };
  }

  /**
   * Allows a player to join an existing lobby using its room code.
   * @param userId The ID of the user attempting to join.
   * @param roomCode The room code of the lobby to join.
   * @returns The updated lobby state.
   */
  async joinLobby(userId: string, roomCode: string): Promise<any> {
    console.log(
      `[LobbyService] User ${userId} attempting to join lobby with code: ${roomCode}.`
    );

    if (!roomCode || roomCode.length !== LobbyService.ROOM_CODE_LENGTH)
      throw new Error("Invalid room code format.");

    const session = await prisma.gameSession.findUnique({
      where: { roomCode: roomCode.toUpperCase() },
      include: { participants: true },
    });

    if (!session) throw new Error("Lobby not found with that code.");
    if (session.status !== GameStatus.LOBBY)
      throw new Error("Lobby is not open for joining.");
    if (session.participants.length >= (session.maxPlayers || 8))
      throw new Error("Lobby is full. Cannot join.");
    if (session.participants.some((p) => p.userId === userId))
      throw new Error("You are already in this lobby.");

    const userProfile = await prisma.userProfile.findUnique({
      where: { userId },
    });
    if (!userProfile)
      throw new Error(`User profile not found for user ID: ${userId}.`);

    // Use a transaction to create the GameParticipant and update the session atomically
    const updatedSession = await prisma.$transaction(async (tx) => {
      await tx.gameParticipant.create({
        data: {
          gameSessionId: session.id, // Link to the current session
          userId: userId, // Explicitly set userId for participant
          isBot: false,
          score: 0,
        },
      });
      // Re-fetch the session with updated participants for getLobbyState
      return tx.gameSession.findUnique({
        where: { id: session.id },
        include: { participants: { include: { userProfile: true } } },
      });
    });

    if (!updatedSession)
      throw new Error("Failed to update session after adding participant.");

    const lobbyState = await this.getLobbyState(updatedSession.id);
    if (lobbyState) {
      // Emit update to all clients in the room, including the new joiner
      socketService.emitToRoom(updatedSession.id, "lobby:update", lobbyState);
      console.log(
        `[LobbyService] User ${userId} successfully joined lobby ${roomCode}.`
      );
    } else {
      console.error(
        `[LobbyService] Failed to retrieve lobby state after join for session ${updatedSession.id}.`
      );
      throw new Error("Failed to update lobby state.");
    }
    // Return the full lobby state to the API route for immediate frontend update
    return lobbyState;
  }

  /**
   * Removes a player from a lobby. Handles host leaving (dissolves lobby) or players leaving.
   * @param userId The ID of the user leaving.
   * @param sessionId The ID of the session the user is leaving.
   */
  async leaveLobby(userId: string, sessionId: string): Promise<void> {
    console.log(
      `[LobbyService] User ${userId} attempting to leave lobby ${sessionId}.`
    );

    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { participants: true },
    });
    if (!session) {
      console.warn(
        `[LobbyService] User ${userId} tried to leave non-existent lobby ${sessionId}.`
      );
      return;
    }

    // If host leaves, dissolve the entire lobby
    if (session.hostId === userId) {
      console.log(
        `[LobbyService] Host ${userId} is leaving lobby ${sessionId}. Dissolving lobby.`
      );
      if (session.status === GameStatus.READY_COUNTDOWN) {
        await this.cancelCountdownInternal(
          sessionId,
          "Host left the lobby during countdown."
        );
      }
      await this.dissolveLobby(session.id, "Host left the lobby.");
      return;
    }

    // Remove non-host participant
    if (!session.participants.some((p) => p.userId === userId)) {
      console.warn(
        `[LobbyService] User ${userId} not found in lobby ${sessionId}.`
      );
      return;
    }
    await prisma.gameParticipant.deleteMany({
      where: { gameSessionId: sessionId, userId: userId },
    });

    const updatedSession = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { participants: true },
    });
    if (updatedSession) {
      const lobbyState = await this.getLobbyState(updatedSession.id);
      if (lobbyState) {
        socketService.emitToRoom(updatedSession.id, "lobby:update", lobbyState);
      }
      // If countdown was active and players dropped below min, cancel it
      if (
        updatedSession.status === GameStatus.READY_COUNTDOWN &&
        updatedSession.participants.length <
          (updatedSession.minPlayers || LobbyService.DEFAULT_MIN_PLAYERS)
      ) {
        await this.cancelCountdownInternal(
          sessionId,
          "Not enough players remaining."
        );
      }
    }
  }

  /**
   * Initiates the game start countdown.
   * @param hostId The ID of the host.
   * @param sessionId The ID of the session.
   * @returns Success message.
   */
  async initiateCountdown(hostId: string, sessionId: string): Promise<any> {
    console.log(
      `[LobbyService] Host ${hostId} requesting to initiate countdown for lobby ${sessionId}.`
    );

    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { participants: true },
    });

    // Validations
    if (!session) throw new Error("Lobby not found.");
    if (session.hostId !== hostId)
      throw new Error("Only the host can start the game.");
    if (session.status !== GameStatus.LOBBY)
      throw new Error("Game cannot be started from its current state.");
    if (
      session.participants.length <
      (session.minPlayers || LobbyService.DEFAULT_MIN_PLAYERS)
    ) {
      throw new Error(
        `Not enough players. Minimum ${
          session.minPlayers || LobbyService.DEFAULT_MIN_PLAYERS
        } required.`
      );
    }

    const updatedSession = await prisma.gameSession.update({
      where: { id: sessionId },
      data: {
        status: GameStatus.READY_COUNTDOWN,
        countdownStartTime: new Date(),
      },
    });

    const jobName = `lobby-start-${updatedSession.id}`;
    await queueService.dispatch(
      "lobby-countdown-jobs",
      { sessionId: updatedSession.id },
      { delay: LobbyService.COUNTDOWN_DURATION_SECONDS * 1000, jobId: jobName }
    );

    socketService.emitToRoom(updatedSession.id, "lobby:countdown_started", {
      duration: LobbyService.COUNTDOWN_DURATION_SECONDS,
      countdownStartTime: updatedSession.countdownStartTime?.toISOString(),
    });
    console.log(`[LobbyService] Countdown initiated for lobby ${sessionId}.`);
    return { success: true, message: "Countdown initiated." };
  }

  /**
   * Cancels an ongoing countdown.
   * @param sessionId The ID of the session.
   * @param reason The reason for cancellation.
   */
  private async cancelCountdownInternal(
    sessionId: string,
    reason: string
  ): Promise<void> {
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { status: GameStatus.LOBBY, countdownStartTime: null },
    });
    await queueService.removeJob(
      "lobby-countdown-jobs",
      `lobby-start-${sessionId}`
    );
    socketService.emitToRoom(sessionId, "lobby:countdown_cancelled", {
      reason: reason,
    });
  }

  /**
   * Public method to cancel countdown.
   * @param hostId The ID of the host.
   * @param sessionId The ID of the session.
   */
  async cancelCountdown(hostId: string, sessionId: string): Promise<void> {
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
    });
    if (!session) throw new Error("Lobby not found.");
    if (session.hostId !== hostId)
      throw new Error("Only the host can cancel the countdown.");
    if (session.status !== GameStatus.READY_COUNTDOWN)
      throw new Error("No active countdown to cancel.");
    await this.cancelCountdownInternal(
      sessionId,
      "Host cancelled the countdown."
    );
  }

  /**
   * Starts the actual game. Called by BullMQ worker.
   * @param sessionId The ID of the session.
   */
  async startGame(sessionId: string): Promise<void> {
    console.log(
      `[LobbyService] Attempting to start game for lobby ${sessionId}.`
    );
    const session = await prisma.gameSession.findUnique({
      where: { id: sessionId },
      include: { participants: true },
    });
    if (!session) {
      console.warn(
        `[LobbyService] Game start aborted for ${sessionId}: Session not found.`
      );
      return;
    }
    if (session.status !== GameStatus.READY_COUNTDOWN) {
      console.warn(
        `[LobbyService] Game start aborted for ${sessionId}: Status is ${session.status}, not READY_COUNTDOWN.`
      );
      return;
    }
    if (
      session.participants.length <
      (session.minPlayers || LobbyService.DEFAULT_MIN_PLAYERS)
    ) {
      console.warn(
        `[LobbyService] Game start aborted for ${sessionId}: Not enough players.`
      );
      await this.cancelCountdownInternal(
        sessionId,
        "Not enough players after countdown."
      );
      return;
    }
    const updatedSession = await prisma.gameSession.update({
      where: { id: sessionId },
      data: { status: GameStatus.ACTIVE, roomCode: null },
    });
    // Delegate actual game start logic to gameService (e.g., generate questions, set scores)
    console.log(
      `[LobbyService] Starting group game for lobby ${sessionId} with  participants.`);

    await gameService.startGroupGame(updatedSession.id);
    console.log(
      `[LobbyService] Game successfully started for lobby ${sessionId}.`
    );
  }

  /**
   * Dissolves a lobby and its participants.
   * @param sessionId The ID of the session.
   * @param reason The reason for dissolving.
   */
  async dissolveLobby(
    sessionId: string,
    reason: string = "Lobby dissolved by system."
  ): Promise<void> {
    console.log(
      `[LobbyService] Dissolving lobby ${sessionId} due to: ${reason}`
    );
    socketService.emitToRoom(sessionId, "lobby:dissolved", { reason: reason });
    await prisma.gameParticipant.deleteMany({
      where: { gameSessionId: sessionId },
    });
    await prisma.gameSession.delete({ where: { id: sessionId } });
    console.log(
      `[LobbyService] Lobby ${sessionId} and its participants deleted.`
    );
  }
}

export const lobbyService = new LobbyService();
