import type { z } from 'zod';
import type {
  availabilitySlotSchema,
  calendarConnectionSchema,
  groupDetailSchema,
  groupInviteSchema,
  groupSummarySchema,
  membershipSchema,
  userProfileSchema,
} from './schemas';

export type GroupSummary = z.infer<typeof groupSummarySchema>;
export type GroupDetail = z.infer<typeof groupDetailSchema>;
export type UserProfile = z.infer<typeof userProfileSchema>;
export type Membership = z.infer<typeof membershipSchema>;
export type GroupInvite = z.infer<typeof groupInviteSchema>;
export type CalendarConnection = z.infer<typeof calendarConnectionSchema>;
export type AvailabilitySlot = z.infer<typeof availabilitySlotSchema>;

export type Match = {
  id: string;
  groupId: string;
  scheduledFor?: string | null;
  state?: 'created' | 'scheduled' | 'cancelled';
  memberIds?: string[] | null;
  status: 'proposed' | 'confirmed' | 'canceled';
  createdAt: string;
  updatedAt?: string;
};
