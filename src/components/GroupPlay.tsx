
import React, { useState, useEffect, useRef, useCallback } from "react";
import { io, Socket } from "socket.io-client";

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";
const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"];
const DURATIONS = [1,2, 5, 10];

export default function GroupPlay({ onClose }: { onClose: () => void }) {
  // --- Auth and State ---
  const [userId, setUserId] = useState(
    () => localStorage.getItem("gp_userId") || ""
  );
  const [token, setToken] = useState(
    () => localStorage.getItem("gp_token") || ""
  );
  const [isConfigured, setIsConfigured] = useState(!!(userId && token));

  const [step, setStep] = useState<
    "menu" | "lobby" | "countdown" | "playing" | "finished"
  >("menu");
  const [roomCode, setRoomCode] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [lobby, setLobby] = useState<any>(null);
  const [lobbyError, setLobbyError] = useState<string | null>(null);

  const [countdown, setCountdown] = useState<number | null>(null);
  const [game, setGame] = useState<any>(null);
  const [question, setQuestion] = useState<any>(null);
  const [scores, setScores] = useState<any>({});
  const [answering, setAnswering] = useState(false);
  const [finalResults, setFinalResults] = useState<any>(null);

  const [createDifficulty, setCreateDifficulty] = useState("MEDIUM");
  const [createDuration, setCreateDuration] = useState(5);
  const [createMaxPlayers, setCreateMaxPlayers] = useState(4);

  // --- Game Timer State ---
  const [gameTimer, setGameTimer] = useState<number | null>(null);
  const [gameDeadline, setGameDeadline] = useState<number | null>(null);

  // --- Socket Ref ---
  const socketRef = useRef<Socket | null>(null);

  // --- API Fetch Helper ---
  const apiFetch = useCallback(
    async (endpoint: string, body: object) => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || `Request to ${endpoint} failed`);
      return data;
    },
    [token]
  );

  // --- Register participant in socket room ---
  const registerParticipant = useCallback(
    (lobbyObj: any) => {
      if (!socketRef.current || !lobbyObj) return;
      const myParticipant = lobbyObj.participants.find(
        (p: any) => p.userId === userId
      );
      if (myParticipant) {
        socketRef.current.emit("game:register-participant", {
          participantId: myParticipant.participantId,
          sessionId: lobbyObj.id,
        });
        console.log(
          "[Socket] Registered participant",
          myParticipant.participantId,
          lobbyObj.id
        );
      }
    },
    [userId]
  );

  // --- useEffect: Socket.IO Connection and Events ---
  useEffect(() => {
    if (!isConfigured || !userId) return;
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    const socket = io(SOCKET_URL, {
      query: { userId },
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      randomizationFactor: 0.3,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.log(`[Socket] Connected with ID: ${socket.id}`);
      if (lobby && userId) registerParticipant(lobby);
    });

    socket.on("disconnect", (reason) => {
      console.warn("[Socket] Disconnected. Reason:", reason);
      setLobbyError(`Disconnected: ${reason}`);
    });
    socket.on("reconnect_attempt", (attempt) => {
      console.log(`[Socket] Reconnection attempt #${attempt}`);
    });
    socket.on("reconnect_failed", () => {
      setLobbyError("Could not reconnect to server.");
    });
    socket.on("connect_error", (err) => {
      setLobbyError("Socket connection error: " + err.message);
      console.error("[Socket] Connection Error:", err.message);
    });

    socket.on("lobby:update", (data) => {
      setLobby(data);
      setRoomCode(data.roomCode || "");
      setIsHost(data.hostId === userId);
      setStep((currentStep) =>
        currentStep !== "countdown" &&
        currentStep !== "playing" &&
        currentStep !== "finished"
          ? "lobby"
          : currentStep
      );
      setLobbyError(null);
    });

    socket.on("lobby:countdown_started", (data) => {
      setCountdown(data.duration || 10);
      setStep("countdown");
    });

    socket.on("lobby:countdown_cancelled", (data) => {
      setCountdown(null);
      setLobbyError(data.reason || "Countdown was cancelled.");
      setStep("lobby");
    });

    socket.on("group_game:started", (data) => {
      setGame(data);
      setScores(
        lobby
          ? lobby.participants.reduce(
              (acc: any, p: any) => ({ ...acc, [p.participantId]: 0 }),
              {}
            )
          : {}
      );
      setStep("playing");
      setCountdown(null);
      // --- Start game timer ---
      console.log(data);
      if (data.duration) {
        const deadline = Date.now() + data.duration * 60 * 1000;
        setGameDeadline(deadline);
        setGameTimer(data.duration * 60);
      }
    });
    console.log(gameDeadline,gameTimer)
    socket.on("group_game:score_update", (data) => setScores(data.scores));
    socket.on("group_game:finished", (data) => {
      setFinalResults(data);
      setStep("finished");
      setGameTimer(0); // Stop timer
    });

    socket.on("question:new", (data) => {
      setQuestion(data);
      setAnswering(false); // Enable answering for the new question
    });

    socket.on("lobby:dissolved", (data) => {
      setLobbyError(data.reason || "Lobby has been dissolved.");
      setLobby(null);
      setRoomCode("");
      setStep("menu");
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isConfigured, userId, lobby, registerParticipant]);

  // --- Re-register participant after lobby changes (e.g. after join/create) ---
  useEffect(() => {
    if (lobby && socketRef.current && userId) registerParticipant(lobby);
  }, [lobby, registerParticipant, userId]);

  // --- useEffect: Countdown Timer Logic ---
  useEffect(() => {
    if (step === "countdown" && countdown !== null && countdown > 0) {
      const timer = setTimeout(
        () => setCountdown((c) => (c ? c - 1 : 0)),
        1000
      );
      return () => clearTimeout(timer);
    }
  }, [step, countdown]);

  // --- useEffect: Overall Game Timer Logic ---
  useEffect(() => {
    if (step !== "playing" || gameDeadline === null) return;
    setGameTimer(Math.max(0, Math.round((gameDeadline - Date.now()) / 1000)));
    const interval = setInterval(() => {
      setGameTimer((prev) => {
        const remaining = Math.max(
          0,
          Math.round((gameDeadline - Date.now()) / 1000)
        );
        if (remaining <= 0) clearInterval(interval);
        return remaining;
      });
    }, 250);
    return () => clearInterval(interval);
  }, [step, gameDeadline]);

  // --- Answer Handler ---
  const handleAnswer = (optionId: string) => {
    if (!question || answering || !socketRef.current || !game || !lobby) return;
    setAnswering(true);
    const myParticipant = lobby.participants.find(
      (p: any) => p.userId === userId
    );
    if (!myParticipant) return;
    socketRef.current.emit("answer:submit", {
      sessionId: game.sessionId || game.id, // support both
      participantId: myParticipant.participantId,
      questionId: question.id,
      optionId,
    });
    console.log("Answer sent:", optionId);
  };

  // --- Handlers for UI Actions ---
  const handleCreateRoom = async () => {
    setLobbyError(null);
    try {
      const settings = {
        difficulty: createDifficulty,
        durationMinutes: createDuration,
        maxPlayers: createMaxPlayers,
      };
      const response = await apiFetch("/api/group/create", settings);
      if (response && response.lobby) {
        setLobby(response.lobby);
        setRoomCode(response.roomCode);
        setIsHost(true);
        setStep("lobby");
        if (socketRef.current && socketRef.current.connected)
          registerParticipant(response.lobby);
      } else {
        throw new Error("Invalid response from server after creating room.");
      }
    } catch (err: any) {
      setLobbyError(err.message);
    }
  };

  const handleJoinRoom = async (code: string) => {
    setLobbyError(null);
    try {
      const lobbyState = await apiFetch("/api/group/join", { roomCode: code });
      if (lobbyState && lobbyState.id) {
        setLobby(lobbyState);
        setRoomCode(lobbyState.roomCode);
        setIsHost(lobbyState.hostId === userId);
        setStep("lobby");
        if (socketRef.current && socketRef.current.connected)
          registerParticipant(lobbyState);
      } else {
        throw new Error("Invalid response from server after joining room.");
      }
    } catch (err: any) {
      setLobbyError(err.message);
    }
  };

  const handleStartCountdown = async () => {
    setLobbyError(null);
    try {
      if (!roomCode) throw new Error("Room code is missing.");
      await apiFetch("/api/group/initiate-countdown", { roomCode });
    } catch (err: any) {
      setLobbyError(err.message);
    }
  };

  const handleLeaveLobby = async () => {
    setLobbyError(null);
    try {
      if (lobby && lobby.id) {
        await apiFetch("/api/group/leave", {
          sessionId: lobby.id,
          userId: userId,
        });
      }
      setLobby(null);
      setRoomCode("");
      setStep("menu");
    } catch (err: any) {
      setLobbyError(err.message);
    }
  };

  const handleCancelCountdown = async () => {
    setLobbyError(null);
    try {
      if (!lobby || !lobby.id)
        throw new Error("Lobby data missing to cancel countdown.");
      await apiFetch("/api/group/cancel-countdown", { sessionId: lobby.id });
    } catch (err: any) {
      setLobbyError(err.message);
    }
  };

  const handleSaveConfig = () => {
    if (userId && token) {
      localStorage.setItem("gp_userId", userId);
      localStorage.setItem("gp_token", token);
      setIsConfigured(true);
    } else {
      setLobbyError("User ID and Token are required.");
    }
  };

  // --- UI Rendering ---

  if (!isConfigured) {
    return (
      <div style={styles.container}>
        <h2 style={styles.h2}>⚙️ Game Setup</h2>
        <p style={styles.subtitle}>
          Enter your details to continue. They will be saved in your browser.
        </p>
        <div style={styles.form}>
          <label style={styles.label}>Your User ID</label>
          <input
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="Enter User ID"
            style={styles.input}
          />
          <label style={styles.label}>Your Auth Token (JWT)</label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste Token"
            style={styles.input}
          />
          {lobbyError && <div style={styles.error}>{lobbyError}</div>}
          <div style={styles.buttonGroup}>
            <button onClick={handleSaveConfig} style={styles.button}>
              Save & Continue
            </button>
            <button onClick={onClose} style={styles.buttonSecondary}>
              Back to Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "menu") {
    return (
      <div style={styles.container}>
        <h2 style={styles.h2}>👥 Group Play</h2>
        <CreateRoomForm
          difficulty={createDifficulty}
          setDifficulty={setCreateDifficulty}
          duration={createDuration}
          setDuration={setCreateDuration}
          maxPlayers={createMaxPlayers}
          setMaxPlayers={setCreateMaxPlayers}
          onCreate={handleCreateRoom}
        />
        <JoinRoomForm onJoin={handleJoinRoom} />
        {lobbyError && <div style={styles.error}>{lobbyError}</div>}
        <button onClick={onClose} style={styles.buttonSecondary}>
          Back to Menu
        </button>
      </div>
    );
  }

  if (step === "lobby" && lobby) {
    return (
      <div style={styles.container}>
        <h2 style={styles.h2}>
          Lobby: <span style={styles.roomCode}>{roomCode}</span>
        </h2>
        <div style={styles.lobbyBox}>
          <strong>
            Players ({lobby.participants.length}/{lobby.maxPlayers}):
          </strong>
          <ul style={styles.playerList}>
            {lobby.participants.map((p: any) => (
              <li key={p.participantId} style={styles.playerItem}>
                <span style={styles.playerName}>{p.username}</span>
                {p.userId === lobby.hostId && (
                  <span style={styles.hostBadge}>Host</span>
                )}
              </li>
            ))}
          </ul>
        </div>
        <div style={styles.buttonGroup}>
          {isHost && (
            <button onClick={handleStartCountdown} style={styles.button}>
              Start Game
            </button>
          )}
          <button onClick={handleLeaveLobby} style={styles.buttonSecondary}>
            Leave Lobby
          </button>
        </div>
        {lobbyError && <div style={styles.error}>{lobbyError}</div>}
      </div>
    );
  }

  if (step === "countdown") {
    return (
      <div style={styles.container}>
        <h2 style={styles.h2}>Game starting in...</h2>
        <div style={styles.countdownNumber}>{countdown}</div>
        {isHost && (
          <button
            onClick={handleCancelCountdown}
            style={styles.buttonSecondary}
          >
            Cancel
          </button>
        )}
      </div>
    );
  }

  // --- PLAYING: Render question, options, timer, and answer buttons ---
  if (step === "playing" && game) {
    return (
      <div style={styles.container}>
        <h2 style={styles.h2}>In Game</h2>
        {/* --- GAME TIMER --- */}
        <div
          style={{
            marginBottom: 12,
            fontSize: 20,
            color: "#d32f2f",
            fontWeight: 700,
          }}
        >
          Time Left:{" "}
          {gameTimer !== null
            ? `${Math.floor(gameTimer / 60)}:${(gameTimer % 60)
                .toString()
                .padStart(2, "0")}`
            : "--:--"}
        </div>
        <Scoreboard scores={scores} players={lobby.participants} />
        {question ? (
          <div style={styles.questionBox}>
            <h3 style={styles.questionText}>{question.text}</h3>
            <div style={styles.optionsGroup}>
              {question.options.map((opt: any) => (
                <button
                  key={opt.id}
                  style={styles.button}
                  disabled={answering || (gameTimer !== null && gameTimer <= 0)}
                  onClick={() => handleAnswer(opt.id)}
                >
                  {opt.text}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={styles.waiting}>Waiting for next question...</div>
        )}
        <button onClick={handleLeaveLobby} style={styles.buttonSecondary}>
          Leave Game
        </button>
      </div>
    );
  }

  if (step === "finished" && finalResults) {
    return (
      <div style={styles.container}>
        <h2 style={styles.h2}>🏁 Game Over!</h2>
        <Scoreboard scores={finalResults.scores} players={lobby.participants} />
        <button onClick={onClose}>Back to Menu</button>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div>Loading...</div>
    </div>
  );
}

// --- Helper Components ---
interface CreateRoomFormProps {
  difficulty: string;
  setDifficulty: React.Dispatch<React.SetStateAction<string>>;
  duration: number;
  setDuration: React.Dispatch<React.SetStateAction<number>>;
  maxPlayers: number;
  setMaxPlayers: React.Dispatch<React.SetStateAction<number>>;
  onCreate: () => void;
}
function CreateRoomForm({
  difficulty,
  setDifficulty,
  duration,
  setDuration,
  maxPlayers,
  setMaxPlayers,
  onCreate,
}: CreateRoomFormProps) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onCreate();
      }}
      style={styles.form}
    >
      <h3 style={styles.h3}>Create a New Room</h3>
      <label style={styles.label}>Difficulty:</label>
      <select
        value={difficulty}
        onChange={(e) => setDifficulty(e.target.value)}
        style={styles.input}
      >
        {DIFFICULTIES.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <label style={styles.label}>Duration (minutes):</label>
      <select
        value={duration}
        onChange={(e) => setDuration(Number(e.target.value))}
        style={styles.input}
      >
        {DURATIONS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <label style={styles.label}>Max Players:</label>
      <input
        type="number"
        min={2}
        max={10}
        value={maxPlayers}
        onChange={(e) => setMaxPlayers(Number(e.target.value))}
        style={styles.input}
      />
      <button type="submit" style={styles.button}>
        Create Room
      </button>
    </form>
  );
}

function JoinRoomForm({ onJoin }: { onJoin: (code: string) => void }) {
  const [code, setCode] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onJoin(code);
      }}
      style={styles.form}
    >
      <h3 style={styles.h3}>Join with Code</h3>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Enter Room Code"
        maxLength={10}
        style={styles.input}
      />
      <button type="submit" style={styles.button}>
        Join Room
      </button>
    </form>
  );
}

function Scoreboard({
  scores,
  players,
}: {
  scores: Record<string, number>;
  players: any[];
}) {
  return (
    <div style={styles.scoreboard}>
      <h3 style={styles.h3}>Scores</h3>
      <ul style={styles.scoreList}>
        {players.map((p) => (
          <li key={p.participantId} style={styles.scoreItem}>
            <span style={styles.scoreName}>{p.username}</span>
            <span style={styles.scoreValue}>
              {scores[p.participantId] || 0}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    maxWidth: 500,
    margin: "40px auto",
    padding: 32,
    background: "linear-gradient(135deg, #f8fafc 0%, #eef2f5 100%)",
    borderRadius: 18,
    boxShadow: "0 8px 40px rgba(0,0,0,0.08)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minHeight: 400,
    position: "relative",
  },
  button: {
    width: "100%",
    boxSizing: "border-box",
    padding: "13px 28px",
    margin: "8px 0",
    borderRadius: 8,
    background: "linear-gradient(90deg, #36D1DC 0%, #5B86E5 100%)",
    color: "#fff",
    border: "none",
    fontWeight: 700,
    fontSize: "1.1rem",
    cursor: "pointer",
    transition: "transform 0.1s",
  },
  buttonGroup: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18,
    justifyContent: "center",
  },
  buttonSecondary: {
    width: "100%",
    boxSizing: "border-box",
    background: "#fff",
    color: "#5B86E5",
    border: "2px solid #5B86E5",
    margin: "8px 0",
    fontWeight: 700,
    padding: "13px 28px",
    borderRadius: 8,
    cursor: "pointer",
    transition: "background 0.2s",
  },
  error: {
    color: "#d32f2f",
    background: "#fff0f0",
    border: "1px solid #fbb",
    borderRadius: 8,
    padding: "12px 15px",
    marginTop: 18,
    fontWeight: 600,
    textAlign: "center",
    width: "100%",
    boxSizing: "border-box",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
    marginBottom: 20,
    width: "100%",
    background: "#fff",
    borderRadius: 12,
    boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
    padding: 24,
    boxSizing: "border-box",
  },
  input: {
    fontSize: "1rem",
    padding: "12px",
    border: "1.5px solid #cdd5de",
    borderRadius: 8,
    outline: "none",
    marginTop: 5,
    marginBottom: 8,
    width: "100%",
    boxSizing: "border-box",
    background: "#f8fafc",
  },
  label: { fontWeight: 600, color: "#3d4f63", marginBottom: 4 },
  h2: {
    fontSize: "2rem",
    fontWeight: 800,
    color: "#36D1DC",
    marginBottom: 16,
    letterSpacing: "-1px",
    textAlign: "center",
  },
  h3: {
    fontSize: "1.2rem",
    fontWeight: 700,
    color: "#2c3e50",
    marginBottom: 12,
    textAlign: "center",
  },
  subtitle: { color: "#5a6a7b", textAlign: "center", marginBottom: "20px" },
  lobbyBox: {
    width: "100%",
    boxSizing: "border-box",
    background: "#fff",
    borderRadius: 10,
    padding: 16,
    margin: "10px 0",
    boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
  },
  playerList: { listStyle: "none", padding: 0, margin: 0 },
  playerItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    padding: "6px 0",
    borderBottom: "1px solid #f0f4f8",
  },
  playerName: { fontWeight: 500, color: "#2b3a4a" },
  hostBadge: {
    background: "#36D1DC",
    color: "#fff",
    borderRadius: 6,
    fontSize: "0.8em",
    padding: "3px 9px",
    marginLeft: 6,
    fontWeight: 700,
  },
  roomCode: {
    color: "#5B86E5",
    fontWeight: 700,
    fontSize: "1.1em",
    letterSpacing: "2px",
    background: "#eef2f5",
    padding: "4px 8px",
    borderRadius: "6px",
  },
  optionsGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginTop: 12,
  },
  waiting: {
    color: "#888",
    fontStyle: "italic",
    marginTop: 24,
    fontSize: "1.1em",
  },
  countdownNumber: {
    color: "#d32f2f",
    fontWeight: 900,
    fontSize: "6rem",
    margin: "20px 0",
  },
  questionBox: {
    width: "100%",
    background: "#fff",
    borderRadius: 10,
    padding: 20,
    margin: "20px 0",
    boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
    textAlign: "center",
  },
  questionText: {
    fontSize: "1.2rem",
    fontWeight: 700,
    color: "#2c3e50",
    marginBottom: 18,
  },
  scoreboard: {
    width: "100%",
    margin: "20px 0",
    background: "#f8fafc",
    borderRadius: 10,
    padding: 16,
    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  },
  scoreList: { listStyle: "none", padding: 0, margin: 0 },
  scoreItem: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "4px 0",
    borderBottom: "1px solid #eef2f5",
  },
  scoreName: { fontWeight: 500, color: "#2b3a4a" },
  scoreValue: { fontWeight: 700, color: "#36D1DC" },
};
