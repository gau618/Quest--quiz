// src/components/social/chat/AddMemberModal.tsx
import React, { useState } from 'react';
import axios from 'axios';
import { socket } from '@/lib/socket'; // Import the shared socket instance

interface AddMemberModalProps {
  roomId: string;
  onClose: () => void;
}

// Define a clear type for the user search result
interface UserSearchResult {
  id: string; // This is the UserProfile ID
  username: string;
  avatarUrl?: string;
}

export function AddMemberModal({ roomId, onClose }: AddMemberModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchMessage, setSearchMessage] = useState('Enter a username to search for users to add.');

  // Function to search for users to add
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    
    setLoading(true);
    setError('');
    setSearchMessage('Searching...');
    setSearchResults([]);
    setSelectedUser(null);
    
    try {
      const token = localStorage.getItem('gp_token');
      // This API endpoint should ideally search for users NOT already in the group
      const { data } = await axios.get(`/api/user/search?query=${searchTerm}&excludeRoomId=${roomId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (data.users.length === 0) {
        setSearchMessage('No users found matching your search.');
      }
      setSearchResults(data.users);

    } catch (err) {
      setError('Failed to search for users. Please try again.');
      setSearchMessage('');
    } finally {
      setLoading(false);
    }
  };

  // Add the member by emitting a socket event
  const handleAddMember = () => {
    if (!selectedUser || !socket.connected) {
      setError('Please select a user and ensure you are connected.');
      return;
    }
     console.log(selectedUser)
    setLoading(true);
    setError('');

    // Emit the event to the server. The server will handle security and broadcasting.
    socket.emit("chat:add_member", {
      roomId: roomId,
      userId: selectedUser.id, // The UserProfile ID of the user to add
    });
    
    // The modal can be closed immediately. The UI will update via a separate broadcast event.
    onClose();
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.container} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Add Member to Group</h2>
          <button onClick={onClose} style={styles.closeButton}>&times;</button>
        </div>
        
        <form onSubmit={handleSearch} style={styles.searchForm}>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by username..."
            style={styles.input}
            disabled={loading}
          />
          <button type="submit" style={styles.searchButton} disabled={loading}>
            {loading && !searchResults.length ? '...' : 'Search'}
          </button>
        </form>

        <div style={styles.resultsContainer}>
          {searchResults.length > 0 ? (
            searchResults.map(user => (
              <div
                key={user.id}
                onClick={() => setSelectedUser(user)}
                style={selectedUser?.id === user.id ? styles.resultItemSelected : styles.resultItem}
              >
                <img src={user.avatarUrl || `https://api.dicebear.com/8.x/initials/svg?seed=${user.username}`} alt={user.username} style={styles.avatar} />
                <span style={styles.username}>{user.username}</span>
              </div>
            ))
          ) : (
            <p style={styles.searchMessageText}>{searchMessage}</p>
          )}
        </div>

        {error && <p style={styles.errorText}>{error}</p>}

        <div style={styles.buttonGroup}>
          <button onClick={onClose} style={styles.cancelButton} disabled={loading}>Cancel</button>
          <button onClick={handleAddMember} style={styles.addButton} disabled={!selectedUser || loading}>
            {loading ? 'Adding...' : 'Add Selected User'}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- BEST UI STYLES ---
const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
  },
  container: {
    background: 'white',
    padding: '24px',
    borderRadius: '12px',
    width: '480px',
    maxWidth: '90%',
    boxShadow: '0 8px 30px rgba(0,0,0,0.2)',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid #eee',
    paddingBottom: '16px',
    marginBottom: '8px'
  },
  title: {
    margin: 0,
    fontSize: '1.4rem',
    fontWeight: 600
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '1.8rem',
    lineHeight: '1',
    cursor: 'pointer',
    color: '#888'
  },
  searchForm: {
    display: 'flex',
    gap: '10px'
  },
  input: {
    flex: 1,
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #ccc',
    fontSize: '1rem'
  },
  searchButton: {
    padding: '0 20px',
    border: 'none',
    borderRadius: '8px',
    background: '#f0f0f0',
    fontWeight: 500,
    cursor: 'pointer'
  },
  resultsContainer: {
    minHeight: '200px',
    maxHeight: '250px',
    overflowY: 'auto',
    border: '1px solid #eee',
    borderRadius: '8px',
    padding: '8px',
    background: '#f8f9fa'
  },
  resultItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 0.2s'
  },
  resultItemSelected: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px',
    borderRadius: '6px',
    cursor: 'pointer',
    background: '#e0f2ff',
    border: '1px solid #b3e0ff'
  },
  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    objectFit: 'cover'
  },
  username: {
    fontWeight: 500
  },
  searchMessageText: {
    display: 'flex',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#888',
    fontStyle: 'italic'
  },
  errorText: {
    color: '#dc3545',
    textAlign: 'center',
    background: '#f8d7da',
    padding: '10px',
    borderRadius: '6px',
    border: '1px solid #f5c6cb'
  },
  buttonGroup: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    paddingTop: '16px',
    borderTop: '1px solid #eee'
  },
  cancelButton: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: '1px solid #ccc',
    background: '#fff',
    cursor: 'pointer',
    fontWeight: 500
  },
  addButton: {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    background: '#007bff',
    color: 'white',
    cursor: 'pointer',
    fontWeight: 600
  },
};
