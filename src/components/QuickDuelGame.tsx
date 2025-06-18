import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';

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

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

export const QuickDuelGame = () => {
  const [userId, setUserId] = useState('');
  const [jwtToken, setJwtToken] = useState('');
  const [tokenError, setTokenError] = useState<string | null>(null);

  const [gameStatus, setGameStatus] = useState<GameStatus>('idle');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const [playerInfo, setPlayerInfo] = useState<{ userId: string; participantId: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [playersInGame, setPlayersInGame] = useState<Player[]>([]);
  const [timeLimit, setTimeLimit] = useState<1 | 2 | 5>(2);
  const [timer, setTimer] = useState(0);

  // Find Match Handler
  const handleFindMatch = async () => {
    if (!jwtToken || !userId) {
      setTokenError('Please enter both JWT token and user ID.');
      return;
    }
    setTokenError(null);
    setGameStatus('searching');
    try {
      const response = await fetch('/api/duel/find-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwtToken}` },
        body: JSON.stringify({ duration: timeLimit }),
      });
      if (!response.ok) {
        console.error('[FE] Failed to find match via API call');
        setGameStatus('idle');
      }
    } catch (error) {
      console.error('[FE] Error finding match:', error);
      setGameStatus('idle');
    }
  };

  const handleAnswerClick = (optionId: string) => {
    if (socket && playerInfo && sessionId && currentQuestion) {
      console.log('[FE] Sending answer:', { optionId });
      socket.emit('answer:submit', {
        sessionId,
        participantId: playerInfo.participantId,
        questionId: currentQuestion.id,
        optionId,
      });
      setCurrentQuestion(null);
    }
  };

  const handleSkipClick = () => {
    if (socket && playerInfo && sessionId) {
      console.log('[FE] Skipping question');
      socket.emit('question:skip', {
        sessionId,
        participantId: playerInfo.participantId,
      });
      setCurrentQuestion(null);
    }
  };

  const resetGame = () => {
    setGameStatus('idle');
    setSessionId(null);
    setCurrentQuestion(null);
    setScores({});
    setPlayerInfo(null);
    setPlayersInGame([]);
  };

  // WebSocket Connection and Event Handlers
  useEffect(() => {
    if (!userId) return;
    const newSocket = io(SOCKET_SERVER_URL, {
      query: { userId },
      reconnection: false,
    });

    newSocket.on('connect', () => {
      setConnectionStatus('connected');
      setConnectionError(null);
      console.log('[FE] Connected to WebSocket server!', newSocket.id);
    });

    newSocket.on('disconnect', (reason) => {
      setConnectionStatus('disconnected');
      setConnectionError(`Disconnected: ${reason}`);
      console.warn('[FE] Disconnected from WebSocket server:', reason);
    });

    newSocket.on('connect_error', (err) => {
      setConnectionStatus('error');
      setConnectionError(err.message);
      console.error('[FE] Connection error:', err.message);
      setGameStatus('idle');
    });

    newSocket.on('reconnect_attempt', () => {
      setConnectionStatus('reconnecting');
      setConnectionError(null);
      console.warn('[FE] Attempting to reconnect...');
    });

    newSocket.on('reconnect_failed', () => {
      setConnectionStatus('error');
      setConnectionError('Reconnection failed');
      console.error('[FE] Reconnection failed');
    });

    newSocket.on('match:found', (data: { sessionId: string; players: Player[], duration: number }) => {
      console.log('[FE] match:found', data);
      const myInfo = data.players.find(p => p.userId === userId);
      if (myInfo) {
        setPlayerInfo({ userId: myInfo.userId, participantId: myInfo.participantId });
        setSessionId(data.sessionId);
        setGameStatus('playing');
        setPlayersInGame(data.players);
        setTimer(data.duration * 60);

        newSocket.emit('game:register-participant', {
          participantId: myInfo.participantId,
        });
        newSocket.emit('game:join', {
          sessionId: data.sessionId,
          participantId: myInfo.participantId,
        });
      } else {
        console.error('[FE] My user ID not found in players list.');
        setGameStatus('idle');
      }
    });

    const questionHandler = (question: Question) => {
      console.log('[FE] Received question', question);
      setCurrentQuestion(question);
    };
    newSocket.on('question:new', questionHandler);

    newSocket.on('score:update', (newScores: Record<string, number>) => {
      console.log('[FE] score:update', newScores);
      setScores(newScores);
    });

    newSocket.on('game:end', (finalScores: Record<string, number>) => {
      console.log('[FE] game:end', finalScores);
      setScores(finalScores);
      setGameStatus('finished');
      setCurrentQuestion(null);
    });

    setSocket(newSocket);

    // Cleanup to avoid duplicate listeners
    return () => {
      newSocket.off('question:new', questionHandler);
      newSocket.disconnect();
    };
  }, [userId]);

  // Countdown Timer Effect
  useEffect(() => {
    if (gameStatus !== 'playing' || timer <= 0) return;
    const interval = setInterval(() => setTimer((prevTimer) => prevTimer - 1), 1000);
    return () => clearInterval(interval);
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

      {gameStatus === 'playing' && !currentQuestion && <p style={styles.statusText}>Waiting for next question...</p>}

   {gameStatus === 'finished' && (
  <div style={styles.card}>
    <h2 style={styles.questionText}>Game Over!</h2>
    <h3 style={styles.statusText}>Final Scores:</h3>
    {playersInGame.map(p => {
      const player = p.participantId;
      let actualScores = scores.scores; // Fix here
      return (
        <p key={p.userId}>
          {p.username || p.userId.slice(0, 5)}: {actualScores[player] || 0}
        </p>
      );
    })}
    <button onClick={resetGame} style={styles.button}>Play Again</button>
  </div>
)}

    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: { fontFamily: 'sans-serif', textAlign: 'center', padding: '20px' },
  title: { color: '#333' },
  card: { background: '#f9f9f9', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' },
  header: { display: 'flex', justifyContent: 'space-between', marginBottom: '20px', fontWeight: 'bold' },
  questionText: { margin: '20px 0' },
  optionsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '20px' },
  button: { padding: '10px 20px', border: 'none', borderRadius: '5px', background: '#007bff', color: 'white', cursor: 'pointer', fontSize: '16px' },
  select: { padding: '10px', marginRight: '10px', fontSize: '16px' },
  statusText: { fontSize: '18px', color: '#555' },
};
