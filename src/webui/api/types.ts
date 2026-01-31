export type GroupSummary = {
  id: string;
  name: string;
  visibility: 'public' | 'private';
  createdAt: string;
};

export type GroupDetail = GroupSummary & {
  description?: string | null;
};
