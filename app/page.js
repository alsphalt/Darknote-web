import Board from '@/components/Board';

export default function Home() {
  return (
    <main style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      minHeight: '100vh', 
      justifyContent: 'center', 
      padding: '20px',
      background: '#1a1a2e'
    }}>
      <h1 style={{ 
        color: 'white', 
        fontSize: '2.5rem', 
        textShadow: '0 0 10px rgba(255,215,0,0.5)',
        marginBottom: '20px'
      }}>
        🎲 Ludo
      </h1>
      <Board />
    </main>
  );
}
