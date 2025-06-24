// src/components/QuickDuelGame.tsx
import React, { useState, useEffect, useMemo } from "react";
import { io, Socket } from "socket.io-client";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

// Register Chart.js components for the results graph
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

// --- TYPE DEFINITIONS ---
type GameStatus = "idle" | "searching" | "playing" | "finished";

interface Player {
  participantId: string;
  userId: string;
  username?: string;
  avatarUrl?: string;
  elo?: number;
  isBot?: boolean;
}

interface Question {
  id: string;
  text: string;
  options: { id: string; text: string }[];
}

interface AnswerData {
  questionId: string;
  timeTaken: number;
  action: "answered" | "skipped" | "timeout";
  correct?: boolean;
}

const SOCKET_SERVER_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

// --- HELPER COMPONENT: RESULTS GRAPH ---
interface ResultsGraphProps {
  players: Player[];
  results: Record<string, AnswerData[]>;
}
const ResultsGraph: React.FC<ResultsGraphProps> = ({ players, results }) => {
  const chartData = useMemo(() => {
    if (!results || !players || players.length === 0) return { datasets: [] };
    const labels: string[] = [];
    const datasets = players.map((player, playerIndex) => {
      const playerResults = results[player.participantId] || [];
      const scoresOverTime: (number | null)[] = [0]; // Start at 0
      let currentScore = 0;
      playerResults.forEach((answer, index) => {
        if (index === 0 && labels.length === 0) labels.push("Start");
        if (answer.correct) currentScore += 10;
        scoresOverTime.push(currentScore);
        if (playerIndex === 0) labels.push(`Q${index + 1}`);
      });
      return {
        label: player.username || player.userId,
        data: scoresOverTime,
        borderColor: player.isBot
          ? "rgba(255, 99, 132, 1)"
          : "rgba(75, 192, 192, 1)",
        tension: 0.1,
        fill: false,
      };
    });
    return { labels: labels.length > 1 ? labels : ["Start", "End"], datasets };
  }, [results, players]);

  return (
    <div style={{ position: "relative", height: "300px", marginTop: "30px" }}>
      <Line
        data={chartData}
        options={{ responsive: true, maintainAspectRatio: false }}
      />
    </div>
  );
};

// --- HELPER COMPONENT: AVATAR ---
const PlayerAvatar: React.FC<{ player: Player }> = ({ player }) => {
  const initial = player.username
    ? player.username.charAt(0).toUpperCase()
    : "?";
  if (player.avatarUrl)
    return (
      <img
        src={player.avatarUrl}
        alt={player.username || "player"}
        style={styles.avatar}
      />
    );
  return <div style={styles.avatar}>{initial}</div>;
};

// --- MAIN COMPONENT ---
export const QuickDuelGame = () => {
  // --- State Management ---
  const [userId, setUserId] = useState("");
  const [jwtToken, setJwtToken] = useState("");
  const [gameStatus, setGameStatus] = useState<GameStatus>("idle");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false); // Clean state for connection status
  const [waitingMessage, setWaitingMessage] = useState<string | null>(null);
  const [playerInfo, setPlayerInfo] = useState<{
    userId: string;
    participantId: string;
  } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [gameResults, setGameResults] = useState<Record<
    string,
    AnswerData[]
  > | null>(null);
  const [playersInGame, setPlayersInGame] = useState<Player[]>([]);
  const [timeLimit, setTimeLimit] = useState<1 | 2 | 5>(2);
  const [timer, setTimer] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // --- Handlers ---
  const handleFindMatch = async () => {
    setErrorMessage("");
    if (!jwtToken || !userId) {
      setErrorMessage("Please enter User ID and JWT Token.");
      return;
    }
    if (!isConnected) {
      setErrorMessage("Not connected to game server. Please wait.");
      return;
    }

    setGameStatus("searching");
    setWaitingMessage("Finding opponent...");
    try {
      const response = await fetch("/api/duel/find-match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({ duration: timeLimit }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Failed to find match.");
      console.log(
        "[QuickDuel] Matchmaking request sent. Waiting for 'match:found' event."
      );
    } catch (error: any) {
      setErrorMessage(`Error: ${error.message}`);
      setGameStatus("idle");
      setWaitingMessage(null);
    }
  };

  const handleAnswerClick = (optionId: string) => {
    if (socket && playerInfo && sessionId && currentQuestion) {
      socket.emit("answer:submit", {
        sessionId,
        participantId: playerInfo.participantId,
        questionId: currentQuestion.id,
        optionId,
      });
      setCurrentQuestion(null);
      setWaitingMessage("Waiting for next question...");
    }
  };

  const handleSkipClick = () => {
    if (socket && playerInfo && sessionId) {
      socket.emit("question:skip", {
        sessionId,
        participantId: playerInfo.participantId,
      });
      setCurrentQuestion(null);
      setWaitingMessage("Skipping to next question...");
    }
  };

  const resetGame = () => {
    setGameStatus("idle");
    setSessionId(null);
    setCurrentQuestion(null);
    setScores({});
    setGameResults(null);
    setPlayerInfo(null);
    setPlayersInGame([]);
    setWaitingMessage(null);
    setTimer(0);
    setErrorMessage("");
  };

  const formatTime = (seconds: number) =>
    `${Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

  // --- EFFECT 1: SOCKET LIFECYCLE MANAGEMENT ---
  // This effect's ONLY job is to connect and disconnect the socket.
  // It depends ONLY on `userId`.
  useEffect(() => {
    if (!userId) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    console.log(
      `[QuickDuel] Establishing new Socket.IO connection for userId: ${userId}`
    );
    const newSocket = io(SOCKET_SERVER_URL, {
      query: { userId },
      reconnection: true,
      reconnectionAttempts: 5,
    });
    setSocket(newSocket);

    newSocket.on("connect", () => {
      console.log(`[QuickDuel] Socket connected: ${newSocket.id}`);
      setIsConnected(true);
    });

    newSocket.on("disconnect", () => {
      console.log(`[QuickDuel] Socket disconnected.`);
      setIsConnected(false);
    });

    newSocket.on("connect_error", (err) => {
      console.error(`[QuickDuel] Socket connection error: ${err.message}`);
      setErrorMessage(
        `Connection Error: ${err.message}. Ensure backend is running.`
      );
      setIsConnected(false);
    });

    // Cleanup function for this useEffect hook
    return () => {
      console.log("[QuickDuel] Cleaning up socket connection.");
      newSocket.disconnect();
    };
  }, [userId]);

  // --- EFFECT 2: GAME EVENT LISTENERS ---
  // This effect sets up game event listeners when the socket is ready.
  useEffect(() => {
    if (!socket) return;

    const handleMatchFound = (data: {
      sessionId: string;
      players: Player[];
      duration: number;
    }) => {
      console.log("[QuickDuel] 'match:found' event received:", data);
      setErrorMessage(null);
      const myInfo = data.players.find((p) => p.userId === userId);
      if (myInfo) {
        setPlayerInfo({
          userId: myInfo.userId,
          participantId: myInfo.participantId,
        });
        setSessionId(data.sessionId);
        setPlayersInGame(data.players);
        setTimer(data.duration * 60);
        setScores(
          data.players.reduce(
            (acc, p) => ({ ...acc, [p.participantId]: 0 }),
            {}
          )
        );

        // Register this client's participant with the socket server for room joining
        socket.emit("game:register-participant", {
          participantId: myInfo.participantId,
          sessionId: data.sessionId,
        });

        // *** CRITICAL FIX FOR BOT ***
        // Request the first question for ALL participants after finding a match.
        console.log(
          `[QuickDuel] Requesting first questions for all participants in session ${data.sessionId}.`
        );
        data.players.forEach((p) => {
          socket.emit("quickduel:request_first_question", {
            sessionId: data.sessionId,
            participantId: p.participantId,
          });
          console.log(
            `  - Requested for ${p.username || p.userId} (ID: ${
              p.participantId
            })`
          );
        });

        setGameStatus("playing");
        setWaitingMessage(null);
      } else {
        setErrorMessage("Failed to find your player info in match data.");
        setGameStatus("idle");
      }
    };

    const handleNewQuestion = (question: Question) => {
      setCurrentQuestion(question);
      setWaitingMessage(null);
    };

    const handleScoreUpdate = (newScores: Record<string, number>) =>
      setScores(newScores);

    const handleParticipantFinished = (data: { reason: string }) => {
      setCurrentQuestion(null);
      setWaitingMessage(
        `You finished! ${data.reason}. Waiting for game to end...`
      );
    };

    const handleGameEnd = (data: {
      scores: Record<string, number>;
      results: Record<string, AnswerData[]>;
    }) => {
      setScores(data.scores);
      setGameResults(data.results);
      setGameStatus("finished");
    };

    const handleGameError = (data: { message: string }) => {
      setErrorMessage(`Game Error: ${data.message}`);
      setGameStatus("idle");
    };

    // Set up listeners
    socket.on("match:found", handleMatchFound);
    socket.on("question:new", handleNewQuestion);
    socket.on("score:update", handleScoreUpdate);
    socket.on("participant:finished", handleParticipantFinished);
    socket.on("game:end", handleGameEnd);
    socket.on("game:error", handleGameError);

    // Cleanup listeners when the component unmounts or socket changes
    return () => {
      socket.off("match:found", handleMatchFound);
      socket.off("question:new", handleNewQuestion);
      socket.off("score:update", handleScoreUpdate);
      socket.off("participant:finished", handleParticipantFinished);
      socket.off("game:end", handleGameEnd);
      socket.off("game:error", handleGameError);
    };
  }, [socket, userId]); // Re-register listeners if socket or user changes

  // --- EFFECT 3: GAME COUNTDOWN TIMER ---
  useEffect(() => {
    let gameInterval: NodeJS.Timeout | undefined;
    if (gameStatus === "playing" && timer > 0) {
      gameInterval = setInterval(() => setTimer((prev) => prev - 1), 1000);
    }
    return () => clearInterval(gameInterval);
  }, [gameStatus, timer]);

  const me = playersInGame.find((p) => p.userId === userId);
  const opponent = playersInGame.find((p) => p.userId !== userId);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🏆 Ranked Quick Duel</h1>
      {errorMessage && <div style={styles.errorMessage}>{errorMessage}</div>}

      {gameStatus === "idle" && (
        <div style={styles.card}>
          <div style={styles.inputGroup}>
            <input
              type="text"
              placeholder="Enter JWT token"
              value={jwtToken}
              onChange={(e) => setJwtToken(e.target.value)}
              style={styles.input}
            />
            <input
              type="text"
              placeholder="Enter your user ID"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              style={styles.input}
            />
          </div>
          <div style={styles.settingsGroup}>
            <label style={styles.label}>Game Duration:</label>
            <select
              value={timeLimit}
              onChange={(e) =>
                setTimeLimit(Number(e.target.value) as 1 | 2 | 5)
              }
              style={styles.select}
            >
              <option value={1}>1 Minute</option>
              <option value={2}>2 Minutes</option>
              <option value={5}>5 Minutes</option>
            </select>
          </div>
          <button
            onClick={handleFindMatch}
            style={styles.button}
            disabled={
              !userId || !jwtToken || !isConnected || gameStatus === "searching"
            }
          >
            {gameStatus === "searching" ? "Finding Match..." : "Find Match"}
          </button>
          {!isConnected && (
            <p style={styles.statusText}>Connecting to game server...</p>
          )}
        </div>
      )}

      {gameStatus === "searching" && (
        <div style={styles.card}>
          <h2 style={styles.statusHeader}>🔍 Finding Match...</h2>
          <p style={styles.statusText}>{waitingMessage}</p>
        </div>
      )}

      {gameStatus === "playing" && (
        <div style={styles.card}>
          <div style={styles.gameHeader}>
            <div style={styles.playerDisplay}>
              {me && <PlayerAvatar player={me} />}
              <div style={styles.playerText}>
                <span>{me?.username || "You"}</span>
                <strong>{me ? scores[me.participantId] || 0 : 0}</strong>
              </div>
            </div>
            <div style={styles.timerDisplay}>
              <span>Time Left</span>
              <strong>{formatTime(timer)}</strong>
            </div>
            <div style={styles.playerDisplay}>
              <div style={styles.playerTextRight}>
                <span>{opponent?.username || "Opponent"}</span>
                <strong>
                  {opponent ? scores[opponent.participantId] || 0 : 0}
                </strong>
              </div>
              {opponent && <PlayerAvatar player={opponent} />}
            </div>
          </div>

          {currentQuestion ? (
            <div style={styles.questionArea}>
              <h2 style={styles.questionText}>{currentQuestion.text}</h2>
              <div style={styles.optionsGrid}>
                {currentQuestion.options.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleAnswerClick(option.id)}
                    style={styles.optionButton}
                  >
                    {option.text}
                  </button>
                ))}
              </div>
              <button onClick={handleSkipClick} style={styles.skipButton}>
                Skip Question
              </button>
            </div>
          ) : (
            <p style={styles.statusText}>
              {waitingMessage || "Waiting for next question..."}
            </p>
          )}
        </div>
      )}

      {gameStatus === "finished" && (
        <div style={styles.card}>
          <h2 style={styles.statusHeader}>🏁 Game Over!</h2>
          <h3 style={styles.finalScoresHeader}>Final Scores</h3>
          <div style={styles.scoreBoard}>
            <span>
              {me?.username || "You"}: {me ? scores[me.participantId] || 0 : 0}
            </span>
            <span>
              {opponent?.username || "Opponent"}:{" "}
              {opponent ? scores[opponent.participantId] || 0 : 0}
            </span>
          </div>
          {gameResults && (
            <ResultsGraph players={playersInGame} results={gameResults} />
          )}
          <button
            onClick={resetGame}
            style={{ ...styles.button, marginTop: "20px" }}
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
};

// --- STYLES --- (Unchanged from previous correct version)
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    maxWidth: "800px",
    margin: "40px auto",
    padding: "20px",
    color: "#333",
  },
  title: {
    textAlign: "center",
    color: "#2c3e50",
    marginBottom: "30px",
    fontSize: "2.2em",
  },
  card: {
    background: "#ffffff",
    padding: "30px",
    borderRadius: "16px",
    boxShadow: "0 8px 40px rgba(0,0,0,0.08)",
  },
  inputGroup: { marginBottom: "20px" },
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px 15px",
    margin: "8px 0",
    border: "1px solid #ddd",
    borderRadius: "8px",
    fontSize: "16px",
  },
  settingsGroup: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    marginBottom: "25px",
  },
  label: { fontWeight: 500, marginBottom: "8px" },
  select: {
    width: "100%",
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #ddd",
    fontSize: "16px",
    background: "white",
  },
  button: {
    width: "100%",
    padding: "15px",
    border: "none",
    background: "linear-gradient(90deg, #36D1DC 0%, #5B86E5 100%)",
    color: "white",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "18px",
    fontWeight: "bold",
    transition: "transform 0.2s, box-shadow 0.2s",
  },
  errorMessage: {
    backgroundColor: "#ffe0e0",
    color: "#d32f2f",
    border: "1px solid #d32f2f",
    padding: "10px 15px",
    borderRadius: "8px",
    marginBottom: "20px",
    textAlign: "center",
    fontWeight: "bold",
  },
  statusHeader: { textAlign: "center", color: "#2c3e50", fontSize: "24px" },
  gameHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "30px",
    paddingBottom: "20px",
    borderBottom: "1px solid #eee",
  },
  playerDisplay: { display: "flex", alignItems: "center", gap: "15px" },
  playerText: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
  },
  playerTextRight: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
  },
  avatar: {
    width: "50px",
    height: "50px",
    borderRadius: "50%",
    background: "#e9ecef",
    color: "#495057",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "24px",
    fontWeight: "bold",
    objectFit: "cover",
  },
  timerDisplay: { textAlign: "center", fontSize: "1.2em" },
  questionArea: { animation: "fadeIn 0.5s" },
  questionText: {
    fontSize: "24px",
    margin: "20px 0 30px",
    minHeight: "70px",
    textAlign: "center",
    fontWeight: 500,
  },
  optionsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "15px",
    marginBottom: "20px",
  },
  optionButton: {
    padding: "18px",
    border: "2px solid #ddd",
    background: "white",
    borderRadius: "10px",
    cursor: "pointer",
    fontSize: "16px",
    textAlign: "center",
    transition: "all 0.2s ease",
    fontWeight: 500,
  },
  skipButton: {
    width: "100%",
    padding: "12px",
    border: "none",
    background: "#ffc107",
    color: "#212529",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "16px",
    fontWeight: "bold",
    marginTop: "10px",
  },
  statusText: {
    fontSize: "18px",
    color: "#555",
    padding: "40px 0",
    fontStyle: "italic",
    textAlign: "center",
  },
  finalScoresHeader: { textAlign: "center", marginTop: "30px", color: "#333" },
  scoreBoard: {
    display: "flex",
    justifyContent: "space-around",
    fontSize: "22px",
    fontWeight: "bold",
    background: "#f8f9fa",
    padding: "20px",
    borderRadius: "10px",
    margin: "10px 0 20px 0",
  },
};
