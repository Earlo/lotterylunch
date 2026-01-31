# LotteryLunch API Task List

This task list is organized to keep the API as the #1 priority and the portal as a first-party client.

## Phase 0: Align on Scope (short)

1. Confirm v1 requirements:
   - Public vs private groups.
   - Weekly scheduling.
   - Basic calendar invites via ICS.
   - API tokens + webhooks in v1 or v1.1.
2. Decide naming:
   - "Lottery" vs "Program" vs "Series".
3. Decide match size constraints:
   - Default 2, allow 3–4.

## Phase 1: API Foundation (must-have)

1. Create API v1 route namespace:
   - [x] Add `src/app/api/v1/health/route.ts`.
   - [x] Add initial versioning structure under `src/app/api/v1/**`.
2. Establish error envelope + helpers:
   - [x] Add `src/server/http/errors.ts`.
   - [x] Add `src/server/http/responses.ts`.
3. Add validation layer:
   - [x] Add Zod schemas under `src/server/schemas/**`.
4. Centralize auth + authorization:
   - [x] Add `src/server/auth/session.ts`.
   - [x] Add `src/server/auth/authorization.ts`.
   - [x] Provide helpers `requireUser()` and `requireGroupRole()`.
5. Define service layer layout:
   - [x] Add `src/server/services/**` folders with stubs.

## Phase 2: Data Model (must-have)

1. Review existing Prisma schema and NextAuth models.
2. Add core models incrementally:
   - [x] Group, Membership.
   - [x] Lottery, LotteryRun.
   - [x] Participation, Match.
   - [x] CalendarArtifact.
3. Add enums:
   - [x] GroupVisibility, GroupRole, MembershipStatus.
   - [x] RunStatus, ParticipationStatus, MatchStatus.
4. Generate migration(s) and Prisma client.
   - [x] Prisma client generated locally (with env vars).
5. Add repositories / query helpers:
   - [x] `src/server/db/groups.ts`
   - [x] `src/server/db/lotteries.ts`
   - [x] `src/server/db/runs.ts`

## Phase 3: Groups + Memberships API (must-have)

1. Implement group services:
   - [x] `createGroup`
   - [x] `listGroups`
   - [x] `updateGroup`
   - [x] `deleteGroup`
2. Implement membership services:
   - [x] `joinGroup`, `inviteToGroup`, `updateMembership`, `removeMembership`.
3. Implement endpoints:
   - [x] `POST /api/v1/groups`
   - [x] `GET /api/v1/groups`
   - [x] `GET /api/v1/groups/:groupId`
   - [x] `PATCH /api/v1/groups/:groupId`
   - [x] Membership endpoints under `/api/v1/groups/:groupId/memberships`.
4. Add authorization tests:
   - Public join rules.
   - Private invite rules.
   - Role-based updates.

## Phase 4: Lotteries + Runs + Participation (must-have)

1. Implement lottery services:
   - [x] CRUD + schedule validation.
2. Implement run services:
   - [x] `createRun`, `listRuns`, `getRun`, `cancelRun`, `executeRun`.
3. Implement participation services:
   - [x] `upsertMyParticipation`, `listParticipations`.
4. Implement endpoints:
   - [x] Lotteries under `/api/v1/groups/:groupId/lotteries`.
   - [x] Runs under `/api/v1/lotteries/:lotteryId/runs` and `/api/v1/runs/:runId/**`.
5. Ensure state-machine-like transitions are enforced in services.
   - [x] Basic transitions enforced in services.

## Phase 5: Matching Engine (must-have)

1. Create matching domain module:
   - [x] `src/server/domain/matching/**`.
2. Implement initial algorithm:
   - [x] Inputs: confirmed participants + recent history window.
   - [x] Constraints: avoid recent repeats (best-effort).
   - [x] Output: list of matches and unmatched users.
3. Persist match results safely:
   - [x] Transactionally write matches.
   - [x] Mark run as `matched`.
4. Add deterministic tests:
   - Seeded/randomness control.
   - Edge cases: odd counts, small counts, repeat constraints.

## Phase 6: Calendar Artifacts (should-have, still API-first)

1. Implement ICS generation:
   - `src/server/integrations/calendar/ics.ts`.
2. Implement calendar artifact service:
   - `createCalendarArtifact(matchId, details)`.
3. Implement endpoints:
   - `POST /api/v1/matches/:matchId/calendar-artifacts`
   - `GET /api/v1/calendar-artifacts/:artifactId.ics`
4. Add tests:
   - ICS UID stability.
   - Timezone handling.

## Phase 7: Integrator Features (should-have)

1. API tokens:
   - Token model with hashed secrets.
   - Create/revoke endpoints.
   - Token auth middleware.
2. Webhooks:
   - Endpoint model.
   - Event emitter.
   - Delivery + retry records.
   - Signed webhook delivery (HMAC).
3. Events to emit:
   - `run.executed`, `match.created`, `calendar.artifact.created`.

## Phase 8: Portal as First-Party Client (secondary)

1. Build minimal portal flows on top of the API services:
   - Create group.
   - Join group.
   - Confirm participation.
   - View matches.
2. Ensure portal does not bypass service layer invariants.

## Phase 8.5: Web UI Separation + Clarity (portal-focused)

1. Establish a clear web UI boundary:
   - [x] Create `src/app/(webui)/**` route group with its own layout.
   - [x] Keep API routes under `src/app/api/**` only.
2. Create a web UI service layer:
   - [x] Add a typed API client in `src/webui/api/**`.
   - [x] Add `src/webui/queries/**` for data hooks and cache keys.
   - [x] Add `src/webui/mutations/**` for write operations.
3. Define shared UI primitives:
   - [x] Add `src/webui/components/ui/**` for buttons, inputs, dialogs.
   - [x] Add `src/webui/components/layout/**` for app shell, nav, empty states.
4. Define portal pages and states:
   - [x] `/portal` landing (empty state + CTA).
   - [x] `/portal/groups`, `/portal/groups/:groupId`.
   - [x] `/portal/lotteries/:lotteryId`, `/portal/runs/:runId`.
   - [x] Loading, empty, error, and unauthorized states for each.
5. Auth + session handling:
   - [x] Guarded routes (client + server).
   - [x] Redirect rules for unauthenticated users.
6. Styling + design tokens:
   - [x] Define CSS variables and baseline typography.
   - [x] Document component usage and spacing scale.
7. Add web UI tests:
   - [x] Smoke tests for core pages.
   - [x] API contract mocks for UI flows.
8. Add missing portal capabilities:
   - [x] Add a logout affordance in the portal shell.
   - [x] Add account settings UI (profile, timezone, avatar).
   - [x] Add group creation and join flows (create group, join by group ID or invite).
   - [x] Add calendar integration management (connect/disconnect providers, ICS download).
   - [x] Add lunch time preferences and lottery frequency controls.
   - [x] Add area/location field to preferences and surface in profile.

## Phase 8.6: Auth Migration (portal + API)

1. Migrate from NextAuth to Better Auth:
   - [x] Inventory current NextAuth usage and auth dependencies.
   - [x] Add Better Auth config and providers.
   - [x] Update API auth helpers and session retrieval.
   - [x] Update web UI auth components and guards.
   - [x] Update environment variables and secrets.
   - [ ] Align Prisma auth models with Better Auth requirements + migrate data.
   - [x] Remove NextAuth dependencies and routes after cutover.

## Phase 9: API Quality Bar (must-have for API-first)

1. Add API docs:
   - [x] Endpoint reference in `docs/`.
   - [x] Example requests/responses.
2. Add contract tests:
   - Status codes.
   - Error envelope consistency.
3. Add basic rate limiting + abuse protections.
   - [x] Basic rate limiting added in `src/middleware.ts`.
4. Add audit-friendly logs around critical transitions.
   - [x] Added structured logs in run execution/cancel and membership changes.

## Missing Features Snapshot (as of now)

### API (still missing)

- [ ] Calendar artifacts API (ICS generation + artifact CRUD).
- [ ] Calendar connections API (connect/disconnect providers, status).
- [ ] Availability slots API (lunch time windows / recurring availability).
- [ ] API tokens + auth middleware.
- [ ] Webhooks (endpoints, delivery, retries, signatures).
- [ ] Membership invite tokens + invite-accept flow.
- [ ] Contract tests for status codes + error envelope.
- [ ] Authorization tests for membership + group role rules.

### Web UI (still missing)

- [ ] Group invite flow (send invite, join via invite token).
- [ ] Membership management UI (roles, remove members).
- [ ] Lottery creation/editing UI (scheduleJson, size, repeat window).
- [ ] Run management UI (open/close enrollment, execute/cancel).
- [ ] Participation confirmation UI.
- [ ] Matches view + calendar artifact download.
- [ ] Calendar connections UI backed by real API (not placeholder).
- [ ] Availability / schedule editor for users and groups.

## Suggested First Slice (high-leverage)

If you want the most progress quickly while staying API-first:

1. Phase 1 (API foundation).
2. Phase 2 (data model for groups, memberships, lotteries, runs, participations).
3. Phase 3 (groups + memberships endpoints).
4. Phase 4 + 5 (execute a run and produce matches).
