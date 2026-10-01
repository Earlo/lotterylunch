export type CancelableEffect = (isCancelled: () => boolean, signal: AbortSignal) => void | (() => void);

export function createCancelableEffect(effect: CancelableEffect): () => void {
  const controller = new AbortController();
  const cleanup = effect(() => controller.signal.aborted, controller.signal);

  return () => {
    controller.abort();
    cleanup?.();
  };
}
