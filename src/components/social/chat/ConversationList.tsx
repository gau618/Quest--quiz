// src/components/social/chat/ConversationList.tsx
import React from "react";
// Define the types for better code quality and to prevent errors
interface UserProfile {
  userId: string;
  username: string;
  avatarUrl?: string;
}

interface ChatRoomMember {
  userProfile: UserProfile;
}

interface Message {
  id: string;
  content: string;
  createdAt: string;
}

interface ChatRoom {
  id: string;
  type: 'DM' | 'GROUP';
  name?: string;
  members: ChatRoomMember[];
  messages?: Message[]; // Mark messages as optional
}

interface ConversationListProps {
  rooms: ChatRoom[];
  selectedRoomId: string | null;
  onSelectRoom: (room: ChatRoom) => void;
  currentUserId: string | null;
}
export function ConversationList({
  rooms,
  selectedRoomId,
  onSelectRoom,
  currentUserId,
}:ConversationListProps) {
  const getRoomDisplayName = (room: any) => {
    if (room.type === "GROUP") return room.name;
    if (room.type === "DM") {
      const otherMember = room.members.find(
        (m: any) => m.userProfile.userId !== currentUserId
      );
      return otherMember?.userProfile.username || "Direct Message";
    }
    return "Chat";
  };
  return (
    <div>
      <h4>Conversations</h4>
      <ul>
        {rooms.map((room: any) => (
          <li
            key={room.id}
            onClick={() => onSelectRoom(room)}
            style={{
              padding: "10px",
              cursor: "pointer",
              background:
                room.id === selectedRoomId ? "#e0f7fa" : "transparent",
            }}
          >
            <strong>{getRoomDisplayName(room)}</strong>
             <p style={{
              margin: 0,
              color: '#888',
              fontStyle: 'italic',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis'
            }}>
              {room.messages?.[0]?.content || 'No messages yet'}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
