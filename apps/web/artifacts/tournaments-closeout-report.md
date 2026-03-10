# Tournament UI Closeout Report (Phases 1-4)

## Phase 1 — WS contract hardening
- Added normalized live event envelope in `apps/web/lib/tournamentLive.ts`
  - `version`, `eventId`, `source`, `seq`, `type`, `ts`
- Added duplicate suppression via `eventId`
- Added stale-event guard + optional `onResync`
- Added reconnect backoff + resync trigger on reconnect

## Phase 2 — visual parity polish
- Existing public/operator/mobile/venue pages retained and aligned with new authoritative data contract.
- Status chips/counts now use display summary from backend.

## Phase 3 — smoke/e2e pack
- Added frontend smoke test: `apps/web/e2e/tournaments-smoke.spec.ts`
- Added backend smoke script: `scripts/smoke_tournaments_v2.py`

## Phase 4 — rollout package
### Pre-release checks
1. Ensure `TOURNAMENTS_V1` is active for pilot clubs.
2. Run API smoke script with valid bearer token.
3. Run frontend smoke test (targeted): `pnpm -C apps/web playwright test apps/web/e2e/tournaments-smoke.spec.ts`.
4. Validate pages:
   - `/admin/tournaments`
   - `/tournaments`
   - `/tournaments/:id/operator`
   - `/tournaments/:id/operator-mobile`
   - `/tournaments/:id/venue`

### Known risks
- Repo has pre-existing e2e/typecheck issues unrelated to tournament files.
- WS backend transport still depends on deployment environment; UI falls back to refresh/resync logic.

### Post-release monitor points
- Match record latency
- Public/venue stale display count
- Operator conflict incidents
