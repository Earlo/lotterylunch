export const groupKeys = {
  all: ['groups'] as const,
  detail: (groupId: string) => ['groups', groupId] as const,
};
