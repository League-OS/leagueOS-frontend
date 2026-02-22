# Agent Onboarding (LeagueOS Frontend)

Trust this file first. Only search the repo if this document is incomplete or you find it is wrong.

## What This Repository Is

- `leagueOS-frontend` is a `pnpm` + `Turborepo` monorepo for LeagueOS client apps.
- It contains:
- `apps/web`: Next.js 15 web UI (App Router).
- `apps/mobile`: Expo SDK 51 React Native app.
- `packages/api`: shared typed API client (`LeagueOsApiClient`) used by web/mobile.
- `packages/schemas`: shared Zod schemas/types.
- `packages/config`: shared constants (default club, seeded users, runtime config type).
- `packages/ui`: shared UI tokens (currently minimal).
- Root scripts orchestrate workspace tasks via Turbo (`dev`, `build`, `lint`, `typecheck`).

## Repo Size / Stack / Runtime

- Small-to-medium TS monorepo (tracked files are concentrated under `apps/` and `packages/`).
- Languages: TypeScript, React/React Native, minimal JS config files.
- Web runtime: Node.js (`next dev`, `next build`, `next start`).
- Mobile runtime: Expo CLI / Metro (local device/simulator).
- Package manager is pinned in root `package.json`: `pnpm@10.14.0`.
- Validated locally in this environment with `node v20.10.0`, `pnpm 10.14.0`.

## Important Reality Checks (Validated)

- There is **no `.github/workflows/` CI config** in this repo. Do not assume GitHub Actions checks exist.
- Root `pnpm lint` currently fails because `apps/web` runs `next lint` without an ESLint config; Next prompts interactively for setup.
- `apps/web` test script currently fails because it runs `node --test` directly on a TypeScript ESM test file with no loader/transpilation.
- Admin unit tests may be added under `apps/web/components/admin/*.test.ts` and `apps/web/lib/*.test.ts`, but they share the same TS runner limitation until a TS-aware test runner (e.g. `tsx`/Vitest) is introduced.
- `pnpm build` succeeds from repo root.
- `pnpm typecheck` succeeds from repo root.
- `pnpm dev:web` could not be fully smoke-tested here due sandbox port bind restrictions (`EPERM 0.0.0.0:3000`), but command wiring is correct.

## Bootstrap / Build / Validate (Use This Order)

Always run from repo root: `/Users/bonythomas/Documents/code/leagueOS-frontend`

1. Bootstrap dependencies
- `pnpm install`
- Preconditions:
- Node 20+ recommended (validated with `v20.10.0`)
- `pnpm 10.14.0` (matches packageManager pin)
- Notes:
- In this sandbox, network is blocked, so `pnpm install` emitted `ERR_PNPM_META_FETCH_FAIL`.
- `pnpm` also prompted: “modules directories will be removed and reinstalled from scratch. Proceed?” when `node_modules` already existed.
- On a normal machine, run interactively and allow reinstall. If automating, prefer `pnpm install --frozen-lockfile` (CI) or `pnpm install --force` only when needed.

2. Typecheck (root, recommended first validation)
- `pnpm typecheck`
- Result: PASS (validated)
- Time observed: ~3.7s

3. Build (root)
- `pnpm build`
- Result: PASS (validated)
- Time observed: ~11.6s
- What runs:
- Turbo builds shared packages (`packages/*`) and the Next.js web app.
- `apps/mobile` has no `build` script, so it is not part of root `build`.

4. Lint (root)
- `pnpm lint`
- Result: FAIL (validated, reproducible)
- Failure mode:
- `apps/web` runs `next lint`
- Next.js opens interactive ESLint setup prompt because no ESLint config exists
- Turbo exits with `ELIFECYCLE`
- Workaround options:
- If your task does not require lint changes, skip lint and run `typecheck` + `build`.
- If you need lint to pass, first add/configure ESLint for `apps/web` (repo currently does not have it).

5. Tests (web-only script currently present)
- `pnpm --filter @leagueos/web test`
- Result: FAIL (validated, reproducible)
- Failure mode:
- `node --test components/addGameLogic.test.ts`
- Node treats file as CommonJS and errors on `import` syntax (`SyntaxError: Cannot use import statement outside a module`)
- Workaround:
- Use a TS-aware test runner/loader (e.g. Vitest, tsx, or Node loader) or convert test execution to transpiled JS.
- `apps/web/tsconfig.json` also excludes `**/*.test.ts`, so typecheck does not validate tests.

6. Run web app (local)
- `pnpm dev:web`
- Expected: Turbo runs `@leagueos/web` -> `next dev -p 3000`
- In this sandbox: failed with `listen EPERM ... 0.0.0.0:3000` (environment restriction, not app code)
- On your machine:
- Ensure port `3000` is free.
- Ensure backend API is running at `http://127.0.0.1:8000` (or override env).

7. Run mobile app (local device/simulator)
- `pnpm dev:mobile`
- Starts Expo (`expo start`) for `apps/mobile`.
- Not fully validated in this sandbox due interactive/device/network/port constraints.
- Use after `pnpm install` and env setup.

## Required Env Setup (Do Not Skip)

README setup is accurate and should be followed:

- `cp apps/web/.env.example apps/web/.env.local`
- `cp apps/mobile/.env.example apps/mobile/.env`
- Start backend API at `http://127.0.0.1:8000`

Validated examples exist:
- `apps/web/.env.example` uses `NEXT_PUBLIC_API_BASE_URL` and `NEXT_PUBLIC_DEFAULT_CLUB_ID`
- `apps/mobile/.env.example` uses `EXPO_PUBLIC_API_BASE_URL` and `EXPO_PUBLIC_DEFAULT_CLUB_ID`

Even if defaults point to localhost, copying the env files is useful because app code expects these variables in normal workflows and teammates may change defaults.

## Architecture / Where To Change What

### Main Paths

- Root orchestration: `package.json`, `turbo.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`
- Web app: `apps/web`
- Mobile app: `apps/mobile`
- Shared API + domain types: `packages/api`, `packages/schemas`
- Shared constants/config: `packages/config`

### Key Source Files (High Value)

- `packages/api/src/index.ts`
- Central typed API client used by both apps.
- Contains auth/session/leaderboard/player/club/court/game calls and `ApiError`.
- If backend contract changes, update this first.

- `packages/schemas/src/index.ts`
- Zod schemas and inferred TS types for API payloads.
- Update when backend response/request shapes change.

- `packages/config/src/index.ts`
- Default club ID and seeded credentials used by UIs.

- `apps/web/app/page.tsx`
- Main web screen logic: auth state, dashboard loading, season/session selection, leaderboard and record-game flows.

- `apps/web/app/admin/**`
- Desktop-first admin sub-app route tree under `/admin` (separate experience from the user-facing `/` route).
- Keep admin changes isolated from `apps/web/app/page.tsx` and `LeaderboardView.tsx` unless a shared behavior is intentionally changed.

- `apps/web/components/LeaderboardView.tsx`
- Main web UI rendering and action callbacks (home/leaderboard/profile tabs, session/game interactions).

- `apps/web/components/admin/AdminWorkspace.tsx`
- Main admin workspace controller (auth guard, club/season context, page panels, lifecycle actions).

- `apps/web/components/admin/adminWorkspaceLogic.ts`
- Pure admin helper logic extracted for easier test coverage (breadcrumbs, titles, player merges, session player counts).

- `apps/web/components/addGameLogic.ts`
- Pure logic helpers used by UI and by the only current test.

- `apps/mobile/App.tsx`
- Single-file mobile UI flow (login + leaderboard + season selection + secure storage).

### Web Build Notes

- `apps/web/next.config.mjs` uses `transpilePackages` for all shared workspace packages.
- This is why shared TS packages can be imported directly in the Next app.

### Mobile Build Notes

- `apps/mobile/app.json` defines Expo app metadata (SDK 51 toolchain from `package.json`).
- Mobile app stores token/club in `expo-secure-store`.

## Validation Checklist Before Opening a PR (Replicate Locally)

Use this sequence unless your task is docs-only:

1. `pnpm install`
2. `pnpm typecheck`
3. `pnpm build`
4. `pnpm --filter @leagueos/web test` (expect failure until test runner is fixed; document if untouched)
5. `pnpm dev:web` and manually smoke key flow if your change affects UI/runtime behavior

If you touch API/client/schema code, always run both `pnpm typecheck` and `pnpm build` from root because changes fan out across apps via workspace packages.

## Layout Snapshot (Tracked Root Files)

- `.gitignore`
- `README.md`
- `apps/`
- `docs/`
- `package.json`
- `packages/`
- `pnpm-lock.yaml`
- `pnpm-workspace.yaml`
- `railway.json`
- `tsconfig.base.json`
- `turbo.json`

## Extra Notes That Save Time

- `docs/IMPLEMENTATION_REVIEW.md` is the most detailed architecture/context doc in this repo.
- `railway.json` builds/deploys only the web app (`@leagueos/web`) using `pnpm`.
- Root `.gitignore` ignores `.next`, `dist`, `.expo`, `.turbo`, logs, and `.env*`.
- The repo may contain local uncommitted work (for example under `apps/web/app/admin`); check `git status` before editing and avoid overwriting unrelated changes.
