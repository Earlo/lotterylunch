import { ZodError } from 'zod';

import { badRequest, HttpError } from '@/server/http/errors';

type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return Response.json(data, { status: 200, ...init });
}

export function jsonCreated<T>(data: T, init?: ResponseInit) {
  return Response.json(data, { status: 201, ...init });
}

export function jsonError(err: unknown): Response {
  const normalized = normalizeError(err);
  const body: ErrorEnvelope = {
    error: {
      code: normalized.code,
      message: normalized.message,
      details: normalized.details,
    },
  };
  return Response.json(body, { status: normalized.status });
}

export async function handleRoute<T>(fn: () => Promise<T>): Promise<Response> {
  try {
    const data = await fn();
    return jsonOk(data);
  } catch (err) {
    return jsonError(err);
  }
}

function normalizeError(err: unknown): HttpError {
  if (err instanceof HttpError) return err;

  if (err instanceof ZodError) {
    return badRequest('Validation failed', {
      issues: err.issues,
    });
  }

  console.error('[http] unhandled error', err);
  return new HttpError(500, 'internal_error', 'Something went wrong');
}

