import Board from '@/components/Board';
import Dice from '@/components/Dice';

export default function Home() {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
      <h1 style={{ color: 'white', fontSize: '2.5rem', textShadow: '0 0 10px rgba(255,215,0,0.5)' }}>
        🎲 Ludo
      </h1>
      <Board />
      <Dice />
    </main>
  );
}
