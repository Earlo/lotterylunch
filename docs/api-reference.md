# LotteryLunch API v1 Reference (Must-Have Slice)

All endpoints live under `/api/v1/**`.

## Response conventions

Successful responses return JSON payloads. Errors use a consistent envelope:

```json
{
  "error": {
    "code": "bad_request",
    "message": "Validation failed",
    "details": {}
  }
}
```

## Health

1. `GET /api/v1/health`

- Returns service metadata and a timestamp.

## Groups

1. `POST /api/v1/groups`

- Creates a group and an owner membership for the caller.
- Body:

```json
{
  "name": "Design Guild",
  "description": "Lunch group for design team",
  "visibility": "open"
}
```

2. `GET /api/v1/groups`

- Lists groups where the caller has an active membership.

3. `GET /api/v1/groups/:groupId`

- Gets a single group, requiring membership.

4. `PATCH /api/v1/groups/:groupId`

- Updates a group, requiring owner/admin role.

5. `DELETE /api/v1/groups/:groupId`

- Deletes a group, requiring owner role.

## Memberships

1. `GET /api/v1/groups/:groupId/memberships`

- Lists memberships for a group.

2. `POST /api/v1/groups/:groupId/memberships`

- Join an open group when no `userId` is provided.
- Invite a user when `userId` is provided (owner/admin only).

Join example:

```json
{}
```

Invite example:

```json
{
  "userId": "00000000-0000-0000-0000-000000000000",
  "role": "member",
  "status": "pending"
}
```

3. `PATCH /api/v1/groups/:groupId/memberships/:membershipId`

- Updates role/status (owner/admin only).

4. `DELETE /api/v1/groups/:groupId/memberships/:membershipId`

- Removes a membership (self, owner, or admin).

## Lotteries

1. `GET /api/v1/groups/:groupId/lotteries`

- Lists lotteries for a group.

2. `POST /api/v1/groups/:groupId/lotteries`

- Creates a lottery (owner/admin only).

Example:

```json
{
  "name": "Weekly Lunch",
  "groupSizeMin": 2,
  "groupSizeMax": 3,
  "repeatWindowRuns": 3,
  "scheduleJson": {
    "cadence": "weekly",
    "dayOfWeek": 3,
    "time": "12:00"
  }
}
```

3. `GET /api/v1/lotteries/:lotteryId`

- Gets a lottery.

4. `PATCH /api/v1/lotteries/:lotteryId`

- Updates a lottery (owner/admin only).

5. `DELETE /api/v1/lotteries/:lotteryId`

- Deletes a lottery (owner/admin only).

## Runs

1. `GET /api/v1/lotteries/:lotteryId/runs`

- Lists runs for a lottery.

2. `POST /api/v1/lotteries/:lotteryId/runs`

- Creates a run (owner/admin only).

Example:

```json
{
  "enrollmentOpensAt": "2026-01-27T16:00:00.000Z",
  "enrollmentClosesAt": "2026-01-28T16:00:00.000Z",
  "matchingExecutesAt": "2026-01-28T17:00:00.000Z"
}
```

3. `GET /api/v1/runs/:runId`

- Gets a run with participations and matches.

4. `POST /api/v1/runs/:runId/cancel`

- Cancels a run (owner/admin only).

5. `POST /api/v1/runs/:runId/execute`

- Executes matching for a run (owner/admin only).

## Participations

1. `GET /api/v1/runs/:runId/participations`

- Lists participations for a run.

2. `POST /api/v1/runs/:runId/participations`

- Upserts the caller's participation during the enrollment window.

Example:

```json
{
  "status": "confirmed"
}
```

## Rate limiting

A simple in-memory rate limit is applied to `/api/v1/**` in middleware.
This is best-effort protection and should be replaced with a durable
store (for example, Redis) in production.
