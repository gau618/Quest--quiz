import React, { useState } from 'react';
import axios from 'axios';
export function JoinGroupModal({ onClose, onJoin }: { onClose: () => void; onJoin: (room: any) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    
    setLoading(true);
    setError('');
    
    try {
      const token = localStorage.getItem('gp_token');
      if (!token) throw new Error('Missing authentication token');
      
      const response = await axios.post('/api/chat/rooms/join-by-code',
        { code: code.toUpperCase() }, // Ensure uppercase
        { 
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000 // 10-second timeout
        }
      );
      
      if (response.data.room) {
        onJoin(response.data.room);
        onClose();
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err: any) {
      let errorMsg = 'Failed to join group';
      
      if (err.response) {
        // Handle API response errors
        errorMsg = err.response.data?.error || `Server error: ${err.response.status}`;
      } else if (err.request) {
        // Handle network errors
        errorMsg = 'Network error. Please check your connection.';
      } else {
        // Handle other errors
        errorMsg = err.message || 'Unknown error occurred';
      }
      
      setError(errorMsg);
      console.error('Join group error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={modalStyles.overlay}>
      <div style={modalStyles.container}>
        <h2>Join Group with Code</h2>
        <form onSubmit={handleSubmit} style={modalStyles.form}>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="Enter invite code"
            style={modalStyles.input}
            required
          />
          
          {error && <p style={modalStyles.error}>{error}</p>}
          
          <div style={modalStyles.buttonGroup}>
            <button
              type="button"
              onClick={onClose}
              style={modalStyles.cancelButton}
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={modalStyles.submitButton}
              disabled={loading || !code.trim()}
            >
              {loading ? 'Joining...' : 'Join Group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const modalStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  container: {
    backgroundColor: 'white',
    padding: '25px',
    borderRadius: '10px',
    width: '400px',
    maxWidth: '90%',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
  },
  form: { marginTop: '20px' },
  input: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #ddd',
    fontSize: '16px',
    textTransform: 'uppercase',
    letterSpacing: '1px'
  },
  error: {
    color: '#ef4444',
    margin: '10px 0'
  },
  buttonGroup: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '10px',
    marginTop: '20px'
  },
  cancelButton: {
    padding: '10px 20px',
    backgroundColor: '#f3f4f6',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer'
  },
  submitButton: {
    padding: '10px 20px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer'
  }
};
