// src/components/social/chat/CreateGroupChatModal.tsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const getToken = () => localStorage.getItem('gp_token');

interface Friend {
  userId: string;
  username: string;
}

interface Props {
  onClose: () => void;
  onGroupCreated: (newRoom: any) => void;
}

export function CreateGroupChatModal({ onClose, onGroupCreated }: Props) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groupName, setGroupName] = useState('');
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);

  useEffect(() => {
    // Fetch the user's friends to populate the selection list
    const fetchFriends = async () => {
      const token = getToken();
      if (!token) return;
      try {
        const { data } = await axios.get('/api/friends', {
          headers: { Authorization: `Bearer ${token}` },
        });
        setFriends(data.friends);
      } catch (error) {
        console.error("Failed to fetch friends for group creation", error);
      }
    };
    fetchFriends();
  }, []);

  const handleFriendToggle = (friendId: string) => {
    setSelectedFriends(prev =>
      prev.includes(friendId)
        ? prev.filter(id => id !== friendId)
        : [...prev, friendId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim() || selectedFriends.length === 0) {
      alert("Please provide a group name and select at least one friend.");
      return;
    }
    const token = getToken();
    try {
      const { data } = await axios.post('/api/chat/rooms', {
        type: 'GROUP',
        groupName,
        memberIds: selectedFriends,
      }, { headers: { Authorization: `Bearer ${token}` } });
      
      onGroupCreated(data.room); // Pass the new room back to the parent
      onClose(); // Close the modal
    } catch (error: any) {
      alert(error.response?.data?.error || "Failed to create group.");
    }
  };

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'white', padding: '20px', borderRadius: '8px', width: '400px' }}>
        <h2>Create New Group Chat</h2>
        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="Group Name"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            style={{ width: '100%', padding: '10px', marginBottom: '10px' }}
            required
          />
          <h4>Select Members</h4>
          <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #ccc', padding: '10px' }}>
            {friends.map(friend => (
              <div key={friend.userId}>
                <input
                  type="checkbox"
                  id={friend.userId}
                  checked={selectedFriends.includes(friend.userId)}
                  onChange={() => handleFriendToggle(friend.userId)}
                />
                <label htmlFor={friend.userId}>{friend.username}</label>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button type="button" onClick={onClose}>Cancel</button>
            <button type="submit">Create Group</button>
          </div>
        </form>
      </div>
    </div>
  );
}
