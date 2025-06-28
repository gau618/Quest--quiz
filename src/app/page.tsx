// src/app/page.tsx
"use client";
import { useRouter } from "next/navigation";
import React, { useState, useEffect } from "react";
import AuthService from "@/lib/services/auth.service";

export default function Home() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<{ id: string } | null>(null);

  useEffect(() => {
    // This effect runs only on the client side
    const userId = AuthService.getCurrentUserId();
    if (userId) {
      setCurrentUser({ id: userId });
    }
  }, []);

  const handleLogout = () => {
    AuthService.logout();
    setCurrentUser(null);
    // You can optionally redirect to the login page after logout
    // router.push('/login');
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🏠 Welcome to the App</h1>

      {currentUser ? (
        <div style={styles.buttonGroup}>
          <p style={styles.welcomeMessage}>
            Welcome, User ID: {currentUser.id}
          </p>
          <button style={styles.button} onClick={() => router.push("/game")}>
            🎮 Go to Game Page
          </button>
          <button style={styles.button} onClick={() => router.push("/friends")}>
            👥 Go to Friends Page
          </button>
          <button
            style={styles.button}
            onClick={() => router.push("/leaderboard")}
          >
            🏆 Go to Leaderboard
          </button>
          <button
            style={styles.button}
            onClick={() => router.push("/chatpage")}
          >
            💬 Go to Chat
          </button>
          <button
            style={{ ...styles.button, background: "#dc3545" }}
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      ) : (
        <div style={styles.buttonGroup}>
          <p style={styles.welcomeMessage}>
            You are not logged in. Please log in to continue.
          </p>
          <button style={styles.button} onClick={() => router.push("/login")}>
            Login
          </button>
        </div>
      )}
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "20px",
    padding: "40px 20px",
  },
  title: { fontSize: "2rem", marginBottom: "20px" },
  buttonGroup: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "15px",
  },
  welcomeMessage: { marginBottom: "20px", fontSize: "1.1rem", color: "#333" },
  button: {
    padding: "12px 24px",
    fontSize: "1rem",
    cursor: "pointer",
    borderRadius: "6px",
    background: "#0070f3",
    color: "#fff",
    border: "none",
    minWidth: "250px",
    textAlign: "center",
  },
};
