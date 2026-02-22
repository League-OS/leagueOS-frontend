# Agent Quickstart (LeagueOS Frontend)

Trust this file first. Only search the repo if information here is missing or incorrect.

## Repo Summary

- `pnpm` + `Turborepo` monorepo for LeagueOS clients.
- Apps:
- `apps/web` = Next.js 15 (App Router)
- `apps/mobile` = Expo SDK 51 / React Native
- Shared packages:
- `packages/api` (typed API client), `packages/schemas` (Zod schemas), `packages/config` (constants), `packages/ui` (tokens)

## Tool Versions (Validated)

- Node: `v20.10.0`
- pnpm: `10.14.0` (pinned in root `package.json`)

## Commands (Run From Repo Root)

1. Bootstrap
- `pnpm install`
- Always run before builds/checks on a fresh clone.
- In this sandbox, install could not fully run due blocked network (`ERR_PNPM_META_FETCH_FAIL`) and pnpm may prompt before reinstalling existing `node_modules`.

2. Typecheck (PASS)
- `pnpm typecheck`
- Validated: passes (~3.7s)

3. Build (PASS)
- `pnpm build`
- Validated: passes (~11.6s)
- Builds shared packages + Next.js web app. Mobile app is not part of root `build`.

4. Lint (FAIL currently)
- `pnpm lint`
- Fails because `apps/web` runs `next lint` and no ESLint config exists, so Next opens interactive setup prompt.

5. Web Test (FAIL currently)
- `pnpm --filter @leagueos/web test`
- Fails because script runs `node --test` on `components/addGameLogic.test.ts` (TypeScript ESM file) without a TS loader/transpiler.

6. Run Web (sandbox limitation)
- `pnpm dev:web`
- Wires correctly to `next dev -p 3000`.
- In this sandbox it fails with `listen EPERM ... 0.0.0.0:3000` (port-bind restriction).

7. Run Mobile (local only)
- `pnpm dev:mobile`
- Starts Expo (`expo start`); not validated here due interactive/device/network constraints.

## Required Setup (Do Not Skip)

- `cp apps/web/.env.example apps/web/.env.local`
- `cp apps/mobile/.env.example apps/mobile/.env`
- Start backend API at `http://127.0.0.1:8000`

## Where To Edit

- `packages/api/src/index.ts`: shared API client + request/error handling
- `packages/schemas/src/index.ts`: API schemas/types
- `packages/config/src/index.ts`: default club + seeded users/runtime config
- `apps/web/app/page.tsx`: web flow/state orchestration
- `apps/web/components/LeaderboardView.tsx`: main web UI
- `apps/web/components/addGameLogic.ts`: pure game/session helpers (has the current test)
- `apps/mobile/App.tsx`: mobile flow UI/state

## Validation Sequence (Best Default)

1. `pnpm install`
2. `pnpm typecheck`
3. `pnpm build`
4. `pnpm dev:web` (manual smoke if UI/runtime changed)

## CI / Pipelines

- No `.github/workflows/` found in this repo.
- `railway.json` deploy config exists and targets only `@leagueos/web`.
