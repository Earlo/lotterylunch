import { useEffect, useRef, type DependencyList } from 'react';

export function useCancelableEffect(
  effect: (
    isCancelled: () => boolean,
    signal: AbortSignal,
  ) => void | (() => void),
  deps: DependencyList,
) {
  const effectRef = useRef(effect);

  useEffect(() => {
    effectRef.current = effect;
  }, [effect]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const cleanup = effectRef.current(() => cancelled, controller.signal);
    return () => {
      cancelled = true;
      controller.abort();
      if (typeof cleanup === 'function') {
        cleanup();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
