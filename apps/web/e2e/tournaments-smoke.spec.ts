import { test, expect } from '@playwright/test';

test('tournaments public page renders with mocked display payload', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('leagueos.admin.auth', JSON.stringify({ token: 'test-token', clubId: 1 }));
  });

  await page.route('**/clubs/1/tournaments-v2', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 1,
          club_id: 1,
          name: 'Smoke Tournament',
          event_type: 'DOUBLES',
          format: 'GROUPS_KO',
          status: 'READY',
          enable_quarterfinals: false,
          matches_per_team: null,
          points_to_win: 21,
          win_by_two: true,
          max_point_cap: 23,
          published: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]),
    });
  });

  await page.route('**/clubs/1/tournaments-v2/1/display', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        tournament: { id: 1, club_id: 1, event_type: 'DOUBLES', format: 'GROUPS_KO', status: 'READY', enable_quarterfinals: false },
        summary: { live_count: 1, upcoming_count: 1, completed_count: 0, total_match_count: 2 },
        live_matches: [
          {
            id: 11,
            tournament_id: 1,
            stage: 'GROUP',
            stage_order: 1,
            status: 'SCHEDULED',
            display_state: 'LIVE',
            completion_reason: null,
            team_a_id: 1,
            team_a_seed_no: 1,
            team_a_name: 'A / B',
            team_b_id: 2,
            team_b_seed_no: 2,
            team_b_name: 'C / D',
            team_a_points: 8,
            team_b_points: 6,
            winner_team_id: null,
            group_id: 1,
            group_code: 'A',
            is_duplicate: false,
            title: 'GROUP · Match #11',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
        upcoming_matches: [],
        completed_matches: [],
        standings: { tournament_id: 1, format: 'GROUPS_KO', groups: [] },
        bracket: { quarterfinals: [], semifinals: [], finals: [] },
      }),
    });
  });

  await page.goto('/tournaments');
  await expect(page.getByText('Smoke Tournament')).toBeVisible();
  await expect(page.getByText('A / B')).toBeVisible();
});
