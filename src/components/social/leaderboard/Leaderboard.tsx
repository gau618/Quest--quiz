// src/components/social/leaderboard/Leaderboard.tsx
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';

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

// Helper to get token from localStorage safely on the client
const getToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('gp_token');
};

// Helper to get userId. For this example, we'll assume it's also stored.
// In a real app, you would get this from decoding the JWT or from an auth context.
const getUserId = () => {
  if (typeof window === 'undefined') return null;
  // Replace this with your actual method of getting the user's ID
  return localStorage.getItem('gp_userId'); 
};


export function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [type, setType] = useState<LeaderboardType>('global');
  const [orderBy, setOrderBy] = useState<OrderByType>('eloRating');

  // Memoize current user ID to avoid re-running effects unnecessarily
  const currentUserId = useMemo(() => getUserId(), []);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setLoading(true);
      setError(null);
      
      let url = '';
      const headers: { [key: string]: string } = {};

      if (type === 'global') {
        url = `/api/leaderboard/global?orderBy=${orderBy}`;
      } else if (type === 'friends') {
        const token = getToken();
        if (!token) {
          setError('You must be logged in to view the friends leaderboard.');
          setLoading(false);
          return;
        }
        url = `/api/leaderboard/friends?orderBy=${orderBy}`;
        headers['Authorization'] = `Bearer ${token}`;
      }

      try {
        const { data } = await axios.get(url, { headers });
        const rankedLeaderboard = data.leaderboard.map(
          (entry: LeaderboardEntryData, index: number) => ({
            ...entry,
            rank: index + 1,
          })
        );
        setLeaderboard(rankedLeaderboard);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load leaderboard data.');
      } finally {
        setLoading(false);
      }
    };

    fetchLeaderboard();
  }, [type, orderBy]); // Re-fetch only when type or orderBy changes

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '20px', maxWidth: '600px', margin: 'auto', border: '1px solid #ddd', borderRadius: '8px' }}>
      <h2>Leaderboard</h2>

      <div style={{ marginBottom: '15px', display: 'flex', gap: '10px' }}>
        <select value={type} onChange={(e) => setType(e.target.value as LeaderboardType)} style={{ padding: '8px' }}>
          <option value="global">Global</option>
          <option value="friends">Friends</option>
        </select>
        <select value={orderBy} onChange={(e) => setOrderBy(e.target.value as OrderByType)} style={{ padding: '8px' }}>
          <option value="eloRating">By ELO Rating</option>
          <option value="xp">By XP</option>
        </select>
      </div>

      {loading && <p>Loading leaderboard...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}

      {!loading && !error && leaderboard.length === 0 && <p>No data available for this leaderboard.</p>}

      {!loading && !error && leaderboard.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f2f2f2' }}>
              <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'left' }}>Rank</th>
              <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'left' }}>Player</th>
              <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'right' }}>{orderBy === 'eloRating' ? 'ELO' : 'XP'}</th>
              <th style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'right' }}>Level</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((entry) => (
              <tr key={entry.userId} style={{ background: entry.userId === currentUserId ? '#e0f7fa' : 'white' }}>
                <td style={{ padding: '10px', border: '1px solid #ddd' }}>{entry.rank}</td>
                <td style={{ padding: '10px', border: '1px solid #ddd', display: 'flex', alignItems: 'center' }}>
                  {entry.avatarUrl && <img src={entry.avatarUrl} alt="Avatar" style={{ width: '30px', height: '30px', borderRadius: '50%', marginRight: '10px' }} />}
                  <span>{entry.username || entry.name || 'Unknown User'}</span>
                </td>
                <td style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'right', fontWeight: 'bold' }}>
                  {orderBy === 'eloRating' ? entry.eloRating : entry.xp}
                </td>
                <td style={{ padding: '10px', border: '1px solid #ddd', textAlign: 'right' }}>{entry.level}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
