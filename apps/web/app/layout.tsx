import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LeagueOS',
  description: 'Season leaderboard frontend for LeagueOS API',
  icons: {
    icon: '/LeagueOS_Small_Logo.png',
    shortcut: '/LeagueOS_Small_Logo.png',
    apple: '/LeagueOS_Small_Logo.png',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
