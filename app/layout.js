export const metadata = {
  title: 'Ludo Game',
  description: 'A simple Ludo board game frontend',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
