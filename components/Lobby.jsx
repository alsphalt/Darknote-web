'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { validateRoomCode } from '@/shared/validation';

const cardStyle = {
  background: '#1c1c36', borderRadius: 16, padding: 20, marginTop: 14,
};
const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #334',
  background: '#14142b', color: '#eee', fontSize: 16, boxSizing: 'border-box', letterSpacing: '2px',
};
const btnBase = {
  width: '100%', padding: '13px', borderRadius: 50, border: 'none', fontWeight: 'bold',
  fontSize: 15, cursor: 'pointer', marginTop: 12,
};

export default function Lobby() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [maxPlayers, setMaxPlayers] = useState(4);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState(null);
  const [busy, setBusy] = useState(null); // 'create' | 'join'
  const [message, setMessage] = useState(null);

  async function createRoom() {
    setBusy('create');
    setMessage(null);
    try {
      const room = await api.post('/api/rooms', { maxPlayers });
      router.push(`/room/${room.code}`);
    } catch (err) {
      setMessage(err.message);
      setBusy(null);
    }
  }

  async function joinRoom() {
    setMessage(null);
    const checked = validateRoomCode(code);
    if (!checked.valid) {
      setCodeError(checked.error);
      return;
    }
    setCodeError(null);
    setBusy('join');
    try {
      const room = await api.post('/api/rooms/join', { code: checked.normalized });
      router.push(`/room/${room.code}`);
    } catch (err) {
      setMessage(err.message);
      setBusy(null);
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: 460, margin: '0 auto' }}>
      <div style={{ textAlign: 'center' }}>
        <h1 style={{ color: 'white', fontSize: '2.4rem', textShadow: '0 0 14px rgba(255,215,0,.45)', margin: '0 0 2px' }}>
          🎲 Ludo
        </h1>
        <p style={{ color: '#8899bb', margin: 0 }}>Logged in as <b style={{ color: '#ffd700' }}>{user?.username}</b></p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button onClick={() => logout()} style={{ ...btnBase, background: '#2c3e50', color: '#ccd', flex: 1, marginTop: 0 }}>
          Log out
        </button>
      </div>

      <div style={cardStyle}>
        <div style={{ color: '#aab', fontSize: 13, marginBottom: 8 }}>Create a room</div>
        <label style={{ color: '#8899bb', fontSize: 13 }}>
          Players
          <select
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(Number(e.target.value))}
            style={{ ...inputStyle, letterSpacing: 0, marginTop: 4, cursor: 'pointer' }}
          >
            <option value={2}>2 players</option>
            <option value={3}>3 players</option>
            <option value={4}>4 players</option>
          </select>
        </label>
        <button onClick={createRoom} disabled={busy === 'create'}
          style={{ ...btnBase, background: busy === 'create' ? '#7a7' : '#ffd700', color: '#14142b' }}>
          {busy === 'create' ? 'Creating…' : 'Create room'}
        </button>
      </div>

      <div style={cardStyle}>
        <div style={{ color: '#aab', fontSize: 13, marginBottom: 8 }}>Join a room</div>
        <input
          value={code}
          onChange={(e) => { setCode(e.target.value); setCodeError(null); }}
          onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
          placeholder="Enter 6-digit code"
          maxLength={6}
          inputMode="numeric"
          style={inputStyle}
        />
        {codeError ? <div style={{ color: '#ff6b6b', fontSize: 12, marginTop: 6 }}>{codeError}</div> : null}
        <button onClick={joinRoom} disabled={busy === 'join'}
          style={{ ...btnBase, background: busy === 'join' ? '#7a7' : '#2ecc71', color: '#0b2b18' }}>
          {busy === 'join' ? 'Joining…' : 'Join room'}
        </button>
      </div>

      {message ? (
        <div style={{ background: '#2a1f1f', color: '#ff6b6b', borderRadius: 10, padding: 12, marginTop: 14, fontSize: 14 }}>
          {message}
        </div>
      ) : null}

      <p style={{ color: '#556', fontSize: 12, textAlign: 'center', marginTop: 18 }}>
        Share the 6-digit room code with friends to play together.
      </p>
    </div>
  );
}
