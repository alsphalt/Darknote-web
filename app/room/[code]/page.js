'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import RoomScreen from '@/components/RoomScreen';
import { validateRoomCode } from '@/shared/validation';

export default function RoomPage() {
  const { code } = useParams();
  const { user, initializing } = useAuth();
  const checked = validateRoomCode(String(code || ''));

  if (initializing) {
    return <p style={{ color: '#8899bb', textAlign: 'center', paddingTop: 60 }}>Loading…</p>;
  }
  if (!user) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 80, color: '#ccd' }}>
        <p>Please log in to join this game.</p>
        <p><Link href="/" style={{ color: '#ffd700' }}>Go to the lobby</Link></p>
      </div>
    );
  }
  if (!checked.valid) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 80, color: '#ccd' }}>
        <p style={{ color: '#ff6b6b' }}>Invalid room code — room codes are exactly 6 digits.</p>
        <p><Link href="/" style={{ color: '#ffd700' }}>Back to the lobby</Link></p>
      </div>
    );
  }

  return (
    <main style={{ background: '#1a1a2e', minHeight: '100vh', paddingTop: 10 }}>
      <RoomScreen code={checked.normalized} />
    </main>
  );
}
