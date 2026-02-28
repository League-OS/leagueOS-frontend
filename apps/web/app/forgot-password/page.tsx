'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { LeagueOsApiClient } from '@leagueos/api';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000';

export default function ForgotPasswordPage() {
  const client = useMemo(() => new LeagueOsApiClient({ apiBaseUrl: API_BASE }), []);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [mailError, setMailError] = useState<string | null>(null);

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: '#f8fafc' }}>
      <section style={{ width: '100%', maxWidth: 420, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, display: 'grid', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Forgot Password</h1>
        <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>Enter your email and we’ll send a reset link if the account exists.</p>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" style={field} />
        </label>
        <button
          style={btn}
          disabled={loading || !email.trim()}
          onClick={async () => {
            setLoading(true);
            setResetLink(null);
            setMailError(null);
            try {
              const res = await client.forgotPassword(email.trim());
              setMessage(res.message);
              if (res.reset_link) setResetLink(res.reset_link);
              if (res.email_send_error) setMailError(res.email_send_error);
            } catch {
              setMessage('If the account exists, a reset email has been sent.');
            } finally {
              setLoading(false);
            }
          }}
        >
          {loading ? 'Sending...' : 'Send Reset Link'}
        </button>
        {message ? <div style={{ fontSize: 13, color: '#0f766e' }}>{message}</div> : null}
        {resetLink ? (
          <div style={{ fontSize: 13, color: '#334155', display: 'grid', gap: 4 }}>
            <span>Local reset link:</span>
            <a href={resetLink} style={{ color: '#0d9488', wordBreak: 'break-all' }}>{resetLink}</a>
          </div>
        ) : null}
        {mailError ? <div style={{ fontSize: 12, color: '#92400e' }}>Email delivery warning: {mailError}</div> : null}
        <Link href="/" style={{ color: '#0d9488', fontSize: 13, textDecoration: 'none' }}>Back to Login</Link>
      </section>
    </main>
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
