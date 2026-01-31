'use client';

import { useState } from 'react';

import { Button } from '@/webui/components/ui/Button';
import { Dialog } from '@/webui/components/ui/Dialog';
import { Notice } from '@/webui/components/ui/Notice';

const providers = ['Google Calendar', 'Outlook', 'Apple Calendar', 'ICS'];

export function CalendarSettings() {
  const [open, setOpen] = useState(false);

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-[color:var(--moss)]">
          Calendar
        </p>
        <h2 className="text-2xl font-semibold">Calendar integrations</h2>
        <p className="mt-1 text-sm text-[color:rgba(20,18,21,0.7)]">
          Connect calendars to publish match invites automatically.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {providers.map((provider) => (
          <div
            key={provider}
            className="flex items-center justify-between rounded-[var(--radius-md)] border border-[color:rgba(20,18,21,0.12)] bg-white/70 px-4 py-3"
          >
            <div>
              <p className="text-sm font-semibold">{provider}</p>
              <p className="text-xs text-[color:rgba(20,18,21,0.6)]">
                Not connected
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
              Connect
            </Button>
          </div>
        ))}
      </div>

      <Notice>Calendar connection endpoints are not yet available.</Notice>

      <Dialog open={open} title="Calendar connections" onClose={() => setOpen(false)}>
        Connections will be enabled after the calendar API routes ship. For now
        you can export schedules via ICS once matches are generated.
      </Dialog>
    </div>
  );
}
