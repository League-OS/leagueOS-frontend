export type AdminEffectiveRole = 'GLOBAL_ADMIN' | 'CLUB_ADMIN' | 'USER' | 'RECORDER' | 'UNKNOWN';

export function toAdminEffectiveRole(role?: string | null, clubRole?: string | null): AdminEffectiveRole {
  const value = String(clubRole ?? role ?? '').toUpperCase();
  if (value === 'GLOBAL_ADMIN') return 'GLOBAL_ADMIN';
  if (value === 'CLUB_ADMIN') return 'CLUB_ADMIN';
  if (value === 'USER') return 'USER';
  if (value === 'RECORDER') return 'RECORDER';
  return 'UNKNOWN';
}

export function canAccessAdmin(role: AdminEffectiveRole): boolean {
  return role === 'GLOBAL_ADMIN' || role === 'CLUB_ADMIN';
}

export function canManageClubs(role: AdminEffectiveRole): boolean {
  return role === 'GLOBAL_ADMIN';
}
