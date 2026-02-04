export type GroupSummary = {
  id: string;
  name: string;
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
  lunchTime?: string | null;
  preferredDays?: string[];
  lotteryFrequency?: 'weekly' | 'biweekly' | 'monthly' | null;
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

export type Lottery = {
  id: string;
  groupId: string;
  name: string;
  isActive: boolean;
  groupSizeMin: number;
  groupSizeMax: number;
  repeatWindowRuns: number;
  scheduleJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type Run = {
  id: string;
  lotteryId: string;
  status: 'scheduled' | 'open' | 'matching' | 'matched' | 'canceled';
  enrollmentOpensAt: string;
  enrollmentClosesAt: string;
  matchingExecutesAt: string;
  matchedAt?: string | null;
  matches?: Match[];
  participations?: Participation[];
};

export type Participation = {
  id: string;
  runId: string;
  userId: string;
  status: 'pending' | 'confirmed' | 'declined';
  respondedAt?: string | null;
};

export type Match = {
  id: string;
  runId?: string | null;
  groupId: string;
  memberIds?: string[] | null;
  status: 'proposed' | 'confirmed' | 'canceled';
  createdAt: string;
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
