export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  return isRecord(error) && typeof error.message === 'string' && error.message.trim() ? error.message : fallback;
}

function summarizeIssues(details: unknown) {
  if (!isRecord(details) || !Array.isArray(details.issues)) return null;
  const summaries = details.issues
    .filter(isRecord)
    .slice(0, 3)
    .map((issue) => {
      const path =
        Array.isArray(issue.path) && issue.path.length
          ? issue.path.filter((part) => typeof part === 'string' || typeof part === 'number').join('.')
          : 'request';
      return `${path || 'request'}: ${getErrorMessage(issue, 'Invalid value')}`;
    });
  return summaries.join('; ');
}

async function parseError(response: Response): Promise<ApiError> {
  const fallback = response.statusText || `Request failed (HTTP ${response.status}).`;
  try {
    const payload: unknown = await response.json();
    if (!isRecord(payload)) return new ApiError(response.status, fallback);
    const errorMessage =
      typeof payload.error === 'string' && payload.error.trim()
        ? payload.error
        : getErrorMessage(payload.error, fallback);
    const errorDetails =
      isRecord(payload.error) && 'details' in payload.error ? payload.error.details : payload.details;
    const issueSummary = summarizeIssues(errorDetails);
    const message = issueSummary ? `${errorMessage}: ${issueSummary}` : errorMessage;
    return new ApiError(response.status, message, errorDetails);
  } catch {
    return new ApiError(response.status, fallback);
  }
}

export async function apiFetch(path: string, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers);
  if (init?.body != null && !headers.has('Content-Type') && typeof init.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');

  const response = await fetch(path, {
    ...init,
    headers,
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) {
    return null;
  }

  const data: unknown = await response.json();
  return data;
}
