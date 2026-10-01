import { createCancelableEffect, type CancelableEffect } from '@/lib/webui/cancelableEffect';
import { useCallback, useEffect, useRef } from 'react';

export function useCancelableEffect(effect: CancelableEffect): () => void {
  const cleanupRef = useRef<(() => void) | null>(null);
  const reload = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = createCancelableEffect(effect);
  }, [effect]);

  useEffect(() => {
    reload();
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, [reload]);

  return reload;
}
