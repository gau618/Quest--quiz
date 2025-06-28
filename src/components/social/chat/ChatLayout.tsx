import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { socket } from '@/lib/socket';
import { ConversationList } from './ConversationList';
import { MessageWindow } from './MessageWindow';
import { CreateGroupChatModal } from './CreateGroupChatModal';


export function ChatLayout() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [rooms, setRooms] = useState<any[]>([]);
  const [selectedRoom, setSelectedRoom] = useState<any | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
   const [userId, setUserId] = useState<string | null>(null);

  // This effect runs ONLY ONCE on the client after the component mounts.
  // This is the safe place to access localStorage.
  useEffect(() => {
    const id = localStorage.getItem('gp_userId');
    setUserId(id);
  }, []); // The empty dependency array [] ensures this runs only once[7].


  // Fetch rooms and handle socket events
  useEffect(() => {
    const getToken = () => localStorage.getItem('gp_token');
    const fetchRoomsAndJoin = async () => {
      setIsLoading(true);
      const token = getToken();
      if (!token) {
        setIsLoading(false);
        return;
      }
      
      try {
        const { data } = await axios.get('/api/chat/rooms', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        setRooms(data.rooms);
        
        if (socket.connected && data.rooms.length > 0) {
          socket.emit('chat:join_rooms', data.rooms.map((r: any) => r.id));
        }
      } catch (error) {
        console.error('Failed to fetch chat rooms', error);
      } finally {
        setIsLoading(false);
      }
    };

    // Socket event handlers
    const onConnect = () => {
      setIsConnected(true);
      fetchRoomsAndJoin();
    };

    const onDisconnect = () => setIsConnected(false);
    
    const handleGroupDeleted = ({ chatRoomId }: { chatRoomId: string }) => {
      setRooms(prev => prev.filter(r => r.id !== chatRoomId));
      if (selectedRoom?.id === chatRoomId) {
        setSelectedRoom(null);
      }
    };

    const handleGroupUpdated = ({ updatedRoom }: { updatedRoom: any }) => {
      setRooms(prev => prev.map(r => 
        r.id === updatedRoom.id ? updatedRoom : r
      ));
      
      if (selectedRoom?.id === updatedRoom.id) {
        setSelectedRoom(updatedRoom);
      }
    };

    const handleMemberRemoved = ({ 
      chatRoomId, 
      removedUserId 
    }: { 
      chatRoomId: string; 
      removedUserId: string 
    }) => {
      // Handle current user removal
      if (removedUserId === userId) {
        setRooms(prev => prev.filter(r => r.id !== chatRoomId));
        if (selectedRoom?.id === chatRoomId) {
          setSelectedRoom(null);
        }
        return;
      }
      
      // Handle other member removal
      setRooms(prev => prev.map(room => {
        if (room.id === chatRoomId) {
          return {
            ...room,
            members: room.members.filter((m: any) => m.userId !== removedUserId)
          };
        }
        return room;
      }));
    };

    // Setup socket listeners
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('chat:group_deleted', handleGroupDeleted);
    socket.on('chat:group_updated', handleGroupUpdated);
    socket.on('chat:member_removed', handleMemberRemoved);

    // Connect socket if not connected
    if (userId && !socket.connected) {
      socket.auth = { userId };
      socket.connect();
    } else if (socket.connected) {
      fetchRoomsAndJoin();
    }

    // Cleanup
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('chat:group_deleted', handleGroupDeleted);
      socket.off('chat:group_updated', handleGroupUpdated);
      socket.off('chat:member_removed', handleMemberRemoved);
    };
  }, [userId, selectedRoom]);

  const handleGroupCreated = (newRoom: any) => {
    setRooms(prev => [newRoom, ...prev]);
    if (socket.connected) {
      socket.emit('chat:join_rooms', [newRoom.id]);
    }
    setSelectedRoom(newRoom);
  };

  const onGroupDeleted = (roomId: string) => {
    setRooms(prev => prev.filter(r => r.id !== roomId));
    if (selectedRoom?.id === roomId) {
      setSelectedRoom(null);
    }
  };

  const onGroupUpdated = (updatedRoom: any) => {
    setRooms(prev => prev.map(r => 
      r.id === updatedRoom.id ? updatedRoom : r
    ));
    if (selectedRoom?.id === updatedRoom.id) {
      setSelectedRoom(updatedRoom);
    }
  };

  const onMemberRemoved = (removedUserId: string) => {
    // Handled in socket event
  };

  return (
    <div style={styles.appContainer}>
      {isModalOpen && (
        <CreateGroupChatModal 
          onClose={() => setIsModalOpen(false)} 
          onGroupCreated={handleGroupCreated} 
        />
      )}
      
      <aside style={styles.sidebar}>
        <header style={styles.sidebarHeader}>
          <div style={connectionStatusStyle(isConnected)}>
            {isConnected ? '● Online' : '○ Offline'}
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            style={styles.newGroupButton}
          >
            + New Group
          </button>
        </header>
        
        {isLoading ? (
          <div style={styles.loadingContainer}>
            <p>Loading conversations...</p>
          </div>
        ) : (
          <ConversationList 
            rooms={rooms} 
            selectedRoomId={selectedRoom?.id} 
            onSelectRoom={setSelectedRoom} 
            currentUserId={userId} 
          />
        )}
      </aside>
      
      <main style={styles.mainContent}>
        {selectedRoom ? (
          <MessageWindow
            key={selectedRoom.id}
            room={selectedRoom}
            isConnected={isConnected}
            onGroupDeleted={onGroupDeleted}
            onGroupUpdated={onGroupUpdated}
            onMemberRemoved={onMemberRemoved}
          />
        ) : (
          <div style={styles.welcomeContainer}>
            <h2>Welcome to Chat</h2>
            <p>Select a conversation or create a new group</p>
          </div>
        )}
      </main>
    </div>
  );
}

// Styles
const styles: Record<string, React.CSSProperties> = {
  appContainer: {
    display: 'flex',
    height: '100vh',
    backgroundColor: '#ffffff'
  },
  sidebar: {
    width: '320px',
    borderRight: '1px solid #e0e4e8',
    display: 'flex',
    flexDirection: 'column'
  },
  sidebarHeader: {
    padding: '16px',
    borderBottom: '1px solid #e0e4e8',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  newGroupButton: {
    padding: '8px 16px',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontWeight: 500
  },
  loadingContainer: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6b7280'
  },
  mainContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column'
  },
  welcomeContainer: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#6b7280',
    textAlign: 'center'
  }
};

const connectionStatusStyle = (isConnected: boolean): React.CSSProperties => ({
  padding: '4px 12px',
  borderRadius: '20px',
  fontWeight: 500,
  fontSize: '0.9rem',
  backgroundColor: isConnected ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
  color: isConnected ? '#10b981' : '#ef4444'
});
