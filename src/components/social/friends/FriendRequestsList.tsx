// src/components/social/friends/FriendRequestsList.tsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { socket } from '@/lib/socket'; // Assuming your socket instance is exported from here

// --- Type Definitions ---
interface FriendRequest {
  id: string;
  requester: {
    userId: string;
    username: string;
    avatarUrl?: string;
  };
}

// --- Main Component ---
export function FriendRequestsList() {
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem('gp_token') : null);

  useEffect(() => {
    // Fetch initial friend requests on component mount
    const fetchRequests = async () => {
      const token = getToken();
      if (!token) {
        setError('Authentication required.');
        setIsLoading(false);
        return;
      }
      try {
        const { data } = await axios.get('/api/friends/requests', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setRequests(data.requests);
      } catch (err) {
        console.error('Failed to fetch friend requests:', err);
        setError('Could not load friend requests.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchRequests();

    // --- Real-Time Listener ---
    const handleNewFriendRequest = (newRequest: FriendRequest) => {
      // Add the new request to the top of the list in real-time
      setRequests(prevRequests => [newRequest, ...prevRequests]);
    };

    socket.on('friend_request:new', handleNewFriendRequest);

    // --- Critical Cleanup Function ---
    return () => {
      socket.off('friend_request:new', handleNewFriendRequest);
    };
  }, []);

  const handleResponse = async (requestId: string, action: 'accept' | 'decline') => {
    const token = getToken();
    if (!token) {
      setError('Authentication required.');
      return;
    }

    // --- Optimistic UI Update ---
    // Remove the request from the list immediately for a snappy feel
    const originalRequests = [...requests];
    setRequests(prevRequests => prevRequests.filter(req => req.id !== requestId));

    try {
      await axios.patch(`/api/friends/requests/${requestId}`, { action }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // On success, no further action is needed due to optimistic update.
      // You might want to trigger a re-fetch of the main friends list elsewhere.
    } catch (err: any) {
      // If the API call fails, revert the optimistic update and show an error
      setError(err.response?.data?.error || `Failed to ${action} request.`);
      setRequests(originalRequests);
    }
  };

  if (isLoading) {
    return <div style={styles.container}><p>Loading requests...</p></div>;
  }

  if (error) {
    return <div style={styles.container}><p style={styles.errorText}>{error}</p></div>;
  }

  if (requests.length === 0) {
    return (
      <div style={styles.container}>
        <h4 style={styles.title}>Friend Requests</h4>
        <p style={styles.emptyState}>No pending friend requests.</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h4 style={styles.title}>Friend Requests ({requests.length})</h4>
      <ul style={styles.list}>
        {requests.map((req) => (
          <li key={req.id} style={styles.listItem}>
            <img 
              src={req.requester.avatarUrl || `https://api.dicebear.com/8.x/initials/svg?seed=${req.requester.username}`} 
              alt={req.requester.username} 
              style={styles.avatar} 
            />
            <div style={styles.content}>
              <span style={styles.requesterName}>{req.requester.username}</span>
              <span style={styles.requestText}>wants to be your friend.</span>
            </div>
            <div style={styles.actions}>
              <button onClick={() => handleResponse(req.id, 'accept')} style={styles.buttonAccept}>Accept</button>
              <button onClick={() => handleResponse(req.id, 'decline')} style={styles.buttonDecline}>Decline</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Best UI Styles ---
const styles: { [key: string]: React.CSSProperties } = {
  container: { background: '#fff', borderRadius: '12px', padding: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', margin: '20px 0' },
  title: { margin: '0 0 20px 0', fontSize: '1.25rem', fontWeight: 600 },
  list: { listStyle: 'none', padding: 0, margin: 0 },
  listItem: { display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 0', borderBottom: '1px solid #eee' },
  avatar: { width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover', background: '#f0f2f5' },
  content: { flex: 1, display: 'flex', flexDirection: 'column' },
  requesterName: { fontWeight: 'bold' },
  requestText: { color: '#65676b', fontSize: '0.9rem' },
  actions: { display: 'flex', gap: '10px' },
  buttonAccept: { padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#007bff', color: 'white', fontWeight: 600, cursor: 'pointer' },
  buttonDecline: { padding: '8px 16px', borderRadius: '8px', border: '1px solid #ccc', background: '#f8f9fa', color: '#333', fontWeight: 600, cursor: 'pointer' },
  emptyState: { textAlign: 'center', color: '#888', padding: '20px 0' },
  errorText: { color: '#d93025', fontWeight: 'bold' },
};
