'use client';

import { useState } from 'react';

type Props = {
  onLogin: (args: { email: string; password: string }) => Promise<void>;
  error: string | null;
  loading: boolean;
  subtitle?: string;
  buttonLabel?: string;
  infoMessage?: string | null;
};

export function LoginView({
  onLogin,
  error,
  loading,
  subtitle = 'Sign in to view season leaderboard',
  buttonLabel = 'Sign In',
  infoMessage = null,
}: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
          autoComplete="on"
          style={{ display: 'grid', gap: 12 }}
        >
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={labelStyle}>Email</span>
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your email"
              autoComplete="username"
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={labelStyle}>Password</span>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
                autoComplete="current-password"
                style={{ ...inputStyle, paddingRight: 64 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 0,
                  background: 'transparent',
                  color: '#64748b',
                  cursor: 'pointer',
                  width: 28,
                  height: 28,
                  display: 'grid',
                  placeItems: 'center',
                  padding: 0,
                }}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M3 3L21 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.58" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M9.88 5.08A11.84 11.84 0 0 1 12 4.9c4.5 0 8.27 2.61 10 6.35a11.9 11.9 0 0 1-3.11 4.14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                    <path d="M6.11 6.11A11.88 11.88 0 0 0 2 11.25C3.73 14.99 7.5 17.6 12 17.6c1.35 0 2.64-.24 3.82-.67" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="1.8" />
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                  </svg>
                )}
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
