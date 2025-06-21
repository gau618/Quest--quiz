// src/components/QuickDuelGame.tsx
import React, { useState, useEffect, useMemo } from 'react';
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

// --- TYPE DEFINITIONS ---
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

// --- HELPER COMPONENT: RESULTS GRAPH ---
interface ResultsGraphProps {
  players: Player[];
  results: Record<string, AnswerData[]>;
}

const ResultsGraph: React.FC<ResultsGraphProps> = ({ players, results }) => {
  const PLAYER_COLORS = ['#36A2EB', '#FF6384', '#4BC0C0', '#FFCD56'];
  const getPointColor = (action: string, correct?: boolean) => {
    if (action === 'answered') return correct ? 'rgba(40, 167, 69, 1)' : 'rgba(220, 53, 69, 1)';
    if (action === 'skipped') return 'rgba(255, 193, 7, 1)';
    return 'rgba(108, 117, 125, 1)';
  };

  const chartData = useMemo(() => {
    const maxQuestions = Math.max(...Object.values(results).map(pResults => pResults.length), 0);
    const labels = Array.from({ length: maxQuestions }, (_, i) => `Q${i + 1}`);

    const datasets = players.map((player, index) => {
      const playerData = results[player.participantId] || [];
      return {
        label: player.username || player.userId.slice(0, 5),
        data: labels.map((_, qIndex) => playerData[qIndex] ? playerData[qIndex].timeTaken / 1000 : null),
        borderColor: PLAYER_COLORS[index % PLAYER_COLORS.length],
        backgroundColor: PLAYER_COLORS[index % PLAYER_COLORS.length],
        fill: false, tension: 0.1, pointRadius: 6, pointHoverRadius: 8,
        pointBackgroundColor: playerData.map(res => getPointColor(res.action, res.correct)),
      };
    });
    return { labels, datasets };
  }, [players, results]);

  const chartOptions: any = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' },
      title: { display: true, text: 'Performance Analysis: Time per Question', font: { size: 18 } },
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
            if(resultData.action === 'answered') status = resultData.correct ? 'Correct' : 'Incorrect';
            return `${playerLabel}: ${timeTaken.toFixed(2)}s (${status})`;
          },
        },
      },
    },
    scales: { y: { beginAtZero: true, title: { display: true, text: 'Time Taken (seconds)' } }, x: { title: { display: true, text: 'Question Number' } } },
  };

  return <div style={{ position: 'relative', height: '400px', marginTop: '30px' }}><Line options={chartOptions} data={chartData} /></div>;
};

// --- HELPER COMPONENT: AVATAR ---
const PlayerAvatar: React.FC<{ player: Player }> = ({ player }) => {
    const initial = player.username ? player.username.charAt(0).toUpperCase() : '?';
    if (player.avatarUrl) {
        return <img src={player.avatarUrl} alt={player.username} style={styles.avatar} />;
    }
    return <div style={styles.avatar}>{initial}</div>;
};

// --- MAIN COMPONENT ---
export const QuickDuelGame = () => {
  const [userId, setUserId] = useState('');
  const [jwtToken, setJwtToken] = useState('');
  const [gameStatus, setGameStatus] = useState<GameStatus>('idle');
  const [socket, setSocket] = useState<Socket | null>(null);
  const [waitingMessage, setWaitingMessage] = useState<string | null>(null);
  const [playerInfo, setPlayerInfo] = useState<{ userId: string; participantId: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [gameResults, setGameResults] = useState<Record<string, AnswerData[]> | null>(null);
  const [playersInGame, setPlayersInGame] = useState<Player[]>([]);
  const [timeLimit, setTimeLimit] = useState<1 | 2 | 5>(2);
  const [timer, setTimer] = useState(0);

  const handleFindMatch = async () => {
    if (!jwtToken || !userId) return;
    setGameStatus('searching');
    try {
      const response = await fetch('/api/duel/find-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwtToken}` },
        body: JSON.stringify({ duration: timeLimit }),
      });
      if (!response.ok) setGameStatus('idle');
    } catch (error) { setGameStatus('idle'); }
  };

  const handleAnswerClick = (optionId: string) => {
    if (socket && playerInfo && sessionId && currentQuestion) {
      socket.emit('answer:submit', { sessionId, participantId: playerInfo.participantId, questionId: currentQuestion.id, optionId });
      setCurrentQuestion(null);
    }
  };

  const handleSkipClick = () => {
    if (socket && playerInfo && sessionId) {
      socket.emit('question:skip', { sessionId, participantId: playerInfo.participantId });
      setCurrentQuestion(null);
    }
  };

  const resetGame = () => {
    setGameStatus('idle'); setSessionId(null); setCurrentQuestion(null); setScores({});
    setGameResults(null); setPlayerInfo(null); setPlayersInGame([]); setWaitingMessage(null); setTimer(0);
  };
  
  const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;

  useEffect(() => {
    if (!userId) return;
    const newSocket = io(SOCKET_SERVER_URL, { query: { userId }, reconnection: false });
    newSocket.on('connect', () => {});
    newSocket.on('disconnect', () => {});
    newSocket.on('connect_error', () => setGameStatus('idle'));
    
    newSocket.on('match:found', (data: { sessionId: string; players: Player[], duration: number }) => {
      const myInfo = data.players.find(p => p.userId === userId);
      if (myInfo) {
        setPlayerInfo({ userId: myInfo.userId, participantId: myInfo.participantId });
        setSessionId(data.sessionId);
        setGameStatus('playing');
        setPlayersInGame(data.players);
        setTimer(data.duration * 60);
        setScores(data.players.reduce((acc, p) => ({ ...acc, [p.participantId]: 0 }), {}));
        newSocket.emit('game:register-participant', { participantId: myInfo.participantId });
        newSocket.emit('game:join', { sessionId: data.sessionId, participantId: myInfo.participantId });
      } else {
        setGameStatus('idle');
      }
    });

    const questionHandler = (question: Question) => { setCurrentQuestion(question); setWaitingMessage(null); };
    newSocket.on('question:new', questionHandler);
    newSocket.on('score:update', (newScores) => setScores(newScores));
    newSocket.on('participant:finished', () => { setCurrentQuestion(null); setWaitingMessage('You finished! Waiting for opponent...'); });
    newSocket.on('game:end', (data) => {
      if (data.results) { setGameResults(data.results); }
      setScores(data.scores); setGameStatus('finished'); setCurrentQuestion(null); setWaitingMessage(null);
    });

    setSocket(newSocket);
    return () => { newSocket.disconnect(); };
  }, [userId]);

  useEffect(() => {
    if (gameStatus !== 'playing' || timer <= 0) return;
    const interval = setInterval(() => setTimer(prev => prev - 1), 1000);
    return () => clearInterval(interval);
  }, [gameStatus, timer]);
  
  const me = playersInGame.find(p => p.userId === userId);
  const opponent = playersInGame.find(p => p.userId !== userId);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🏆 Ranked Quick Duel</h1>

      {gameStatus === 'idle' && (
        <div style={styles.card}>
          <div style={styles.inputGroup}>
            <input type="text" placeholder="Enter JWT token" value={jwtToken} onChange={e => setJwtToken(e.target.value)} style={styles.input} />
            <input type="text" placeholder="Enter your user ID" value={userId} onChange={e => setUserId(e.target.value)} style={styles.input} />
          </div>
          <div style={styles.settingsGroup}>
            <label style={styles.label}>Game Duration:</label>
            <select value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value) as 1 | 2 | 5)} style={styles.select}>
              <option value={1}>1 Minute</option>
              <option value={2}>2 Minutes</option>
              <option value={5}>5 Minutes</option>
            </select>
          </div>
          <button onClick={handleFindMatch} style={styles.button}>Find Match</button>
        </div>
      )}

      {gameStatus === 'searching' && <div style={styles.card}><h2 style={styles.statusHeader}>🔍 Finding Match...</h2></div>}

      {gameStatus === 'playing' && (
        <div style={styles.card}>
          <div style={styles.gameHeader}>
            <div style={styles.playerDisplay}>
              {me && <PlayerAvatar player={me} />}
              <div style={styles.playerText}>
                <span>{me?.username || 'You'}</span>
                <strong>{me ? scores[me.participantId] || 0 : 0}</strong>
              </div>
            </div>
            <div style={styles.timerDisplay}>
              <span>Time Left</span>
              <strong>{formatTime(timer)}</strong>
            </div>
            <div style={styles.playerDisplay}>
              <div style={styles.playerTextRight}>
                <span>{opponent?.username || 'Opponent'}</span>
                <strong>{opponent ? scores[opponent.participantId] || 0 : 0}</strong>
              </div>
              {opponent && <PlayerAvatar player={opponent} />}
            </div>
          </div>
          
          {currentQuestion ? (
            <div style={styles.questionArea}>
              <h2 style={styles.questionText}>{currentQuestion.text}</h2>
              <div style={styles.optionsGrid}>
                {currentQuestion.options.map((option) => (
                  <button key={option.id} onClick={() => handleAnswerClick(option.id)} style={styles.optionButton}>{option.text}</button>
                ))}
              </div>
              <button onClick={handleSkipClick} style={styles.skipButton}>Skip Question</button>
            </div>
          ) : (
            <p style={styles.statusText}>{waitingMessage || 'Waiting for next question...'}</p>
          )}
        </div>
      )}

      {gameStatus === 'finished' && (
        <div style={styles.card}>
          <h2 style={styles.statusHeader}>🏁 Game Over!</h2>
          <h3 style={styles.finalScoresHeader}>Final Scores</h3>
          <div style={styles.scoreBoard}>
              <span>{me?.username || 'You'}: {me ? scores[me.participantId] || 0 : 0}</span>
              <span>{opponent?.username || 'Opponent'}: {opponent ? scores[opponent.participantId] || 0 : 0}</span>
          </div>
          {gameResults && <ResultsGraph players={playersInGame} results={gameResults} />}
          <button onClick={resetGame} style={{ ...styles.button, marginTop: '20px' }}>Play Again</button>
        </div>
      )}
    </div>
  );
};

// --- STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
  container: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif', maxWidth: '800px', margin: '40px auto', padding: '20px', color: '#333' },
  title: { textAlign: 'center', color: '#2c3e50', marginBottom: '30px' },
  card: { background: '#ffffff', padding: '30px', borderRadius: '16px', boxShadow: '0 8px 40px rgba(0,0,0,0.08)' },
  inputGroup: { marginBottom: '20px' },
  input: { width: '100%', boxSizing: 'border-box', padding: '12px 15px', margin: '8px 0', border: '1px solid #ddd', borderRadius: '8px', fontSize: '16px' },
  settingsGroup: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: '25px' },
  label: { fontWeight: 500, marginBottom: '8px' },
  select: { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '16px', background: 'white' },
  button: { width: '100%', padding: '15px', border: 'none', background: 'linear-gradient(90deg, #36D1DC 0%, #5B86E5 100%)', color: 'white', borderRadius: '8px', cursor: 'pointer', fontSize: '18px', fontWeight: 'bold', transition: 'transform 0.2s, box-shadow 0.2s' },
  statusHeader: { textAlign: 'center', color: '#2c3e50', fontSize: '24px' },
  gameHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px', paddingBottom: '20px', borderBottom: '1px solid #eee' },
  playerDisplay: { display: 'flex', alignItems: 'center', gap: '15px' },
  playerText: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start' },
  playerTextRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
  avatar: { width: '50px', height: '50px', borderRadius: '50%', background: '#e9ecef', color: '#495057', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 'bold' },
  timerDisplay: { textAlign: 'center' },
  questionArea: { animation: 'fadeIn 0.5s' },
  questionText: { fontSize: '24px', margin: '20px 0 30px', minHeight: '70px', textAlign: 'center', fontWeight: 500 },
  optionsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' },
  optionButton: { padding: '18px', border: '2px solid #ddd', background: 'white', borderRadius: '10px', cursor: 'pointer', fontSize: '16px', textAlign: 'center', transition: 'all 0.2s ease', fontWeight: 500 },
  skipButton: { width: '100%', padding: '12px', border: 'none', background: '#ffc107', color: '#212529', borderRadius: '8px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', marginTop: '10px' },
  statusText: { fontSize: '18px', color: '#555', padding: '40px 0', fontStyle: 'italic' },
  finalScoresHeader: { textAlign: 'center', marginTop: '30px', color: '#333' },
  scoreBoard: { display: 'flex', justifyContent: 'space-around', fontSize: '22px', fontWeight: 'bold', background: '#f8f9fa', padding: '20px', borderRadius: '10px', margin: '10px 0 20px 0' },
};

