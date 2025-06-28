// src/components/social/chat/CreateGroupChatModal.tsx
import React, { useState, useEffect, useMemo } from "react";
import axios from "axios";

// --- Helper Functions & Interfaces ---
const getToken = () => localStorage.getItem("gp_token");

interface Friend {
  userId: string;
  username: string;
  avatarUrl?: string; // Add avatar for better UI
}

interface Props {
  onClose: () => void;
  onGroupCreated: (newRoom: any) => void;
}

// --- Main Component ---
export function CreateGroupChatModal({ onClose, onGroupCreated }: Props) {
  // --- Component State ---
  const [friends, setFriends] = useState<Friend[]>([]);
  const [groupName, setGroupName] = useState("");
  const [selectedFriends, setSelectedFriends] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Data Fetching ---
  useEffect(() => {
    const fetchFriends = async () => {
      const token = getToken();
      if (!token) return;
      try {
        const { data } = await axios.get("/api/friends", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setFriends(data.friends);
      } catch (err) {
        console.error("Failed to fetch friends for group creation", err);
        setError("Could not load your friends list.");
      }
    };
    fetchFriends();
  }, []);

  // --- Memoized Filtering ---
  const filteredFriends = useMemo(() => {
    return friends.filter((friend) =>
      friend.username.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [friends, searchTerm]);

  // --- Event Handlers ---
  const handleFriendToggle = (friendId: string) => {
    setSelectedFriends((prev) =>
      prev.includes(friendId)
        ? prev.filter((id) => id !== friendId)
        : [...prev, friendId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); // Clear previous errors

    if (!groupName.trim()) {
      setError("Please provide a group name.");
      return;
    }
    if (selectedFriends.length === 0) {
      setError("Please select at least one friend to create a group.");
      return;
    }

    setIsLoading(true);
    const token = getToken();
    try {
      const { data } = await axios.post(
        "/api/chat/rooms",
        {
          type: "GROUP",
          groupName,
          memberIds: selectedFriends,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      onGroupCreated(data.room);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to create group.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={styles.backdrop}>
      <div style={styles.modalContainer}>
        <header style={styles.header}>
          <h2 style={styles.title}>Create New Group</h2>
          <button
            onClick={onClose}
            style={styles.closeButton}
            disabled={isLoading}
          >
            ×
          </button>
        </header>
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label htmlFor="groupName" style={styles.label}>
              Group Name
            </label>
            <input
              id="groupName"
              type="text"
              placeholder="E.g. Study Buddies"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              style={styles.input}
              required
            />
          </div>

          <div style={styles.inputGroup}>
            <label htmlFor="searchFriends" style={styles.label}>
              Select Members ({selectedFriends.length})
            </label>
            <input
              id="searchFriends"
              type="text"
              placeholder="Search friends..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.friendList}>
            {filteredFriends.length > 0 ? (
              filteredFriends.map((friend) => (
                <div
                  key={friend.userId}
                  style={styles.friendItem}
                  onClick={() => handleFriendToggle(friend.userId)}
                >
                  <img
                    src={
                      friend.avatarUrl ||
                      `https://api.dicebear.com/8.x/initials/svg?seed=${friend.username}`
                    }
                    alt={friend.username}
                    style={styles.avatar}
                  />
                  <span style={styles.friendName}>{friend.username}</span>
                  <input
                    type="checkbox"
                    readOnly
                    checked={selectedFriends.includes(friend.userId)}
                    style={styles.checkbox}
                  />
                </div>
              ))
            ) : (
              <p style={styles.noFriendsText}>No friends found.</p>
            )}
          </div>

          {error && <p style={styles.errorText}>{error}</p>}

          <footer style={styles.footer}>
            <button
              type="button"
              onClick={onClose}
              style={styles.buttonSecondary}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={styles.buttonPrimary}
              disabled={isLoading}
            >
              {isLoading
                ? "Creating..."
                : `Create Group (${selectedFriends.length + 1})`}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

// --- Best UI Styles ---
const styles: { [key: string]: React.CSSProperties } = {
  backdrop: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    background: "rgba(0, 0, 0, 0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  },
  modalContainer: {
    background: "white",
    padding: "24px",
    borderRadius: "12px",
    width: "90%",
    maxWidth: "480px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "20px",
  },
  title: { margin: 0, fontSize: "1.5rem", fontWeight: 600 },
  closeButton: {
    background: "none",
    border: "none",
    fontSize: "2rem",
    cursor: "pointer",
    color: "#888",
    lineHeight: 1,
  },
  form: { display: "flex", flexDirection: "column", gap: "16px" },
  inputGroup: {},
  label: {
    display: "block",
    marginBottom: "8px",
    fontWeight: 500,
    fontSize: "0.9rem",
  },
  input: {
    width: "100%",
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    fontSize: "1rem",
    boxSizing: "border-box",
  },
  friendList: {
    maxHeight: "250px",
    overflowY: "auto",
    border: "1px solid #eee",
    borderRadius: "8px",
    padding: "8px",
  },
  friendItem: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px",
    borderRadius: "6px",
    cursor: "pointer",
    transition: "background-color 0.2s",
  },
  avatar: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    objectFit: "cover",
    background: "#eee",
  },
  friendName: { flex: 1, fontWeight: 500 },
  checkbox: { width: "20px", height: "20px", accentColor: "#007bff" },
  noFriendsText: { textAlign: "center", color: "#888", padding: "20px" },
  errorText: {
    color: "#d93025",
    fontSize: "0.9rem",
    textAlign: "center",
    margin: "0",
  },
  footer: {
    display: "flex",
    justifyContent: "flex-end",
    gap: "12px",
    marginTop: "24px",
    borderTop: "1px solid #eee",
    paddingTop: "20px",
  },
  buttonSecondary: {
    padding: "12px 20px",
    borderRadius: "8px",
    border: "1px solid #ccc",
    background: "white",
    color: "#333",
    fontWeight: 600,
    cursor: "pointer",
  },
  buttonPrimary: {
    padding: "12px 20px",
    borderRadius: "8px",
    border: "none",
    background: "#007bff",
    color: "white",
    fontWeight: 600,
    cursor: "pointer",
  },
};
