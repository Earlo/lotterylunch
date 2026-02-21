export type GroupSummary = {
  id: string;
  name: string;
  location?: string | null;
  visibility: 'open' | 'invite_only';
  createdAt: string;
};

export type GroupDetail = GroupSummary & {
  description?: string | null;
};

export type UserProfile = {
  id: string;
  email: string;
  name?: string | null;
  timezone?: string | null;
  image?: string | null;
  area?: string | null;
  shortNoticePreference?: 'strict' | 'standard' | 'flexible' | null;
  weekStartDay?: 'monday' | 'sunday' | null;
  clockFormat?: 'h24' | 'ampm' | null;
};

export type Membership = {
  id: string;
  userId: string;
  groupId: string;
  role: 'owner' | 'admin' | 'member';
  status: 'pending' | 'active' | 'suspended';
  joinedAt: string;
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
};

export type GroupInvite = {
  id: string;
  token: string;
  groupId: string;
  createdById: string;
  expiresAt: string;
  maxUses: number;
  uses: number;
  createdAt: string;
};

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

export type CalendarConnection = {
  id: string;
  userId: string;
  provider: 'google' | 'outlook' | 'apple' | 'ics';
  status: string;
  oauthTokens: Record<string, unknown>;
};

export type AvailabilitySlot = {
  id: string;
  userId: string;
  groupId?: string | null;
  startAt: string;
  endAt: string;
  recurringRule?: string | null;
  type: 'coffee' | 'lunch' | 'afterwork';
};
