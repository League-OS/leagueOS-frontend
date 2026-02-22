'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

export type AdminNavKey = 'dashboard' | 'clubs' | 'seasons' | 'sessions' | 'courts' | 'players';

export function AdminSidebar({
  active,
}: {
  active: AdminNavKey;
}) {
  const items: Array<{ key: AdminNavKey; label: string; href: string }> = [
    { key: 'dashboard', label: 'Dashboard', href: '/admin' },
    { key: 'clubs', label: 'Clubs', href: '/admin/clubs' },
    { key: 'seasons', label: 'Seasons', href: '/admin/seasons' },
    { key: 'sessions', label: 'Sessions', href: '/admin/sessions' },
    { key: 'courts', label: 'Courts', href: '/admin/courts' },
    { key: 'players', label: 'Club Players', href: '/admin/players' },
  ];

  return (
    <aside style={sidebar}>
      <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>LeagueOS</div>
      <div style={{ marginTop: 4, color: '#64748b', fontSize: 13 }}>Admin Console</div>
      <nav style={{ marginTop: 16, display: 'grid', gap: 8 }}>
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            style={{
              ...navLink,
              ...(active === item.key ? navLinkActive : {}),
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

export function AdminTopbar({
  title,
  subtitle,
  roleLabel,
  clubOptions,
  selectedClubId,
  onClubChange,
  seasonOptions,
  selectedSeasonId,
  onSeasonChange,
  canSelectClub,
  onRefresh,
  onLogout,
  loading,
}: {
  title: string;
  subtitle?: string;
  roleLabel: string;
  clubOptions: Array<{ id: number; name: string }>;
  selectedClubId: number | null;
  onClubChange: (clubId: number) => void;
  seasonOptions: Array<{ id: number; name: string }>;
  selectedSeasonId: number | null;
  onSeasonChange: (seasonId: number | null) => void;
  canSelectClub: boolean;
  onRefresh: () => void;
  onLogout: () => void;
  loading: boolean;
}) {
  return (
    <header style={topbar}>
      <div>
        <h1 style={{ margin: 0, fontSize: 24, color: '#0f172a' }}>{title}</h1>
        <div style={{ color: '#64748b', fontSize: 13 }}>{subtitle || roleLabel}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {canSelectClub ? (
          <select
            value={selectedClubId ?? ''}
            onChange={(e) => onClubChange(Number(e.target.value))}
            style={field}
            disabled={loading || !clubOptions.length}
          >
            {clubOptions.map((club) => (
              <option key={club.id} value={club.id}>{club.name}</option>
            ))}
          </select>
        ) : null}
        <select
          value={selectedSeasonId ?? ''}
          onChange={(e) => onSeasonChange(e.target.value ? Number(e.target.value) : null)}
          style={field}
          disabled={loading}
        >
          <option value="">All Seasons</option>
          {seasonOptions.map((season) => (
            <option key={season.id} value={season.id}>{season.name}</option>
          ))}
        </select>
        <span style={roleBadge}>{roleLabel}</span>
        <button style={outlineBtn} onClick={onRefresh} disabled={loading}>Refresh</button>
        <button style={outlineBtn} onClick={onLogout}>Logout</button>
      </div>
    </header>
  );
}

export function AdminBreadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <div style={crumbBar}>
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {item.href ? (
            <Link href={item.href} style={{ color: '#0d9488', textDecoration: 'none', fontWeight: 600 }}>{item.label}</Link>
          ) : (
            <span style={{ color: '#334155', fontWeight: 600 }}>{item.label}</span>
          )}
          {i < items.length - 1 ? <span style={{ color: '#94a3b8' }}>/</span> : null}
        </span>
      ))}
    </div>
  );
}

export function AdminCard({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: 18, color: '#0f172a' }}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function AdminEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div style={emptyState}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{title}</div>
      <div style={{ marginTop: 4, color: '#64748b', fontSize: 13 }}>{description}</div>
    </div>
  );
}

export function AdminTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<Array<ReactNode>>;
}) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={table}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column} style={th}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx}>
              {row.map((cell, cIdx) => (
                <td key={`${idx}-${cIdx}`} style={td}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const adminPageShell: React.CSSProperties = {
  minHeight: '100vh',
  background: '#eef2f7',
  display: 'grid',
  gridTemplateColumns: '260px minmax(0, 1fr)',
};

export const adminMainPanel: React.CSSProperties = {
  minWidth: 0,
  padding: 18,
  display: 'grid',
  gap: 12,
  alignContent: 'start',
};

export const adminAlertError: React.CSSProperties = {
  background: '#fff1f2',
  border: '1px solid #fecaca',
  color: '#9f1239',
  borderRadius: 12,
  padding: '10px 12px',
  fontSize: 14,
};

export const adminAlertSuccess: React.CSSProperties = {
  background: '#ecfdf5',
  border: '1px solid #a7f3d0',
  color: '#065f46',
  borderRadius: 12,
  padding: '10px 12px',
  fontSize: 14,
};

export const field: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  background: '#fff',
  padding: '10px 12px',
  minHeight: 40,
  color: '#0f172a',
};

export const outlineBtn: React.CSSProperties = {
  border: '1px solid #cbd5e1',
  borderRadius: 10,
  background: '#fff',
  color: '#0f172a',
  padding: '8px 12px',
  fontWeight: 600,
  cursor: 'pointer',
};

export const primaryBtn: React.CSSProperties = {
  border: 0,
  borderRadius: 10,
  background: 'linear-gradient(90deg, #14b8a6, #0d9488)',
  color: '#fff',
  padding: '9px 12px',
  fontWeight: 700,
  cursor: 'pointer',
};

const sidebar: React.CSSProperties = {
  background: '#fff',
  borderRight: '1px solid #dbe3ef',
  padding: 16,
  position: 'sticky',
  top: 0,
  height: '100vh',
};

const navLink: React.CSSProperties = {
  border: '1px solid #dbe3ef',
  borderRadius: 12,
  padding: '10px 12px',
  textDecoration: 'none',
  color: '#0f172a',
  fontWeight: 600,
  background: '#fff',
};

const navLinkActive: React.CSSProperties = {
  background: 'linear-gradient(135deg, #14b8a6, #0d9488)',
  color: '#fff',
  borderColor: '#0d9488',
};

const topbar: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #dbe3ef',
  borderRadius: 14,
  padding: 14,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  flexWrap: 'wrap',
};

const roleBadge: React.CSSProperties = {
  borderRadius: 999,
  border: '1px solid #bae6fd',
  background: '#eff6ff',
  color: '#075985',
  padding: '6px 10px',
  fontWeight: 700,
  fontSize: 12,
};

const crumbBar: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #dbe3ef',
  borderRadius: 12,
  padding: '8px 12px',
  display: 'flex',
  gap: 6,
  flexWrap: 'wrap',
};

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #dbe3ef',
  borderRadius: 14,
  padding: 14,
};

const emptyState: React.CSSProperties = {
  border: '1px dashed #cbd5e1',
  borderRadius: 12,
  background: '#f8fafc',
  padding: 16,
};

const table: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  minWidth: 700,
};

const th: React.CSSProperties = {
  textAlign: 'left',
  borderBottom: '1px solid #e2e8f0',
  padding: '10px 8px',
  color: '#475569',
  fontSize: 13,
};

const td: React.CSSProperties = {
  borderBottom: '1px solid #f1f5f9',
  padding: '10px 8px',
  color: '#0f172a',
  fontSize: 14,
};
