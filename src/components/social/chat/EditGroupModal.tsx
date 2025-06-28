import React, { useState } from 'react';
import axios from 'axios';

interface EditGroupModalProps {
  room: any;
  onClose: () => void;
  onGroupUpdated: (updatedRoom: any) => void;
}

export function EditGroupModal({ room, onClose, onGroupUpdated }: EditGroupModalProps) {
  const [name, setName] = useState(room.name || '');
  const [description, setDescription] = useState(room.description || '');
  const [isLoading, setIsLoading] = useState(false);

  const getToken = () => localStorage.getItem('gp_token');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const token = getToken();
      const { data } = await axios.patch(
        `/api/chat/rooms/${room.id}`,
        { name, description },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      onGroupUpdated(data.updatedRoom);
      onClose();
    } catch (error: any) {
      alert(error.response?.data?.error || "Failed to update group details");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'white',
        padding: '24px',
        borderRadius: '12px',
        width: '400px',
        boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
      }}>
        <h2 style={{ marginTop: 0 }}>Edit Group</h2>
        
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
              Group Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #ccc',
                fontSize: '1rem'
              }}
            />
          </div>
          
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #ccc',
                minHeight: '100px',
                fontSize: '1rem'
              }}
            />
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 20px',
                background: '#f0f2f5',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: '10px 20px',
                background: '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 500
              }}
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
