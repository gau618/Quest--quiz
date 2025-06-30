import React, { useState, useEffect } from 'react';
import axios from 'axios';

const copyText = async (text:string) => {
  try {
    await navigator.clipboard.writeText(text);
    alert('Copied to clipboard!');
  } catch (err) {
    alert('Failed to copy!');
  }
};


export function InviteManagement({ roomId, isAdmin }: { roomId: string; isAdmin: boolean }) {
  const [invites, setInvites] = useState<any[]>([]);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      fetchInvites();
    }
  }, [roomId, isAdmin]);

const fetchInvites = async () => {
  setLoading(true);
  try {
    const token = localStorage.getItem('gp_token');
    const { data } = await axios.get(`/api/chat/rooms/${roomId}/invites`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    setInvites(data);
  } catch (error: any) {
    console.error('Failed to fetch invites', error);
    // Handle error (e.g., show toast notification)
  } finally {
    setLoading(false);
  }
};

  const generateNewCode = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('gp_token');
      const { data } = await axios.post(
        `/api/chat/rooms/${roomId}/invites`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setNewCode(data.code);
      setInvites([data, ...invites]);
    } catch (error) {
      console.error('Failed to generate invite code', error);
    } finally {
      setLoading(false);
    }
  };

  const formatExpiration = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div style={styles.container}>
      <h4>Invite Codes</h4>
      
      {isAdmin && (
        <button 
          onClick={generateNewCode} 
          style={styles.generateButton}
          disabled={loading}
        >
          {loading ? 'Generating...' : 'Generate New Code'}
        </button>
      )}

      {newCode && (
        <div style={styles.newCodeContainer}>
          <p>New Invite Code:</p>
          <div style={styles.codeDisplay}>
            <strong>{newCode}</strong>
            <button
            onClick={() => copyText(newCode)}
            >copy</button>
          </div>
          <p>Expires in 24 hours</p>
        </div>
      )}

      <div style={styles.inviteList}>
        {invites.map(invite => (
          <div key={invite.id} style={styles.inviteItem}>
            <div style={styles.codeRow}>
              <strong>{invite.code}</strong>
              {invite.usedById ? (
                <span style={styles.usedBadge}>Used</span>
              ) : (
                <span style={styles.activeBadge}>Active</span>
              )}
            </div>
            <p>Expires: {formatExpiration(invite.expiresAt)}</p>
            {invite.usedById && (
              <p>Used by: {invite.usedBy?.username || 'Unknown'}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { marginTop: '20px', padding: '15px', borderTop: '1px solid #eee' },
  generateButton: {
    padding: '8px 16px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    marginBottom: '15px'
  },
  newCodeContainer: {
    backgroundColor: '#f0f9ff',
    padding: '10px',
    borderRadius: '8px',
    marginBottom: '15px'
  },
  codeDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '10px 0'
  },
  copyButton: {
    padding: '4px 8px',
    background: '#e0f2fe',
    border: '1px solid #bae6fd',
    borderRadius: '4px',
    cursor: 'pointer'
  },
  inviteList: { maxHeight: '200px', overflowY: 'auto' },
  inviteItem: {
    padding: '10px',
    borderBottom: '1px solid #f3f4f6',
  },
  codeRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  activeBadge: {
    background: '#dcfce7',
    color: '#166534',
    padding: '3px 8px',
    borderRadius: '12px',
    fontSize: '0.8rem'
  },
  usedBadge: {
    background: '#fee2e2',
    color: '#b91c1c',
    padding: '3px 8px',
    borderRadius: '12px',
    fontSize: '0.8rem'
  }
};
