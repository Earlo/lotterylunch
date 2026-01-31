# LotteryLunch API-First Design Document

## 1. Summary

LotteryLunch is an API-first service for organizing "lottery lunches" (randomized small-group meals). The web portal is a first-party client of the API, but the API is the primary product surface and must be clean, stable, and integrator-friendly.

Key goals:

- Provide a generic, well-structured API for organizing recurring randomized lunches.
- Support both public groups (open participation) and personal/private groups (invite-only).
- Support calendar invites and lifecycle events (schedule, confirm, cancel, reschedule).
- Enable integrations with other platforms/services via a clear auth and webhook story.

Non-goals (initially):

- Deep calendar provider write-back beyond basic invite links/ICS generation.
- Complex multi-tenant enterprise features (SCIM, SSO beyond OAuth, etc.).

---

## 2. Product Requirements (API Perspective)

### 2.1 Core capabilities

1. Users can create and join groups.
2. Groups can be public or private.
3. A group can run "lotteries" on a schedule (e.g., weekly).
4. Each lottery run generates matches (pairs or small groups).
5. Users can confirm participation per run.
6. The system can generate calendar invites for matches.
7. Integrators can:
   - Authenticate users.
   - Manage groups and memberships.
   - Trigger runs or rely on scheduling.
   - Receive events via webhooks.

### 2.2 Primary API surfaces

- Identity/authentication.
- Groups + memberships.
- Lotteries (definitions).
- Lottery runs (instances).
- Matches (results).
- Scheduling + calendar invite artifacts.
- Webhooks + event streams.

---

## 3. Architecture Overview

This repo is already a Next.js app with Prisma and NextAuth. We will treat it as:

- API host: Next.js Route Handlers under `src/app/api/**`.
- Core domain logic: `src/server/**` (pure functions + services).
- Persistence: Prisma models + repositories under `src/server/db/**`.
- Auth: NextAuth for user identity + API tokens for integrators.
- Portal: `src/app/**` consumes the same domain services.

### 3.1 Layered structure (proposed)

- `src/app/api/v1/**/route.ts`
  - Thin HTTP layer (parsing, auth, status codes).
- `src/server/services/**`
  - Business logic orchestration.
- `src/server/domain/**`
  - Core types, invariants, and matching algorithm(s).
- `src/server/db/**`
  - Prisma-backed repositories and query helpers.
- `src/server/integrations/**`
  - Calendar, email, and webhook delivery.

This keeps the API stable and makes the portal just another client.

---

## 4. Domain Model

### 4.1 Entities

1. User
   - A person authenticated via OAuth (NextAuth).
2. Group
   - A collection of users with a purpose and configuration.
   - Visibility: `public` or `private`.
3. Membership
   - A user’s relationship to a group.
   - Roles: `owner`, `admin`, `member`.
   - Status: `active`, `invited`, `left`, `removed`.
4. Lottery
   - A reusable configuration defining how matching works.
   - Belongs to a Group.
5. LotteryRun
   - A specific execution of a Lottery at a specific time window.
6. Participation
   - A user’s per-run response: `pending`, `confirmed`, `declined`.
7. Match
   - A set of 2..N users matched for a run.
8. CalendarArtifact
   - An ICS file or invite link generated for a match.
9. WebhookEndpoint
   - A destination configured to receive events.
10. WebhookDelivery

- Delivery attempt records for observability/retry.

### 4.2 Key relationships

- Group 1..\* Lottery
- Group 1..\* Membership
- Lottery 1..\* LotteryRun
- LotteryRun 1..\* Participation
- LotteryRun 1..\* Match
- Match 0..\* CalendarArtifact

---

## 5. Matching & Scheduling Concepts

### 5.1 Matching rules (initial)

- Group size target: default 2, optional 3–4.
- Avoid recent repeats: do not match users who met within last K runs.
- Respect participation: match only `confirmed` users.
- Handle leftovers:
  - If 1 user left over, create a 3-person group (if allowed) or mark unmatched.

### 5.2 Scheduling modes

- Manual: integrator or admin triggers a run.
- Scheduled: system generates runs based on a schedule.

### 5.3 Scheduling configuration (Lottery)

- Frequency: weekly (initial).
- Day-of-week.
- Enrollment cutoff time.
- Matching execution time.
- Timezone (important).

---

## 6. API Design

### 6.1 Principles

- Versioned: `/api/v1/**`.
- Resource-oriented JSON.
- Idempotent where it matters.
- Strongly typed request/response schemas.
- Consistent error envelope.

### 6.2 Auth model

Two auth modes:

1. User session auth (first-party portal + OAuth flows).
2. API tokens (integrators / service-to-service).

Recommended approach:

- Keep NextAuth for user sessions.
- Add API tokens:
  - Personal Access Tokens (PAT) for user-scoped integrations.
  - Optional Group-scoped tokens for automation.

### 6.3 Error envelope (proposed)

All non-2xx responses return:

```json
{
  "error": {
    "code": "string_machine_code",
    "message": "human-readable summary",
    "details": {}
  }
}
```

### 6.4 Core resources and endpoints (v1)

Note: these are the minimum viable API surfaces to support both integrations and the portal.

#### Users

- `GET /api/v1/me`
  - Returns current authenticated user profile and global preferences.

#### Groups

- `POST /api/v1/groups`
  - Create a group.
- `GET /api/v1/groups`
  - List groups visible to caller.
- `GET /api/v1/groups/:groupId`
- `PATCH /api/v1/groups/:groupId`
- `DELETE /api/v1/groups/:groupId`

Group fields:

- `name`
- `description`
- `visibility` (`public` | `private`)
- `defaultGroupSize`
- `timezone`

#### Memberships

- `POST /api/v1/groups/:groupId/memberships`
  - Join public group OR invite user to private group (role-gated).
- `GET /api/v1/groups/:groupId/memberships`
- `PATCH /api/v1/groups/:groupId/memberships/:membershipId`
  - Update role/status (role-gated).
- `DELETE /api/v1/groups/:groupId/memberships/:membershipId`

#### Lotteries

- `POST /api/v1/groups/:groupId/lotteries`
- `GET /api/v1/groups/:groupId/lotteries`
- `GET /api/v1/lotteries/:lotteryId`
- `PATCH /api/v1/lotteries/:lotteryId`
- `DELETE /api/v1/lotteries/:lotteryId`

Lottery fields:

- `name`
- `isActive`
- `groupSizeMin`
- `groupSizeMax`
- `repeatWindowRuns`
- `schedule`:
  - `frequency` (initial: `weekly`)
  - `dayOfWeek`
  - `cutoffLocalTime`
  - `runLocalTime`
  - `timezone`

#### Lottery runs

- `POST /api/v1/lotteries/:lotteryId/runs`
  - Manual run creation.
- `GET /api/v1/lotteries/:lotteryId/runs`
- `GET /api/v1/runs/:runId`
- `POST /api/v1/runs/:runId/execute`
  - Execute matching for a run.
- `POST /api/v1/runs/:runId/cancel`

Run fields:

- `status` (`scheduled` | `open` | `matching` | `matched` | `canceled`)
- `enrollmentOpensAt`
- `enrollmentClosesAt`
- `matchingExecutesAt`
- `matchedAt`

#### Participations

- `PUT /api/v1/runs/:runId/participations/me`
  - Upsert current user participation for a run.
- `GET /api/v1/runs/:runId/participations`
  - Admin visibility.

Participation fields:

- `status` (`pending` | `confirmed` | `declined`)
- `respondedAt`

#### Matches

- `GET /api/v1/runs/:runId/matches`
- `GET /api/v1/matches/:matchId`

Match fields:

- `runId`
- `memberUserIds`
- `status` (`proposed` | `confirmed` | `canceled`)

#### Calendar artifacts

- `POST /api/v1/matches/:matchId/calendar-artifacts`
  - Generate ICS / invite link metadata.
- `GET /api/v1/matches/:matchId/calendar-artifacts`
- `GET /api/v1/calendar-artifacts/:artifactId.ics`
  - ICS download endpoint.

Calendar fields:

- `type` (`ics`)
- `title`
- `startsAt`
- `endsAt`
- `timezone`
- `location`
- `notes`

#### Webhooks

- `POST /api/v1/webhooks/endpoints`
- `GET /api/v1/webhooks/endpoints`
- `PATCH /api/v1/webhooks/endpoints/:endpointId`
- `DELETE /api/v1/webhooks/endpoints/:endpointId`

Suggested events:

- `group.created`
- `membership.created`
- `lottery.created`
- `run.created`
- `run.executed`
- `match.created`
- `match.updated`
- `calendar.artifact.created`

---

## 7. Data Model (Prisma Sketch)

This is a schema sketch, not a drop-in. It is intentionally explicit to guide implementation.

Key notes:

- Keep IDs as `cuid()` or `uuid()` consistently.
- Record state transitions with timestamps.
- Many auth models will already exist via NextAuth tables; avoid breaking them.

Illustrative models:

```prisma
model Group {
  id               String        @id @default(cuid())
  name             String
  description      String?
  visibility       GroupVisibility @default(private)
  defaultGroupSize Int           @default(2)
  timezone         String        @default("UTC")
  createdById      String
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  lotteries    Lottery[]
  memberships  Membership[]
}

model Membership {
  id        String           @id @default(cuid())
  groupId   String
  userId    String
  role      GroupRole        @default(member)
  status    MembershipStatus @default(active)
  createdAt DateTime         @default(now())
  updatedAt DateTime         @updatedAt

  group Group @relation(fields: [groupId], references: [id])
  user  User  @relation(fields: [userId], references: [id])

  @@unique([groupId, userId])
}

model Lottery {
  id               String   @id @default(cuid())
  groupId          String
  name             String
  isActive         Boolean  @default(true)
  groupSizeMin     Int      @default(2)
  groupSizeMax     Int      @default(3)
  repeatWindowRuns Int      @default(3)
  scheduleJson     Json
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  group Group @relation(fields: [groupId], references: [id])
  runs  LotteryRun[]
}

model LotteryRun {
  id                  String    @id @default(cuid())
  lotteryId           String
  status              RunStatus @default(scheduled)
  enrollmentOpensAt   DateTime
  enrollmentClosesAt  DateTime
  matchingExecutesAt  DateTime
  matchedAt           DateTime?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  lottery        Lottery         @relation(fields: [lotteryId], references: [id])
  participations Participation[]
  matches        Match[]
}

model Participation {
  id        String               @id @default(cuid())
  runId     String
  userId    String
  status    ParticipationStatus  @default(pending)
  respondedAt DateTime?
  createdAt DateTime             @default(now())
  updatedAt DateTime             @updatedAt

  run  LotteryRun @relation(fields: [runId], references: [id])
  user User       @relation(fields: [userId], references: [id])

  @@unique([runId, userId])
}

model Match {
  id        String      @id @default(cuid())
  runId     String
  status    MatchStatus @default(proposed)
  memberIds Json
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt

  run LotteryRun @relation(fields: [runId], references: [id])
  calendarArtifacts CalendarArtifact[]
}

model CalendarArtifact {
  id        String   @id @default(cuid())
  matchId   String
  type      String
  payload   Json
  createdAt DateTime @default(now())

  match Match @relation(fields: [matchId], references: [id])
}
```

---

## 8. API Contracts & Validation

Recommended approach:

- Define shared schemas using Zod (or similar) under `src/server/schemas/**`.
- Use the same schemas for:
  - Route handler input validation.
  - Service layer invariants.
  - Response shaping.

Consistency goal:

- Every endpoint has:
  - Request schema.
  - Response schema.
  - Typed handler + typed service.

---

## 9. Calendar Invites Strategy

Start simple and integrator-friendly:

1. Provide ICS generation per match.
2. Provide event metadata in API responses.
3. Optionally support provider integrations later (Google Calendar write-back).

Practical flow:

- Client requests calendar artifact creation.
- API returns:
  - Artifact metadata.
  - A stable ICS download URL.

ICS specifics:

- Use UTC internally.
- Include group/match identifiers in ICS UID.
- Avoid exposing private membership data in summaries.

---

## 10. Scheduling & Execution Strategy

Scheduling requires background processing. In a Next.js environment, treat it explicitly:

- Introduce a job runner:
  - Option A: managed cron hitting an internal endpoint.
  - Option B: queue-based job system.

Minimum viable scheduling:

1. Store schedule config.
2. Provide internal/admin endpoint to:
   - Create the next run.
   - Execute due runs.
3. Drive it initially with manual calls or simple cron.

---

## 11. Security, Privacy, and Multi-Tenancy

### 11.1 Security basics

- All endpoints require auth (except explicitly public reads).
- Enforce group-scoped authorization in services, not only routes.
- Log structured events, but avoid sensitive payloads.

### 11.2 Public vs private groups

- Public groups:
  - Discoverable.
  - Joinable without invite.
- Private groups:
  - Not discoverable.
  - Join requires invite or admin action.

### 11.3 Integrator safety

- API tokens must be hashed at rest.
- Support token rotation.
- Webhooks signed with HMAC.

---

## 12. Observability & Operational Concerns

Must-haves early:

- Correlation/request IDs.
- Structured logs at service boundaries.
- Audit-style events for:
  - Run creation/execution.
  - Match creation.
  - Membership changes.

Nice-to-have:

- Basic metrics:
  - Runs executed.
  - Match success rate.
  - Unmatched users per run.

---

## 13. Proposed Initial Milestones

### Milestone A: API foundation

- Versioned route structure.
- Auth + authorization helpers.
- Consistent validation and error envelope.

### Milestone B: Core lunch lottery

- Groups + memberships.
- Lotteries + runs + participations.
- Matching execution.

### Milestone C: Calendar + integrator features

- ICS artifacts.
- Webhooks.
- Documentation and examples.
