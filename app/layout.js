import './globals.css';
import { AppProviders } from './providers';

export const metadata = {
  title: 'Ludo — Play with friends',
  description: 'Multiplayer Ludo with realtime rooms: roll the dice, race your tokens and win.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
