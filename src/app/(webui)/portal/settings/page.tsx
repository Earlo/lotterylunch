import { requirePortalSession } from '@/webui/auth';
import { AppShell } from '@/webui/components/layout/AppShell';
import { AccountSettings } from '@/webui/components/settings/AccountSettings';
import { AvailabilitySettings } from '@/webui/components/settings/AvailabilitySettings';
import { CalendarSettings } from '@/webui/components/settings/CalendarSettings';
import { PreferencesSettings } from '@/webui/components/settings/PreferencesSettings';
import { Card } from '@/webui/components/ui/Card';

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
