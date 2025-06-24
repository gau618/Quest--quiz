// src/components/TimeAttackGame.tsx
import React, { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { Difficulty } from '@prisma/client'; // Assuming Difficulty enum is accessible

type TimeAttackStatus = 'setup' | 'playing' | 'finished';
interface Question { id: string; text: string; options: { id: string; text: string }[]; }

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

export const TimeAttackGame = () => {
  // --- State Management ---
  const [userId, setUserId] = useState("");
  const [jwtToken, setJwtToken] = useState("");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [status, setStatus] = useState<TimeAttackStatus>("setup");

  // Setup State
  const [difficulty, setDifficulty] = useState<Difficulty>("EASY");
  const [durationMinutes, setDurationMinutes] = useState<1 | 2 | 5>(1); // Total game time
  const [isStarting, setIsStarting] = useState(false); // For loading state on button

  // Game State
  const [sessionId, setSessionId] = useState("");
  const [participantId, setParticipantId] = useState("");
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0); // Main game timer in seconds

  // --- Handlers ---
  const startTimeAttack = async () => {
    console.log("[TimeAttack] Start Time Attack button clicked.");
    if (!jwtToken || !userId) { alert("Please enter JWT and User ID."); return; }
    if (!socket || !socket.connected) { alert("Game server is not connected. Please wait or refresh the page."); return; }
    setIsStarting(true);

    try {
      // Note: Assumes /api/time-attack/start endpoint handles 'durationMinutes' and 'categories'
      const response = await fetch("/api/time-attack/play", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${jwtToken}` },
        body: JSON.stringify({ difficulty, categories: [], durationMinutes }), // Categories array sent as empty
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to start Time Attack session");
      }
      // Backend will emit time_attack:started after session is ready, which is handled in useEffect
      console.log("[TimeAttack] API request successful. Waiting for 'time_attack:started' event.");
      
    } catch (error: any) {
      console.error("[TimeAttack] Error starting Time Attack:", error.message);
      alert(`Failed to start Time Attack: ${error.message}`);
      setIsStarting(false);
    }
  };

  const handleAnswerClick = (optionId: string) => {
    console.log(`[TimeAttack] Answer clicked: ${optionId}`);
    if (!socket || !currentQuestion || status !== 'playing') return; // Only allow answering if playing
    
    // Emit answer. Server will process and send new question immediately for Time Attack.
    socket.emit("answer:submit", { sessionId, participantId, questionId: currentQuestion.id, optionId });
    setCurrentQuestion(null); // Clear question immediately to show "Loading next question..."
  };

  const resetGame = () => {
    console.log("[TimeAttack] Resetting game state.");
    setStatus("setup"); setScore(0); setTimeLeft(0); setIsStarting(false);
    setSessionId(""); setParticipantId(""); setCurrentQuestion(null);
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // --- USEEFFECT HOOKS ---

  // Effect to manage the Socket.IO connection and its listeners.
  useEffect(() => {
    console.log("[TimeAttack] Socket useEffect triggered. userId:", userId);
    // If no userId is provided, ensure we are disconnected.
    if (!userId) {
      console.log("[TimeAttack] userId is empty. Disconnecting socket if exists.");
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    // If there's a userId but no socket, create a new one.
    if (!socket) {
      console.log(`[TimeAttack] Establishing new Socket.IO connection for userId: ${userId}`);
      const newSocket = io(SOCKET_SERVER_URL, {
        query: { userId },
        reconnection: true, // Ensure reconnection is enabled for reliability
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000, // Cap delay
        randomizationFactor: 0.5, // Randomize delay to avoid stampeding server
      });
      setSocket(newSocket);

      // --- Socket Connection Events ---
      newSocket.on('connect', () => console.log(`[TimeAttack] Socket connected: ${newSocket.id}.`));
      newSocket.on('disconnect', (reason) => console.log(`[TimeAttack] Socket disconnected. Reason: ${reason}`));
      newSocket.on('connect_error', (err) => {
        console.error(`[TimeAttack] Socket connection error: ${err.message}`);
        alert(`Could not connect to the game server: ${err.message}. Please refresh.`);
        resetGame(); // Reset to setup on connection error
      });
      
      // --- Time Attack Specific Game Events ---
      newSocket.on("time_attack:started", (data: { sessionId: string; participantId: string; totalQuestions: number; durationMinutes: number }) => {
        console.log("[TimeAttack] 'time_attack:started' received:", data);
        const { sessionId, participantId, durationMinutes } = data; // totalQuestions isn't used by frontend in TimeAttack
        
        // 1. Register with the socket server. This is the core handshake.
        newSocket.emit("game:register-participant", { participantId, sessionId });

        // 2. Update state and start timer
        setSessionId(sessionId);
        setParticipantId(participantId);
        setScore(0); // Ensure score starts from 0 for new game
        setTimeLeft(durationMinutes * 60); // Set initial game timer
        setStatus("playing");
        setIsStarting(false); // Game has started, re-enable start button for next game if needed

        // 3. Request the first question
        newSocket.emit("time_attack:request_next_question", { sessionId, participantId });
        console.log("[TimeAttack] Status set to 'playing'. Requesting first question.");
      });

      newSocket.on("question:new", (data: { question: Question; questionNumber: number }) => {
        console.log("[TimeAttack] 'question:new' received:", data);
        setCurrentQuestion(data.question);
        // questionNumber can be used for display if desired, but not for core logic in time attack
      });

      newSocket.on("time_attack:score_update", (data: { score: number }) => {
        console.log("[TimeAttack] 'time_attack:score_update' received:", data);
        setScore(data.score); // Update score in real-time
      });

      newSocket.on("time_attack:finished", (data: { scores: Record<string, number>; results: any[] }) => {
        console.log("[TimeAttack] 'time_attack:finished' received:", data);
        const finalPScore = data.scores|| 0;
        console.log(data)
 
        setStatus("finished");
        setCurrentQuestion(null); // Clear question on game end
        console.log("[TimeAttack] Game status set to 'finished'. Final Score: ", finalPScore);
      });
      
      newSocket.on("time_attack:error", (data: { message: string }) => {
        console.error("[TimeAttack] 'time_attack:error' received:", data.message);
        alert(`Time Attack Error: ${data.message}`);
        resetGame(); // Reset to setup on game-specific error
      });

      // Cleanup function for this specific useEffect instance (runs on unmount or userId change)
      return () => {
        if (newSocket) {
          console.log("[TimeAttack] Cleaning up socket connection in useEffect cleanup.");
          newSocket.offAny(); // Remove all event listeners attached to this socket instance
          newSocket.disconnect(); // Disconnect the socket
        }
      };
    }

    // This return handles the case where `socket` already exists.
    // We don't need to create a new socket if one is already established for the current userId.
    return () => { /* no-op or specific cleanup for existing socket if necessary on re-render */ };
  }, [userId]); // This effect depends only on `userId` to manage the socket's lifecycle.

  // Game countdown timer useEffect
  useEffect(() => {
    if (status === 'playing' && timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    } else if (status === 'playing' && timeLeft <= 0) {
      // Time's up, frontend timer finished. Backend should eventually send time_attack:finished.
      console.log("[TimeAttack] Frontend timer reached 0. Waiting for backend to end game.");
      // Do not change status here, let backend dictate game end.
    }
  }, [status, timeLeft]);

  // --- JSX Rendering Logic ---
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>⏰ Time Attack</h1>

      {/* Setup Screen */}
      {status === 'setup' && (
        <div style={styles.card}>
          <p style={styles.description}>Answer as many questions as possible within the time limit. Aim for the high score!</p>
          
          <div style={styles.inputGroup}>
            <label htmlFor="jwtToken" style={styles.label}>JWT Token:</label>
            <input id="jwtToken" type="text" placeholder="Enter JWT token" value={jwtToken} onChange={e => setJwtToken(e.target.value)} style={styles.input} />
          </div>
          <div style={styles.inputGroup}>
            <label htmlFor="userId" style={styles.label}>User ID:</label>
            <input id="userId" type="text" placeholder="Enter your user ID" value={userId} onChange={e => setUserId(e.target.value)} style={styles.input} />
          </div>

          <div style={styles.settingsGrid}>
            <div style={styles.settingsItem}>
              <label htmlFor="difficulty" style={styles.label}>Difficulty:</label>
              <select id="difficulty" value={difficulty} onChange={e => setDifficulty(e.target.value as Difficulty)} style={styles.select}>
                  <option value="EASY">Easy</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HARD">Hard</option>
              </select>
            </div>
            <div style={styles.settingsItem}>
              <label htmlFor="duration" style={styles.label}>Duration:</label>
              <select id="duration" value={durationMinutes} onChange={e => setDurationMinutes(Number(e.target.value) as 1 | 2 | 5)} style={styles.select}>
                <option value={1}>1 Minute</option>
                <option value={2}>2 Minutes</option>
                <option value={5}>5 Minutes</option>
              </select>
            </div>
          </div>
          
          <button onClick={startTimeAttack} style={styles.button} disabled={isStarting || !socket?.connected}>
            {isStarting ? "Starting..." : (!socket?.connected ? "Connecting..." : "Start Time Attack")}
          </button>
        </div>
      )}
      
      {/* Playing Screen */}
      {status === 'playing' && (
        <div style={styles.card}>
            <div style={styles.gameHeader}>
                <span style={styles.headerItem}>Time Left: <strong>{formatTime(timeLeft)}</strong></span>
                <span style={styles.headerItem}>Score: <strong>{score}</strong></span>
            </div>

            {currentQuestion ? (
              <div style={styles.questionArea}>
                <p style={styles.questionNumber}>Question {score / 10 + 1}</p> {/* Assuming +10 per correct answer */}
                <h2 style={styles.questionText}>{currentQuestion.text}</h2>
                <div style={styles.optionsGrid}>
                  {currentQuestion.options.map(opt => (
                    <button key={opt.id} onClick={() => handleAnswerClick(opt.id)} style={styles.optionButton}>{opt.text}</button>
                  ))}
                </div>
              </div>
            ) : (
              <p style={styles.loadingMessage}>Loading next question...</p>
            )}
        </div>
      )}

      {/* Finished Screen */}
      {status === 'finished' && (
        <div style={styles.card}>
          <h2 style={styles.finalHeader}>🏁 Time's Up!</h2>
          <p style={styles.finalScoreText}>Your final score: <strong>{score}</strong> points</p>
          <button onClick={resetGame} style={{ ...styles.button, marginTop: '20px' }}>Play Again</button>
        </div>
      )}
    </div>
  );
};

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
  // Container for the whole game component
  container: {
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    maxWidth: '700px',
    margin: '40px auto',
    padding: '25px',
    backgroundColor: '#f8f9fa',
    borderRadius: '16px',
    boxShadow: '0 12px 24px rgba(0,0,0,0.1)',
    color: '#343a40',
    border: '1px solid #e0e0e0',
  },
  // Main title of the game mode
  title: {
    textAlign: 'center',
    color: '#2c3e50',
    marginBottom: '30px',
    fontSize: '2.5em',
    fontWeight: 'bold',
    letterSpacing: '0.05em',
    textShadow: '1px 1px 2px rgba(0,0,0,0.05)',
  },
  // Card-like container for different game states (setup, playing, finished)
  card: {
    backgroundColor: '#ffffff',
    padding: '35px 40px',
    borderRadius: '12px',
    boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
    border: '1px solid #f0f0f0',
  },
  // General input field style
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 15px',
    margin: '10px 0',
    border: '1px solid #ced4da',
    borderRadius: '8px',
    fontSize: '1em',
    color: '#495057',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  inputGroup: {
    marginBottom: '15px',
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontWeight: 'bold',
    color: '#495057',
  },
  // Settings layout for difficulty/duration
  settingsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '20px',
    marginBottom: '25px',
  },
  settingsItem: {
    display: 'flex',
    flexDirection: 'column',
  },
  select: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #ced4da',
    fontSize: '1em',
    backgroundColor: '#fff',
    color: '#495057',
    appearance: 'none', // Remove default arrow
    background: `url('data:image/svg+xml;utf8,<svg fill="%23495057" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/><path d="M0 0h24v24H0z" fill="none"/></svg>') no-repeat right 10px center`,
    backgroundSize: '20px',
  },
  // Primary action button
  button: {
    width: '100%',
    padding: '15px',
    border: 'none',
    background: 'linear-gradient(45deg, #4CAF50 0%, #689F38 100%)', // Green gradient
    color: 'white',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '1.2em',
    fontWeight: 'bold',
    transition: 'transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease',
    boxShadow: '0 4px 12px rgba(76, 175, 80, 0.3)',
  },
  // Hover and active states for buttons
  buttonHover: {
    transform: 'translateY(-2px)',
    boxShadow: '0 6px 16px rgba(76, 175, 80, 0.4)',
  },
  buttonActive: {
    transform: 'translateY(0)',
    boxShadow: '0 2px 8px rgba(76, 175, 80, 0.2)',
  },
  description: {
    textAlign: 'center',
    marginBottom: '30px',
    fontSize: '1.1em',
    color: '#6c757d',
    lineHeight: '1.6',
  },
  // Game Header (Time Left & Score)
  gameHeader: {
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: '30px',
    padding: '15px',
    backgroundColor: '#e9ecef',
    borderRadius: '10px',
    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)',
    fontWeight: 'bold',
    fontSize: '1.3em',
    color: '#495057',
  },
  headerItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '5px',
  },
  // Question area
  questionArea: {
    textAlign: 'center',
    animation: 'fadeIn 0.5s ease-out', // Simple fade-in animation
  },
  questionNumber: {
    fontSize: '1.1em',
    color: '#6c757d',
    marginBottom: '10px',
  },
  questionText: {
    fontSize: '1.8em',
    fontWeight: '600',
    marginBottom: '30px',
    lineHeight: '1.4',
    color: '#2c3e50',
    minHeight: '80px', // Prevent layout shifts when question loads
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr', // Two columns
    gap: '15px', // Space between options
    marginBottom: '20px',
  },
  optionButton: {
    padding: '18px',
    border: '2px solid #007bff', // Blue border
    backgroundColor: '#e0f2ff', // Light blue background
    color: '#0056b3', // Darker blue text
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '1.1em',
    fontWeight: '500',
    transition: 'all 0.2s ease',
    boxShadow: '0 2px 6px rgba(0, 123, 255, 0.2)',
  },
  optionButtonHover: {
    backgroundColor: '#cce5ff', // Even lighter blue on hover
    transform: 'translateY(-2px)',
    boxShadow: '0 4px 8px rgba(0, 123, 255, 0.3)',
  },
  optionButtonActive: {
    backgroundColor: '#99ccff', // Darker blue on click
    transform: 'translateY(0)',
    boxShadow: '0 1px 3px rgba(0, 123, 255, 0.1)',
  },
  loadingMessage: {
    textAlign: 'center',
    fontStyle: 'italic',
    color: '#6c757d',
    minHeight: '80px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Finished screen styles
  finalHeader: {
    textAlign: 'center',
    fontSize: '2.2em',
    fontWeight: 'bold',
    color: '#28a745', // Green for success
    marginBottom: '20px',
  },
  finalScoreText: {
    textAlign: 'center',
    fontSize: '1.8em',
    color: '#343a40',
    marginBottom: '30px',
  },
  // Keyframe for fade-in animation
  '@keyframes fadeIn': {
    from: { opacity: 0, transform: 'translateY(10px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
  },
};
