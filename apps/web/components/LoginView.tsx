'use client';

import { useState } from 'react';
import { SEEDED_USERS } from '@leagueos/config';

type Props = {
  onLogin: (args: { email: string; password: string }) => Promise<void>;
  error: string | null;
  loading: boolean;
  subtitle?: string;
  buttonLabel?: string;
  infoMessage?: string | null;
  initialEmail?: string;
  initialPassword?: string;
};

export function LoginView({
  onLogin,
  error,
  loading,
  subtitle = 'Sign in to view season leaderboard',
  buttonLabel = 'Sign In',
  infoMessage = null,
  initialEmail = SEEDED_USERS?.clubAdmin?.email ?? '',
  initialPassword = SEEDED_USERS?.clubAdmin?.password ?? '',
}: Props) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState(initialPassword);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        background: 'linear-gradient(140deg, #eef2ff 0%, #e0f2fe 55%, #f8fafc 100%)',
      }}
    >
      <section
        style={{
          width: '100%',
          maxWidth: 390,
          background: '#fff',
          borderRadius: 24,
          border: '1px solid #e8edf3',
          padding: 24,
          boxShadow: '0 24px 50px rgba(2, 6, 23, 0.12)',
        }}
      >
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <img
              src="/LeagueOS_Full_Logo.png"
              alt="LeagueOS Logo"
              style={{ width: 260, maxWidth: '90%', height: 'auto', display: 'inline-block' }}
            />
            <p style={{ margin: '6px 0 0', color: '#64748b', fontSize: 14 }}>{subtitle}</p>
            {infoMessage ? <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 12 }}>{infoMessage}</p> : null}
          </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await onLogin({ email, password });
          }}
          style={{ display: 'grid', gap: 12 }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={labelStyle}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={labelStyle}>Password</span>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
                style={{ ...inputStyle, paddingRight: 64 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 0,
                  background: 'transparent',
                  color: '#64748b',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          {error ? <div style={{ color: 'var(--bad)', fontSize: 14 }}>{error}</div> : null}

          <button
            disabled={loading}
            type="submit"
            style={{
              border: 0,
              borderRadius: 14,
              padding: '12px 14px',
              color: '#fff',
              cursor: 'pointer',
              background: 'linear-gradient(90deg, var(--teal-start), var(--teal-end))',
              fontWeight: 700,
              boxShadow: '0 10px 22px rgba(13, 148, 136, 0.28)',
              marginTop: 2,
              opacity: loading ? 0.85 : 1,
            }}
          >
            {loading ? 'Signing in...' : buttonLabel}
          </button>
        </form>
      </section>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  border: '1px solid #d7dee8',
  borderRadius: 12,
  padding: '10px 12px',
  background: '#f8fafc',
  outline: 'none',
  color: '#111827',
};

const labelStyle: React.CSSProperties = {
  fontSize: 13,
  color: '#334155',
  fontWeight: 600,
};
