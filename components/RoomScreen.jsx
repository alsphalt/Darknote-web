'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { SocketProvider, useSocket } from '@/contexts/SocketContext';
import { useAuth } from '@/contexts/AuthContext';
import Board from '@/components/Board';

const COLOR_HEX = { red: '#e74c3c', green: '#2ecc71', yellow: '#f1c40f', blue: '#3498db' };

function RoomContent({ code }) {
  const router = useRouter();
  const { user } = useAuth();
  const {
    roomState, connection, lastError, joinRoom, leaveRoom, ended, gameState, setLastError,
  } = useSocket();

  const [room, setRoom] = useState(null); // REST snapshot (waiting room info)
  const [loadState, setLoadState] = useState('loading'); // loading|ready|error|gone
  const [loadError, setLoadError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const fetchRoom = useCallback(async () => {
    try {
      const data = await api.get(`/api/rooms/${code}`);
      setRoom(data);
      setLoadState('ready');
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setLoadState('gone');
      else {
        setLoadState('error');
        setLoadError(err.message);
      }
    }
  }, [code]);

  useEffect(() => {
    fetchRoom();
  }, [fetchRoom]);

  // Join the realtime room once connected
  const joinOnce = useCallback(async () => {
    if (connection !== 'connected') return;
    try {
      await joinRoom(code);
      // refresh the REST snapshot (players may have changed since we fetched)
      fetchRoom();
    } catch (err) {
      setActionError(err.message);
    }
  }, [connection, joinRoom, code, fetchRoom]);

  useEffect(() => {
    joinOnce();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection]);

  // Refresh snapshot while waiting (players join/leave)
  useEffect(() => {
    if (!roomState) return undefined;
    if (roomState.status === 'playing' || roomState.status === 'finished') {
      setRoom((prev) => (prev ? { ...prev, status: roomState.status } : prev));
      return undefined;
    }
    const t = setInterval(() => fetchRoom(), 2500);
    return () => clearInterval(t);
  }, [roomState?.status, roomState?.players?.length, fetchRoom]);

  const copyCode = async () => {
    const ok = await copyText(code);
    setCopied(ok); // 'Copied' only after a confirmed success
    if (ok) setTimeout(() => setCopied(false), 1600);
  };

  const startGame = async () => {
    setBusy(true);
    setActionError(null);
    try {
      await api.post(`/api/rooms/${code}/start`);
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const doLeave = async () => {
    setActionError(null);
    try {
      await api.post(`/api/rooms/${code}/leave`);
    } catch (err) {
      setActionError(err.message); // e.g. cannot leave mid-game
      return;
    }
    leaveRoom();
    router.push('/');
  };

  const players = useMemo(() => {
    const list = roomState?.players || room?.players || [];
    return list;
  }, [roomState, room]);

  const playing = (roomState?.status || room?.status) === 'playing';
  const finished = (roomState?.status || room?.status) === 'finished';
  const isHost = room?.host?.id === user?.id;
  const myColor = gameState?.players?.find((p) => p.userId === user?.id)?.color
    || players.find((p) => p.userId === user?.id)?.color
    || null;

  const notice = lastError || actionError || loadError;

  if (loadState === 'loading') {
    return <Center><StatusText>Loading room…</StatusText></Center>;
  }
  if (loadState === 'gone') {
    return (
      <Center>
        <StatusText>Room not found. It may have been closed.</StatusText>
        <ActionBtn onClick={() => router.push('/')}>Back to lobby</ActionBtn>
      </Center>
    );
  }
  if (loadState === 'error' && !room) {
    return (
      <Center>
        <StatusText>{loadError || 'Unable to load the room.'}</StatusText>
        <ActionBtn onClick={() => { setLoadState('loading'); fetchRoom(); }}>Retry</ActionBtn>
        <ActionBtn onClick={() => router.push('/')}>Back to lobby</ActionBtn>
      </Center>
    );
  }

  return (
    <div style={{ width: '100%', maxWidth: 1000, margin: '0 auto', padding: '12px 8px 30px' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        <h1 style={{ color: 'white', fontSize: '1.5rem', margin: 0 }}>
          {playing || finished ? '🎲 Ludo match' : '🎲 Game room'}
        </h1>
        <div style={{ background: '#2c3e50', color: '#ffd700', fontWeight: 'bold', letterSpacing: 2,
          padding: '6px 14px', borderRadius: 10, fontSize: 20, fontFamily: 'monospace' }}>
          {code}
        </div>
        <button onClick={copyCode} title="Copy room code"
          style={{ background: copied ? '#1e8449' : '#2c3e50', color: '#fff', border: 'none',
            borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontWeight: 600 }}>
          {copied ? '✓ Copied' : 'Copy'}
        </button>
        <span style={{ fontSize: 12, color: connection === 'connected' ? '#2ecc71' : '#e67e22' }}>
          {connection === 'connected' ? '● connected' : connection === 'reconnecting' ? '○ reconnecting…' : '○ offline'}
        </span>
        <button onClick={doLeave} style={{ marginLeft: 'auto', background: '#c0392b', color: '#fff', border: 'none',
          borderRadius: 8, padding: '7px 12px', cursor: 'pointer', fontWeight: 600 }}>
          Leave room
        </button>
      </div>

      {notice ? (
        <div style={{ background: '#3a1f1f', border: '1px solid #c0392b', color: '#ffb4b4',
          borderRadius: 10, padding: 10, margin: '12px auto 0', maxWidth: 560, textAlign: 'center', fontSize: 14 }}>
          {notice}
        </div>
      ) : null}

      {/* waiting room */}
      {!playing && !finished && (
        <div style={{ background: '#1c1c36', borderRadius: 16, padding: 18, marginTop: 14, maxWidth: 560, marginLeft: 'auto', marginRight: 'auto' }}>
          <div style={{ color: '#aab', fontSize: 13, marginBottom: 8 }}>
            Waiting room — share code <b style={{ color: '#ffd700', letterSpacing: 1 }}>{code}</b> with friends.
            The game starts automatically when all {room?.maxPlayers || 4} seats are full.
          </div>
          <div style={{ display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))' }}>
            {Array.from({ length: room?.maxPlayers || 4 }).map((_, i) => {
              const p = players[i];
              const seatColor = ['red', 'green', 'yellow', 'blue'][i];
              return (
                <div key={i} style={{
                  background: p ? '#14142b' : '#101022', borderRadius: 12, padding: 10,
                  border: p ? `2px solid ${COLOR_HEX[p.color || seatColor]}` : '1px dashed #334',
                  opacity: p ? 1 : 0.6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', display: 'inline-block',
                      background: COLOR_HEX[p?.color || seatColor] }} />
                    <b style={{ color: '#fff', fontSize: 14 }}>{p?.username || `Seat ${i + 1}`}</b>
                  </div>
                  <div style={{ fontSize: 12, color: p ? '#8899bb' : '#556' }}>
                    {!p ? 'Empty' : p.userId === room?.host?.id ? '👑 Host' : (roomState?.players?.[i]?.connected ? '● online' : '○ offline')}
                  </div>
                </div>
              );
            })}
          </div>
          {isHost && (
            <button onClick={startGame} disabled={busy || (players || []).length < 2}
              style={{
                marginTop: 14, width: '100%', padding: '12px', borderRadius: 50, border: 'none',
                background: (players || []).length < 2 ? '#3a3a5a' : '#ffd700', color: '#14142b',
                fontWeight: 'bold', cursor: (players || []).length < 2 ? 'not-allowed' : 'pointer', fontSize: 15,
              }}>
              {busy ? 'Starting…' : (players || []).length < 2 ? 'Need at least 2 players to start' : 'Start game now'}
            </button>
          )}
          {!isHost && (
            <div style={{ color: '#8899bb', fontSize: 13, marginTop: 12, textAlign: 'center' }}>
              Waiting for the host to start…
            </div>
          )}
        </div>
      )}

      {/* gameplay */}
      {(playing || finished) && (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            {players.map((p, i) => {
              const c = p.color || ['red', 'green', 'yellow', 'blue'][i];
              const connectedNow = p.userId ? (roomState?.players?.find((rp) => rp.userId === p.userId)?.connected ?? true) : true;
              return (
                <div key={p.userId || i} style={{
                  display: 'flex', alignItems: 'center', gap: 6, background: '#1c1c36',
                  borderRadius: 50, padding: '5px 12px', border: myColor === c ? `2px solid ${COLOR_HEX[c]}` : '2px solid transparent',
                }}>
                  <span style={{ width: 11, height: 11, borderRadius: '50%', background: COLOR_HEX[c] }} />
                  <span style={{ color: '#fff', fontSize: 13 }}>{p.username}</span>
                  {myColor === c && <span style={{ color: '#ffd700', fontSize: 12 }}>(you)</span>}
                  <span style={{ fontSize: 11, color: connectedNow ? '#2ecc71' : '#e67e22' }}>
                    {connectedNow ? '●' : '○'}
                  </span>
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 14 }}>
            <Board />
          </div>
          {(finished || ended) && (
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button onClick={() => router.push('/')}
                style={{ background: '#ffd700', color: '#14142b', border: 'none', borderRadius: 50,
                  padding: '12px 26px', fontWeight: 'bold', fontSize: 15, cursor: 'pointer' }}>
                Back to lobby
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Center({ children }) {
  return <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', justifyContent: 'center' }}>{children}</div>;
}
function StatusText({ children }) {
  return <div style={{ color: '#ccd', fontSize: 16 }}>{children}</div>;
}
function ActionBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ background: '#2c3e50', color: '#fff', border: 'none', borderRadius: 50, padding: '10px 22px', cursor: 'pointer', fontWeight: 600 }}>
      {children}
    </button>
  );
}

export default function RoomScreen({ code }) {
  return (
    <SocketProvider code={code}>
      <RoomContent code={code} />
    </SocketProvider>
  );
}
