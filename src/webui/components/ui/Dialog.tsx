import { Button } from '@/webui/components/ui/Button';
import type { ReactNode } from 'react';

export function Dialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          {onClose ? (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Close
            </Button>
          ) : null}
        </div>
        <div className="mt-4 text-sm text-[rgba(20,18,21,0.7)]">{children}</div>
      </div>
    </div>
  );
}
