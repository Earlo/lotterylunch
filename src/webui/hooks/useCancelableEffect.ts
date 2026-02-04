import { useEffect, useRef, type DependencyList } from 'react';

export function useCancelableEffect(
  effect: (isCancelled: () => boolean) => void | (() => void),
  deps: DependencyList,
) {
  const effectRef = useRef(effect);

  useEffect(() => {
    effectRef.current = effect;
  }, [effect]);

  useEffect(() => {
    let cancelled = false;
    const cleanup = effectRef.current(() => cancelled);
    return () => {
      cancelled = true;
      if (typeof cleanup === 'function') {
        cleanup();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
