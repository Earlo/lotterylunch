import { useEffect, type DependencyList } from 'react';

export function useCancelableEffect(
  effect: (isCancelled: () => boolean) => void | (() => void),
  deps: DependencyList,
) {
  useEffect(() => {
    let cancelled = false;
    const cleanup = effect(() => cancelled);
    return () => {
      cancelled = true;
      if (typeof cleanup === 'function') {
        cleanup();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, effect]);
}
