// src/components/PracticeModeGame.tsx
import React, { useState, useEffect } from "react";
import { io, Socket } from "socket.io-client";
import { Difficulty } from "@prisma/client";

// --- TYPE DEFINITIONS ---
type PracticeStatus = "setup" | "playing" | "feedback" | "finished";
interface Category { id: string; name: string; }
interface Question { id: string; text: string; options: { id: string; text: string }[]; }
interface AnswerFeedback { correct: boolean; correctOptionId: string; explanation?: string; learningTip?: string; }

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:4000";

export const PracticeModeGame = () => {
  // --- STATE MANAGEMENT ---
  const [userId, setUserId] = useState("");
  const [jwtToken, setJwtToken] = useState("");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<PracticeStatus>("setup");

  // Setup State
  const [availableCategories, setAvailableCategories] = useState<Category[]>([]);
  const [selectedCategoryNames, setSelectedCategoryNames] = useState<string[]>([]);
  const [difficulty, setDifficulty] = useState<Difficulty>("EASY");
  const [numQuestions, setNumQuestions] = useState(10);
  const [isStarting, setIsStarting] = useState(false); // For loading state on button

  // Game State
  const [sessionId, setSessionId] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<AnswerFeedback | null>(null);
  const [finalResults, setFinalResults] = useState<any[] | null>(null);

  // --- UI & DATA HANDLERS ---
  const handleCategoryChange = (categoryName: string) => {
    console.log(`[PracticeMode] Toggling category: ${categoryName}`);
    setSelectedCategoryNames(
      (prev) =>
        prev.includes(categoryName)
          ? prev.filter((name) => name !== categoryName)
          : [...prev, categoryName]
    );
  };

  const handleSelectAllCategories = () => {
    console.log(`[PracticeMode] Toggling select all categories`);
    if (selectedCategoryNames.length === availableCategories.length) {
      setSelectedCategoryNames([]);
    } else {
      setSelectedCategoryNames(availableCategories.map((cat) => cat.name));
    }
  };

  const startPractice = async () => {
    console.log("[PracticeMode] Start Practice button clicked.");
    if (!jwtToken || !userId) {
      alert("Please enter JWT and User ID.");
      return;
    }
    if (!socket || !socket.connected) {
      alert("Game server is not connected. Please wait or refresh the page.");
      return;
    }
    setIsStarting(true);

    try {
      console.log("[PracticeMode] Calling /api/practice/start...");
      const response = await fetch("/api/practice/play", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${jwtToken}`,
        },
        body: JSON.stringify({ difficulty, categories: selectedCategoryNames, numQuestions }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to start practice session");
      }
      const data = await response.json();
      console.log("[PracticeMode] API response received:", data);

      // The `practice:started` event listener will handle updating state and requesting the first question.
      // We just need to wait for that event to propagate.
      console.log("[PracticeMode] API request successful. Waiting for 'practice:started' event from socket.");
      
    } catch (error: any) {
      console.error("[PracticeMode] Error in startPractice:", error.message);
      alert(`Failed to start practice: ${error.message}`);
      setIsStarting(false);
    }
  };

  const handleAnswer = (optionId: string) => {
    console.log(`[PracticeMode] Answer clicked: ${optionId}`);
    if (!socket || !currentQuestion || feedback) return;
    setSelectedOptionId(optionId); // Mark user's selection in UI
    socket.emit("answer:submit", { sessionId, participantId, questionId: currentQuestion.id, optionId });
    console.log(`[PracticeMode] Emitted 'answer:submit' for question ${currentQuestion.id}, option ${optionId}`);
  };
  
  const handleNextQuestion = () => {
    console.log("[PracticeMode] Next Question button clicked.");
    if (!socket) return;
    socket.emit("practice:next_question", { sessionId, participantId });
    console.log(`[PracticeMode] Emitted 'practice:next_question' for session ${sessionId}`);
    setCurrentQuestion(null);
    setSelectedOptionId(null);
    setFeedback(null);
    setStatus("playing");
  };

  const resetGame = () => {
    console.log("[PracticeMode] Resetting game state (connection remains active).");
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
    // Do NOT touch the socket connection here. It persists.
  };

  // --- USEEFFECT HOOKS ---

  // Effect to fetch available categories
  useEffect(() => {
    const fetchCategories = async () => {
      console.log("[PracticeMode] Fetching categories...");
      try {
        const response = await fetch("/api/practice/categories"); // Call your new API endpoint
        if (!response.ok) {
          throw new Error("Failed to fetch categories");
        }
        const data: Category[] = await response.json();
        setAvailableCategories(data);
        console.log("[PracticeMode] Categories fetched:", data);
      } catch (error) {
        console.error("[PracticeMode] Error fetching categories:", error);
      }
    };
    fetchCategories();
  }, []);

  // Effect to manage the Socket.IO connection and its listeners.
  useEffect(() => {
    console.log("[PracticeMode] Socket useEffect triggered. userId:", userId);
    if (!userId) {
      console.log("[PracticeMode] userId is empty. Disconnecting socket if exists.");
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    if (!socket) {
      console.log(`[PracticeMode] Establishing new Socket.IO connection for userId: ${userId}`);
      const newSocket = io(SOCKET_SERVER_URL, {
        query: { userId },
        reconnection: true, // Ensure reconnection is enabled for reliability
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
      setSocket(newSocket);

      // --- Basic Socket Connection Events ---
      newSocket.on('connect', () => {
        console.log(`[PracticeMode] Socket connected: ${newSocket.id}.`);
      });
      newSocket.on('disconnect', (reason) => {
        console.log(`[PracticeMode] Socket disconnected. Reason: ${reason}`);
      });
      newSocket.on('connect_error', (err) => {
        console.error(`[PracticeMode] Socket connection error: ${err.message}`);
        alert(`Could not connect to the game server: ${err.message}. Please refresh.`);
        resetGame(); // Reset to setup on connection error
      });
      
      // --- Game-Specific Event Listeners (Triggered by Socket.IO Server) ---
      newSocket.on("practice:started", (data: { sessionId: string; participantId: string; totalQuestions: number }) => {
        console.log("[PracticeMode] 'practice:started' received from server:", data);
        const { sessionId, participantId, totalQuestions } = data;
        
        // 1. Register with the socket server
        newSocket.emit("game:register-participant", { participantId, sessionId });

        // 2. Update state
        setSessionId(sessionId);
        setParticipantId(participantId);
        setTotalQuestions(totalQuestions);
        setStatus("playing");
        setIsStarting(false); // Game has started, allow re-triggering

        // ** THE CRITICAL FIX IS HERE **
        // 3. Request the first question AFTER successful registration
        console.log(`[PracticeMode] Emitting 'practice:next_question' to request first question for session ${sessionId}, participant ${participantId}.`);
        newSocket.emit("practice:next_question", { sessionId, participantId });
      });

      newSocket.on("question:new", (data: { question: Question; questionNumber: number }) => {
        console.log("[PracticeMode] 'question:new' received from server:", data);
        setCurrentQuestion(data.question);
        setQuestionNumber(data.questionNumber);
      });

      newSocket.on("answer:feedback", (data: AnswerFeedback) => {
        console.log("[PracticeMode] 'answer:feedback' received from server:", data);
        setFeedback(data);
        setStatus("feedback");
      });

      newSocket.on("practice:finished", (data: { results: any[] }) => {
        console.log("[PracticeMode] 'practice:finished' received from server:", data);
        setFinalResults(data.results);
        setStatus("finished");
      });
      
      newSocket.on("practice:error", (data: { message: string }) => {
        console.error("[PracticeMode] 'practice:error' received from server:", data.message);
        alert(`Practice Error: ${data.message}`);
        resetGame(); // Reset to setup on game-specific error
      });

      // Cleanup function for this specific useEffect instance
      return () => {
        if (newSocket) {
          console.log("[PracticeMode] Cleaning up socket connection for new effect instance.");
          newSocket.offAny(); // Remove all event listeners attached to this socket instance
          newSocket.disconnect(); // Disconnect the socket
        }
      };
    }

    // This return handles the case where `socket` already exists.
    // The previous `useEffect` instance would have set up the `newSocket` and its listeners.
    // We don't need to do anything if `socket` is already there and `userId` is valid.
    return () => { /* no-op or specific cleanup for existing socket if necessary on re-render */ };
  }, [userId]); // This effect depends only on `userId` to manage the socket's lifecycle.

  const getOptionStyle = (optionId: string) => {
    // If feedback is available (i.e., answer has been submitted and processed)
    if (feedback) {
      if (optionId === feedback.correctOptionId) return styles.optionCorrect;
      if (optionId === selectedOptionId && !feedback.correct) return styles.optionIncorrect;
      return styles.option;
    }
    // Before feedback, just highlight the user's selected option if they clicked one
    if (selectedOptionId === optionId) return styles.optionSelected;
    return styles.option;
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>📚 Practice Mode</h1>
      
      {status === "setup" && (
        <div style={styles.card}>
          <input type="text" placeholder="JWT Token" value={jwtToken} onChange={e => setJwtToken(e.target.value)} style={styles.input} />
          <input type="text" placeholder="User ID" value={userId} onChange={e => setUserId(e.target.value)} style={styles.input} />
          
          <div style={styles.settingsGroup}>
            <div>
              <label style={styles.label}>Difficulty:</label>
              <select value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)} style={styles.select}>
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
              </select>
            </div>
            <div>
              <label style={styles.label}>Number of Questions:</label>
              <input type="number" min="1" max="50" value={numQuestions} onChange={e => setNumQuestions(Number(e.target.value))} style={styles.input} />
            </div>
          </div>

          {/* Category Selection Section */}
          <div style={styles.categorySection}>
            <div style={styles.categoryHeader}>
              <label style={styles.label}>Categories (select one or more):</label>
              <button onClick={handleSelectAllCategories} style={styles.selectAllButton}>
                {selectedCategoryNames.length === availableCategories.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div style={styles.categoryGrid}>
              {availableCategories.length === 0 ? (
                <p style={{ gridColumn: 'span 2', textAlign: 'center', color: '#666' }}>Loading categories or none available...</p>
              ) : (
                availableCategories.map(cat => (
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
          
          <button onClick={startPractice} style={styles.button} disabled={isStarting || !socket?.connected}>
            {isStarting ? "Starting..." : (!socket?.connected ? "Connecting..." : "Start Practice")}
          </button>
        </div>
      )}
      
      {/* Playing & Feedback Section: Displayed when status is 'playing' or 'feedback' and a question is loaded */}
      {(status === "playing" || status === "feedback") && currentQuestion && (
        <div style={styles.card}>
            <div style={styles.gameHeader}>Question {questionNumber} of {totalQuestions}</div>
            <h2 style={styles.questionText}>{currentQuestion.text}</h2>
            <div style={styles.optionsGrid}>
                {currentQuestion.options.map(option => (
                    <button key={option.id} onClick={() => handleAnswer(option.id)} disabled={!!feedback} style={getOptionStyle(option.id)}>{option.text}</button>
                ))}
            </div>
            
            {status === "feedback" && feedback && (
                <div style={styles.feedbackBox}>
                    <h3>Feedback</h3>
                    <p style={{ color: feedback.correct ? 'green' : 'red' }}>{feedback.correct ? "Correct!" : "That's not quite right."}</p>
                    {feedback.explanation && <p><strong>Explanation:</strong> {feedback.explanation}</p>}
                    {feedback.learningTip && <p><strong>Learning Tip:</strong> {feedback.learningTip}</p>}
                    <button onClick={handleNextQuestion} style={styles.button}>Next Question</button>
                </div>
            )}
        </div>
      )}

      {/* Finished Section: Displayed when status is 'finished' */}
      {status === "finished" && finalResults && (
        <div style={styles.card}>
            <h2 style={styles.statusHeader}>🏁 Practice Complete!</h2>
            <p>You answered {finalResults?.filter(r => r.correct).length} out of {finalResults.length} questions correctly.</p>
            {/* The resetGame function now correctly returns to the setup screen without disconnecting */}
            <button onClick={resetGame} style={{ ...styles.button, marginTop: '20px' }}>Practice Again</button>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', maxWidth: '700px', margin: '40px auto', padding: '20px', color: '#333' },
  title: { textAlign: 'center', color: '#2c3e50', marginBottom: '30px' },
  card: { background: '#ffffff', padding: '25px 30px', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.08)' },
  input: { width: '100%', boxSizing: 'border-box', padding: '12px', margin: '8px 0', border: '1px solid #ddd', borderRadius: '8px', fontSize: '16px' },
  settingsGroup: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' },
  label: { fontWeight: 'bold', marginBottom: '5px', display: 'block' },
  select: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '16px', background: 'white' },
  button: { width: '100%', padding: '15px', border: 'none', background: 'linear-gradient(90deg, #36D1DC 0%, #5B86E5 100%)', color: 'white', borderRadius: '8px', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold' },
  statusHeader: { textAlign: 'center', color: '#2c3e50' },
  gameHeader: { textAlign: 'center', marginBottom: '20px', color: '#555', fontWeight: 'bold' },
  questionText: { fontSize: '22px', margin: '20px 0', minHeight: '60px', textAlign: 'center' },
  optionsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' },
  option: { padding: '15px', border: '2px solid #ddd', background: 'white', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', textAlign: 'center', transition: 'all 0.2s' },
  optionSelected: { padding: '15px', border: '2px solid #5B86E5', background: '#eaf2ff', borderRadius: '8px', fontSize: '16px', textAlign: 'center' },
  optionCorrect: { padding: '15px', border: '2px solid #28a745', background: '#d4edda', color: '#155724', borderRadius: '8px', fontSize: '16px', textAlign: 'center', fontWeight: 'bold' },
  optionIncorrect: { padding: '15px', border: '2px solid #dc3545', background: '#f8d7da', color: '#721c24', borderRadius: '8px', fontSize: '16px', textAlign: 'center' },
  feedbackBox: { marginTop: '25px', padding: '20px', borderTop: '1px solid #eee', background: '#f8f9fa', borderRadius: '8px' },
  categorySection: { margin: '25px 0', borderTop: '1px solid #eee', paddingTop: '20px' },
  categoryHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' },
  selectAllButton: { background: 'none', border: 'none', color: '#007bff', cursor: 'pointer', fontSize: '14px' },
  categoryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' },
  checkboxContainer: { display: 'flex', alignItems: 'center', gap: '8px' },
};
