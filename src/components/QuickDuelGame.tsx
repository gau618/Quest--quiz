// src/components/QuickDuelGame.tsx
import { useState, useEffect, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

type GameStatus = 'idle' | 'searching' | 'playing' | 'finished';

interface Player {
  participantId: string;
  userId: string;
  username?: string;
  avatarUrl?: string;
  elo?: number;
}

interface Question {
  id: string;
  text: string;
  options: { id: string; text: string }[];
}

interface AnswerData {
  questionId: string;
  timeTaken: number;
  action: 'answered' | 'skipped' | 'timeout';
  correct?: boolean;
}

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

// --- Results Graph Component ---
interface ResultsGraphProps {
  players: Player[];
  results: Record<string, AnswerData[]>;
}

const ResultsGraph: React.FC<ResultsGraphProps> = ({ players, results }) => {
  const PLAYER_COLORS = ['#3e95cd', '#8e5ea2', '#3cba9f', '#e8c3b9'];
  const getPointColor = (action: string, correct?: boolean) => {
    if (action === 'answered') {
      return correct ? 'rgba(40, 167, 69, 1)' : 'rgba(220, 53, 69, 1)'; // Green / Red
    }
    if (action === 'skipped') {
      return 'rgba(255, 193, 7, 1)'; // Yellow
    }
    return 'rgba(108, 117, 125, 1)'; // Gray for timeout
  };

  const chartData = useMemo(() => {
    const maxQuestions = Math.max(
      ...Object.values(results).map(pResults => pResults.length), 0
    );
    const labels = Array.from({ length: maxQuestions }, (_, i) => `Q${i + 1}`);
    console.log('[FE][Graph] Preparing chart data for questions:', labels.length);

    const datasets = players.map((player, index) => {
      const playerData = results[player.participantId] || [];
      console.log(`[FE][Graph] Player ${player.username || player.userId.slice(0,5)} data points:`, playerData.length);
      return {
        label: player.username || player.userId.slice(0, 5),
        data: labels.map((_, qIndex) =>
          playerData[qIndex] ? playerData[qIndex].timeTaken / 1000 : null
        ),
        borderColor: PLAYER_COLORS[index % PLAYER_COLORS.length],
        backgroundColor: PLAYER_COLORS[index % PLAYER_COLORS.length],
        fill: false,
        tension: 0.1,
        pointRadius: 6,
        pointHoverRadius: 8,
        pointBackgroundColor: playerData.map(res => getPointColor(res.action, res.correct)),
      };
    });

    return { labels, datasets };
  }, [players, results]);

  const chartOptions: any = { // Using 'any' for chartOptions due to complex Chart.js types
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Performance Analysis: Time per Question',
        font: { size: 18 }
      },
      tooltip: {
        callbacks: {
          label: function (context: any) {
            const playerLabel = context.dataset.label || '';
            const timeTaken = context.parsed.y;
            const qIndex = context.dataIndex;
            const player = players.find(p => (p.username || p.userId.slice(0,5)) === playerLabel);
            if (!player) return '';

            const resultData = results[player.participantId]?.[qIndex];
            if (!resultData) return '';

            let status = resultData.action.charAt(0).toUpperCase() + resultData.action.slice(1);
            if(resultData.action === 'answered') {
              status = resultData.correct ? 'Correct' : 'Incorrect';
            }
            return `${playerLabel}: ${timeTaken.toFixed(2)}s (${status})`;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        title: {
          display: true,
          text: 'Time Taken (seconds)',
        },
      },
      x: {
        title: {
          display: true,
          text: 'Question Number',
        },
      },
    },
  };

  return (
    <div style={{ position: 'relative', height: '400px', marginTop: '30px' }}>
      <Line options={chartOptions} data={chartData} />
    </div>
  );
};


export const QuickDuelGame = () => {
  // State for user authentication/identification
  const [userId, setUserId] = useState('');
  const [jwtToken, setJwtToken] = useState('');
  const [tokenError, setTokenError] = useState<string | null>(null);

  // State for game status and WebSocket connection
  const [gameStatus, setGameStatus] = useState<GameStatus>('idle');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [waitingMessage, setWaitingMessage] = useState<string | null>(null); // For messages like "waiting for opponent"

  // State for current game session details
  const [playerInfo, setPlayerInfo] = useState<{ userId: string; participantId: string } | null>(null); // My participant ID
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({}); // ParticipantId -> Score mapping
  const [gameResults, setGameResults] = useState<Record<string, AnswerData[]> | null>(null); // Detailed game results for graph
  const [playersInGame, setPlayersInGame] = useState<Player[]>([]); // List of all players in current game
  const [timeLimit, setTimeLimit] = useState<1 | 2 | 5>(2); // Game duration selected by user
  const [timer, setTimer] = useState(0); // Countdown timer for the game session

  // Handler to initiate matchmaking
  const handleFindMatch = async () => {
    console.log('[FE][QuickDuel] Find Match button clicked.');
    if (!jwtToken || !userId) {
      setTokenError('Please enter both JWT token and user ID.');
      console.warn('[FE][QuickDuel] JWT token or User ID missing.');
      return;
    }
    setTokenError(null);
    setGameStatus('searching');
    console.log(`[FE][QuickDuel] Searching for match with duration: ${timeLimit} minutes.`);
    try {
      const response = await fetch('/api/duel/find-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwtToken}` },
        body: JSON.stringify({ duration: timeLimit }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        console.error('[FE][QuickDuel] Failed to find match via API call:', errorData);
        setGameStatus('idle');
      } else {
        console.log('[FE][QuickDuel] Matchmaking request sent successfully.');
      }
    } catch (error) {
      console.error('[FE][QuickDuel] Error sending find match request:', error);
      setGameStatus('idle');
    }
  };

  // Handler for answering a question
  const handleAnswerClick = (optionId: string) => {
    console.log(`[FE][QuickDuel] Answer clicked: ${optionId}`);
    if (socket && playerInfo && sessionId && currentQuestion) {
      console.log(`[FE][QuickDuel] Emitting 'answer:submit' for Q${currentQuestion.id} with option ${optionId}.`);
      socket.emit('answer:submit', { sessionId, participantId: playerInfo.participantId, questionId: currentQuestion.id, optionId });
      setCurrentQuestion(null); // Clear question to prevent re-answering until next Q arrives
    } else {
      console.warn('[FE][QuickDuel] Cannot submit answer: socket, playerInfo, sessionId, or currentQuestion is null.');
    }
  };

  // Handler for skipping a question
  const handleSkipClick = () => {
    console.log('[FE][QuickDuel] Skip button clicked.');
    if (socket && playerInfo && sessionId) {
      console.log(`[FE][QuickDuel] Emitting 'question:skip' for session ${sessionId}.`);
      socket.emit('question:skip', { sessionId, participantId: playerInfo.participantId });
      setCurrentQuestion(null); // Clear question to prevent re-skipping
    } else {
      console.warn('[FE][QuickDuel] Cannot skip: socket, playerInfo, or sessionId is null.');
    }
  };

  // Resets game state to idle
  const resetGame = () => {
    console.log('[FE][QuickDuel] Resetting game state.');
    setGameStatus('idle');
    setSessionId(null);
    setCurrentQuestion(null);
    setScores({});
    setGameResults(null);
    setPlayerInfo(null);
    setPlayersInGame([]);
    setWaitingMessage(null);
    setTimer(0);
  };

  // Effect for WebSocket connection and event listeners
  useEffect(() => {
    if (!userId) {
      console.log('[FE][QuickDuel] userId is empty, skipping socket connection setup.');
      return;
    }
    console.log(`[FE][QuickDuel] Setting up WebSocket connection for userId: ${userId}.`);
    const newSocket = io(SOCKET_SERVER_URL, { query: { userId }, reconnection: false });

    // Socket connection events
    newSocket.on('connect', () => { 
      setConnectionStatus('connected'); 
      setConnectionError(null); 
      console.log('[FE][QuickDuel] Connected to WebSocket server!'); 
    });
    newSocket.on('disconnect', (reason) => { 
      setConnectionStatus('disconnected'); 
      setConnectionError(`Disconnected: ${reason}`); 
      console.warn('[FE][QuickDuel] Disconnected from WebSocket server:', reason); 
    });
    newSocket.on('connect_error', (err) => { 
      setConnectionStatus('error'); 
      setConnectionError(err.message); 
      setGameStatus('idle'); // Force back to idle on connection error
      console.error('[FE][QuickDuel] Connection error:', err.message); 
    });
    
    // Game-specific events
    newSocket.on('match:found', (data: { sessionId: string; players: Player[], duration: number }) => {
      console.log('[FE][QuickDuel] Received \'match:found\' event:', data);
      const myInfo = data.players.find(p => p.userId === userId);
      if (myInfo) {
        setPlayerInfo({ userId: myInfo.userId, participantId: myInfo.participantId });
        setSessionId(data.sessionId);
        setGameStatus('playing');
        setPlayersInGame(data.players);
        setTimer(data.duration * 60); // Convert minutes to seconds
        console.log(`[FE][QuickDuel] Match found! Session ${data.sessionId}. My participant ID: ${myInfo.participantId}.`);

        // Register my participant ID with the socket server
        newSocket.emit('game:register-participant', { participantId: myInfo.participantId });
        // Join the specific game session room
        newSocket.emit('game:join', { sessionId: data.sessionId, participantId: myInfo.participantId });
      } else {
        console.error('[FE][QuickDuel] My user ID not found in players list received from match:found. Resetting.');
        setGameStatus('idle');
      }
    });

    const questionHandler = (question: Question) => {
      console.log('[FE][QuickDuel] Received \'question:new\' event:', question.id);
      setCurrentQuestion(question);
      setWaitingMessage(null); // Clear waiting message when new question arrives
    };
    newSocket.on('question:new', questionHandler);

    newSocket.on('score:update', (newScores: Record<string, number>) => {
      console.log('[FE][QuickDuel] Received \'score:update\' event:', newScores);
      setScores(newScores);
    });

    // Event when a participant finishes all their questions (before overall game end)
    newSocket.on('participant:finished', (data: { reason: string }) => {
      console.log('[FE][QuickDuel] Received \'participant:finished\' event:', data.reason);
      setCurrentQuestion(null); // Clear question
      setWaitingMessage('You have answered all questions! Waiting for opponent...');
    });

    newSocket.on('game:end', (data: { scores: Record<string, number>; results: Record<string, AnswerData[]> }) => {
      console.log('[FE][QuickDuel] Received \'game:end\' event:', data);
      // Ensure results are present before setting
      if (data.results) { 
        setScores(data.scores);
        setGameResults(data.results);
        setGameStatus('finished');
        setCurrentQuestion(null); // Clear any active question
        setWaitingMessage(null); // Clear messages
      } else {
        console.warn('[FE][QuickDuel] Game end data missing results.');
        setScores(data.scores);
        setGameStatus('finished');
      }
    });

    setSocket(newSocket); // Store the socket instance in state

    // Cleanup function for useEffect
    return () => {
      console.log('[FE][QuickDuel] Cleaning up WebSocket listeners and disconnecting socket.');
      newSocket.off('question:new', questionHandler);
      newSocket.off('match:found');
      newSocket.off('score:update');
      newSocket.off('participant:finished');
      newSocket.off('game:end');
      newSocket.disconnect();
    };
  }, [userId]); // Dependency array: re-run this effect if userId changes

  // Effect for the game session countdown timer
  useEffect(() => {
    if (gameStatus !== 'playing' || timer <= 0) return; // Only run if playing and timer is active
    const interval = setInterval(() => setTimer((prevTimer) => prevTimer - 1), 1000);
    return () => clearInterval(interval); // Cleanup interval on component unmount or dependencies change
  }, [gameStatus, timer]);

  // Render Logic
  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Ranked Quick Duel</h1>

      {/* Token and User ID Input UI */}
      <div style={{ marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Enter JWT token"
          value={jwtToken}
          onChange={e => setJwtToken(e.target.value)}
          style={{ width: 350, marginRight: 10, padding: 6, fontSize: 14 }}
        />
        <input
          type="text"
          placeholder="Enter your user ID"
          value={userId}
          onChange={e => setUserId(e.target.value)}
          style={{ width: 200, marginRight: 10, padding: 6, fontSize: 14 }}
        />
        {tokenError && <span style={{ color: 'red', fontSize: 14 }}>{tokenError}</span>}
      </div>

      {/* WebSocket Connection Status */}
      <div style={{ marginBottom: 10 }}>
        <strong>WebSocket Status:</strong> {connectionStatus}
        {connectionError && <span style={{ color: 'red', marginLeft: 10 }}>{connectionError}</span>}
      </div>

      {/* UI based on game status */}
      {gameStatus === 'idle' && (
        <div style={styles.card}>
          <select value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value) as 1 | 2 | 5)} style={styles.select}>
            <option value={1}>1 Minute</option>
            <option value={2}>2 Minutes</option>
            <option value={5}>5 Minutes</option>
          </select>
          <button onClick={handleFindMatch} style={styles.button}>
            Find Match
          </button>
        </div>
      )}

      {gameStatus === 'searching' && <p style={styles.statusText}>Searching for a match...</p>}

      {gameStatus === 'playing' && currentQuestion && (
        <div style={styles.card}>
          <div style={styles.header}>
            <span>Time Left: {Math.floor(timer / 60)}:{String(timer % 60).padStart(2, '0')}</span>
            <div>
              {playersInGame.map(p => (
                <span key={p.userId} style={{ marginLeft: '10px' }}>
                  {p.username || p.userId.slice(0, 5)}: {scores[p.participantId] || 0}
                </span>
              ))}
            </div>
          </div>
          <h2 style={styles.questionText}>{currentQuestion.text}</h2>
          <div style={styles.optionsGrid}>
            {currentQuestion.options.map((option) => (
              <button key={option.id} onClick={() => handleAnswerClick(option.id)} style={styles.button}>
                {option.text}
              </button>
            ))}
          </div>
          <button onClick={handleSkipClick} style={{ ...styles.button, backgroundColor: '#f0ad4e' }}>Skip</button>
        </div>
      )}

      {gameStatus === 'playing' && !currentQuestion && <p style={styles.statusText}>{waitingMessage || 'Waiting for next question...'}</p>}

      {gameStatus === 'finished' && (
        <div style={styles.card}>
          <h2 style={styles.questionText}>Game Over!</h2>
          <h3 style={styles.statusText}>Final Scores:</h3>
          {playersInGame.map(p => (
            <p key={p.userId}>
              {p.username || p.userId.slice(0, 5)}: {scores[p.participantId] || 0}
            </p>
          ))}
          {gameResults && <ResultsGraph players={playersInGame} results={gameResults} />}
          <button onClick={resetGame} style={{ ...styles.button, marginTop: '20px' }}>Play Again</button>
        </div>
      )}

    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: { fontFamily: 'sans-serif', textAlign: 'center', padding: '20px' },
  title: { color: '#333' },
  card: { background: '#f9f9f9', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', maxWidth: '800px', margin: 'auto' },
  header: { display: 'flex', justifyContent: 'space-between', marginBottom: '20px', fontWeight: 'bold' },
  questionText: { margin: '20px 0' },
  optionsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' },
  button: { padding: '10px 20px', border: 'none', borderRadius: '5px', background: '#007bff', color: 'white', cursor: 'pointer', fontSize: '16px' },
  select: { padding: '10px', marginRight: '10px', fontSize: '16px' },
  statusText: { fontSize: '18px', color: '#555' },
};
