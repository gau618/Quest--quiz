// src/pages/index.tsx
import { useState } from 'react';
import { QuickDuelGame } from '@/components/QuickDuelGame';
import { FastestFingerGame } from '@/components/FastestFingerGame';
import { PracticeModeGame } from '@/components/PracticeModeGame';

// Define Game Mode types for clarity and type safety
type GameModeSelection = 'quick_duel' | 'fastest_finger' | 'practice_mode' | null;

export default function Home() {
  const [selectedGame, setSelectedGame] = useState<GameModeSelection>(null);

  const buttonStyle: React.CSSProperties = {
    padding: '20px 40px',
    fontSize: '24px',
    cursor: 'pointer',
    borderRadius: '10px',
    border: '1px solid',
    backgroundColor: '#f0f4f8',
    color: '#333',
    transition: 'all 0.3s ease',
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
  };

  const backButtonStyle: React.CSSProperties = {
    marginTop: '30px', // Increased margin
    padding: '12px 25px', // Slightly larger padding
    fontSize: '18px', // Larger font
    cursor: 'pointer',
    borderRadius: '8px', // Consistent border radius
    border: '1px solid #007bff',
    backgroundColor: '#e7f3ff',
    color: '#007bff',
    transition: 'background-color 0.3s, color 0.3s',
  };

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '40px', textAlign: 'center', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '3rem', color: '#2c3e50', marginBottom: '50px' }}>
        🚀 Choose Your Game Mode!
      </h1>

      {!selectedGame && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '30px', marginTop: '50px' }}>
          <button
            onClick={() => setSelectedGame('quick_duel')}
            style={{ ...buttonStyle, borderColor: '#007bff', color: '#007bff' }}
          >
            ⚔️ Quick Duel (1v1)
          </button>
          <button
            onClick={() => setSelectedGame('fastest_finger')}
            style={{ ...buttonStyle, borderColor: '#28a745', color: '#28a745' }}
          >
            ⚡ Fastest Finger First
          </button>
          <button
            onClick={() => setSelectedGame('practice_mode')}
            style={{ ...buttonStyle, borderColor: '#ffc107', color: '#ffc107' }}
          >
            📚 Practice Mode (Solo)
          </button>
        </div>
      )}

      {selectedGame === 'quick_duel' && (
        <div>
          <button
            onClick={() => setSelectedGame(null)}
            style={backButtonStyle}
          >
            ← Back to Game Selection
          </button>
          <QuickDuelGame />
        </div>
      )}

      {selectedGame === 'fastest_finger' && (
        <div>
          <button
            onClick={() => setSelectedGame(null)}
            style={backButtonStyle}
          >
            ← Back to Game Selection
          </button>
          <FastestFingerGame />
        </div>
      )}

      {selectedGame === 'practice_mode' && (
        <div>
          <button
            onClick={() => setSelectedGame(null)}
            style={backButtonStyle}
          >
            ← Back to Game Selection
          </button>
          <PracticeModeGame />
        </div>
      )}
    </div>
  );
}
