const LOCAL_ORIGIN = 'https://lotterylunch.invalid';

export function localRedirectPath(
  value: string | null | undefined,
  fallback = '/portal/settings',
) {
  if (!value?.startsWith('/') || !URL.canParse(value, LOCAL_ORIGIN))
    return fallback;

  const url = new URL(value, LOCAL_ORIGIN);
  if (url.origin !== LOCAL_ORIGIN) return fallback;

  return `${url.pathname}${url.search}${url.hash}`;
}
