export type ApiError = {
  status: number;
  message: string;
  details?: unknown;
};

type ZodIssue = {
  path?: Array<string | number>;
  message?: string;
};

function summarizeIssues(issues?: ZodIssue[]) {
  if (!issues || issues.length === 0) return null;
  const summaries = issues.slice(0, 3).map((issue) => {
    const path = issue.path?.length ? issue.path.join('.') : 'request';
    return `${path}: ${issue.message ?? 'Invalid value'}`;
  });
  return summaries.join('; ');
}

async function parseError(response: Response): Promise<ApiError> {
  try {
    const payload = (await response.json()) as {
      error?: string | { message?: string; details?: unknown };
      details?: unknown;
    };
    const errorMessage =
      typeof payload?.error === 'string'
        ? payload.error
        : payload?.error?.message;
    const errorDetails =
      typeof payload?.error === 'object' && payload?.error?.details
        ? payload.error.details
        : payload?.details;
    const issueSummary = summarizeIssues(
      (typeof payload?.error === 'object'
        ? (payload.error?.details as { issues?: ZodIssue[] } | undefined)
            ?.issues
        : undefined) ??
        (payload?.details as { issues?: ZodIssue[] } | undefined)?.issues,
    );
    const messageBase = errorMessage ?? response.statusText;
    const message = issueSummary ? `${messageBase}: ${issueSummary}` : messageBase;
    return {
      status: response.status,
      message,
      details: errorDetails,
    };
  } catch {
    return {
      status: response.status,
      message: response.statusText,
    };
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    throw await parseError(response);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}
