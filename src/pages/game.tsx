// src/pages/index.tsx
import React, { useState } from 'react';
import { QuickDuelGame } from '@/components/QuickDuelGame';
import { FastestFingerGame } from '@/components/FastestFingerGame';
import { PracticeModeGame } from '@/components/PracticeModeGame';
import { TimeAttackGame } from '@/components/TimeAttackGame';
import GroupPlay from '@/components/GroupPlay'; // NEW

type SelectedGameMode = 'none' | 'quick-duel' | 'fastest-finger' | 'practice' | 'time-attack' | 'group-play'; // NEW

const HomePage: React.FC = () => {
  const [selectedMode, setSelectedMode] = useState<SelectedGameMode>('none');

  const renderGameComponent = () => {
    switch (selectedMode) {
      case 'quick-duel': return <QuickDuelGame />;
      case 'fastest-finger': return <FastestFingerGame />;
      case 'practice': return <PracticeModeGame />;
      case 'time-attack': return <TimeAttackGame />;
      case 'group-play': return <GroupPlay onClose={() => setSelectedMode('none')} />; // NEW
      default:
        return (
          <div style={styles.container}>
            <h1 style={styles.title}>🚀 Choose Your Game Mode!</h1>
            <div style={styles.buttonGroup}>
              <button style={styles.modeButton} onClick={() => setSelectedMode('quick-duel')}>⚡ Quick Duel</button>
              <button style={styles.modeButton} onClick={() => setSelectedMode('fastest-finger')}>🔥 Fastest Finger</button>
              <button style={styles.modeButton} onClick={() => setSelectedMode('practice')}>📚 Practice Mode</button>
              <button style={styles.modeButton} onClick={() => setSelectedMode('time-attack')}>⏰ Time Attack</button>
              <button style={styles.modeButton} onClick={() => setSelectedMode('group-play')}>👥 Group Play</button> {/* NEW */}
            </div>
          </div>
        );
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      {selectedMode !== 'none' && (
        <button style={styles.backButton} onClick={() => setSelectedMode('none')}>← Back to Game Selection</button>
      )}
      {renderGameComponent()}
    </div>
  );
};

export default HomePage;

const styles: { [key: string]: React.CSSProperties } = {
  container: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' },
  title: { fontSize: '2.5rem', marginBottom: '40px', color: '#333' },
  buttonGroup: { display: 'flex', flexDirection: 'column', gap: '20px', width: '300px' },
  modeButton: { padding: '15px 20px', fontSize: '1.2rem', cursor: 'pointer', borderRadius: '8px', border: '1px solid #ddd', background: '#fff', transition: 'all 0.2s' },
  backButton: { position: 'absolute', top: '20px', left: '20px', background: 'none', border: 'none', fontSize: '1rem', cursor: 'pointer' },
};
