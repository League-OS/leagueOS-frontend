'use client';

import dynamic from 'next/dynamic';

export const AdminWorkspace = dynamic(() => import('./AdminWorkspace').then((m) => m.AdminWorkspace), {
  ssr: false,
  loading: () => (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#eef2f7', padding: 24 }}>
      <section style={{ width: '100%', maxWidth: 520, background: '#fff', border: '1px solid #dbe3ef', borderRadius: 18, padding: 20, boxShadow: '0 16px 30px rgba(15,23,42,.08)' }}>
        <h1 style={{ margin: 0, fontSize: 28, color: '#0f172a' }}>LeagueOS Admin</h1>
        <p style={{ margin: '8px 0 0', color: '#64748b' }}>Loading admin workspace...</p>
      </section>
    </main>
  ),
});
