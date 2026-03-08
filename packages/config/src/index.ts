export const DEFAULT_CLUB_ID = 1;
export const FEATURE_FLAGS = {
  TEAM_RANKING: 'team_ranking',
} as const;

export type FeatureFlagKey = typeof FEATURE_FLAGS[keyof typeof FEATURE_FLAGS];

export const SEEDED_USERS = {
  globalAdmin: { email: 'GlobalAdmin@leagueos.local', password: 'GlobalAdmin@123' },
  clubAdmin: { email: 'fvma-clubAdmin@leagueos.local', password: 'Admin@123' },
  recorder: { email: 'enosh_fvma_badminton_club@leagueos.local', password: 'Recorder@123' },
};

export type RuntimeConfig = {
  apiBaseUrl: string;
};
