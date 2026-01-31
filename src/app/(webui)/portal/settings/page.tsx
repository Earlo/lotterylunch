import { requirePortalSession } from '@/webui/auth';
import { AppShell } from '@/webui/components/layout/AppShell';
import { Card } from '@/webui/components/ui/Card';
import { AccountSettings } from '@/webui/components/settings/AccountSettings';
import { PreferencesSettings } from '@/webui/components/settings/PreferencesSettings';
import { CalendarSettings } from '@/webui/components/settings/CalendarSettings';

export default async function SettingsPage() {
  await requirePortalSession('/portal/settings');

  return (
    <AppShell
      title="Account settings"
      description="Update your profile, preferences, and calendar connections."
    >
      <div className="grid gap-6">
        <Card title="Profile">
          <AccountSettings />
        </Card>
        <Card title="Lunch preferences">
          <PreferencesSettings />
        </Card>
        <Card title="Calendar connections">
          <CalendarSettings />
        </Card>
      </div>
    </AppShell>
  );
}
