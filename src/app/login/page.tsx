'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import AuthService from '@/lib/services/auth.service';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await AuthService.login(email, password);

      if (result.success && result.data?.token) {
        const token = result.data.token;

        const headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        };

        // ✅ Avatar Signature
        await fetch('/api/onboarding/avatar-signature', {
          method: 'POST',
          headers,
          body: JSON.stringify({ fileType: 'image/jpeg' }),
        });

        // ✅ Profile Setup
        await fetch('/api/onboarding/progress', {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            step: 'profileSetup',
            data: {
              bio: 'I am a new trader interested in learning.',
              location: 'New York, USA',
              website: 'https://my-portfolio.com',
              avatarUrl:
                'https://www.spruson.com/app/uploads/2014/03/bigstock_Wah_Taj__760602.jpg', // Replace as needed
            },
          }),
        });

        router.push('/');
        router.refresh();
      } else {
        setError(result.message || 'Login failed.');
      }
    } catch (err: any) {
      console.error(err);
      setError('An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.pageContainer}>
      <div style={styles.formWrapper}>
        <form onSubmit={handleLogin} style={styles.formContainer}>
          <div style={styles.alertBox}>
            🔐 <strong>First Time Here?</strong><br />
            Please{' '}
            <a
              href="https://dev.tradeved.com/login"
              target="_blank"
              rel="noopener noreferrer"
              style={styles.link}
            >
              sign up here
            </a>{' '}
            first. After signing up, return to this page and log in.
          </div>

          <h1 style={styles.title}>Welcome Back</h1>
          <p style={styles.subtitle}>Log in to continue your journey.</p>

          <div style={styles.inputGroup}>
            <label htmlFor="email" style={styles.label}>Email Address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              style={styles.input}
            />
          </div>

          <div style={styles.inputGroup}>
            <label htmlFor="password" style={styles.label}>Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={styles.input}
            />
          </div>

          {error && <p style={styles.errorText}>{error}</p>}

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? <div className="button-loader" /> : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  pageContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    background: '#121212',
    color: '#e0e0e0',
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  formWrapper: {
    width: '100%',
    maxWidth: '420px',
    margin: '20px',
  },
  formContainer: {
    background: '#1e1e1e',
    padding: '40px',
    borderRadius: '16px',
    boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
    border: '1px solid #2a2a2a',
  },
  alertBox: {
    backgroundColor: '#232323',
    border: '1px solid #444',
    color: '#ccc',
    fontSize: '0.95rem',
    padding: '14px 16px',
    marginBottom: '25px',
    borderRadius: '8px',
    lineHeight: '1.6',
  },
  link: {
    color: '#4ea8ff',
    textDecoration: 'underline',
  },
  title: {
    textAlign: 'center',
    margin: '0 0 10px 0',
    fontSize: '2rem',
    fontWeight: 700,
    color: '#ffffff',
  },
  subtitle: {
    textAlign: 'center',
    margin: '0 0 35px 0',
    color: '#a0a0a0',
  },
  inputGroup: {
    marginBottom: '25px',
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontWeight: 500,
    color: '#c0c0c0',
    fontSize: '0.9rem',
  },
  input: {
    width: '100%',
    padding: '14px',
    borderRadius: '8px',
    border: '1px solid #333',
    fontSize: '1rem',
    background: '#2a2a2a',
    color: '#e0e0e0',
    outline: 'none',
  },
  errorText: {
    color: '#ff8a80',
    textAlign: 'center',
    margin: '0 0 20px 0',
    background: 'rgba(255, 138, 128, 0.1)',
    padding: '10px',
    borderRadius: '6px',
  },
  button: {
    width: '100%',
    padding: '14px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(90deg, #007bff, #0056b3)',
    color: 'white',
    fontWeight: 'bold',
    fontSize: '1rem',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
    boxShadow: '0 4px 15px rgba(0, 123, 255, 0.2)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
  },
};
