import { z } from 'zod';

export const uuidSchema = z.string().uuid();

export const visibilitySchema = z.enum(['open', 'invite_only']);

export const nonEmptyString = z.string().trim().min(1);
