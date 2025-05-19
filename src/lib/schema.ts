// app/lib/schema.ts
import { z } from 'zod';

/** ------------------ Enums ------------------ **/
export const VisibilityEnum = z.enum(['open', 'invite_only']);
export const RoleEnum = z.enum(['owner', 'admin', 'member']);
export const MembershipStatusEnum = z.enum(['pending', 'active', 'suspended']);
export const CalendarProviderEnum = z.enum([
  'google',
  'outlook',
  'apple',
  'ics',
]);
export const SlotTypeEnum = z.enum(['coffee', 'lunch', 'afterwork']);
export const MatchStateEnum = z.enum(['created', 'scheduled', 'cancelled']);
export const EventStatusEnum = z.enum(['tentative', 'confirmed', 'cancelled']);

/** ------------------ Helpers ------------------ **/
// parse ISO‐8601 strings into Date
const dateString = z.preprocess((val) => {
  if (typeof val === 'string' || val instanceof Date) return new Date(val);
}, z.date());

/** ------------------ Param Schemas ------------------ **/
export const userIdParam = z.object({ id: z.string().uuid() });
export const groupIdParam = z.object({ id: z.string().uuid() });
export const membershipIdParam = z.object({ id: z.string().uuid() });
export const calendarConnIdParam = z.object({ id: z.string().uuid() });
export const matchIdParam = z.object({ id: z.string().uuid() });
export const eventIdParam = z.object({ id: z.string().uuid() });
export const inviteTokenParam = z.object({ token: z.string() });

/** ------------------ Query Schemas ------------------ **/
// GET /v1/groups?visibility=
export const getGroupsQuery = z.object({
  visibility: VisibilityEnum.optional(),
});

// GET /v1/groups/:id/matches?date=YYYY-MM-DD
export const getMatchesQuery = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .optional(),
});

/** ------------------ Body Schemas ------------------ **/
// POST /v1/auth/signup
export const signupSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).optional(),
  // if using password auth:
  password: z.string().min(8),
});

// POST /v1/auth/login
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// PUT /v1/users/:id
export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  photoUrl: z.string().url().optional(),
});

// POST /v1/groups
export const createGroupSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  visibility: VisibilityEnum.optional(),
});

// PUT /v1/groups/:id
export const updateGroupSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  visibility: VisibilityEnum.optional(),
});

// POST /v1/groups/:id/invite
export const inviteMembersSchema = z.object({
  emails: z.array(z.string().email()).min(1),
});

// POST /v1/invites/:token/accept
export const acceptInviteSchema = z.object({}); // no body

// GET/PUT /v1/groups/:gid/profiles/:uid
export const profileSchema = z.object({
  bio: z.string().max(1024).optional(),
  interests: z.array(z.string()).optional(),
  dietaryPreferences: z.array(z.string()).optional(),
  locationHint: z.string().optional(),
});

// GET /v1/interest-tags
export const getTagsQuery = z.object({
  q: z.string().optional(),
});

// POST /v1/calendar/connections
export const createCalendarConnSchema = z.object({
  provider: CalendarProviderEnum,
});

// DELETE /v1/calendar/connections/:id → no body

// GET /v1/availability
// POST /v1/availability
const availabilitySlotInput = z.object({
  groupId: z.string().uuid().optional(),
  startAt: dateString,
  endAt: dateString,
  recurringRule: z.string().optional(),
  type: SlotTypeEnum,
});
export const upsertAvailabilitySchema = z.array(availabilitySlotInput);

// POST /v1/groups/:gid/match → no body (or optionally a dryRun flag)
export const runMatchSchema = z
  .object({ dryRun: z.boolean().optional() })
  .optional();

// PATCH /v1/events/:id
export const updateEventSchema = z
  .object({
    venue: z.string().optional(),
    meetingUrl: z.string().url().optional(),
    status: EventStatusEnum.optional(),
  })
  .strict();

/** ------------------ Notifications & Webhooks ------------------ **/
// GET /v1/notifications → no input
// POST /v1/webhooks
export const createWebhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).optional(),
});

/** ------------------ Admin ------------------ **/
// GET /v1/admin/audit-logs
export const auditLogsQuery = z.object({
  actorId: z.string().uuid().optional(),
  action: z.string().optional(),
  objectType: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// GET /v1/admin/stats
export const statsQuery = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});
