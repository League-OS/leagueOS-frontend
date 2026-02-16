export const DEFAULT_CLUB_ID = 1;

export const SEEDED_USERS = {
  admin: { email: 'admin@clubrally.local', password: 'Admin@123' },
  user: { email: 'user@clubrally.local', password: 'User@1234' },
};

export type RuntimeConfig = {
  apiBaseUrl: string;
};
