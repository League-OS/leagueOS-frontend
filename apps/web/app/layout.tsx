import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LeagueOS Leaderboard',
  description: 'Season leaderboard frontend for LeagueOS API',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
