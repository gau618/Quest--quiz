// src/components/social/chat/MessageWindow.tsx
"use client";
import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { socket } from "@/lib/socket";

// Import all necessary sub-components
import { EditGroupModal } from "./EditGroupModal";
import { AddMemberModal } from "./AddMemberModal";
import { InviteManagement } from "./InviteManagement";

// Helper for localStorage access
const getToken = () => localStorage.getItem("gp_token");

// Define the component's props for type safety
interface MessageWindowProps {
  room: any;
  isConnected: boolean;
  currentUserId: string | null; // Receive userId as a prop
  onGroupDeleted: (roomId: string) => void;
  onGroupUpdated: (updatedRoom: any) => void;
  onMemberRemoved: (removedUserId: string) => void;
}

export function MessageWindow({
  room,
  isConnected,
  currentUserId, // Use the prop
  onGroupDeleted,
  onGroupUpdated,
  onMemberRemoved,
}: MessageWindowProps) {
  // Use a local constant for convenience, but the prop is the source of truth
  const userId = currentUserId;

  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isInfoPanelOpen, setIsInfoPanelOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddMemberModalOpen, setIsAddMemberModalOpen] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{ [key: string]: string }>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- SAFE PROPERTY ACCESS ---
  // Use optional chaining (`?.`) to prevent crashes if `room` or `members` is undefined.
  const currentUserMemberInfo = room?.members?.find(
    (m: any) => m.userId === userId
  );
  const isUserAdmin =
    room?.type === "GROUP" && currentUserMemberInfo?.role === "ADMIN";

  // --- DATA FETCHING & SOCKET LISTENERS ---
  useEffect(() => {
    const fetchMessages = async () => {
      const token = getToken();
      if (!room?.id || !token) return;
      try {
        const { data } = await axios.get(
          `/api/chat/rooms/${room.id}/messages`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setMessages(data.messages);
      } catch (error) {
        console.error("Failed to fetch messages", error);
      }
    };
    fetchMessages();
  }, [room?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const handleReceiveMessage = (message: any) => {
      if (message.chatRoomId === room?.id) {
        setMessages((prev) => {
          const filtered = prev.filter(
            (m) =>
              !(
                String(m.id).startsWith("optimistic-") &&
                m.content === message.content &&
                m.sender.userId === message.sender.userId
              )
          );
          if (!filtered.some((m) => m.id === message.id))
            return [...filtered, message];
          return filtered;
        });
      }
    };
    const handleTypingIndicator = (data: {
      chatRoomId: string;
      user: { userId: string };
    }) => {
      if (data.chatRoomId === room?.id && data.user.userId !== userId) {
        const typingUsername =
          room?.members?.find((m: any) => m.userId === data.user.userId)
            ?.userProfile?.username || "Someone";
        setTypingUsers((prev) => ({
          ...prev,
          [data.user.userId]: typingUsername,
        }));
      }
    };
    const handleStopTypingIndicator = (data: {
      chatRoomId: string;
      user: { userId: string };
    }) => {
      if (data.chatRoomId === room?.id) {
        setTypingUsers((prev) => {
          const newTypingUsers = { ...prev };
          delete newTypingUsers[data.user.userId];
          return newTypingUsers;
        });
      }
    };

    socket.on("chat:receive_message", handleReceiveMessage);
    socket.on("chat:typing_indicator", handleTypingIndicator);
    socket.on("chat:stop_typing_indicator", handleStopTypingIndicator);
    return () => {
      socket.off("chat:receive_message", handleReceiveMessage);
      socket.off("chat:typing_indicator", handleTypingIndicator);
      socket.off("chat:stop_typing_indicator", handleStopTypingIndicator);
    };
  }, [room, userId]);

  // --- EVENT HANDLERS ---
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !isConnected) return;
    const optimisticMessage = {
      id: `optimistic-${Date.now()}`,
      content: newMessage,
      createdAt: new Date().toISOString(),
      sender: { userId, username: localStorage.getItem("gp_username") || "Me" },
      chatRoomId: room.id,
    };
    setMessages((prev) => [...prev, optimisticMessage]);
    socket.emit("chat:send_message", {
      chatRoomId: room.id,
      content: newMessage,
    });
    setNewMessage("");
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = null;
    socket.emit("chat:stop_typing", { chatRoomId: room.id });
  };
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNewMessage(e.target.value);
    if (!isConnected) return;
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    else socket.emit("chat:typing", { chatRoomId: room.id });
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("chat:stop_typing", { chatRoomId: room.id });
      typingTimeoutRef.current = null;
    }, 2000);
  };
  const handleDeleteGroup = async () => {
    if (!confirm(`Permanently delete "${room.name}"? This cannot be undone.`))
      return;
    try {
      await axios.delete(`/api/chat/rooms/${room.id}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      onGroupDeleted(room.id);
    } catch (error: any) {
      alert(error.response?.data?.error || "Failed to delete group");
    }
  };
  const handleRemoveMember = async (memberId: string) => {
    if (!confirm("Remove this member from the group?")) return;
    try {
      await axios.delete(`/api/chat/rooms/${room.id}/members/${memberId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      onMemberRemoved(memberId);
    } catch (error: any) {
      alert(error.response?.data?.error || "Failed to remove member");
    }
  };
  const handleLeaveGroup = async () => {
    if (!confirm("Leave this group?")) return;
    try {
      await axios.delete(`/api/chat/rooms/${room.id}/members/${userId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      onMemberRemoved(userId as string);
    } catch (error: any) {
      alert(error.response?.data?.error || "Failed to leave group");
    }
  };

  const getRoomDisplayName = () => {
    if (room?.type === "DM") {
      const otherMember = room?.members?.find((m: any) => m.userId !== userId);
      return otherMember?.userProfile?.username || "Direct Message";
    }
    return room?.name || "Group Chat";
  };
  const TypingIndicator = () => {
    const users = Object.values(typingUsers);
    if (users.length === 0) return null;
    return (
      <p style={styles.typingIndicator}>
        {users.length === 1
          ? `${users[0]} is typing...`
          : users.length === 2
          ? `${users[0]} and ${users[1]} are typing...`
          : "Several people are typing..."}
      </p>
    );
  };

  return (
    <div style={styles.chatLayout}>
      {isEditModalOpen && (
        <EditGroupModal
          room={room}
          onClose={() => setIsEditModalOpen(false)}
          onGroupUpdated={onGroupUpdated}
        />
      )}
      {isAddMemberModalOpen && (
        <AddMemberModal
          roomId={room.id}
          onClose={() => setIsAddMemberModalOpen(false)}
        />
      )}

      <div style={styles.chatContainer}>
        <header style={styles.header}>
          <div>
            <h2 style={styles.headerTitle}>{getRoomDisplayName()}</h2>
            {room?.type === "GROUP" && (
              <p style={styles.headerSubtitle}>
                {room?.members?.length || 0} members
              </p>
            )}
          </div>
          {room?.type === "GROUP" && (
            <button
              onClick={() => setIsInfoPanelOpen(!isInfoPanelOpen)}
              style={styles.infoButton}
            >
              {isInfoPanelOpen ? "Close Info" : "Group Info"}
            </button>
          )}
        </header>

        <div style={styles.messageList}>
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={messageItemStyle(msg.sender.userId === userId)}
            >
              <div
                style={messageBubbleStyle(
                  msg.sender.userId === userId,
                  String(msg.id).startsWith("optimistic-")
                )}
              >
                <strong style={styles.messageSender}>
                  {msg.sender.username}
                </strong>
                <p style={styles.messageContent}>{msg.content}</p>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        <footer style={styles.footer}>
          <div style={styles.typingIndicatorContainer}>
            <TypingIndicator />
          </div>
          <form onSubmit={handleSendMessage} style={styles.messageForm}>
            <input
              value={newMessage}
              onChange={handleInputChange}
              style={styles.messageInput}
              placeholder="Type a message..."
              autoComplete="off"
              disabled={!isConnected}
            />
            <button
              type="submit"
              style={styles.sendButton}
              disabled={!isConnected || !newMessage.trim()}
            >
              Send
            </button>
          </form>
        </footer>
      </div>

      {room?.type === "GROUP" && isInfoPanelOpen && (
        <aside style={styles.infoPanel}>
          <div style={styles.infoHeader}>
            <h3>Group Information</h3>
            <button
              onClick={() => setIsInfoPanelOpen(false)}
              style={styles.closeButton}
            >
              &times;
            </button>
          </div>
          <div style={styles.infoContent}>
            <div style={styles.groupInfoSection}>
              <div style={styles.groupNameRow}>
                <strong>{room.name}</strong>
                {isUserAdmin && (
                  <button
                    onClick={() => setIsEditModalOpen(true)}
                    style={styles.editButton}
                  >
                    Edit
                  </button>
                )}
              </div>
              <p style={styles.groupDescription}>
                {room.description || "No description available"}
              </p>
            </div>

            <div style={styles.membersSection}>
              <h4>Members ({room?.members?.length || 0})</h4>
              <ul style={styles.memberList}>
                {room?.members?.map((member: any) => (
                  <li key={member.userId} style={styles.memberItem}>
                    <div style={styles.memberInfo}>
                      <img
                        src={
                          member.userProfile?.avatarUrl ||
                          `https://api.dicebear.com/8.x/initials/svg?seed=${member.userProfile?.username}`
                        }
                        alt="avatar"
                        style={styles.avatar}
                      />
                      <span>{member.userProfile?.username}</span>
                    </div>
                    <div style={styles.memberControls}>
                      <span style={roleBadgeStyle(member.role)}>
                        {member.role}
                      </span>
                      {isUserAdmin && member.userId !== userId && (
                        <button
                          onClick={() => handleRemoveMember(member.userId)}
                          style={styles.removeButton}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div style={styles.actionsSection}>
              {isUserAdmin && (
                <div style={styles.adminToolsSection}>
                  <h4 style={styles.adminToolsTitle}>Admin Tools</h4>
                  <button
                    onClick={() => setIsAddMemberModalOpen(true)}
                    style={styles.adminButton}
                  >
                    Add Member by Search
                  </button>
                  <InviteManagement roomId={room.id} isAdmin={isUserAdmin} />
                </div>
              )}
              <div style={styles.bottomActions}>
                <button onClick={handleLeaveGroup} style={styles.leaveButton}>
                  Leave Group
                </button>
                {isUserAdmin && (
                  <button
                    onClick={handleDeleteGroup}
                    style={styles.deleteButton}
                  >
                    Delete Group
                  </button>
                )}
              </div>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

const roleBadgeStyle = (role: string): React.CSSProperties => ({
  padding: "3px 10px",
  borderRadius: "12px",
  fontSize: "0.8rem",
  fontWeight: "bold",
  color: "white",
  background: role === "ADMIN" ? "#007bff" : "#6c757d",
});
const styles: Record<string, React.CSSProperties> = {
  chatLayout: {
    display: "flex",
    width: "100%",
    height: "100%",
    position: "relative",
  },
  chatContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#f5f7fb",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px",
    backgroundColor: "#ffffff",
    borderBottom: "1px solid #e0e4e8",
  },
  headerTitle: { margin: 0, fontSize: "1.2rem", fontWeight: 600 },
  headerSubtitle: { margin: 0, color: "#6b7280", fontSize: "0.9rem" },
  infoButton: {
    padding: "8px 16px",
    backgroundColor: "#e5e7eb",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: 500,
  },
  messageList: {
    flex: 1,
    overflowY: "auto",
    padding: "20px",
    backgroundColor: "#ffffff",
  },
  footer: {
    padding: "16px",
    backgroundColor: "#ffffff",
    borderTop: "1px solid #e0e4e8",
  },
  typingIndicatorContainer: { minHeight: "24px", marginBottom: "8px" },
  typingIndicator: {
    margin: 0,
    color: "#6b7280",
    fontStyle: "italic",
    fontSize: "0.9rem",
  },
  messageForm: { display: "flex", gap: "12px" },
  messageInput: {
    flex: 1,
    padding: "12px 16px",
    border: "1px solid #d1d5db",
    borderRadius: "24px",
    fontSize: "1rem",
    outline: "none",
    backgroundColor: "#f9fafb",
  },
  sendButton: {
    padding: "12px 24px",
    backgroundColor: "#3b82f6",
    color: "white",
    border: "none",
    borderRadius: "24px",
    cursor: "pointer",
    fontWeight: 500,
  },
  infoPanel: {
    width: "320px",
    backgroundColor: "#ffffff",
    borderLeft: "1px solid #e0e4e8",
    display: "flex",
    flexDirection: "column",
    height: "100%",
  },
  infoHeader: {
    padding: "16px",
    borderBottom: "1px solid #e0e4e8",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  closeButton: {
    background: "none",
    border: "none",
    fontSize: "1.5rem",
    cursor: "pointer",
    color: "#6b7280",
  },
  infoContent: {
    flex: 1,
    overflowY: "auto",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
  },
  groupInfoSection: { marginBottom: "24px" },
  groupNameRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  },
  editButton: {
    padding: "6px 12px",
    backgroundColor: "#e5e7eb",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.9rem",
  },
  groupDescription: { color: "#4b5563", lineHeight: 1.5 },
  membersSection: { marginBottom: "24px" },
  memberList: { listStyle: "none", padding: 0, margin: 0 },
  memberItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 0",
    borderBottom: "1px solid #f3f4f6",
  },
  avatar: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    marginRight: "10px",
    objectFit: "cover",
  },
  memberInfo: { display: "flex", alignItems: "center", gap: "8px" },
  memberControls: { display: "flex", alignItems: "center", gap: "8px" },
  removeButton: {
    padding: "4px 8px",
    backgroundColor: "#fee2e2",
    color: "#ef4444",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    fontSize: "0.8rem",
  },
  actionsSection: {
    marginTop: "auto",
    display: "flex",
    flexDirection: "column",
  },
  adminToolsSection: {
    borderTop: "1px solid #eee",
    paddingTop: "16px",
    marginBottom: "16px",
  },
  adminToolsTitle: { margin: "0 0 10px 0", fontSize: "1rem", fontWeight: 600 },
  adminButton: {
    width: "100%",
    padding: "10px",
    backgroundColor: "#e0f2ff",
    color: "#0056b3",
    border: "1px solid #b3e0ff",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: 500,
    marginBottom: "10px",
  },
  bottomActions: {
    display: "flex",
    gap: "12px",
    paddingTop: "16px",
    borderTop: "1px solid #eee",
  },
  leaveButton: {
    flex: 1,
    padding: "10px",
    backgroundColor: "#fef3c7",
    color: "#d97706",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: 500,
  },
  deleteButton: {
    flex: 1,
    padding: "10px",
    backgroundColor: "#fee2e2",
    color: "#ef4444",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: 500,
  },
  messageSender: { fontWeight: 600, marginBottom: "4px", fontSize: "0.95rem" },
  messageContent: { margin: 0, lineHeight: 1.4 },
};
const messageItemStyle = (isSender: boolean): React.CSSProperties => ({
  display: "flex",
  justifyContent: isSender ? "flex-end" : "flex-start",
  marginBottom: "16px",
});
const messageBubbleStyle = (
  isSender: boolean,
  isOptimistic: boolean
): React.CSSProperties => ({
  maxWidth: "75%",
  padding: "12px 16px",
  borderRadius: isSender ? "18px 4px 18px 18px" : "4px 18px 18px 18px",
  backgroundColor: isSender ? "#3b82f6" : "#e5e7eb",
  color: isSender ? "white" : "#1f2937",
  opacity: isOptimistic ? 0.8 : 1,
  boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
});
