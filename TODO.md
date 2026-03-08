# TODO — leagueOS-frontend

Technical improvements in priority order. Each item is tagged `HIGH`, `MEDIUM`, or `LOW`.

---

## HIGH Priority


| ID  | Task                                                       | Notes                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | **Break up god components with proper state management**   | `page.tsx` has 30+ `useState` calls (~1000 lines), `LeaderboardView.tsx` ~2200 lines, `AdminWorkspace.tsx` ~3200 lines. Extract domain state into `useReducer` / context slices or a lightweight store (e.g. Zustand). Eliminate the 6 pairs of duplicated `record*` vs `selected*` state in `page.tsx`.                                                                                              |
| H2  | **Eliminate N+1 / waterfall API calls in `loadDashboard`** | Current flow fires 100+ parallel `gameParticipants()` calls (one per game), 10 `sessions()` calls (one per season), and a sequential waterfall of dependent fetches on every dashboard load. Needs API-side aggregation endpoints or a request-batching layer in the client.                                                                                                                          |
| H3  | **Fix UTC/timezone handling in `sessionSchema` transform** | `sessionSchema`'s `.transform()` calls `dt.getHours()` (browser local time), so `session_date` and `start_time_local` are wrong for users in a different timezone from the club. Use UTC date methods or accept an explicit timezone parameter. `combineSessionDateAndTimeToIso` in `addGameLogic.ts` also constructs a local `Date` before calling `.toISOString()` — verify round-trip correctness. |
| H4  | **Add ESLint config to `apps/web`**                        | `pnpm lint` fails interactively because no ESLint config exists. A real `react-hooks/exhaustive-deps` violation in `page.tsx` is suppressed with a disable comment instead of being fixed.                                                                                                                                                                                                            |
| H5  | **Replace test runner with Vitest or `tsx`**               | `node --test` on `.ts` files fails with a CommonJS `import` syntax error. Tests are also excluded from `tsconfig.json` so they are never type-checked. Adopt Vitest (recommended) or a `tsx` loader and re-include test files in `tsconfig`.                                                                                                                                                          |


---

## MEDIUM Priority


| ID  | Task                                               | Notes                                                                                                                                                                                                                                                                                                                                |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | **Add pagination to API client and UI list views** | All list methods (`games`, `players`, `sessions`) fetch unbounded result sets. `recentGames` slices client-side after fetching everything. Add `limit`/`offset` params to client methods and wire up pagination controls in the UI.                                                                                                  |
| M2  | **Introduce data caching / optimistic updates**    | Every mutation calls `loadDashboard()` which re-fetches all data. `sessionsBySeason` cache is never invalidated after mutations. Adopt SWR or React Query for cache management and optimistic updates on game/session mutations.                                                                                                     |
| M3  | **Type role fields as enums, not plain strings**   | `profile.role`, `profile.club_role`, and `authResponse.role` are typed as `z.string()`. All role checks are manual `.toUpperCase()` string comparisons. Change to `z.enum(['GLOBAL_ADMIN', 'CLUB_ADMIN', 'RECORDER', 'USER'])` to get type-safe exhaustive checks.                                                                   |
| M4  | **Implement missing features vs API surface**      | No UI exists for: password reset flow (`forgotPassword` / `resetPassword` client methods exist), close/reopen session (user-facing), edit/delete game, feature flag management in admin (`/admin/config-flags` route).                                                                                                               |
| M5  | **Fix mobile auth restore on app launch**          | Token is saved to SecureStore on login but never read back on mount — the app always shows the login screen. Add a `useEffect` on mount that reads the stored token and auto-restores the session.                                                                                                                                   |
| M6  | **Expand mobile app feature parity**               | Mobile only shows a season leaderboard. Missing: home screen, record-game flow, profile tab, ELO history chart, team leaderboard tab. Club list is hardcoded with placeholder names instead of using the API response.                                                                                                               |
| M7  | **Add React error boundaries**                     | No `<ErrorBoundary>` exists anywhere. `schema.parse()` throws `ZodError` on malformed API responses, which propagates as an unhandled exception in the render cycle. Wrap top-level routes and data-driven sections.                                                                                                                 |
| M8  | **Remove hardcoded values from production code**   | `CLUB_NAME_FALLBACK` maps real club names to hardcoded IDs in `page.tsx`. `America/Vancouver` timezone hardcoded in session/season creation. `location: 'Club Session'` and `address: 'TBD'` hardcoded on session create. `API_BASE` defined independently in `page.tsx` and `AdminWorkspace.tsx` instead of from `packages/config`. |


---

## LOW Priority


| ID  | Task                                                            | Notes                                                                                                                                                                                                                               |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | **Add loading skeletons for initial data fetch**                | A single global `loading` boolean controls all feedback. Initial load shows no skeleton layout. `hydratingAuth` shows plain text with no spinner or layout placeholder.                                                             |
| L2  | **Fix accessibility gaps in modals and nav**                    | No focus trap or Escape-key handler in any modal. `role="dialog"` / `aria-modal` missing. `window.confirm()` used for finalize/revert dialogs. Bottom `<nav>` missing `role="navigation"`. Row action buttons missing `aria-label`. |
| L3  | **Consolidate `API_BASE` into `packages/config`**               | Defined separately in `page.tsx` and `AdminWorkspace.tsx`. Should be a single exported constant from `packages/config`.                                                                                                             |
| L4  | **Remove unused `menuItemBtn` constant**                        | Defined in `LeaderboardView.tsx` but never referenced anywhere in the file.                                                                                                                                                         |
| L5  | **Memoize sub-components with `React.memo`**                    | `HomeScreen`, `AddGameScreen`, `HomeTableCard`, and others re-render on every parent state change. Apply `React.memo` to stable leaf components and `useCallback` to handlers passed as props.                                      |
| L6  | **Replace default game scores test data**                       | `scoreA: 21, scoreB: 17` hardcoded as defaults in `AddGameScreen`. Replace with empty/zero defaults or remove.                                                                                                                      |
| L7  | **Move profile tier thresholds to config**                      | 75% = "Smash Elite", 50% = "Rally Pro" win-rate brackets are inline magic numbers. Extract to a named config constant.                                                                                                              |
| L8  | **Remove `SEEDED_USERS` credentials from mobile production UI** | Real seeded passwords are exported from `packages/config` and pre-filled into the mobile login form. Remove from production UI; keep only in test/dev utilities.                                                                    |


