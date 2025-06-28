// src/components/social/friends/FriendsList.tsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

// Define the structure of a Friend object
interface Friend {
  userId: string;
  username: string;
}

// Helper function to get the authentication token from localStorage
const getToken = () => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('gp_token');
};

export function FriendsList() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true); // Add a loading state for better UX

  useEffect(() => {
    const fetchFriends = async () => {
      const token = getToken();
      if (!token) {
        setMessage('You must be logged in to see your friends.');
        setLoading(false);
        return;
      }
      try {
        const { data } = await axios.get('/api/friends', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setFriends(data.friends);
      } catch (error) {
        console.error('Failed to fetch friends:', error);
        setMessage('Could not load friends list.');
      } finally {
        setLoading(false); // Set loading to false after the request finishes
      }
    };

    fetchFriends();
  }, []);

  // --- NEW FUNCTION TO START A CHAT ---
  const handleStartChat = async (friendId: string) => {
    const token = getToken();
    if (!token) {
      alert('Authentication error. Please log in again.');
      return;
    }
    try {
      // Call the API endpoint to get or create a DM chat room
      await axios.post(
        '/api/chat/rooms',
        {
          type: 'DM', // Specify that we want a Direct Message room
          friendId: friendId,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      // On success, redirect the user to your chat page
      // Based on your code, the chat page is at '/chatpage'
      window.location.href = '/chatpage';
      
    } catch (error: any) {
      // Show an alert if the chat creation fails
      alert(error.response?.data?.error || 'Failed to start conversation.');
    }
  };
  // --- END OF NEW FUNCTION ---

  const handleRemove = async (friendId: string) => {
    const token = getToken();
    if (!token) {
      setMessage('Authentication token not found.');
      return;
    }
    if (!confirm('Are you sure you want to remove this friend?')) return;
    try {
      await axios.delete('/api/friends', {
        headers: { Authorization: `Bearer ${token}` },
        data: { friendId },
      });
      // Re-fetch friends to update the UI
      setFriends(prevFriends => prevFriends.filter(f => f.userId !== friendId));
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Failed to remove friend.');
    }
  };

  // Show a loading message while fetching data
  if (loading) {
    return <p>Loading friends...</p>;
  }

  // Show an error or info message if one exists
  if (message && friends.length === 0) {
    return <p>{message}</p>;
  }

  if (friends.length === 0) {
    return <p>You haven't added any friends yet. Use the search to find some!</p>;
  }

  return (
    <div>
      <h4>My Friends</h4>
      {message && <p>{message}</p>}
      <ul style={{ listStyle: 'none', padding: 0 }}>
        {friends.map((friend) => (
          <li key={friend.userId} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span>{friend.username}</span>
            {/* The "Chat" button is now functional and calls handleStartChat */}
            <button onClick={() => handleStartChat(friend.userId)}>Chat</button>
            <button onClick={() => handleRemove(friend.userId)}>Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
