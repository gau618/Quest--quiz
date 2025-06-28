// src/components/social/friends/FriendSearch.tsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

// --- Type Definitions ---
interface UserSearchResult {
  userId: string;
  username: string;
  avatarUrl?: string;
  friendshipStatus: 'FRIENDS' | 'REQUEST_SENT' | 'REQUEST_RECEIVED' | 'NONE';
}

// --- Custom Hook for Debouncing ---
const useDebounce = (value: string, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
};

// --- Main Component ---
export function FriendSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('Enter a username to find friends.');

  const debouncedQuery = useDebounce(query, 500); // 500ms delay

  const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem('gp_token') : null);

  const handleSearch = useCallback(async (searchQuery: string) => {
    const token = getToken();
    if (!token) {
      setMessage('Authentication required.');
      return;
    }
    if (searchQuery.length < 2) {
      setResults([]);
      setMessage('Enter at least 2 characters to search.');
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      const { data } = await axios.get(`/api/friends/search?query=${searchQuery}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setResults(data.users);
      if (data.users.length === 0) {
        setMessage('No users found matching your search.');
      }
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'An error occurred during search.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    handleSearch(debouncedQuery);
  }, [debouncedQuery, handleSearch]);

  const handleSendRequest = async (receiverId: string) => {
    const token = getToken();
    if (!token) return;

    // Optimistic UI update: change the button state immediately
    setResults(prevResults =>
      prevResults.map(user =>
        user.userId === receiverId ? { ...user, friendshipStatus: 'REQUEST_SENT' } : user
      )
    );

    try {
      await axios.post('/api/friends/requests', { receiverId }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // On success, the optimistic state is correct.
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Failed to send request.');
      // Revert on error
      setResults(prevResults =>
        prevResults.map(user =>
          user.userId === receiverId ? { ...user, friendshipStatus: 'NONE' } : user
        )
      );
    }
  };

  const getButtonState = (user: UserSearchResult) => {
    switch (user.friendshipStatus) {
      case 'FRIENDS':
        return <button style={styles.buttonDisabled} disabled>Friends</button>;
      case 'REQUEST_SENT':
        return <button style={styles.buttonDisabled} disabled>Request Sent</button>;
      case 'REQUEST_RECEIVED':
        return <button style={styles.buttonPrimary}>Respond to Request</button>; // Should link to requests list
      default:
        return <button onClick={() => handleSendRequest(user.userId)} style={styles.buttonPrimary}>Add Friend</button>;
    }
  };

  return (
    <div style={styles.container}>
      <h4 style={styles.title}>Find Friends</h4>
      <div style={styles.inputWrapper}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by username..."
          style={styles.input}
        />
        {isLoading && <span style={styles.loader}></span>}
      </div>
      
      <ul style={styles.resultsList}>
        {results.length > 0 ? (
          results.map((user) => (
            <li key={user.userId} style={styles.resultItem}>
              <img 
                src={user.avatarUrl || `https://api.dicebear.com/8.x/initials/svg?seed=${user.username}`} 
                alt={user.username} 
                style={styles.avatar} 
              />
              <span style={styles.username}>{user.username}</span>
              {getButtonState(user)}
            </li>
          ))
        ) : (
          <p style={styles.messageText}>{message}</p>
        )}
      </ul>
    </div>
  );
}

// --- Best UI Styles ---
const styles: { [key: string]: React.CSSProperties } = {
  container: { background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', margin: '20px 0' },
  title: { margin: '0 0 16px 0', fontSize: '1.25rem', fontWeight: 600 },
  inputWrapper: { position: 'relative', display: 'flex', alignItems: 'center' },
  input: { width: '100%', padding: '12px 16px', fontSize: '1rem', borderRadius: '8px', border: '1px solid #ccc' },
  loader: { position: 'absolute', right: '16px', width: '20px', height: '20px', border: '3px solid #f3f3f3', borderTop: '3px solid #007bff', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  resultsList: { listStyle: 'none', padding: 0, margin: '16px 0 0 0', maxHeight: '300px', overflowY: 'auto' },
  resultItem: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderBottom: '1px solid #eee' },
  avatar: { width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' },
  username: { flex: 1, fontWeight: 500 },
  buttonPrimary: { padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#007bff', color: 'white', fontWeight: 600, cursor: 'pointer' },
  buttonDisabled: { padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#e9ecef', color: '#6c757d', cursor: 'not-allowed' },
  messageText: { textAlign: 'center', color: '#888', padding: '20px' },
};


