import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LeagueOS',
  description: 'Season leaderboard frontend for LeagueOS API',
  icons: {
    icon: '/leagueos-mark.png',
    shortcut: '/leagueos-mark.png',
    apple: '/leagueos-mark.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
