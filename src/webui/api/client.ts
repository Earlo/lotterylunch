export type ApiError = {
  status: number;
  message: string;
  details?: unknown;
};

async function parseError(response: Response): Promise<ApiError> {
  try {
    const payload = (await response.json()) as { error?: string; details?: unknown };
    return {
      status: response.status,
      message: payload?.error ?? response.statusText,
      details: payload?.details,
    };
  } catch {
    return {
      status: response.status,
      message: response.statusText,
    };
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
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
