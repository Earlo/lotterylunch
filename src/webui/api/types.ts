export type GroupSummary = {
  id: string;
  name: string;
  visibility: 'public' | 'private';
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
