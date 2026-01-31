import AuthButton from '@/webui/components/auth/AuthButton';
import { Button } from '@/webui/components/ui/Button';
import Link from 'next/link';

export function PortalHeaderActions() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="ghost" as={Link} href="/portal/settings">
        Account
      </Button>
      <AuthButton />
    </div>
  );
}
