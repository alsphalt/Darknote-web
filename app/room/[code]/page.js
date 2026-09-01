'use client';

import { useParams } from 'next/navigation';
import { SocketProvider } from '@/contexts/SocketContext';
import Board from '@/components/Board';

// You'll need an auth hook that gives user and token
import { useAuth } from '@/hooks/useAuth';

export default function RoomPage() {
  const { code } = useParams();
  const { user, token } = useAuth(); // implement this hook

  if (!user) return <div>Please log in</div>;

  return (
    <SocketProvider roomId={code} userId={user.id} token={token}>
      <div style={{ padding: '20px' }}>
        <h1 style={{ color: 'white' }}>Room: {code}</h1>
        <Board roomId={code} />
      </div>
    </SocketProvider>
  );
}
