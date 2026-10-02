# LotteryLunch API v1

All paths below start with `/api/v1`. Except health/readiness, requests require a
Better Auth session or a personal token in `Authorization: Bearer <token>`.
Google Calendar OAuth additionally requires the authenticated browser session.
Success responses contain JSON, except ICS downloads. Errors use this envelope:

```json
{ "error": { "code": "bad_request", "message": "Validation failed", "details": {} } }
```

## Health

| Method | Path      | Behavior                                                                     |
| ------ | --------- | ---------------------------------------------------------------------------- |
| GET    | `/health` | Process liveness and service metadata; no database query.                    |
| GET    | `/ready`  | Queries the application database; HTTP 200 when ready, 503 when unavailable. |

## Account and availability

| Method | Path                           | Behavior                                                                                 |
| ------ | ------------------------------ | ---------------------------------------------------------------------------------------- |
| GET    | `/users/me`                    | Current profile and display preferences.                                                 |
| PATCH  | `/users/me`                    | Update name, timezone, image, area, shortNoticePreference, weekStartDay, or clockFormat. |
| GET    | `/availability?groupId=<uuid>` | Own availability; omit groupId to retrieve all own slots.                                |
| PUT    | `/availability`                | Atomically replace **all** own availability; `[]` clears all slots.                      |

Profile name, image, and area accept `null` to clear values. Timezones must be IANA
names. Availability requires `endAt > startAt`; grouped slots require active group
membership. Save the full list, including other groups' slots you want to keep.
At most 1,000 slots are accepted per replacement.

```json
[
  {
    "startAt": "2026-10-02T09:00:00.000Z",
    "endAt": "2026-10-02T10:00:00.000Z",
    "type": "lunch",
    "recurringRule": "FREQ=WEEKLY;BYDAY=FR"
  }
]
```

Slot types: coffee, lunch, afterwork; matching uses lunch. Omit `groupId` for personal
availability and `recurringRule` for one-off slots. Weekly rules have exactly
`FREQ=WEEKLY;BYDAY=SU|MO|TU|WE|TH|FR|SA`, optionally followed by
`;X-LL-DISABLED=1`. `X-LL-DAY-OFF=1` suppresses the corresponding weekly slot on
that date, matching times, type, and group. Other recurrence rules are rejected.
Weekly wall-clock times use the user's profile timezone. Recurring slots, including
disabled templates and day-off overrides, must last no more than seven days.
Invalid or overlong historical weekly templates are ignored by draws.

## Groups and memberships

| Method | Path                                         | Permission and behavior                                                                                              |
| ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| GET    | `/groups`                                    | Own active groups.                                                                                                   |
| POST   | `/groups`                                    | Create group plus owner membership.                                                                                  |
| GET    | `/groups/:groupId`                           | Active member; details.                                                                                              |
| PATCH  | `/groups/:groupId`                           | Owner/admin; edit group.                                                                                             |
| DELETE | `/groups/:groupId`                           | Owner; delete dependent memberships, invites, grouped availability, runs, matches, events/artifacts transactionally. |
| GET    | `/groups/:groupId/memberships`               | Active member; list memberships and participation.                                                                   |
| POST   | `/groups/:groupId/memberships`               | `{}` joins an open group; `{ "userId": "..." }` invites as owner/admin.                                              |
| PATCH  | `/groups/:groupId/memberships/:membershipId` | Owner/admin; edit non-owner role/status, including reinstatement.                                                    |
| DELETE | `/groups/:groupId/memberships/:membershipId` | Leave own membership or remove another member as owner/admin.                                                        |
| POST   | `/groups/:groupId/ownership`                 | Current owner; transfer to an active member with `{ "userId": "..." }`.                                              |
| POST   | `/groups/:groupId/invites`                   | Owner/admin; generate token with optional expiresInDays/maxUses.                                                     |
| POST   | `/invites/:token/accept`                     | Accept an unexpired invite; atomically claim its limited use.                                                        |

Group fields: name, description, location, visibility (`open` or `invite_only`),
defaultGroupSize (maximum lunch size, 2–8), timezone. Invitation/edit roles: member/admin; statuses:
pending/active/suspended. Ordinary writes cannot assign ownership, change the
canonical owner, or overwrite approved membership through an invitation.
Ownership transfer updates the group and roles together; the previous owner
becomes admin. Suspended users cannot join, accept invites, or delete their
suspension. An active owner/admin must reinstate them first.

Deletion also removes the group's retained legacy lotteries, runs, participations,
and their match descendants when those older tables exist. The legacy tables,
other groups, and ungrouped personal availability are preserved.

## Participation and lunch draws

| Method | Path                             | Permission and behavior                                               |
| ------ | -------------------------------- | --------------------------------------------------------------------- |
| GET    | `/groups/:groupId/participation` | Active member; own participation flag.                                |
| PATCH  | `/groups/:groupId/participation` | Active member; opt in/out with `{ "participating": true }`.           |
| GET    | `/groups/:groupId/runs`          | Active member; latest 20 persisted draws, matches, unmatched members. |
| POST   | `/groups/:groupId/runs`          | Owner/admin; execute and persist a draw, HTTP 201.                    |

```json
{
  "windowStart": "2026-10-02T00:00:00.000Z",
  "windowEnd": "2026-10-09T00:00:00.000Z",
  "durationMinutes": 60
}
```

The future window spans at least one lunch duration and at most 31 days. Duration
is 15–180 minutes, default 60. At least two active members must opt in; up to 500
participants are supported. Draws combine ungrouped and current-group lunch
availability, respect weekly templates/overrides, and avoid overlapping persisted
app bookings across groups. Lunches contain two to defaultGroupSize members.
The user's shortNoticePreference determines minimum notice from the draw's
createdAt: strict means 24 hours, standard means one hour, and flexible allows any
future time. Unset preferences use standard. These are elapsed periods regardless
of the profile timezone; a shared lunch honors every participant's minimum.
Matching prioritizes members with less usable availability and compares bounded
alternative schedules by participation coverage, then repeated pairings. Each
member receives at most one lunch per draw. Unassigned members appear in
`unmatchedUserIds`; a globally optimal schedule is not guaranteed. A fixed work
budget bounds recurrence expansion and matching. Excessively complex draws return
HTTP 400 with advice to shorten the window or simplify availability.

Runs persist participantIds, unmatchedUserIds, algorithmVersion, requested window,
and matches with memberIds/scheduledFor/scheduledUntil. GET results include each
match's calendarArtifacts for the requesting user, with id, type, and optional
payload.eventLink; other artifact payload fields are omitted. Execution and match/event
persistence use a transaction. No background scheduler, per-run enrollment window,
cancellation endpoint, or automatic reminders are provided. Former lottery CRUD
and `/runs/:runId/**` endpoints are not shipped.

## Calendar

| Method | Path                                    | Behavior                                                                                     |
| ------ | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| GET    | `/calendar/connections`                 | Own Google connections; tokens redacted.                                                     |
| POST   | `/calendar/connections/google`          | Start OAuth with optional returnTo; set HttpOnly browser-binding cookie, return consent URL. |
| GET    | `/calendar/connections/google/callback` | Finish in initiating browser/account, consume state once, redirect.                          |
| DELETE | `/calendar/connections/:connectionId`   | Disconnect own connection.                                                                   |
| POST   | `/matches/:matchId/calendar-artifacts`  | Active participant or group owner/admin; create ICS or a Google event in caller's calendar.  |
| GET    | `/calendar-artifacts/:artifactId.ics`   | Authorized authenticated download; private, no-store.                                        |

Artifact body: title, startsAt, endsAt, optional provider (`ics`, default, or google),
timezone, location, meetingUrl, notes. End must follow start. Downloads have no
public sharing links: leaving/suspension removes access, canceled matches cannot
export, and group deletion removes artifacts. Previously imported files and Google
events remain in the recipient's external calendar. Each lunch/user/provider action
reuses its saved artifact; subsequent requests return the original event details.
Google events use a stable client-supplied ID, so retrying after a failed artifact
save recovers the existing event. ICS exports use the lunch's stable UID, including
older artifacts. Saved actions remain visible after reloading the group page.
Events are created manually for the caller; no attendee invitations or reminders
are sent automatically.
Outlook/Apple OAuth and ICS feeds are unavailable; direct
`POST /calendar/connections` requests are rejected.

## API tokens and webhooks

`GET/POST /tokens` list/create personal tokens; `DELETE /tokens/:tokenId` revokes one.
Creation returns the raw token once; only its hash is stored. Tokens carry the
user's permissions and are not scoped to a group.

Webhook delivery is unavailable. `GET /webhooks` exposes historical endpoints with
`isActive: false` and `deliveryAvailable: false`. Creation or activation returns
HTTP 501. `PATCH /webhooks/:webhookId` can edit/deactivate an owned historical
endpoint; `DELETE` removes it and its delivery rows. No outgoing delivery,
signatures, or retry worker are claimed.

## Rate limiting

Production `/api/v1/**` has a per-process sliding-window limiter (120 requests/minute).
Ingress must overwrite `x-forwarded-for`; multiple replicas require shared gateway
rate limiting. The process limiter is supplemental protection.
