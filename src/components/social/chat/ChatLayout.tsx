// src/components/social/chat/ChatLayout.tsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { socket } from '@/lib/socket';
import { ConversationList } from './ConversationList';
import { MessageWindow } from './MessageWindow';
import { CreateGroupChatModal } from './CreateGroupChatModal'; // Import the new modal

const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem('gp_token') : null);
const getUserId = () => (typeof window !== 'undefined' ? localStorage.getItem('gp_userId') : null);

export function ChatLayout() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [rooms, setRooms] = useState<any[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false); // State to control the modal
  
  const userId = getUserId();

  useEffect(() => {
    const fetchRoomsAndJoin = async () => {
      const token = getToken();
      if (!token) return;
      try {
        const { data } = await axios.get('/api/chat/rooms', { headers: { Authorization: `Bearer ${token}` } });
        setRooms(data.rooms);
        if (socket.connected && data.rooms.length > 0) {
          socket.emit('chat:join_rooms', data.rooms.map((r: any) => r.id));
        }
      } catch (error) { console.error("Failed to fetch chat rooms", error); }
    };

    function onConnect() {
      console.log('[Socket] ✅ Connected successfully!');
      setIsConnected(true);
      fetchRoomsAndJoin();
    }
    function onDisconnect() { console.log('[Socket] ❌ Disconnected.'); setIsConnected(false); }
    function onConnectError(err: Error) { console.error('[Socket] ❌ Connection Error:', err); setIsConnected(false); }

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    if (userId && !socket.connected) {
      socket.auth = { userId };
      socket.connect();
    }

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, [userId]);

  const handleGroupCreated = (newRoom: any) => {
    setRooms(prevRooms => [newRoom, ...prevRooms]);
    if (socket.connected) {
      socket.emit('chat:join_rooms', [newRoom.id]);
    }
    setSelectedRoom(newRoom);
  };

  return (
    <>
      {isModalOpen && (
        <CreateGroupChatModal
          onClose={() => setIsModalOpen(false)}
          onGroupCreated={handleGroupCreated}
        />
      )}
      <div style={{ display: 'flex', height: '80vh', border: '1px solid #ccc' }}>
        <aside style={{ width: '30%', borderRight: '1px solid #ccc', overflowY: 'auto' }}>
          <div style={{ padding: '10px', borderBottom: '1px solid #ccc' }}>
            <p>Connection: {isConnected ? '✅ Online' : '❌ Offline'}</p>
            <button onClick={() => setIsModalOpen(true)} style={{ width: '100%' }}>
              + New Group Chat
            </button>
          </div>
          <ConversationList
            rooms={rooms}
            selectedRoomId={selectedRoom?.id}
            onSelectRoom={setSelectedRoom}
            currentUserId={userId}
          />
        </aside>
        <main style={{ width: '70%', display: 'flex' }}>
          {selectedRoom ? (
            <MessageWindow key={selectedRoom.id} room={selectedRoom} isConnected={isConnected} />
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><p>Select or create a conversation.</p></div>
          )}
        </main>
      </div>
    </>
  );
}
