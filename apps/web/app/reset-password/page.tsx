'use client';

import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { LeagueOsApiClient } from '@leagueos/api';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000';

function ResetPasswordInner() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const client = useMemo(() => new LeagueOsApiClient({ apiBaseUrl: API_BASE }), []);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: '#f8fafc' }}>
      <section style={{ width: '100%', maxWidth: 440, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, display: 'grid', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Reset Password</h1>
        {!token ? <div style={{ color: '#b91c1c', fontSize: 13 }}>Missing or invalid reset token.</div> : null}
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>New Password</span>
          <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" style={field} />
        </label>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>Confirm Password</span>
          <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" style={field} />
        </label>
        <button
          style={btn}
          disabled={loading || !token || !newPassword || !confirmPassword}
          onClick={async () => {
            setLoading(true);
            setError(null);
            setMessage(null);
            try {
              const res = await client.resetPassword(token, newPassword, confirmPassword);
              setMessage(res.message);
            } catch (e: unknown) {
              setError(e instanceof Error ? e.message : 'Unable to reset password.');
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? 'Resetting...' : 'Reset Password'}
        </button>
        {error ? <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div> : null}
        {message ? <div style={{ color: '#0f766e', fontSize: 13 }}>{message}</div> : null}
        <Link href="/" style={{ color: '#0d9488', fontSize: 13, textDecoration: 'none' }}>Back to Login</Link>
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>Loading...</main>}>
      <ResetPasswordInner />
    </Suspense>
  );
}

const field: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  padding: '10px 12px',
};

const btn: React.CSSProperties = {
  border: 0,
  borderRadius: 10,
  padding: '10px 12px',
  background: '#0d9488',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
};
