// src/components/social/friends/FriendSearch.tsx
import React, { useState } from 'react';
import axios from 'axios';

interface UserSearchResult {
  userId: string;
  username: string;
  avatarUrl?: string;
}

export function FriendSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [message, setMessage] = useState('');

  // Helper to get the token from localStorage
  const getToken = () => {
    // This function can only be called in a browser environment.
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('gp_token'); // Retrieves the token from localStorage[2][5]
  };

  const handleSearch = async () => {
    const token = getToken();
    if (!token) {
      setMessage('Authentication token not found. Please log in.');
      return;
    }
    if (query.length < 2) {
      setMessage('Please enter at least 2 characters to search.');
      return;
    }
    try {
      const { data } = await axios.get(`/api/friends/search?query=${query}`, {
        headers: { Authorization: `Bearer ${token}` }, // Sends token in the header[3]
      });
      setResults(data.users);
      setMessage(data.users.length === 0 ? 'No users found.' : '');
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'An error occurred during search.');
    }
  };

  const handleSendRequest = async (receiverId: string) => {
    const token = getToken();
    if (!token) {
      setMessage('Authentication token not found. Please log in.');
      return;
    }
    try {
      await axios.post('/api/friends/requests', { receiverId }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setMessage('Friend request sent successfully!');
      setResults(results.filter(u => u.userId !== receiverId));
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Failed to send request.');
    }
  };

  return (
    <div>
      <h4>Find Friends</h4>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by username..."
      />
      <button onClick={handleSearch}>Search</button>
      {message && <p>{message}</p>}
      <ul>
        {results.map((user) => (
          <li key={user.userId}>
            <span>{user.username}</span>
            <button onClick={() => handleSendRequest(user.userId)}>Add Friend</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
