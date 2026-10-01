import { AppShell } from '@/components/layout/AppShell';
import { AccountSettings } from '@/components/settings/AccountSettings';
import { AvailabilitySettings } from '@/components/settings/AvailabilitySettings';
import { CalendarSettings } from '@/components/settings/CalendarSettings';
import { PreferencesSettings } from '@/components/settings/PreferencesSettings';
import { Card } from '@/components/ui/Card';
import { requirePortalSession } from '@/lib/webui/auth';

export default async function SettingsPage() {
  await requirePortalSession('/portal/settings');

  return (
    <AppShell
      title="Account settings"
      description="Update your profile, calendar flexibility, and calendar connections."
    >
      <div className="grid gap-6">
        <Card title="Profile">
          <AccountSettings />
        </Card>
        <Card title="Calendar preferences">
          <PreferencesSettings />
        </Card>
        <Card title="Calendar connections">
          <CalendarSettings />
        </Card>
        <Card title="Preferred times">
          <AvailabilitySettings />
        </Card>
      </div>
    </AppShell>
  );
}
