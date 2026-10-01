export function resolvePortalCallback(nextPath: string | null, origin: string) {
  try {
    const target = new URL(nextPath ?? '/portal', origin);
    if (
      target.origin === origin &&
      (target.pathname === '/portal' || target.pathname.startsWith('/portal/'))
    ) {
      return `${target.pathname}${target.search}${target.hash}`;
    }
  } catch {
    // Invalid return paths fall back to the portal overview.
  }
  return '/portal';
}
