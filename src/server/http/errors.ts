export type ErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'bad_request'
  | 'conflict'
  | 'internal_error';

export class HttpError extends Error {
  status: number;
  code: ErrorCode;
  details?: unknown;

  constructor(status: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function unauthorized(message = 'Authentication required') {
  return new HttpError(401, 'unauthorized', message);
}

export function forbidden(message = 'Not allowed') {
  return new HttpError(403, 'forbidden', message);
}

export function notFound(message = 'Resource not found') {
  return new HttpError(404, 'not_found', message);
}

export function badRequest(message = 'Invalid request', details?: unknown) {
  return new HttpError(400, 'bad_request', message, details);
}

