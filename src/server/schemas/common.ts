import { z } from 'zod';

export const uuidSchema = z.string().uuid();

// Auth users, API tokens, and webhooks use opaque string identifiers.
export const stringIdSchema = z.string().trim().min(1).max(128);

export const visibilitySchema = z.enum(['open', 'invite_only']);

export const nonEmptyString = z.string().trim().min(1);
