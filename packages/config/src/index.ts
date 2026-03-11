export const DEFAULT_CLUB_ID = 1;

export const FEATURE_FLAGS = {
  TEAM_RANKING: 'team_ranking',
} as const;

export type FeatureFlagKey = typeof FEATURE_FLAGS[keyof typeof FEATURE_FLAGS];

/** Fallback API base URL used when NEXT_PUBLIC_API_BASE_URL / EXPO_PUBLIC_API_BASE_URL is not set. */
export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000';

/**
 * Default IANA timezone applied to season / session creation.
 * This should eventually become a per-club setting stored in the database.
 */
export const DEFAULT_TIMEZONE = 'America/Vancouver';

/** Default values used when creating sessions without explicit location data. */
export const DEFAULT_SESSION_LOCATION = 'Club Session';
export const DEFAULT_SESSION_ADDRESS = 'TBD';

export const SEEDED_USERS = {
  globalAdmin: { email: 'GlobalAdmin@leagueos.local', password: 'GlobalAdmin@123' },
  clubAdmin: { email: 'fvma-clubAdmin@leagueos.local', password: 'Admin@123' },
  recorder: { email: 'enosh_fvma_badminton_club@leagueos.local', password: 'Recorder@123' },
};

export type RuntimeConfig = {
  apiBaseUrl: string;
};
