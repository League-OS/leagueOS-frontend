# leagueOS Frontend Monorepo

## Apps
- `apps/web`: Next.js web app
- `apps/mobile`: Expo mobile app

## Shared packages
- `packages/api`: Typed LeagueOS API client
- `packages/schemas`: Zod schemas + types
- `packages/config`: shared config and constants
- `packages/ui`: shared design tokens

## Local setup
1. `pnpm install`
2. `cp apps/web/.env.example apps/web/.env.local`
3. `cp apps/mobile/.env.example apps/mobile/.env`
4. Start API at `http://127.0.0.1:8000`
5. Run `pnpm dev`
