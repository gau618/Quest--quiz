// src/components/social/chat/ChatLayout.tsx
"use client";
import React, { useState, useEffect, useCallback } from "react";
import axios from "axios";
import { socket } from "@/lib/socket"; // Import the shared socket instance

// Import necessary sub-components
import { ConversationList } from "./ConversationList";
import { MessageWindow } from "./MessageWindow";
import { CreateGroupChatModal } from "./CreateGroupChatModal";
import { JoinGroupModal } from "./JoinGroupModal";

// Helper functions for localStorage access (ensure these are client-side only)
const getToken = () =>
  typeof window !== "undefined" ? localStorage.getItem("gp_token") : null;
const getUserId = () =>
  typeof window !== "undefined" ? localStorage.getItem("gp_userId") : null;

// Main ChatLayout Component
export function ChatLayout() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [rooms, setRooms] = useState<any[] | null>(null); // Use null initially to indicate loading
  const [selectedRoom, setSelectedRoom] = useState<any | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [loadingInitialData, setLoadingInitialData] = useState(true);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // EFFECT 1: Load userId from localStorage on initial client mount
  useEffect(() => {
    const id = getUserId();
    setCurrentUserId(id);
  }, []);

  // EFFECT 2: Fetch rooms and set up main socket listeners
  useEffect(() => {
    // Only proceed if we have a userId
    if (!currentUserId) {
      setLoadingInitialData(false); // No user, so stop loading
      return;
    }

    const fetchRoomsAndJoin = async () => {
      setLoadingInitialData(true);
      const token = getToken();
      if (!token) {
        // User is not authenticated, clean up and stop loading
        setRooms([]); // No rooms if not authenticated
        setLoadingInitialData(false);
        return;
      }

      try {
        const { data } = await axios.get("/api/chat/rooms", {
          headers: { Authorization: `Bearer ${token}` },
        });

        setRooms(data.rooms);

        // Join socket rooms for all fetched chat rooms
        if (socket.connected && data.rooms.length > 0) {
          socket.emit(
            "chat:join_rooms",
            data.rooms.map((r: any) => r.id)
          );
        }
      } catch (error) {
        console.error("Failed to fetch chat rooms:", error);
        setRooms([]); // Set to empty array on error
      } finally {
        setLoadingInitialData(false);
      }
    };

    // Socket event handlers
    const onConnect = () => {
      setIsConnected(true);
      fetchRoomsAndJoin(); // Re-fetch rooms on reconnect
    };
    const onDisconnect = () => setIsConnected(false);

    // Group-related update handlers (from previous discussions)
    const handleGroupDeleted = ({ chatRoomId }: { chatRoomId: string }) => {
      setRooms((prevRooms) =>
        (prevRooms || []).filter((r) => r.id !== chatRoomId)
      );
      if (selectedRoom?.id === chatRoomId) setSelectedRoom(null);
    };

    const handleGroupUpdated = ({ updatedRoom }: { updatedRoom: any }) => {
      setRooms((prevRooms) =>
        (prevRooms || []).map((r) =>
          r.id === updatedRoom.id ? updatedRoom : r
        )
      );
      if (selectedRoom?.id === updatedRoom.id) setSelectedRoom(updatedRoom);
    };

    const handleMemberRemoved = ({
      chatRoomId,
      removedUserId,
    }: {
      chatRoomId: string;
      removedUserId: string;
    }) => {
      if (removedUserId === currentUserId) {
        // Current user was removed from the group
        setRooms((prevRooms) =>
          (prevRooms || []).filter((r) => r.id !== chatRoomId)
        );
        if (selectedRoom?.id === chatRoomId) setSelectedRoom(null);
        alert("You have been removed from a group."); // Inform the user
      } else {
        // Another member was removed
        setRooms((prevRooms) =>
          (prevRooms || []).map((room) => {
            if (room.id === chatRoomId) {
              return {
                ...room,
                members: (room.members || []).filter(
                  (m: any) => m.userId !== removedUserId
                ),
              };
            }
            return room;
          })
        );
      }
    };

    // --- NEW: handleMemberAdded and chat:error ---
    const handleMemberAdded = (data: { roomId: string; newMember: any }) => {
      setRooms((prevRooms) =>
        (prevRooms || []).map((room) => {
          if (room.id === data.roomId) {
            const memberExists = (room.members || []).some(
              (m: any) => m.userId === data.newMember.userId
            );
            return memberExists
              ? room
              : { ...room, members: [...(room.members || []), data.newMember] };
          }
          return room;
        })
      );
      // If the currently selected room is the one that was updated, refresh its state
      if (selectedRoom?.id === data.roomId) {
        setSelectedRoom((prevSelectedRoom: any) => {
          if (!prevSelectedRoom) return null;
          const memberExists = (prevSelectedRoom.members || []).some(
            (m: any) => m.userId === data.newMember.userId
          );
          return memberExists
            ? prevSelectedRoom
            : {
                ...prevSelectedRoom,
                members: [...(prevSelectedRoom.members || []), data.newMember],
              };
        });
      }
    };

    const handleYouWereAdded = ({ room: newRoomData }: { room: any }) => {
      setRooms((prevRooms) => [newRoomData, ...(prevRooms || [])]);
      // If no room is selected, or if this is the first room, select it.
      if (!selectedRoom) setSelectedRoom(newRoomData);
      alert(`You've been added to the group: ${newRoomData.name}`);
      socket.emit("chat:join_rooms", [newRoomData.id]); // Make client join the new room
    };

    const handleChatError = ({ message }: { message: string }) => {
      console.error("Chat Error:", message);
      alert(`Chat Error: ${message}`); // Or use a toast notification library
    };

    // Setup socket listeners
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("chat:group_deleted", handleGroupDeleted);
    socket.on("chat:group_updated", handleGroupUpdated);
    socket.on("chat:member_removed", handleMemberRemoved);
    socket.on("chat:member_added", handleMemberAdded); // New listener
    socket.on("chat:you_were_added", handleYouWereAdded); // New listener for direct notification
    socket.on("chat:error", handleChatError); // New listener for server-side errors

    // Connect socket if not connected (after userId is loaded)
    if (currentUserId && !socket.connected) {
      socket.auth = { token: getToken(), userId: currentUserId }; // Ensure token is passed
      socket.connect();
    } else if (socket.connected) {
      // If already connected, just fetch rooms for the user
      fetchRoomsAndJoin();
    }

    // Cleanup function
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("chat:group_deleted", handleGroupDeleted);
      socket.off("chat:group_updated", handleGroupUpdated);
      socket.off("chat:member_removed", handleMemberRemoved);
      socket.off("chat:member_added", handleMemberAdded);
      socket.off("chat:you_were_added", handleYouWereAdded);
      socket.off("chat:error", handleChatError);
    };
  }, [currentUserId, selectedRoom]); // Dependency on currentUserId and selectedRoom

  // Callbacks for prop drilling
  const handleGroupCreated = useCallback((newRoom: any) => {
    setRooms((prevRooms) => [newRoom, ...(prevRooms || [])]);
    if (socket.connected) {
      socket.emit("chat:join_rooms", [newRoom.id]);
    }
    setSelectedRoom(newRoom);
  }, []);

  const onGroupDeleted = useCallback(
    (roomId: string) => {
      setRooms((prevRooms) => (prevRooms || []).filter((r) => r.id !== roomId));
      if (selectedRoom?.id === roomId) setSelectedRoom(null);
    },
    [selectedRoom]
  );

  const onGroupUpdated = useCallback(
    (updatedRoom: any) => {
      setRooms((prevRooms) =>
        (prevRooms || []).map((r) =>
          r.id === updatedRoom.id ? updatedRoom : r
        )
      );
      if (selectedRoom?.id === updatedRoom.id) setSelectedRoom(updatedRoom);
    },
    [selectedRoom]
  );

  const onMemberRemoved = useCallback((removedUserId: string) => {
    // This is primarily handled by the socket event listener,
    // but the callback ensures the type signature matches props.
    // The actual state update happens in handleMemberRemoved.
  }, []);

  // --- Render Logic ---
  // Display loading state if rooms is null
  if (loadingInitialData || rooms === null) {
    return (
      <div style={styles.appContainer}>
        <div style={styles.loadingContainer}>
          <p>Loading conversations...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.appContainer}>
      {isCreateModalOpen && (
        <CreateGroupChatModal
          onClose={() => setIsCreateModalOpen(false)}
          onGroupCreated={handleGroupCreated}
        />
      )}
      {isJoinModalOpen && (
        <JoinGroupModal
          onClose={() => setIsJoinModalOpen(false)}
          onJoin={(room) => {
            setRooms((prev) => [room, ...(prev || [])]);
            setSelectedRoom(room);
            setIsJoinModalOpen(false); // Close modal on successful join
          }}
        />
      )}

      <aside style={styles.sidebar}>
        <header style={styles.sidebarHeader}>
          <div style={connectionStatusStyle(isConnected)}>
            {isConnected ? "● Online" : "○ Offline"}
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            style={styles.newGroupButton}
          >
            + New Group
          </button>
        </header>

        {rooms.length === 0 ? (
          <div style={styles.emptySidebar}>
            <p>No conversations yet.</p>
            <button
              onClick={() => setIsJoinModalOpen(true)}
              style={styles.joinButton}
            >
              Join a group
            </button>
          </div>
        ) : (
          <ConversationList
            rooms={rooms}
            selectedRoomId={selectedRoom?.id}
            onSelectRoom={setSelectedRoom}
            currentUserId={currentUserId}
          />
        )}
      </aside>

      <main style={styles.mainContent}>
        {selectedRoom ? (
          <MessageWindow
            key={selectedRoom.id} // Key to force re-render when room changes
            room={selectedRoom}
            isConnected={isConnected}
            onGroupDeleted={onGroupDeleted}
            onGroupUpdated={onGroupUpdated}
            onMemberRemoved={onMemberRemoved}
            // Pass the userId explicitly if needed in MessageWindow
            currentUserId={currentUserId}
          />
        ) : (
          <div style={styles.welcomeContainer}>
            <h2>Welcome to Chat</h2>
            <p>Select a conversation or create a new group</p>
            <button
              onClick={() => setIsJoinModalOpen(true)}
              style={styles.joinButton}
            >
              Join with Code
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

// Styles
const styles: Record<string, React.CSSProperties> = {
  appContainer: {
    display: "flex",
    height: "100vh",
    backgroundColor: "#ffffff",
    overflow: "hidden", // Prevent scrollbars from modals
  },
  sidebar: {
    width: "320px",
    borderRight: "1px solid #e0e4e8",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
  },
  sidebarHeader: {
    padding: "16px",
    borderBottom: "1px solid #e0e4e8",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  newGroupButton: {
    padding: "8px 16px",
    backgroundColor: "#3b82f6",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: 500,
  },
  loadingContainer: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#6b7280",
  },
  mainContent: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },
  welcomeContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "#6b7280",
    textAlign: "center",
  },
  joinButton: {
    // Added style for join button
    padding: "8px 16px",
    backgroundColor: "#6b7280",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: 500,
    marginTop: "10px",
  },
  emptySidebar: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    textAlign: "center",
    color: "#888",
  },
};

const connectionStatusStyle = (isConnected: boolean): React.CSSProperties => ({
  padding: "4px 12px",
  borderRadius: "20px",
  fontWeight: 500,
  fontSize: "0.9rem",
  backgroundColor: isConnected
    ? "rgba(16, 185, 129, 0.1)"
    : "rgba(239, 68, 68, 0.1)",
  color: isConnected ? "#10b981" : "#ef4444",
});
