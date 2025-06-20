// src/components/FastestFingerGame.tsx

import { useState, useEffect, useRef } from 'react'; // <-- Import useRef
import { io, Socket } from 'socket.io-client';

type FFGameStatus = 'idle' | 'searching' | 'waiting' | 'playing' | 'answered' | 'finished';

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
  action: 'answered' | 'timeout';
  correct?: boolean;
}

const SOCKET_SERVER_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:4000';

export const FastestFingerGame = () => {
  // User identification state
  const [userId, setUserId] = useState('');
  const [jwtToken, setJwtToken] = useState('');

  // Game status and WebSocket connection state
  const [gameStatus, setGameStatus] = useState<FFGameStatus>('idle');
  const [socket, setSocket] = useState<Socket | null>(null);
  
  // Game session details
  const [sessionId, setSessionId] = useState<string | null>(null); // <-- FIX 1: Add state for sessionId
  const [players, setPlayers] = useState<Player[]>([]);
  const playersRef = useRef(players); // <-- FIX 2: Create a ref to hold the current players state
  
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [timePerQuestion, setTimePerQuestion] = useState<1 | 2 | 5>(2);
  
  const [scores, setScores] = useState<Record<string, number>>({});
  const [hasAnswered, setHasAnswered] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [waitingMessage, setWaitingMessage] = useState<string | null>(null);
  const [gameResults, setGameResults] = useState<Record<string, AnswerData[]> | null>(null);

  // FIX 2 (continued): Keep the ref updated with the latest players state
  useEffect(() => {
    playersRef.current = players;
  }, [players]);


  // Handler to initiate matchmaking for Fastest Finger
  const findMatch = async () => {
    console.log('[FE][FastestFinger] Find Match button clicked.');
    if (!jwtToken || !userId) {
      console.warn('[FE][FastestFinger] JWT token or User ID missing.');
      return; 
    }
    
    setGameStatus('searching');
    console.log(`[FE][FastestFinger] Searching for match with time per question: ${timePerQuestion} seconds.`);
    try {
      const response = await fetch('/api/fastest-finger/find-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwtToken}` },
        body: JSON.stringify({ timePerQuestion: timePerQuestion * 1000 }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        console.error('[FE][FastestFinger] Failed to find match via API call:', errorData);
        setGameStatus('idle');
      } else {
        console.log('[FE][FastestFinger] Matchmaking request sent successfully.');
      }
    } catch (error) {
      console.error('[FE][FastestFinger] Error sending find match request:', error);
      setGameStatus('idle');
    }
  };

  // Handler for answering a question
  const handleAnswerClick = (optionId: string) => {
    console.log(`[FE][FastestFinger] Answer clicked: ${optionId}`);
    if (!socket || !currentQuestion || hasAnswered || !sessionId) {
      console.warn('[FE][FastestFinger] Cannot submit answer: invalid state.');
      return; 
    }
    
    setSelectedOption(optionId);
    setHasAnswered(true);
    setGameStatus('answered');
    
    console.log(`[FE][FastestFinger] Emitting 'answer:submit' for Q${currentQuestion.id} with option ${optionId}.`);
    socket.emit('answer:submit', {
      sessionId: sessionId, // <-- FIX 1: Use the actual sessionId from the state
      participantId: players.find(p => p.userId === userId)?.participantId,
      questionId: currentQuestion.id,
      optionId,
    });
  };

  // Resets game state to idle
  const resetGame = () => {
    console.log('[FE][FastestFinger] Resetting game state.');
    setGameStatus('idle');
    setSessionId(null);
    setCurrentQuestion(null);
    setHasAnswered(false);
    setSelectedOption(null);
    setScores({});
    setGameResults(null);
    setWaitingMessage(null);
    setQuestionNumber(0);
    setTotalQuestions(0);
    setTimeLeft(0);
    setPlayers([]);
  };
 console.log(timePerQuestion)
  // Effect for WebSocket connection and event listeners
  useEffect(() => {
    if (!userId) {
      console.log('[FE][FastestFinger] userId is empty, skipping socket connection setup.');
      return;
    }
    console.log(`[FE][FastestFinger] Setting up WebSocket connection for userId: ${userId}.`);
    const newSocket = io(SOCKET_SERVER_URL, { query: { userId } });
    setSocket(newSocket); // Store socket instance

    // Event: Match found for Fastest Finger
    newSocket.on('ff:match_found', (data: { sessionId: string; players: Player[], duration: number, timePerQuestion: number, totalQuestions: number }) => {
      console.log('[FE][FastestFinger] Received \'ff:match_found\' event:', data);
      setSessionId(data.sessionId); // <-- FIX 1: Store the session ID from the backend
      const myInfo = data.players.find(p => p.userId === userId);
      if (myInfo) {
        newSocket.emit('game:register-participant', { participantId: myInfo.participantId });
        newSocket.emit('game:join', { sessionId: data.sessionId, participantId: myInfo.participantId });
      }

      setPlayers(data.players);
      setTotalQuestions(data.totalQuestions || 20);
      setTimePerQuestion(data.timePerQuestion / 1000 as 1 | 2 | 5);
      setGameStatus('waiting');
    });

    // Event: New question is sent
    newSocket.on('ff:new_question', (data: { question: Question; questionNumber: number; timeLimit: number }) => {
      console.log('[FE][FastestFinger] Received \'ff:new_question\' event:', data);
      setCurrentQuestion(data.question);
      setQuestionNumber(data.questionNumber);
      setTimeLeft(data.timeLimit / 1000);
      setHasAnswered(false);
      setSelectedOption(null);
      setGameStatus('playing');
      setWaitingMessage(null);
    });

    // Event: A player has submitted an answer
    newSocket.on('ff:player_answered', (data: { participantId: string; correct: boolean; timeTaken: number }) => {
      // FIX 2: Use the ref to access the most current list of players
      const player = playersRef.current.find(p => p.participantId === data.participantId);
      const isMe = player?.userId === userId;
      console.log(`[FE][FastestFinger] Player ${player?.username || data.participantId} answered. Correct: ${data.correct}.`);
      
      if (!isMe) {
        setWaitingMessage(`${player?.username || 'Opponent'} answered ${data.correct ? 'correctly' : 'incorrectly'}!`);
      } else if (!data.correct) {
        setWaitingMessage('Incorrect answer! Waiting for opponent...');
      }
    });

    // Event: A point is awarded
    newSocket.on('ff:point_awarded', (data: { participantId: string; allScores: Record<string, number> }) => {
      console.log('[FE][FastestFinger] Received \'ff:point_awarded\' event:', data);
      setScores(data.allScores);
      // FIX 2: Use the ref to access the most current list of players
      const winner = playersRef.current.find(p => p.participantId === data.participantId);
      setWaitingMessage(`${winner?.username || 'Player'} wins this round!`);
    });

    // Event: Question timer ran out
    newSocket.on('ff:question_timeout', () => {
      console.log('[FE][FastestFinger] Received \'ff:question_timeout\' event.');
      setWaitingMessage('Time up! Moving to the next question...');
    });

    // Event: Game ends
    newSocket.on('ff:game_end', (data: { scores: Record<string, number>; results: Record<string, AnswerData[]> }) => {
      console.log('[FE][FastestFinger] Received \'ff:game_end\' event:', data);
      setScores(data.scores);
      setGameResults(data.results);
      setGameStatus('finished');
      setWaitingMessage(null);
    });

    // Cleanup on unmount or if userId changes
    return () => {
      console.log('[FE][FastestFinger] Cleaning up WebSocket listeners and disconnecting socket.');
      newSocket.off('ff:match_found');
      newSocket.off('ff:new_question');
      newSocket.off('ff:player_answered');
      newSocket.off('ff:point_awarded');
      newSocket.off('ff:question_timeout');
      newSocket.off('ff:game_end');
      newSocket.disconnect();
    };
  }, [userId]); // <-- FIX 3: Dependency array now ONLY includes userId

  // Countdown timer effect
  useEffect(() => {
    if (gameStatus === 'playing' && timeLeft > 0 && !hasAnswered) {
      const timer = setTimeout(() => setTimeLeft((prev) => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [gameStatus, timeLeft, hasAnswered]);

  const myParticipantId = players.find(p => p.userId === userId)?.participantId;
  const myScore = myParticipantId ? (scores[myParticipantId] || 0) : 0;
  const opponentScore = Object.entries(scores).find(([pId]) => pId !== myParticipantId)?.[1] || 0;


  return (
    <div style={styles.container}>
      <h1 style={styles.title}>⚡ Fastest Finger</h1>

      {gameStatus === 'idle' && (
        <div style={styles.card}>
          <input
            type="text"
            placeholder="JWT Token"
            value={jwtToken}
            onChange={e => setJwtToken(e.target.value)}
            style={styles.input}
          />
          <input
            type="text"
            placeholder="User ID"
            value={userId}
            onChange={e => setUserId(e.target.value)}
            style={styles.input}
          />
          <div style={styles.timeSelector}>
            <label>Time per question:</label>
            <select 
              value={timePerQuestion} 
              onChange={e => setTimePerQuestion(Number(e.target.value) as 1 | 2 | 5)}
              style={styles.select}
            >
              <option value={10}>10 second</option>
              <option value={20}>20 seconds</option>
              <option value={30}>30 seconds</option>
            </select>
          </div>
          <button onClick={findMatch} style={styles.button}>Find Match</button>
        </div>
      )}

      {gameStatus === 'searching' && (
        <div style={styles.card}>
          <h2>🔍 Finding opponent...</h2>
          <p>Looking for players in your skill range</p>
        </div>
      )}

      {gameStatus === 'waiting' && (
        <div style={styles.card}>
          <h2>🎯 Get Ready!</h2>
          <p>Game starting soon...</p>
          <div style={styles.playersList}>
            {players.map(player => (
              <div key={player.participantId} style={styles.playerChip}>
                {player.username || player.userId.slice(0, 8)} ({player.elo})
              </div>
            ))}
          </div>
        </div>
      )}

      {(gameStatus === 'playing' || gameStatus === 'answered') && currentQuestion && (
        <div style={styles.card}>
          <div style={styles.header}>
            <span>Question {questionNumber}/{totalQuestions}</span>
            <div style={styles.scores}>
              <span>You: {myScore}</span>
              <span>Opponent: {opponentScore}</span>
            </div>
            <span style={{ 
              color: timeLeft <= 1 ? '#e74c3c' : '#2ecc71', // Red text when 1 sec left
              fontSize: '18px',
              fontWeight: 'bold'
            }}>
              ⏱️ {timeLeft}s
            </span>
          </div>

          <h2 style={styles.questionText}>{currentQuestion.text}</h2>
          
          <div style={styles.optionsGrid}>
            {currentQuestion.options.map(option => (
              <button
                key={option.id}
                onClick={() => handleAnswerClick(option.id)}
                disabled={hasAnswered} // Disable button after player's first attempt
                style={{
                  ...styles.optionButton,
                  // Visual feedback for selected option and disabled state
                  backgroundColor: selectedOption === option.id ? '#3498db' : hasAnswered ? '#bdc3c7' : '#ecf0f1',
                  color: selectedOption === option.id ? 'white' : hasAnswered ? '#7f8c8d' : '#2c3e50',
                  cursor: hasAnswered ? 'not-allowed' : 'pointer',
                }}
              >
                {option.text}
              </button>
            ))}
          </div>

          {/* Display messages while waiting for opponent or result */}
          {waitingMessage && (
            <div style={styles.waitingMessage}>
              {waitingMessage}
            </div>
          )}

          {/* Confirmation message after submitting answer */}
          {hasAnswered && !waitingMessage && (
            <div style={styles.answerStatus}>
              ✅ Answer submitted! Waiting for result...
            </div>
          )}
        </div>
      )}

      {gameStatus === 'finished' && (
        <div style={styles.card}>
          <h2>🏁 Game Complete!</h2>
          
          <div style={styles.finalScores}>
            {players.map((player, index) => {
              const playerScore = scores[player.participantId] || 0;
              // Determine winner(s) (simple for 1v1, or multiple winners if tied)
              const maxScore = Math.max(...Object.values(scores));
              const isWinner = playerScore === maxScore;
              
              return (
                <div 
                  key={player.participantId}
                  style={{
                    ...styles.scoreItem,
                    backgroundColor: isWinner ? '#f1c40f' : '#ecf0f1', // Yellow for winner, light gray for loser
                    fontWeight: isWinner ? 'bold' : 'normal',
                  }}
                >
                  <span>{isWinner ? '🏆' : '🥈'}</span> {/* Trophy for winner, silver medal for others */}
                  <span>{player.username || player.userId.slice(0, 8)}</span>
                  <span>{playerScore} points</span>
                </div>
              );
            })}
          </div>
          {/* No graph for FF as per prior discussions, but could be added here if gameResults is populated */}
          <button onClick={resetGame} style={{ ...styles.button, marginTop: '20px' }}>
            Play Again
          </button>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: { 
    fontFamily: 'sans-serif', 
    maxWidth: '600px', 
    margin: '0 auto', 
    padding: '20px' 
  },
  title: { 
    textAlign: 'center', 
    color: '#2c3e50', 
    marginBottom: '30px',
    fontSize: '28px'
  },
  card: { 
    background: '#ffffff', 
    padding: '30px', 
    borderRadius: '12px', 
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)', 
    marginBottom: '20px' 
  },
  header: { 
    display: 'flex', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    marginBottom: '20px', 
    fontWeight: 'bold', 
    fontSize: '16px' 
  },
  scores: {
    display: 'flex',
    gap: '20px',
  },
  questionText: { 
    fontSize: '20px', 
    marginBottom: '25px', 
    lineHeight: '1.4',
    textAlign: 'center',
  },
  optionsGrid: { 
    display: 'grid', 
    gridTemplateColumns: '1fr 1fr', 
    gap: '15px', 
    marginBottom: '20px' 
  },
  optionButton: { 
    padding: '15px', 
    border: '2px solid #bdc3c7', 
    borderRadius: '8px', 
    fontSize: '16px', 
    cursor: 'pointer', 
    transition: 'all 0.2s',
    fontWeight: '500',
  },
  input: { 
    width: '100%', 
    padding: '12px', 
    margin: '10px 0', 
    borderRadius: '6px', 
    border: '1px solid #ddd', 
    fontSize: '16px',
    boxSizing: 'border-box',
  },
  button: { 
    width: '100%',
    padding: '12px 24px', 
    backgroundColor: '#3498db', 
    color: 'white', 
    border: 'none', 
    borderRadius: '6px', 
    fontSize: '16px', 
    cursor: 'pointer',
    fontWeight: 'bold',
  },
  select: {
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ddd',
    fontSize: '14px',
  },
  timeSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '15px 0',
    fontSize: '14px',
  },
  playersList: { 
    display: 'flex', 
    flexWrap: 'wrap', 
    gap: '10px', 
    marginTop: '20px', 
  },
  playerChip: { 
    background: '#ecf0f1', 
    padding: '8px 16px', 
    borderRadius: '20px', 
    fontSize: '14px', 
  },
  answerStatus: {
    textAlign: 'center',
    color: '#27ae60',
    fontSize: '16px',
    fontWeight: 'bold',
    marginTop: '15px',
  },
  waitingMessage: {
    textAlign: 'center',
    color: '#f39c12',
    fontSize: '16px',
    fontWeight: 'bold',
    marginTop: '15px',
    padding: '10px',
    backgroundColor: '#fef9e7',
    borderRadius: '6px',
  },
  finalScores: {
    marginBottom: '25px',
  },
  scoreItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '15px',
    margin: '8px 0',
    borderRadius: '8px',
    fontSize: '16px',
  },
};
