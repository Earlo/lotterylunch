import { z } from 'zod';

export const groupSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  location: z.string().nullish(),
  visibility: z.enum(['open', 'invite_only']),
  createdAt: z.string(),
});

export const groupDetailSchema = groupSummarySchema.extend({
  description: z.string().nullish(),
  ownerId: z.string().optional(),
  defaultGroupSize: z.number().int().default(2),
  timezone: z.string().default('UTC'),
});

export const userProfileSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullish(),
  timezone: z.string().nullish(),
  image: z.string().nullish(),
  area: z.string().nullish(),
  shortNoticePreference: z.enum(['strict', 'standard', 'flexible']).nullish(),
  weekStartDay: z.enum(['monday', 'sunday']).nullish(),
  clockFormat: z.enum(['h24', 'ampm']).nullish(),
});

export const membershipSchema = z.object({
  id: z.string(),
  userId: z.string(),
  groupId: z.string(),
  role: z.enum(['owner', 'admin', 'member']),
  status: z.enum(['pending', 'active', 'suspended']),
  participating: z.boolean().default(false),
  joinedAt: z.string(),
  user: z
    .object({
      id: z.string(),
      name: z.string().nullish(),
      email: z.string().nullish(),
    })
    .nullish(),
});

export const groupInviteSchema = z.object({
  id: z.string(),
  token: z.string(),
  groupId: z.string(),
  createdById: z.string(),
  expiresAt: z.string(),
  maxUses: z.number().int(),
  uses: z.number().int(),
  createdAt: z.string(),
});

export const calendarConnectionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  provider: z.literal('google'),
  status: z.string(),
  oauthTokens: z.record(z.string(), z.unknown()),
});

export const availabilitySlotSchema = z.object({
  id: z.string(),
  userId: z.string(),
  groupId: z.string().nullish(),
  startAt: z.string(),
  endAt: z.string(),
  recurringRule: z.string().nullish(),
  type: z.enum(['coffee', 'lunch', 'afterwork']),
});

export const removedMembershipSchema = z.object({ id: z.string(), deleted: z.literal(true) });
export const googleCalendarRedirectSchema = z.object({ url: z.string().url() });
