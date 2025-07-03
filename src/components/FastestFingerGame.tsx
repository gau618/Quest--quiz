// src/components/FastestFingerGame.tsx
import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
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

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const GAME_STATUSES = [
  "idle",
  "searching",
  "waiting",
  "playing",
  "answered",
  "finished",
] as const;
type FFGameStatus = (typeof GAME_STATUSES)[number];
interface Player {
  participantId: string;
  userId: string;
  username?: string;
  avatarUrl?: string;
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
interface Results {
  [participantId: string]: AnswerData[];
}

// --- HELPER COMPONENT: RESULTS GRAPH ---
const ResultsGraph = ({
  results,
  players,
  myUserId,
}: {
  results: Results;
  players: Player[];
  myUserId: string | null;
}) => {
  const chartData = useMemo(() => {
    if (!myUserId || !results || !players) return { labels: [], datasets: [] };

    const me = players.find((p) => p.userId === myUserId);
    const opponent = players.find((p) => p.userId !== myUserId);

    const myResults = me ? results[me.participantId] || [] : [];
    const opponentResults = opponent
      ? results[opponent.participantId] || []
      : [];

    const maxRounds = Math.max(myResults.length, opponentResults.length);
    const labels = Array.from({ length: maxRounds }, (_, i) => `Q${i + 1}`);

    const processData = (playerResults: AnswerData[]) => {
      return playerResults.map((res) => {
        if (res.action === "timeout") return 25;
        if (res.action === "answered" && !res.correct) return 22;
        if (res.action === "answered" && res.correct)
          return res.timeTaken / 1000;
        return null;
      });
    };

    return {
      labels,
      datasets: [
        {
          label: `${me?.username || "You"} (Performance)`,
          data: processData(myResults),
          borderColor: "rgba(54, 162, 235, 1)",
          backgroundColor: "rgba(54, 162, 235, 0.5)",
          tension: 0.1,
        },
        {
          label: `${opponent?.username || "Opponent"} (Performance)`,
          data: processData(opponentResults),
          borderColor: "rgba(255, 99, 132, 1)",
          backgroundColor: "rgba(255, 99, 132, 0.5)",
          tension: 0.1,
        },
      ],
    };
  }, [results, players, myUserId]);

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: { position: "top" as const },
      title: {
        display: true,
        text: "Performance Analysis (Lower is Better)",
        font: { size: 16 },
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            let label = context.dataset.label || "";
            if (label) label += ": ";
            const value = context.parsed.y;
            if (value === 25) return label + "Timeout";
            if (value === 22) return label + "Incorrect";
            if (value !== null) return label + `${value.toFixed(2)} seconds`;
            return label + "N/A";
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: "Time (s) / Status (Incorrect=22, Timeout=25)",
        },
      },
    },
  };

  return (
    <div style={{ position: "relative", height: "300px", marginTop: "30px" }}>
      <Line options={chartOptions} data={chartData} />
    </div>
  );
};

// --- MAIN COMPONENT ---
export const FastestFingerGame = () => {
  // --- State Management ---
  const [authInfo, setAuthInfo] = useState<{
    userId: string;
    token: string;
  } | null>(null);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [gameStatus, setGameStatus] = useState<FFGameStatus>("idle");

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const playersRef = useRef(players);

  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [questionTimeLeft, setQuestionTimeLeft] = useState(0);
  const [totalTimeLeft, setTotalTimeLeft] = useState(0);
  const [timePerQuestion, setTimePerQuestion] = useState<10 | 20 | 30>(20);
  const [gameDuration, setGameDuration] = useState<1 | 2 | 5>(2);

  const [scores, setScores] = useState<Record<string, number>>({});
  const [hasAnswered, setHasAnswered] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [correctOptionId, setCorrectOptionId] = useState<string | null>(null);
  const [waitingMessage, setWaitingMessage] = useState<string | null>(null);
  const [gameResults, setGameResults] = useState<Results | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  const myParticipantId = useMemo(
    () => players.find((p) => p.userId === authInfo?.userId)?.participantId,
    [players, authInfo]
  );
  const opponent = useMemo(
    () => players.find((p) => p.userId !== authInfo?.userId),
    [players, authInfo]
  );
  const myScore = myParticipantId ? scores[myParticipantId] || 0 : 0;
  const opponentScore = opponent ? scores[opponent.participantId] || 0 : 0;

  // --- EFFECT 1: AUTHENTICATION & SOCKET CONNECTION ---
  useEffect(() => {
    const token = localStorage.getItem("gp_token");
    const userId = localStorage.getItem("gp_userId");

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

  // --- Handlers ---
  const findMatch = useCallback(async () => {
    setErrorMessage(null);
    if (!authInfo) return setErrorMessage("Authentication details not found.");
    if (!isConnected) return setErrorMessage("Not connected to game server.");

    setGameStatus("searching");
    try {
      await fetch("/api/fastest-finger/find-match", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authInfo.token}`,
        },
        body: JSON.stringify({
          timePerQuestion: timePerQuestion * 1000,
          duration: gameDuration,
        }),
      });
    } catch (error: any) {
      setErrorMessage(`Error finding match: ${error.message}`);
      setGameStatus("idle");
    }
  }, [authInfo, isConnected, timePerQuestion, gameDuration]);

  const handleAnswerClick = (optionId: string) => {
    if (
      !socket ||
      !currentQuestion ||
      hasAnswered ||
      !sessionId ||
      !myParticipantId
    )
      return;
    setSelectedOptionId(optionId);
    setHasAnswered(true);
    setGameStatus("answered");
    socket.emit("answer:submit", {
      sessionId,
      participantId: myParticipantId,
      questionId: currentQuestion.id,
      optionId,
    });
  };

  const resetGame = () => {
    setGameStatus("idle");
    setSessionId(null);
    setCurrentQuestion(null);
    setHasAnswered(false);
    setSelectedOptionId(null);
    setCorrectOptionId(null);
    setScores({});
    setWaitingMessage(null);
    setPlayers([]);
    setGameResults(null);
    setTotalTimeLeft(0);
    setQuestionNumber(0);
    setTotalQuestions(0);
    setQuestionTimeLeft(0);
  };

  const formatTime = (seconds: number) =>
    `${Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

  // --- EFFECT 2: GAME EVENT LISTENERS ---
  useEffect(() => {
    if (!isConnected || !socket || !authInfo) return;

    const handleMatchFound = (data: {
      sessionId: string;
      players: Player[];
      duration: number;
      timePerQuestion: number;
      totalQuestions: number;
    }) => {
      const myInfo = data.players.find((p) => p.userId === authInfo.userId);
      if (!myInfo) {
        setErrorMessage("Your player info not found in match data.");
        setGameStatus("idle");
        return;
      }
      socket.emit("game:register-participant", {
        participantId: myInfo.participantId,
        sessionId: data.sessionId,
      });
      setSessionId(data.sessionId);
      setPlayers(data.players);
      setTotalQuestions(data.totalQuestions);
      setTotalTimeLeft(data.duration * 60);
      setTimePerQuestion((data.timePerQuestion / 1000) as 10 | 20 | 30);
      setGameStatus("waiting");
    };

    const handleNewQuestion = (data: {
      question: Question;
      questionNumber: number;
      timeLimit: number;
    }) => {
      setCurrentQuestion(data.question);
      setQuestionNumber(data.questionNumber);
      setQuestionTimeLeft(data.timeLimit / 1000);
      setHasAnswered(false);
      setSelectedOptionId(null);
      setCorrectOptionId(null);
      setGameStatus("playing");
      setWaitingMessage(null);
    };

    const handlePlayerAnswered = (data: {
      participantId: string;
      correct: boolean;
    }) => {
      const player = playersRef.current.find(
        (p) => p.participantId === data.participantId
      );
      const isMe = player?.userId === authInfo.userId;
      if (!isMe) {
        setWaitingMessage(`${player?.username || "Opponent"} has answered!`);
      } else if (!data.correct) {
        setWaitingMessage("Incorrect answer! Locked out for this round.");
      }
    };

    const handlePointAwarded = (data: {
      participantId: string;
      allScores: Record<string, number>;
      correctOptionId: string;
    }) => {
      setScores(data.allScores);
      setCorrectOptionId(data.correctOptionId);
      const winner = playersRef.current.find(
        (p) => p.participantId === data.participantId
      );
      setWaitingMessage(
        winner ? `${winner.username} wins this round!` : "Round over!"
      );
    };

    const handleQuestionTimeout = (data: {
      questionNumber: number;
      correctOptionId: string;
    }) => {
      setWaitingMessage("Time up! Moving to the next question...");
      setCorrectOptionId(data.correctOptionId);
    };

    const handleGameEnd = (data: {
      scores: Record<string, number>;
      results: Results;
    }) => {
      setScores(data.scores);
      setGameResults(data.results);
      setGameStatus("finished");
      setWaitingMessage(null);
      setCurrentQuestion(null);
    };

    socket.on("ff:match_found", handleMatchFound);
    socket.on("ff:new_question", handleNewQuestion);
    socket.on("ff:player_answered", handlePlayerAnswered);
    socket.on("ff:point_awarded", handlePointAwarded);
    socket.on("ff:question_timeout", handleQuestionTimeout);
    socket.on("ff:game_end", handleGameEnd);

    return () => {
      socket.off("ff:match_found");
      socket.off("ff:new_question");
      socket.off("ff:player_answered");
      socket.off("ff:point_awarded");
      socket.off("ff:question_timeout");
      socket.off("ff:game_end");
    };
  }, [isConnected, socket, authInfo]);

  // --- EFFECT 3 & 4 (Timers) ---
  useEffect(() => {
    if (gameStatus === "playing" && questionTimeLeft > 0 && !hasAnswered) {
      const timer = setTimeout(
        () => setQuestionTimeLeft((prev) => prev - 1),
        1000
      );
      return () => clearTimeout(timer);
    }
  }, [gameStatus, questionTimeLeft, hasAnswered]);

  useEffect(() => {
    if (
      (gameStatus === "playing" ||
        gameStatus === "answered" ||
        gameStatus === "waiting") &&
      totalTimeLeft > 0
    ) {
      const timer = setTimeout(
        () => setTotalTimeLeft((prev) => prev - 1),
        1000
      );
      return () => clearTimeout(timer);
    }
  }, [gameStatus, totalTimeLeft]);
console.log('gameStatus:', gameStatus);

  const getOptionStyle = (optionId: string) => {
    if (correctOptionId) {
      if (optionId === correctOptionId) return styles.optionCorrect;
      if (optionId === selectedOptionId && optionId !== correctOptionId)
        return styles.optionIncorrect;
      return styles.option;
    }
    if (hasAnswered && selectedOptionId === optionId)
      return styles.optionSelected;
    return styles.option;
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>⚡ Fastest Finger</h1>
      {errorMessage && (
        <div
          style={{ color: "red", textAlign: "center", marginBottom: "10px" }}
        >
          {errorMessage}
        </div>
      )}

      {gameStatus === "idle" && (
        <div style={styles.card}>
          <div style={styles.settingsGrid}>
            <div>
              <label style={styles.label}>Time per Question:</label>
              <select
                value={timePerQuestion}
                onChange={(e) =>
                  setTimePerQuestion(Number(e.target.value) as 10 | 20 | 30)
                }
                style={styles.select}
              >
                <option value={10}>10 seconds</option>
                <option value={20}>20 seconds</option>
                <option value={30}>30 seconds</option>
              </select>
            </div>
            <div>
              <label style={styles.label}>Game Duration:</label>
              <select
                value={gameDuration}
                onChange={(e) =>
                  setGameDuration(Number(e.target.value) as 1 | 2 | 5)
                }
                style={styles.select}
              >
                <option value={1}>1 Minute</option>
                <option value={2}>2 Minutes</option>
                <option value={5}>5 Minutes</option>
              </select>
            </div>
          </div>
          <button
            onClick={findMatch}
            style={styles.button}
            disabled={!authInfo || !isConnected || gameStatus === 'searching' as FFGameStatus}
          >
            {gameStatus === 'searching' as FFGameStatus
              ? "Finding Match..."
              : !isConnected
              ? "Connecting..."
              : "Find Match"}
          </button>
        </div>
      )}

      {gameStatus === "searching" && (
        <div style={styles.card}>
          <h2 style={styles.statusHeader}>🔍 Finding opponent...</h2>
        </div>
      )}
      {gameStatus === "waiting" && (
        <div style={styles.card}>
          <h2 style={styles.statusHeader}>🎯 Match Found! Get Ready...</h2>
        </div>
      )}

      {(gameStatus === "playing" || gameStatus === "answered") &&
        currentQuestion && (
          <div style={styles.card}>
            <div style={styles.header}>
              <span style={styles.headerItem}>
                Q: {questionNumber}/{totalQuestions}
              </span>
              <span style={styles.headerItem}>
                GAME TIME: {formatTime(totalTimeLeft)}
              </span>
              <span style={styles.headerItem}>TIME: {questionTimeLeft}s</span>
            </div>
            <div style={styles.scoreBoard}>
              <span>
                {players.find((p) => p.userId === authInfo?.userId)?.username ||
                  "You"}
                : {myScore}
              </span>
              <span>
                {opponent?.username || "Opponent"}: {opponentScore}
              </span>
            </div>
            <h2 style={styles.questionText}>{currentQuestion.text}</h2>
            <div style={styles.optionsGrid}>
              {currentQuestion.options.map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleAnswerClick(option.id)}
                  disabled={hasAnswered}
                  style={getOptionStyle(option.id)}
                >
                  {option.text}
                </button>
              ))}
            </div>
            {waitingMessage && (
              <p style={styles.waitingMessage}>{waitingMessage}</p>
            )}
          </div>
        )}

      {gameStatus === "finished" && (
        <div style={styles.card}>
          <h2 style={styles.statusHeader}>🏁 Game Over!</h2>
          <h3 style={styles.finalScoresHeader}>Final Scores:</h3>
          <div style={styles.scoreBoard}>
            <span>
              {players.find((p) => p.userId === authInfo?.userId)?.username ||
                "You"}
              : {myScore}
            </span>
            <span>
              {opponent?.username || "Opponent"}: {opponentScore}
            </span>
          </div>
          {gameResults && authInfo && (
            <div style={styles.graphContainer}>
              <ResultsGraph
                results={gameResults}
                players={players}
                myUserId={authInfo.userId}
              />
            </div>
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

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    maxWidth: "700px",
    margin: "40px auto",
    padding: "20px",
    color: "#333",
  },
  title: { textAlign: "center", color: "#2c3e50", marginBottom: "30px" },
  card: {
    background: "#ffffff",
    padding: "25px 30px",
    borderRadius: "12px",
    boxShadow: "0 8px 30px rgba(0,0,0,0.08)",
  },
  settingsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
    margin: "20px 0",
  },
  label: { fontWeight: 500, marginBottom: "5px", display: "block" },
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
  statusHeader: { textAlign: "center", color: "#2c3e50" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "15px",
    paddingBottom: "10px",
    borderBottom: "1px solid #eee",
    color: "#555",
    fontWeight: 500,
  },
  headerItem: {
    background: "#f0f4f8",
    padding: "5px 10px",
    borderRadius: "6px",
  },
  scoreBoard: {
    display: "flex",
    justifyContent: "space-around",
    fontSize: "20px",
    fontWeight: "bold",
    background: "#f0f4f8",
    padding: "15px",
    borderRadius: "8px",
    margin: "10px 0 25px 0",
  },
  questionText: {
    fontSize: "22px",
    margin: "20px 0",
    minHeight: "60px",
    textAlign: "center",
  },
  optionsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" },
  option: {
    padding: "15px",
    border: "2px solid #ddd",
    background: "white",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "16px",
    textAlign: "center",
    transition: "all 0.2s",
  },
  optionSelected: {
    padding: "15px",
    border: "2px solid #5B86E5",
    background: "#eaf2ff",
    borderRadius: "8px",
    fontSize: "16px",
    textAlign: "center",
    transform: "scale(1.02)",
  },
  optionCorrect: {
    padding: "15px",
    border: "2px solid #28a745",
    background: "#d4edda",
    color: "#155724",
    borderRadius: "8px",
    fontSize: "16px",
    textAlign: "center",
    fontWeight: "bold",
  },
  optionIncorrect: {
    padding: "15px",
    border: "2px solid #dc3545",
    background: "#f8d7da",
    color: "#721c24",
    borderRadius: "8px",
    fontSize: "16px",
    textAlign: "center",
  },
  waitingMessage: {
    textAlign: "center",
    marginTop: "20px",
    color: "#555",
    fontStyle: "italic",
  },
  finalScoresHeader: { textAlign: "center", marginTop: "30px" },
  graphContainer: { marginTop: "30px", height: "300px", position: "relative" },
};
