// src/pages/index.tsx
import { useState } from 'react';
import { QuickDuelGame } from '@/components/QuickDuelGame';
import { FastestFingerGame } from '@/components/FastestFingerGame';

export default function Home() {
  const [selectedGame, setSelectedGame] = useState<'quick_duel' | 'FASTEST_FINGER_FIRST' | null>(null);

  return (
    <div style={{ fontFamily: 'sans-serif', padding: '20px', textAlign: 'center' }}>
      <h1>Choose your game mode!</h1>

      {!selectedGame && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '50px' }}>
          <button 
            onClick={() => setSelectedGame('quick_duel')} 
            style={{ padding: '20px 40px', fontSize: '24px', cursor: 'pointer', borderRadius: '10px', border: '1px solid #007bff', backgroundColor: '#e7f3ff', color: '#007bff' }}
          >
            Quick Duel (1v1)
          </button>
          <button 
            onClick={() => setSelectedGame('FASTEST_FINGER_FIRST')} 
            style={{ padding: '20px 40px', fontSize: '24px', cursor: 'pointer', borderRadius: '10px', border: '1px solid #28a745', backgroundColor: '#e6ffe6', color: '#28a745' }}
          >
            Fastest Finger
          </button>
        </div>
      )}

      {selectedGame === 'quick_duel' && (
        <div>
          <button 
            onClick={() => setSelectedGame(null)} 
            style={{ marginTop: '20px', padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
          >
            ← Back to Game Selection
          </button>
          <QuickDuelGame />
        </div>
      )}

      {selectedGame === 'FASTEST_FINGER_FIRST' && (
        <div>
          <button 
            onClick={() => setSelectedGame(null)} 
            style={{ marginTop: '20px', padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}
          >
            ← Back to Game Selection
          </button>
          <FastestFingerGame />
        </div>
      )}
    </div>
  );
}
