// src/components/social/friends/FriendsList.tsx
import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { socket } from "@/lib/socket"; // Assuming your socket instance is exported

// --- Type Definitions ---
interface Friend {
  userId: string;
  username: string;
  avatarUrl?: string;
}

// --- Main Component ---
export function FriendsList() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const getToken = () =>
    typeof window !== "undefined" ? localStorage.getItem("gp_token") : null;

  useEffect(() => {
    // Fetch initial friends list on mount
    const fetchFriends = async () => {
      const token = getToken();
      if (!token) {
        setError("Authentication required.");
        setIsLoading(false);
        return;
      }
      try {
        const { data } = await axios.get("/api/friends", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setFriends(data.friends);
      } catch (err) {
        console.error("Failed to fetch friends:", err);
        setError("Could not load friends list.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchFriends();

    // --- Real-Time Listeners ---
    const handleNewFriend = (data: { newFriend: Friend }) => {
      setFriends((prev) => [data.newFriend, ...prev]);
    };
    const handleFriendRemoved = (data: { removedFriendId: string }) => {
      setFriends((prev) =>
        prev.filter((f) => f.userId !== data.removedFriendId)
      );
    };

    socket.on("friend:new", handleNewFriend);
    socket.on("friend:removed", handleFriendRemoved);

    // --- Cleanup ---
    return () => {
      socket.off("friend:new", handleNewFriend);
      socket.off("friend:removed", handleFriendRemoved);
    };
  }, []);

  const handleStartChat = async (friendId: string) => {
    const token = getToken();
    if (!token) return;
    try {
      await axios.post(
        "/api/chat/rooms",
        { type: "DM", friendId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      window.location.href = "/chatpage"; // Or use Next.js router
    } catch (error: any) {
      alert(error.response?.data?.error || "Failed to start conversation.");
    }
  };

  const handleRemove = async (friendId: string) => {
    if (!confirm("Are you sure you want to remove this friend?")) return;
    const token = getToken();
    if (!token) return;

    // Optimistic UI update
    const originalFriends = [...friends];
    setFriends((prev) => prev.filter((f) => f.userId !== friendId));

    try {
      await axios.delete("/api/friends", {
        headers: { Authorization: `Bearer ${token}` },
        data: { friendId },
      });
    } catch (error: any) {
      setError(error.response?.data?.error || "Failed to remove friend.");
      setFriends(originalFriends); // Revert on error
    }
  };

  const filteredFriends = useMemo(() => {
    return friends.filter((friend) =>
      friend.username.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [friends, searchTerm]);

  if (isLoading) {
    return (
      <div style={styles.container}>
        <p>Loading friends...</p>
      </div>
    );
  }
  if (error) {
    return (
      <div style={styles.container}>
        <p style={styles.errorText}>{error}</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h4 style={styles.title}>My Friends ({friends.length})</h4>
        <input
          type="text"
          placeholder="Search friends..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={styles.searchInput}
        />
      </div>

      {filteredFriends.length > 0 ? (
        <ul style={styles.list}>
          {filteredFriends.map((friend) => (
            <li key={friend.userId} style={styles.listItem}>
              <img
                src={
                  friend.avatarUrl ||
                  `https://api.dicebear.com/8.x/initials/svg?seed=${friend.username}`
                }
                alt={friend.username}
                style={styles.avatar}
              />
              <span style={styles.friendName}>{friend.username}</span>
              <div style={styles.actions}>
                <button
                  onClick={() => handleStartChat(friend.userId)}
                  style={styles.buttonPrimary}
                >
                  Chat
                </button>
                <button
                  onClick={() => handleRemove(friend.userId)}
                  style={styles.buttonSecondary}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p style={styles.emptyState}>
          {friends.length === 0
            ? "You haven't added any friends yet."
            : "No friends match your search."}
        </p>
      )}
    </div>
  );
}

// --- Best UI Styles ---
const styles: { [key: string]: React.CSSProperties } = {
  container: {
    background: "#fff",
    borderRadius: "12px",
    padding: "20px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
    margin: "20px 0",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
    gap: "16px",
  },
  title: { margin: 0, fontSize: "1.25rem", fontWeight: 600 },
  searchInput: {
    padding: "8px 12px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    minWidth: "200px",
  },
  list: { listStyle: "none", padding: 0, margin: 0 },
  listItem: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    padding: "12px 0",
    borderBottom: "1px solid #eee",
  },
  avatar: {
    width: "45px",
    height: "45px",
    borderRadius: "50%",
    objectFit: "cover",
    background: "#f0f2f5",
  },
  friendName: { flex: 1, fontWeight: 500 },
  actions: { display: "flex", gap: "10px" },
  buttonPrimary: {
    padding: "8px 16px",
    borderRadius: "8px",
    border: "none",
    background: "#007bff",
    color: "white",
    fontWeight: 600,
    cursor: "pointer",
  },
  buttonSecondary: {
    padding: "8px 16px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    background: "#f8f9fa",
    color: "#333",
    cursor: "pointer",
  },
  emptyState: { textAlign: "center", color: "#888", padding: "40px 0" },
  errorText: { color: "#d93025", fontWeight: "bold" },
};
