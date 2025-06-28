// src/components/social/leaderboard/Leaderboard.tsx
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';

// --- Type Definitions ---
interface LeaderboardEntryData {
  userId: string;
  username?: string;
  name?: string;
  avatarUrl?: string;
  eloRating: number;
  xp: number;
  level: number;
}

interface LeaderboardEntry extends LeaderboardEntryData {
  rank: number;
}

type LeaderboardType = 'global' | 'friends';
type OrderByType = 'eloRating' | 'xp';

// --- Helper Functions ---
const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem('gp_token') : null);
const getUserId = () => (typeof window !== 'undefined' ? localStorage.getItem('gp_userId') : null);

// --- Main Component ---
export function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<LeaderboardType>('global');
  const [orderBy, setOrderBy] = useState<OrderByType>('eloRating');

  const currentUserId = useMemo(() => getUserId(), []);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      setError(null);
      
      let url = `/api/leaderboard/${type}?orderBy=${orderBy}`;
      const headers: { [key: string]: string } = {};

      if (type === 'friends') {
        const token = getToken();
        if (!token) {
          setError('You must be logged in to view the friends leaderboard.');
          setLoading(false);
          return;
        }
        headers['Authorization'] = `Bearer ${token}`;
      }

      try {
        const { data } = await axios.get(url, { headers });
        const rankedLeaderboard = data.leaderboard.map(
          (entry: LeaderboardEntryData, index: number) => ({ ...entry, rank: index + 1 })
        );
        setLeaderboard(rankedLeaderboard);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load leaderboard data.');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [type, orderBy]);

  const getRankIcon = (rank: number) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h2 style={styles.title}>Leaderboard</h2>
        <div style={styles.filterGroup}>
          <div style={styles.toggleSwitch}>
            <button onClick={() => setType('global')} style={toggleButtonStyle(type === 'global')}>Global</button>
            <button onClick={() => setType('friends')} style={toggleButtonStyle(type === 'friends')}>Friends</button>
          </div>
          <div style={styles.toggleSwitch}>
            <button onClick={() => setOrderBy('eloRating')} style={toggleButtonStyle(orderBy === 'eloRating')}>ELO</button>
            <button onClick={() => setOrderBy('xp')} style={toggleButtonStyle(orderBy === 'xp')}>XP</button>
          </div>
        </div>
      </header>

      {loading && <div className="leaderboard-loader" />}
      {error && <p style={styles.errorText}>Error: {error}</p>}

      {!loading && !error && (
        leaderboard.length > 0 ? (
          <ul style={styles.list}>
            {leaderboard.map((entry) => (
              <li key={entry.userId} style={{...styles.listItem, ...(entry.userId === currentUserId ? styles.currentUserItem : {})}}>
                <div style={rankStyle(entry.rank)}>
                  {getRankIcon(entry.rank)}
                </div>
                <img
                  src={entry.avatarUrl || `https://api.dicebear.com/8.x/initials/svg?seed=${entry.username || entry.name}`}
                  alt={entry.username || 'Avatar'}
                  style={styles.avatar}
                />
                <div style={styles.playerInfo}>
                  <span style={styles.playerName}>{entry.username || entry.name || 'Unknown User'}</span>
                  <span style={styles.playerLevel}>Level {entry.level}</span>
                </div>
                <div style={styles.score}>
                  {orderBy === 'eloRating' ? entry.eloRating.toLocaleString() : entry.xp.toLocaleString()}
                  <span style={styles.scoreLabel}>{orderBy === 'eloRating' ? ' ELO' : ' XP'}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p style={styles.emptyState}>No data available for this leaderboard.</p>
        )
      )}
    </div>
  );
}

// --- Best UI Styles ---
const styles: { [key: string]: React.CSSProperties } = {
  container: { fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' },
  title: { margin: 0, fontSize: '1.75rem', fontWeight: 700 },
  filterGroup: { display: 'flex', gap: '12px' },
  toggleSwitch: { display: 'flex', background: '#f0f2f5', borderRadius: '8px', padding: '4px' },
  list: { listStyle: 'none', padding: 0, margin: 0 },
  listItem: { display: 'flex', alignItems: 'center', padding: '12px', borderRadius: '8px', transition: 'background-color 0.2s', marginBottom: '8px' },
  currentUserItem: { backgroundColor: '#e7f3ff', border: '1px solid #007bff' },
  avatar: { width: '45px', height: '45px', borderRadius: '50%', objectFit: 'cover', background: '#eee', marginRight: '16px' },
  playerInfo: { flex: 1, display: 'flex', flexDirection: 'column' },
  playerName: { fontWeight: 600, fontSize: '1rem' },
  playerLevel: { color: '#65676b', fontSize: '0.85rem' },
  score: { fontSize: '1.1rem', fontWeight: 'bold' },
  scoreLabel: { fontSize: '0.8rem', fontWeight: 'normal', color: '#65676b' },
  errorText: { color: '#d93025', fontWeight: 'bold', textAlign: 'center' },
  emptyState: { textAlign: 'center', color: '#888', padding: '40px 0' },
};

const toggleButtonStyle = (isActive: boolean): React.CSSProperties => ({
  padding: '8px 16px',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: isActive ? 600 : 400,
  background: isActive ? '#fff' : 'transparent',
  color: isActive ? '#007bff' : '#333',
  boxShadow: isActive ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
});

const rankStyle = (rank: number): React.CSSProperties => {
  const baseStyle: React.CSSProperties = {
    width: '40px',
    textAlign: 'center',
    fontSize: '1.2rem',
    fontWeight: 'bold',
    marginRight: '16px',
  };
  if (rank === 1) return { ...baseStyle, color: '#FFD700' }; // Gold
  if (rank === 2) return { ...baseStyle, color: '#C0C0C0' }; // Silver
  if (rank === 3) return { ...baseStyle, color: '#CD7F32' }; // Bronze
  return baseStyle;
};
