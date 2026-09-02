'use client';

import { useAuth } from '@/contexts/AuthContext';
import AuthScreen from '@/components/AuthScreen';
import Lobby from '@/components/Lobby';

export default function Home() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return (
      <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#8899bb' }}>Loading…</p>
      </div>
    );
  }

  return (
    <main style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', minHeight: '100vh',
      justifyContent: 'center', padding: '20px', background: '#1a1a2e',
    }}>
      {user ? <Lobby /> : <AuthScreen />}
    </main>
  );
}
