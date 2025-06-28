// src/components/social/chat/ConversationList.tsx
import React, { useState } from 'react';

// --- Type Definitions ---
interface UserProfile {
  userId: string;
  username: string;
  avatarUrl?: string;
}

interface ChatRoomMember {
  userId: string;
  role: 'ADMIN' | 'MEMBER';
  userProfile: UserProfile;
}

interface Message {
  id: string;
  content: string;
  createdAt: string;
}

interface ChatRoom {
  id:string;
  type: 'DM' | 'GROUP';
  name?: string;
  members: ChatRoomMember[];
  messages?: Message[];
}

interface ConversationListProps {
  rooms: ChatRoom[];
  selectedRoomId: string | null;
  onSelectRoom: (room: ChatRoom) => void;
  currentUserId: string | null;
}

// --- Helper Functions ---
const formatTimestamp = (dateString?: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfDay.getTime() - 86400000);

  if (date >= startOfDay) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (date >= startOfYesterday) {
    return 'Yesterday';
  }
  return date.toLocaleDateString();
};

// --- Main Component ---
export function ConversationList({ rooms, selectedRoomId, onSelectRoom, currentUserId }: ConversationListProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const getRoomDetails = (room: ChatRoom) => {
    if (room.type === 'GROUP') {
      return {
        name: room.name || 'Group Chat',
        avatar: `https://api.dicebear.com/8.x/initials/svg?seed=${room.name || 'G'}&backgroundColor=0084ff,007bff,d81b60,e53935&backgroundType=gradient`,
      };
    }
    
    // For DM
    const otherMember = room.members.find(m => m.userId !== currentUserId);
    return {
      name: otherMember?.userProfile.username || 'Direct Message',
      avatar: otherMember?.userProfile.avatarUrl || `https://api.dicebear.com/8.x/initials/svg?seed=${otherMember?.userProfile.username || 'U'}`,
    };
  };

  return (
    <div style={styles.container}>
      <h4 style={styles.title}>Conversations</h4>
      <ul style={styles.list}>
        {rooms.length > 0 ? (
          rooms.map((room) => {
            const { name, avatar } = getRoomDetails(room);
            const lastMessage = room.messages?.[0];
            const isSelected = room.id === selectedRoomId;

            return (
              <li
                key={room.id}
                onClick={() => onSelectRoom(room)}
                onMouseEnter={() => setHoveredId(room.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  ...styles.listItem,
                  backgroundColor: isSelected ? '#e7f3ff' : (hoveredId === room.id ? '#f5f5f5' : 'transparent'),
                }}
              >
                <img src={avatar} alt={name} style={styles.avatar} />
                <div style={styles.content}>
                  <span style={styles.name}>{name}</span>
                  <p style={styles.lastMessage}>
                    {lastMessage?.content || 'No messages yet'}
                  </p>
                </div>
                <div style={styles.info}>
                  <span style={styles.timestamp}>
                    {formatTimestamp(lastMessage?.createdAt)}
                  </span>
                  {/* Future-proof: Add an unread count badge here if you add that feature */}
                </div>
              </li>
            );
          })
        ) : (
          <p style={styles.emptyState}>No conversations found. Start a new chat!</p>
        )}
      </ul>
    </div>
  );
}

// --- Best UI Styles ---
const styles: { [key: string]: React.CSSProperties } = {
  container: { height: '100%', display: 'flex', flexDirection: 'column' },
  title: { padding: '16px', margin: 0, fontSize: '1.1rem', fontWeight: 600, borderBottom: '1px solid #eee' },
  list: { listStyle: 'none', padding: 0, margin: 0, flex: 1, overflowY: 'auto' },
  listItem: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', cursor: 'pointer', transition: 'background-color 0.2s ease' },
  avatar: { width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover', background: '#eee' },
  content: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  name: { fontWeight: 600, fontSize: '1rem', color: '#050505' },
  lastMessage: { margin: 0, color: '#65676b', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  info: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' },
  timestamp: { fontSize: '0.75rem', color: '#888' },
  emptyState: { textAlign: 'center', color: '#888', padding: '40px 20px' },
};
