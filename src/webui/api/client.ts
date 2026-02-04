export type ApiError = {
  status: number;
  message: string;
  details?: unknown;
};

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
    return {
      status: response.status,
      message: errorMessage ?? response.statusText,
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
