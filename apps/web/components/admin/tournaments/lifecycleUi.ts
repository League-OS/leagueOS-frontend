import type { CSSProperties } from 'react';

import type { TournamentLifecycleStatus } from './types';

export const lifecycleStatusLabel: Record<TournamentLifecycleStatus, string> = {
  DRAFT: 'Draft',
  REGISTRATION_OPEN: 'Registration Open',
  REGISTRATION_CLOSED: 'Registration Closed',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const lifecycleStatusColors: Record<TournamentLifecycleStatus, { bg: string; border: string; text: string }> = {
  DRAFT: { bg: '#eef2f7', border: '#ced7e3', text: '#334155' },
  REGISTRATION_OPEN: { bg: '#e9f8f0', border: '#a8dcc2', text: '#0f6a4d' },
  REGISTRATION_CLOSED: { bg: '#fef3dd', border: '#f5d39b', text: '#92400e' },
  IN_PROGRESS: { bg: '#e8f1ff', border: '#b9cffa', text: '#1e40af' },
  COMPLETED: { bg: '#e9f6f7', border: '#acd7db', text: '#155e63' },
  CANCELLED: { bg: '#feeceb', border: '#f2b8b5', text: '#b42318' },
};

export function lifecycleStatusBadgeStyle(status: TournamentLifecycleStatus): CSSProperties {
  const colors = lifecycleStatusColors[status];
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    border: `1px solid ${colors.border}`,
    background: colors.bg,
    color: colors.text,
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: '0.01em',
    padding: '3px 9px',
    whiteSpace: 'nowrap',
  };
}

export function lifecycleStatusSelectStyle(status: TournamentLifecycleStatus): CSSProperties {
  const colors = lifecycleStatusColors[status];
  return {
    borderColor: colors.border,
    background: colors.bg,
    color: colors.text,
    fontWeight: 700,
  };
}

export function formatTimezoneWithOffset(timezone: string): string {
  if (!timezone) return '-';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'shortOffset',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date());
    const offsetPart = parts.find((part) => part.type === 'timeZoneName')?.value || '';
    const normalizedOffset = offsetPart.replace('UTC', 'GMT');
    return normalizedOffset ? `${timezone} (${normalizedOffset})` : timezone;
  } catch {
    return timezone;
  }
}
