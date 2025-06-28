'use client';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🏠 Welcome to the App</h1>
      <button style={styles.button} onClick={() => router.push('/game')}>🎮 Go to Game Page</button>
      <button style={styles.button} onClick={() => router.push('/friends')}>👥 Go to Friends Page</button>
      <button style={styles.button} onClick={() => router.push('/leaderboard')}> leaderboard </button>
       <button style={styles.button} onClick={() => router.push('/chatpage')}>chatpage</button>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '20px',
    paddingTop: '100px',
  },
  title: {
    fontSize: '2rem',
    marginBottom: '30px',
  },
  button: {
    padding: '12px 24px',
    fontSize: '1rem',
    cursor: 'pointer',
    borderRadius: '6px',
    background: '#0070f3',
    color: '#fff',
    border: 'none',
  },
};
