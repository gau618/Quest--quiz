// src/components/QuickDuelGame.tsx
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { socket } from "@/lib/socket"; // IMPORT the shared socket instance
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

// Register Chart.js components
ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend
);

// --- TYPE DEFINITIONS ---
type GameStatus = "idle" | "searching" | "playing" | "finished";

interface Player {
  participantId: string;
  userId: string;
  username?: string;
  avatarUrl?: string;
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

// --- HELPER COMPONENT: RESULTS GRAPH ---
const ResultsGraph: React.FC<{ players: Player[], results: Record<string, AnswerData[]> }> = ({ players, results }) => {
  const chartData = useMemo(() => {
    if (!results || !players || players.length === 0) return { datasets: [] };
    const labels: string[] = ["Start"];
    const datasets = players.map((player, playerIndex) => {
      const playerResults = results[player.participantId] || [];
      const scoresOverTime: number[] = [0];
      let currentScore = 0;
      playerResults.forEach((answer, index) => {
        if (answer.correct) currentScore += 10;
        scoresOverTime.push(currentScore);
        if (playerIndex === 0) labels.push(`Q${index + 1}`);
      });
      return {
        label: player.username || player.userId,
        data: scoresOverTime,
        borderColor: player.isBot ? "rgba(255, 99, 132, 1)" : "rgba(75, 192, 192, 1)",
        tension: 0.1,
        fill: false,
      };
    });
    return { labels, datasets };
  }, [results, players]);

  return <div style={{ position: "relative", height: "300px", marginTop: "30px" }}><Line data={chartData} options={{ responsive: true, maintainAspectRatio: false }} /></div>;
};

// --- HELPER COMPONENT: AVATAR ---
const PlayerAvatar: React.FC<{ player: Player }> = ({ player }) => (
  <img src={player.avatarUrl || `https://api.dicebear.com/8.x/initials/svg?seed=${player.username || player.userId}`} alt={player.username || "player"} style={styles.avatar} />
);

// --- MAIN COMPONENT ---
export const QuickDuelGame = () => {
  const [authInfo, setAuthInfo] = useState<{ userId: string; token: string } | null>(null);
  const [gameStatus, setGameStatus] = useState<GameStatus>("idle");
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [waitingMessage, setWaitingMessage] = useState<string | null>(null);
  const [playerInfo, setPlayerInfo] = useState<{ userId: string; participantId: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [gameResults, setGameResults] = useState<Record<string, AnswerData[]> | null>(null);
  const [playersInGame, setPlayersInGame] = useState<Player[]>([]);
  const [timeLimit, setTimeLimit] = useState<1 | 2 | 5>(2);
  const [timer, setTimer] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('gp_token');
    const userId = localStorage.getItem('gp_userId');

    if (token && userId) {
      setAuthInfo({ userId, token });
      if (!socket.connected) socket.connect();
    } else {
      setErrorMessage("You must be logged in to play.");
    }

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    const onConnectError = (err: Error) => {
      setErrorMessage(`Connection Error: ${err.message}.`);
      setIsConnected(false);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
    };
  }, []);

  const handleFindMatch = useCallback(async () => {
    setErrorMessage(null);
    if (!authInfo) return setErrorMessage("Authentication details not found.");
    if (!isConnected) return setErrorMessage("Not connected to game server.");

    setGameStatus("searching");
    setWaitingMessage("Finding opponent...");
    try {
      await fetch("/api/duel/find-match", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authInfo.token}` },
        body: JSON.stringify({ duration: timeLimit }),
      });
    } catch (error: any) {
      setErrorMessage(`Error: ${error.message}`);
      setGameStatus("idle");
    }
  }, [authInfo, isConnected, timeLimit]);

  const handleAnswerClick = (optionId: string) => {
    if (playerInfo && sessionId && currentQuestion) {
      socket.emit("answer:submit", { sessionId, participantId: playerInfo.participantId, questionId: currentQuestion.id, optionId });
      setCurrentQuestion(null);
      setWaitingMessage("Waiting for next question...");
    }
  };

  const handleSkipClick = () => {
    if (playerInfo && sessionId) {
      socket.emit("question:skip", { sessionId, participantId: playerInfo.participantId });
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
    setErrorMessage(null);
  };

  const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

  useEffect(() => {
    if (!isConnected || !authInfo) return;

    const handleMatchFound = (data: { sessionId: string; players: Player[]; duration: number; }) => {
      const myInfo = data.players.find((p) => p.userId === authInfo.userId);
      if (myInfo) {
        setPlayerInfo({ userId: myInfo.userId, participantId: myInfo.participantId });
        setSessionId(data.sessionId);
        setPlayersInGame(data.players);
        setTimer(data.duration * 60);
        setScores(data.players.reduce((acc, p) => ({ ...acc, [p.participantId]: 0 }), {}));
        socket.emit("game:register-participant", { participantId: myInfo.participantId, sessionId: data.sessionId });
        data.players.forEach((p) => {
          socket.emit("quickduel:request_first_question", { sessionId: data.sessionId, participantId: p.participantId });
        });
        setGameStatus("playing");
      } else {
        setErrorMessage("Failed to find your player info in match data.");
        setGameStatus("idle");
      }
    };

    const handleNewQuestion = (question: Question) => setCurrentQuestion(question);
    const handleScoreUpdate = (newScores: Record<string, number>) => setScores(newScores);
    const handleParticipantFinished = (data: { reason: string }) => {
      setCurrentQuestion(null);
      setWaitingMessage(`You finished! ${data.reason}. Waiting for game to end...`);
    };
    const handleGameEnd = (data: { scores: Record<string, number>; results: Record<string, AnswerData[]>; }) => {
      setScores(data.scores);
      setGameResults(data.results);
      setGameStatus("finished");
    };
    const handleGameError = (data: { message: string }) => {
      setErrorMessage(`Game Error: ${data.message}`);
      setGameStatus("idle");
    };

    socket.on("match:found", handleMatchFound);
    socket.on("question:new", handleNewQuestion);
    socket.on("score:update", handleScoreUpdate);
    socket.on("participant:finished", handleParticipantFinished);
    socket.on("game:end", handleGameEnd);
    socket.on("game:error", handleGameError);

    return () => {
      socket.off("match:found");
      socket.off("question:new");
      socket.off("score:update");
      socket.off("participant:finished");
      socket.off("game:end");
      socket.off("game:error");
    };
  }, [isConnected, authInfo]);

  useEffect(() => {
    if (gameStatus === "playing" && timer > 0) {
      const gameInterval = setInterval(() => setTimer((prev) => prev - 1), 1000);
      return () => clearInterval(gameInterval);
    }
  }, [gameStatus, timer]);

  const me = playersInGame.find((p) => p.userId === authInfo?.userId);
  const opponent = playersInGame.find((p) => p.userId !== authInfo?.userId);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🏆 Ranked Quick Duel</h1>
      {errorMessage && <div style={styles.errorMessage}>{errorMessage}</div>}

      {gameStatus === "idle" && (
        <div style={styles.card}>
          <div style={styles.settingsGroup}>
            <label style={styles.label}>Game Duration:</label>
            <select value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value) as 1 | 2 | 5)} style={styles.select}>
              <option value={1}>1 Minute</option>
              <option value={2}>2 Minutes</option>
              <option value={5}>5 Minutes</option>
            </select>
          </div>
          <button onClick={handleFindMatch} style={styles.button} disabled={!authInfo || !isConnected || gameStatus !== "idle"}>
            {gameStatus !== "idle" ? "Finding Match..." : "Find Match"}
          </button>
          {!isConnected && authInfo && <p style={styles.statusText}>Connecting to game server...</p>}
        </div>
      )}

      {gameStatus === "searching" && (
        <div style={styles.card}>
          <h2 style={styles.statusHeader}>🔍 Finding Match...</h2>
          <p style={styles.statusText}>{waitingMessage}</p>
        </div>
      )}

      {gameStatus === "playing" && me && opponent && (
        <div style={styles.card}>
          <div style={styles.gameHeader}>
            <div style={styles.playerDisplay}><PlayerAvatar player={me} /><div style={styles.playerText}><span>{me.username || "You"}</span><strong>{scores[me.participantId] || 0}</strong></div></div>
            <div style={styles.timerDisplay}><span>Time Left</span><strong>{formatTime(timer)}</strong></div>
            <div style={styles.playerDisplay}><div style={styles.playerTextRight}><span>{opponent.username || "Opponent"}</span><strong>{scores[opponent.participantId] || 0}</strong></div><PlayerAvatar player={opponent} /></div>
          </div>
          {currentQuestion ? (
            <div style={styles.questionArea}>
              <h2 style={styles.questionText}>{currentQuestion.text}</h2>
              <div style={styles.optionsGrid}>{currentQuestion.options.map((option) => (<button key={option.id} onClick={() => handleAnswerClick(option.id)} style={styles.optionButton}>{option.text}</button>))}</div>
              <button onClick={handleSkipClick} style={styles.skipButton}>Skip Question</button>
            </div>
          ) : (<p style={styles.statusText}>{waitingMessage || "Waiting for next question..."}</p>)}
        </div>
      )}

      {gameStatus === "finished" && me && (
        <div style={styles.card}>
          <h2 style={styles.statusHeader}>🏁 Game Over!</h2>
          <h3 style={styles.finalScoresHeader}>Final Scores</h3>
          <div style={styles.scoreBoard}>
            <span>{me.username || "You"}: {scores[me.participantId] || 0}</span>
            {opponent && <span>{opponent.username || "Opponent"}: {scores[opponent.participantId] || 0}</span>}
          </div>
          {gameResults && <ResultsGraph players={playersInGame} results={gameResults} />}
          <button onClick={resetGame} style={{ ...styles.button, marginTop: "20px" }}>Play Again</button>
        </div>
      )}
    </div>
  );
};

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
  container: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', maxWidth: "800px", margin: "40px auto", padding: "20px", color: "#333" },
  title: { textAlign: "center", color: "#2c3e50", marginBottom: "30px", fontSize: "2.2em" },
  card: { background: "#ffffff", padding: "30px", borderRadius: "16px", boxShadow: "0 8px 40px rgba(0,0,0,0.08)" },
  settingsGroup: { display: "flex", flexDirection: "column", alignItems: "flex-start", marginBottom: "25px" },
  label: { fontWeight: 500, marginBottom: "8px" },
  select: { width: "100%", padding: "12px", borderRadius: "8px", border: "1px solid #ddd", fontSize: "16px", background: "white" },
  button: { width: "100%", padding: "15px", border: "none", background: "linear-gradient(90deg, #36D1DC 0%, #5B86E5 100%)", color: "white", borderRadius: "8px", cursor: "pointer", fontSize: "18px", fontWeight: "bold", transition: "transform 0.2s, box-shadow 0.2s" },
  errorMessage: { backgroundColor: "#ffe0e0", color: "#d32f2f", border: "1px solid #d32f2f", padding: "10px 15px", borderRadius: "8px", marginBottom: "20px", textAlign: "center", fontWeight: "bold" },
  statusHeader: { textAlign: "center", color: "#2c3e50", fontSize: "24px" },
  gameHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px", paddingBottom: "20px", borderBottom: "1px solid #eee" },
  playerDisplay: { display: "flex", alignItems: "center", gap: "15px" },
  playerText: { display: "flex", flexDirection: "column", alignItems: "flex-start" },
  playerTextRight: { display: "flex", flexDirection: "column", alignItems: "flex-end" },
  avatar: { width: "50px", height: "50px", borderRadius: "50%", background: "#e9ecef", color: "#495057", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px", fontWeight: "bold", objectFit: "cover" },
  timerDisplay: { textAlign: "center", fontSize: "1.2em" },
  questionArea: { animation: "fadeIn 0.5s" },
  questionText: { fontSize: "24px", margin: "20px 0 30px", minHeight: "70px", textAlign: "center", fontWeight: 500 },
  optionsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginBottom: "20px" },
  optionButton: { padding: "18px", border: "2px solid #ddd", background: "white", borderRadius: "10px", cursor: "pointer", fontSize: "16px", textAlign: "center", transition: "all 0.2s ease", fontWeight: 500 },
  skipButton: { width: "100%", padding: "12px", border: "none", background: "#ffc107", color: "#212529", borderRadius: "8px", cursor: "pointer", fontSize: "16px", fontWeight: "bold", marginTop: "10px" },
  statusText: { fontSize: "18px", color: "#555", padding: "40px 0", fontStyle: "italic", textAlign: "center" },
  finalScoresHeader: { textAlign: "center", marginTop: "30px", color: "#333" },
  scoreBoard: { display: "flex", justifyContent: "space-around", fontSize: "22px", fontWeight: "bold", background: "#f8f9fa", padding: "20px", borderRadius: "10px", margin: "10px 0 20px 0" },
};
