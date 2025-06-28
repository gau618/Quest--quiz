// src/components/social/friends/FriendRequestsList.tsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface FriendRequest {
  id: string;
  requester: {
    username: string;
  };
}

export function FriendRequestsList() {
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [message, setMessage] = useState('');

  const getToken = () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('gp_token');
  };

  const fetchRequests = async () => {
    const token = getToken();
    if (!token) {
      setMessage('Authentication token not found.');
      return;
    }
    try {
      const { data } = await axios.get('/api/friends/requests', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setRequests(data.requests);
    } catch (error) {
      console.error('Failed to fetch friend requests:', error);
      setMessage('Could not load friend requests.');
    }
  };

  useEffect(() => {
    fetchRequests();
    // In a later step, we will add a socket listener here to update this list in real-time.
  }, []);

  const handleResponse = async (requestId: string, action: 'accept' | 'decline') => {
    const token = getToken();
    if (!token) {
      setMessage('Authentication token not found.');
      return;
    }
    try {
      await axios.patch(`/api/friends/requests/${requestId}`, { action }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Re-fetch the list to update the UI
      fetchRequests();
    } catch (error: any) {
      setMessage(error.response?.data?.error || `Failed to ${action} request.`);
    }
  };

  if (requests.length === 0) {
    return <p>No pending friend requests.</p>;
  }

  return (
    <div>
      <h4>Pending Friend Requests</h4>
      {message && <p>{message}</p>}
      <ul>
        {requests.map((req) => (
          <li key={req.id}>
            <span>{req.requester.username} wants to be your friend.</span>
            <button onClick={() => handleResponse(req.id, 'accept')}>Accept</button>
            <button onClick={() => handleResponse(req.id, 'decline')}>Decline</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
