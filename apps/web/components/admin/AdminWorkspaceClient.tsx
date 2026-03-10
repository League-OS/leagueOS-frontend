'use client';

import dynamic from 'next/dynamic';

export const AdminWorkspace = dynamic(() => import('./AdminWorkspace').then((m) => m.AdminWorkspace), {
  ssr: false,
  loading: () => (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background:
          'radial-gradient(circle at 10% 12%, #e0efe8 0%, rgba(224, 239, 232, 0) 32%), radial-gradient(circle at 88% 16%, #f5ead3 0%, rgba(245, 234, 211, 0) 28%), linear-gradient(160deg, #f4f6f2 0%, #eef2ef 100%)',
        padding: 24,
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 520,
          background: 'rgba(255, 255, 255, 0.88)',
          border: '1px solid #d2ddd7',
          borderRadius: 18,
          padding: 20,
          boxShadow: '0 16px 30px rgba(20, 33, 29, 0.12)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 28, color: '#182521' }}>LeagueOS Admin</h1>
        <p style={{ margin: '8px 0 0', color: '#52605b' }}>Loading admin workspace...</p>
      </section>
    </main>
  ),
});
