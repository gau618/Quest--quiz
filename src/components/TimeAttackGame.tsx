// src/components/TimeAttackGame.tsx
import React, { useState, useEffect, useCallback } from "react";
import { socket } from "@/lib/socket"; // IMPORT the shared socket instance
import { Difficulty } from "@prisma/client";

// --- TYPE DEFINITIONS ---
type TimeAttackStatus = "setup" | "playing" | "finished";
interface Question {
  id: string;
  text: string;
  options: { id: string; text: string }[];
}

// --- MAIN COMPONENT ---
export const TimeAttackGame = () => {
  // --- State Management ---
  const [authInfo, setAuthInfo] = useState<{
    userId: string;
    token: string;
  } | null>(null);
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [status, setStatus] = useState<TimeAttackStatus>("setup");
  const [difficulty, setDifficulty] = useState<Difficulty>("EASY");
  const [durationMinutes, setDurationMinutes] = useState<1 | 2 | 5>(1);
  const [isStarting, setIsStarting] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
  const startTimeAttack = useCallback(async () => {
    if (!authInfo) return setErrorMessage("Authentication details not found.");
    if (!isConnected) return setErrorMessage("Not connected to game server.");

    setIsStarting(true);
    setErrorMessage(null);

    try {
      await fetch("/api/time-attack/play", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authInfo.token}`,
        },
        body: JSON.stringify({ difficulty, categories: [], durationMinutes }),
      });
    } catch (error: any) {
      setErrorMessage(`Failed to start Time Attack: ${error.message}`);
      setIsStarting(false);
    }
  }, [authInfo, isConnected, difficulty, durationMinutes]);

  const handleAnswerClick = (optionId: string) => {
    if (!socket || !currentQuestion || status !== "playing") return;
    socket.emit("answer:submit", {
      sessionId,
      participantId,
      questionId: currentQuestion.id,
      optionId,
    });
    setCurrentQuestion(null);
  };

  const resetGame = () => {
    setStatus("setup");
    setScore(0);
    setTimeLeft(0);
    setIsStarting(false);
    setSessionId("");
    setParticipantId("");
    setCurrentQuestion(null);
    setErrorMessage(null);
  };

  const formatTime = (seconds: number) =>
    `${Math.floor(seconds / 60)
      .toString()
      .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

  // --- EFFECT 2: GAME EVENT LISTENERS ---
  useEffect(() => {
    if (!isConnected || !socket) return;

    const handleTimeAttackStarted = (data: {
      sessionId: string;
      participantId: string;
      durationMinutes: number;
    }) => {
      socket.emit("game:register-participant", {
        participantId: data.participantId,
        sessionId: data.sessionId,
      });
      setSessionId(data.sessionId);
      setParticipantId(data.participantId);
      setScore(0);
      setTimeLeft(data.durationMinutes * 60);
      setStatus("playing");
      setIsStarting(false);
      socket.emit("time_attack:request_next_question", {
        sessionId: data.sessionId,
        participantId: data.participantId,
      });
    };

    const handleNewQuestion = (data: { question: Question }) =>
      setCurrentQuestion(data.question);
    const handleScoreUpdate = (data: { score: number }) => setScore(data.score);
    const handleTimeAttackFinished = (data: {
      scores: Record<string, number>;
    }) => {
      // Assuming the score for the current user is sent back directly
      const finalPScore = data.scores[participantId] || score;
      setScore(finalPScore);
      setStatus("finished");
      setCurrentQuestion(null);
    };
    const handleTimeAttackError = (data: { message: string }) => {
      setErrorMessage(`Time Attack Error: ${data.message}`);
      resetGame();
    };

    socket.on("time_attack:started", handleTimeAttackStarted);
    socket.on("question:new", handleNewQuestion);
    socket.on("time_attack:score_update", handleScoreUpdate);
    socket.on("time_attack:finished", handleTimeAttackFinished);
    socket.on("time_attack:error", handleTimeAttackError);

    return () => {
      socket.off("time_attack:started");
      socket.off("question:new");
      socket.off("time_attack:score_update");
      socket.off("time_attack:finished");
      socket.off("time_attack:error");
    };
  }, [isConnected, socket, participantId, score]); // Dependencies ensure listeners are up-to-date with state

  // --- EFFECT 3: GAME COUNTDOWN TIMER ---
  useEffect(() => {
    if (status === "playing" && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft((prev) => prev - 1), 1000);
      return () => clearInterval(timer);
    }
  }, [status, timeLeft]);

  // --- JSX Rendering Logic ---
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>⏰ Time Attack</h1>
      {errorMessage && (
        <p style={{ color: "red", textAlign: "center" }}>{errorMessage}</p>
      )}

      {status === "setup" && (
        <div style={styles.card}>
          <p style={styles.description}>
            Answer as many questions as possible within the time limit. Aim for
            the high score!
          </p>

          {/* The manual input fields for token and userId are now REMOVED. */}

          <div style={styles.settingsGrid}>
            <div style={styles.settingsItem}>
              <label htmlFor="difficulty" style={styles.label}>
                Difficulty:
              </label>
              <select
                id="difficulty"
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                style={styles.select}
              >
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </div>
            <div style={styles.settingsItem}>
              <label htmlFor="duration" style={styles.label}>
                Duration:
              </label>
              <select
                id="duration"
                value={durationMinutes}
                onChange={(e) =>
                  setDurationMinutes(Number(e.target.value) as 1 | 2 | 5)
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
            onClick={startTimeAttack}
            style={styles.button}
            disabled={isStarting || !authInfo || !isConnected}
          >
            {isStarting
              ? "Starting..."
              : !isConnected
              ? "Connecting..."
              : "Start Time Attack"}
          </button>
        </div>
      )}

      {status === "playing" && (
        <div style={styles.card}>
          <div style={styles.gameHeader}>
            <span style={styles.headerItem}>
              Time Left: <strong>{formatTime(timeLeft)}</strong>
            </span>
            <span style={styles.headerItem}>
              Score: <strong>{score}</strong>
            </span>
          </div>
          {currentQuestion ? (
            <div style={styles.questionArea}>
              <p style={styles.questionNumber}>Question {score / 10 + 1}</p>
              <h2 style={styles.questionText}>{currentQuestion.text}</h2>
              <div style={styles.optionsGrid}>
                {currentQuestion.options.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => handleAnswerClick(opt.id)}
                    style={styles.optionButton}
                  >
                    {opt.text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <p style={styles.loadingMessage}>Loading next question...</p>
          )}
        </div>
      )}

      {status === "finished" && (
        <div style={styles.card}>
          <h2 style={styles.finalHeader}>🏁 Time's Up!</h2>
          <p style={styles.finalScoreText}>
            Your final score: <strong>{score}</strong> points
          </p>
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

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    maxWidth: "700px",
    margin: "40px auto",
    padding: "25px",
    backgroundColor: "#f8f9fa",
    borderRadius: "16px",
    boxShadow: "0 12px 24px rgba(0,0,0,0.1)",
    color: "#343a40",
    border: "1px solid #e0e0e0",
  },
  title: {
    textAlign: "center",
    color: "#2c3e50",
    marginBottom: "30px",
    fontSize: "2.5em",
    fontWeight: "bold",
    letterSpacing: "0.05em",
    textShadow: "1px 1px 2px rgba(0,0,0,0.05)",
  },
  card: {
    backgroundColor: "#ffffff",
    padding: "35px 40px",
    borderRadius: "12px",
    boxShadow: "0 6px 18px rgba(0,0,0,0.08)",
    border: "1px solid #f0f0f0",
  },
  label: {
    display: "block",
    marginBottom: "8px",
    fontWeight: "bold",
    color: "#495057",
  },
  settingsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
    marginBottom: "25px",
  },
  settingsItem: { display: "flex", flexDirection: "column" },
  select: {
    width: "100%",
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #ced4da",
    fontSize: "1em",
    backgroundColor: "#fff",
    color: "#495057",
    appearance: "none",
    background: `url('data:image/svg+xml;utf8,<svg fill="%23495057" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/><path d="M0 0h24v24H0z" fill="none"/></svg>') no-repeat right 10px center`,
    backgroundSize: "20px",
  },
  button: {
    width: "100%",
    padding: "15px",
    border: "none",
    background: "linear-gradient(45deg, #4CAF50 0%, #689F38 100%)",
    color: "white",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "1.2em",
    fontWeight: "bold",
    transition:
      "transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease",
    boxShadow: "0 4px 12px rgba(76, 175, 80, 0.3)",
  },
  description: {
    textAlign: "center",
    marginBottom: "30px",
    fontSize: "1.1em",
    color: "#6c757d",
    lineHeight: "1.6",
  },
  gameHeader: {
    display: "flex",
    justifyContent: "space-around",
    alignItems: "center",
    marginBottom: "30px",
    padding: "15px",
    backgroundColor: "#e9ecef",
    borderRadius: "10px",
    boxShadow: "inset 0 2px 4px rgba(0,0,0,0.06)",
    fontWeight: "bold",
    fontSize: "1.3em",
    color: "#495057",
  },
  headerItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "5px",
  },
  questionArea: { textAlign: "center" },
  questionNumber: { fontSize: "1.1em", color: "#6c757d", marginBottom: "10px" },
  questionText: {
    fontSize: "1.8em",
    fontWeight: "600",
    marginBottom: "30px",
    lineHeight: "1.4",
    color: "#2c3e50",
    minHeight: "80px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  optionsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "15px",
    marginBottom: "20px",
  },
  optionButton: {
    padding: "18px",
    border: "2px solid #007bff",
    backgroundColor: "#e0f2ff",
    color: "#0056b3",
    borderRadius: "10px",
    cursor: "pointer",
    fontSize: "1.1em",
    fontWeight: "500",
    transition: "all 0.2s ease",
    boxShadow: "0 2px 6px rgba(0, 123, 255, 0.2)",
  },
  loadingMessage: {
    textAlign: "center",
    fontStyle: "italic",
    color: "#6c757d",
    minHeight: "80px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  finalHeader: {
    textAlign: "center",
    fontSize: "2.2em",
    fontWeight: "bold",
    color: "#28a745",
    marginBottom: "20px",
  },
  finalScoreText: {
    textAlign: "center",
    fontSize: "1.8em",
    color: "#343a40",
    marginBottom: "30px",
  },
};
