// src/components/social/chat/MessageWindow.tsx
import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { socket } from '@/lib/socket';

const getToken = () => (typeof window !== 'undefined' ? localStorage.getItem('gp_token') : null);
const getUserId = () => (typeof window !== 'undefined' ? localStorage.getItem('gp_userId') : null);
const getUsername = () => (typeof window !== 'undefined' ? localStorage.getItem('gp_username') : 'Me');

export function MessageWindow({ room }: { room: any }) {
  const userId = getUserId();
  const username = getUsername();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });

  useEffect(() => {
    const fetchMessages = async () => {
      const token = getToken();
      if (!room?.id || !token) return;
      try {
        const { data } = await axios.get(`/api/chat/rooms/${room.id}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setMessages(data.messages);
      } catch (error) {
        console.error("Failed to fetch messages", error);
      }
    };
    fetchMessages();
  }, [room?.id]);

  useEffect(scrollToBottom, [messages]);


useEffect(() => {
  const handleReceiveMessage = (message: any) => {
    setMessages(prev => {
      // Remove any optimistic message with same content and sender
      const filtered = prev.filter(
        m => !(String(m.id).startsWith('optimistic-') && m.content === message.content && m.sender.userId === message.sender.userId)
      );
      // Avoid adding duplicate real messages
      if (filtered.find(m => m.id === message.id)) return filtered;
      return [...filtered, message];
    });
  };
  socket.on('chat:receive_message', handleReceiveMessage);
  return () => {
    socket.off('chat:receive_message', handleReceiveMessage);
  };
}, [room?.id]);


  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !socket.connected) return;

    // Optimistic UI update: add message immediately with a temporary id
    const optimisticMessage = {
      id: `optimistic-${Date.now()}`,
      content: newMessage,
      createdAt: new Date().toISOString(),
      sender: { userId, username },
      chatRoomId: room.id,
    };
    setMessages(prev => [...prev, optimisticMessage]);

    socket.emit('chat:send_message', { chatRoomId: room.id, content: newMessage });
    setNewMessage('');
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
        {messages.map((msg: any) => (
          <div
            key={msg.id}
            style={{
              textAlign: msg.sender.userId === userId ? 'right' : 'left',
              opacity: String(msg.id).startsWith('optimistic-') ? 0.7 : 1,
            }}
          >
            <p
              style={{
                background: msg.sender.userId === userId ? '#dcf8c6' : '#fff',
                padding: '8px 12px',
                borderRadius: '10px',
                display: 'inline-block',
                maxWidth: '70%',
              }}
            >
              <strong>{msg.sender.username}</strong><br />
              {msg.content}
            </p>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <form onSubmit={handleSendMessage} style={{ padding: '10px', display: 'flex' }}>
        <input
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          style={{ flex: 1, padding: '10px' }}
          placeholder="Type a message..."
          autoComplete="off"
        />
        <button type="submit" style={{ padding: '10px' }}>Send</button>
      </form>
    </div>
  );
}
