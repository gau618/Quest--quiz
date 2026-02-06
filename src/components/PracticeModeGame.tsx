// src/components/PracticeModeGame.tsx
import React, { useState, useEffect, useCallback } from "react";
import { socket } from "@/lib/socket"; // Use shared socket instance
import { Difficulty } from "@prisma/client";
import AuthService from "@/lib/services/auth.service";

// --- TYPE DEFINITIONS ---
type PracticeStatus = "setup" | "playing" | "feedback" | "finished";
interface Category {
  id: string;
  name: string;
}
interface Question {
  id: string;
  text: string;
  options: { id: string; text: string }[];
}
interface AnswerFeedback {
  correct: boolean;
  correctOptionId: string;
  explanation?: string;
  learningTip?: string;
}

export const PracticeModeGame = () => {
  // --- STATE MANAGEMENT ---
  const [authInfo, setAuthInfo] = useState<{
    userId: string;
    token: string;
  } | null>(null);
  const [status, setStatus] = useState<PracticeStatus>("setup");

  // Setup state
  const [availableCategories, setAvailableCategories] = useState<Category[]>(
    []
  );
  const [selectedCategoryNames, setSelectedCategoryNames] = useState<string[]>(
    []
  );
  const [difficulty, setDifficulty] = useState<Difficulty>("EASY");
  const [numQuestions, setNumQuestions] = useState(10);
  const [isStarting, setIsStarting] = useState(false);

  // Game state
  const [sessionId, setSessionId] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [finalResults, setFinalResults] = useState<any[] | null>(null);

  // --- CATEGORY SELECTION HANDLERS ---
  const handleCategoryChange = (categoryName: string) => {
    setSelectedCategoryNames((prev) =>
      prev.includes(categoryName)
        ? prev.filter((name) => name !== categoryName)
        : [...prev, categoryName]
    );
  };

  const handleSelectAllCategories = () => {
    if (selectedCategoryNames.length === availableCategories.length) {
      setSelectedCategoryNames([]);
    } else {
      setSelectedCategoryNames(availableCategories.map((cat) => cat.name));
    }
  };

  // --- START PRACTICE SESSION ---
  const startPractice = async () => {
    if (!authInfo) {
      alert("You must be logged in to start practice.");
      return;
    }
    if (!socket.connected) {
      alert("Game server is not connected. Please wait or refresh.");
      return;
    }
    setIsStarting(true);

    try {
      const response = await fetch("/api/practice/play", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authInfo.token}`,
        },
        body: JSON.stringify({
          difficulty,
          categories: selectedCategoryNames,
          numQuestions,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || "Failed to start practice session"
        );
      }

      // Wait for 'practice:started' socket event to update state
    } catch (error: any) {
      alert(`Failed to start practice: ${error.message}`);
      setIsStarting(false);
    }
  };

  // --- ANSWER HANDLER ---
  const handleAnswer = (optionId: string) => {
    if (!socket || !currentQuestion || feedback) return;
    setSelectedOptionId(optionId);
    socket.emit("answer:submit", {
      sessionId,
      participantId,
      questionId: currentQuestion.id,
      optionId,
    });
  };

  // --- NEXT QUESTION HANDLER ---
  const handleNextQuestion = () => {
    if (!socket) return;
    socket.emit("practice:next_question", { sessionId, participantId });
    setCurrentQuestion(null);
    setSelectedOptionId(null);
    setFeedback(null);
    setStatus("playing");
  };

  // --- RESET GAME ---
  const resetGame = () => {
    setStatus("setup");
    setSessionId("");
    setParticipantId("");
    setCurrentQuestion(null);
    setSelectedOptionId(null);
    setFeedback(null);
    setFinalResults(null);
    setIsStarting(false);
    setQuestionNumber(0);
    setTotalQuestions(0);
    setSelectedCategoryNames([]);
  };

  // --- FETCH CATEGORIES ON MOUNT ---
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const token = AuthService.getToken();
        const headers: HeadersInit = {};
        if (token) {
          headers['Authorization'] = `Bearer ${token}`; // Use Bearer prefix
        }
        
        const response = await fetch("/api/practice/categories", { headers });
        if (!response.ok) throw new Error("Failed to fetch categories");
        const data: Category[] = await response.json();
        setAvailableCategories(data);
      } catch (error) {
        console.error("Error fetching categories:", error);
      }
    };
    fetchCategories();
  }, []);

  // --- MANAGE AUTH & SOCKET CONNECTION ---
  useEffect(() => {
    const token = localStorage.getItem("gp_token");
    const userId = localStorage.getItem("gp_userId");

    if (token && userId) {
      setAuthInfo({ userId, token });
      if (!socket.connected) socket.connect();
    } else {
      alert("You must be logged in to play.");
    }

    const onConnect = () => console.log("Socket connected.");
    const onDisconnect = () => console.log("Socket disconnected.");
    const onConnectError = (err: Error) =>
      alert(`Connection error: ${err.message}`);

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
    };
  }, []);

  // --- SOCKET EVENT LISTENERS ---
  useEffect(() => {
    if (!socket) return;

    const handlePracticeStarted = (data: {
      sessionId: string;
      participantId: string;
      totalQuestions: number;
    }) => {
      socket.emit("game:register-participant", {
        participantId: data.participantId,
        sessionId: data.sessionId,
      });
      setSessionId(data.sessionId);
      setParticipantId(data.participantId);
      setTotalQuestions(data.totalQuestions);
      setStatus("playing");
      setIsStarting(false);
      socket.emit("practice:next_question", {
        sessionId: data.sessionId,
        participantId: data.participantId,
      });
    };

    const handleNewQuestion = (data: {
      question: Question;
      questionNumber: number;
    }) => {
      setCurrentQuestion(data.question);
      setQuestionNumber(data.questionNumber);
    };

    const handleAnswerFeedback = (data: AnswerFeedback) => {
      setFeedback(data);
      setStatus("feedback");
    };

    const handlePracticeFinished = (data: { results: any[] }) => {
      setFinalResults(data.results);
      setStatus("finished");
    };

    const handlePracticeError = (data: { message: string }) => {
      alert(`Practice Error: ${data.message}`);
      resetGame();
    };

    socket.on("practice:started", handlePracticeStarted);
    socket.on("question:new", handleNewQuestion);
    socket.on("answer:feedback", handleAnswerFeedback);
    socket.on("practice:finished", handlePracticeFinished);
    socket.on("practice:error", handlePracticeError);

    return () => {
      socket.off("practice:started", handlePracticeStarted);
      socket.off("question:new", handleNewQuestion);
      socket.off("answer:feedback", handleAnswerFeedback);
      socket.off("practice:finished", handlePracticeFinished);
      socket.off("practice:error", handlePracticeError);
    };
  }, [socket]);

  // --- RENDER ---
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>📚 Practice Mode</h1>

      {status === "setup" && (
        <div style={styles.card}>
          <div style={styles.settingsGroup}>
            <div>
              <label style={styles.label}>Difficulty:</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                style={styles.select}
              >
                <option value="EASY">Easy</option>
                <option value="MEDIUM">Medium</option>
                <option value="HARD">Hard</option>
              </select>
            </div>
            <div>
              <label style={styles.label}>Number of Questions:</label>
              <input
                type="number"
                min={1}
                max={50}
                value={numQuestions}
                onChange={(e) => setNumQuestions(Number(e.target.value))}
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.categorySection}>
            <div style={styles.categoryHeader}>
              <label style={styles.label}>
                Categories (select one or more):
              </label>
              <button
                onClick={handleSelectAllCategories}
                style={styles.selectAllButton}
              >
                {selectedCategoryNames.length === availableCategories.length
                  ? "Deselect All"
                  : "Select All"}
              </button>
            </div>
            <div style={styles.categoryGrid}>
              {availableCategories.length === 0 ? (
                <p
                  style={{
                    gridColumn: "span 2",
                    textAlign: "center",
                    color: "#666",
                  }}
                >
                  Loading categories or none available...
                </p>
              ) : (
                availableCategories.map((cat) => (
                  <div key={cat.id} style={styles.checkboxContainer}>
                    <input
                      type="checkbox"
                      id={cat.id}
                      checked={selectedCategoryNames.includes(cat.name)}
                      onChange={() => handleCategoryChange(cat.name)}
                    />
                    <label htmlFor={cat.id}>{cat.name}</label>
                  </div>
                ))
              )}
            </div>
          </div>

          <button
            onClick={startPractice}
            style={styles.button}
            disabled={isStarting || !socket?.connected}
          >
            {isStarting
              ? "Starting..."
              : !socket?.connected
              ? "Connecting..."
              : "Start Practice"}
          </button>
        </div>
      )}

      {(status === "playing" || status === "feedback") && currentQuestion && (
        <div style={styles.card}>
          <div style={styles.gameHeader}>
            Question {questionNumber} of {totalQuestions}
          </div>
          <h2 style={styles.questionText}>{currentQuestion.text}</h2>
          <div style={styles.optionsGrid}>
            {currentQuestion.options.map((option) => (
              <button
                key={option.id}
                onClick={() => handleAnswer(option.id)}
                disabled={!!feedback}
                style={
                  selectedOptionId === option.id
                    ? styles.optionSelected
                    : styles.option
                }
              >
                {option.text}
              </button>
            ))}
          </div>

          {status === "feedback" && feedback && (
            <div style={styles.feedbackBox}>
              <h3>Feedback</h3>
              <p style={{ color: feedback.correct ? "green" : "red" }}>
                {feedback.correct ? "Correct!" : "That's not quite right."}
              </p>
              {feedback.explanation && (
                <p>
                  <strong>Explanation:</strong> {feedback.explanation}
                </p>
              )}
              {feedback.learningTip && (
                <p>
                  <strong>Learning Tip:</strong> {feedback.learningTip}
                </p>
              )}
              <button onClick={handleNextQuestion} style={styles.button}>
                Next Question
              </button>
            </div>
          )}
        </div>
      )}

      {status === "finished" && finalResults && (
        <div style={styles.card}>
          <h2 style={styles.statusHeader}>🏁 Practice Complete!</h2>
          <p>
            You answered {finalResults.filter((r) => r.correct).length} out of{" "}
            {finalResults.length} questions correctly.
          </p>
          <button
            onClick={resetGame}
            style={{ ...styles.button, marginTop: "20px" }}
          >
            Practice Again
          </button>
        </div>
      )}
    </div>
  );
};

// --- STYLES ---
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
  input: {
    width: "100%",
    boxSizing: "border-box",
    padding: "12px",
    margin: "8px 0",
    border: "1px solid #ddd",
    borderRadius: "8px",
    fontSize: "16px",
  },
  settingsGroup: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "20px",
    marginBottom: "20px",
  },
  label: { fontWeight: "bold", marginBottom: "5px", display: "block" },
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
  },
  statusHeader: { textAlign: "center", color: "#2c3e50" },
  gameHeader: {
    textAlign: "center",
    marginBottom: "20px",
    color: "#555",
    fontWeight: "bold",
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
  },
  feedbackBox: {
    marginTop: "25px",
    padding: "20px",
    borderTop: "1px solid #eee",
    background: "#f8f9fa",
    borderRadius: "8px",
  },
  categorySection: {
    margin: "25px 0",
    borderTop: "1px solid #eee",
    paddingTop: "20px",
  },
  categoryHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "15px",
  },
  selectAllButton: {
    background: "none",
    border: "none",
    color: "#007bff",
    cursor: "pointer",
    fontSize: "14px",
  },
  categoryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: "10px",
  },
  checkboxContainer: { display: "flex", alignItems: "center", gap: "8px" },
};
