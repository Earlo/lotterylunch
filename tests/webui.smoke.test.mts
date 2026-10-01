import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

const files = [
  'app/(webui)/page.tsx',
  'app/(webui)/portal/page.tsx',
  'app/(webui)/portal/groups/page.tsx',
  'app/(webui)/portal/groups/[groupId]/page.tsx',
  'app/(webui)/portal/settings/page.tsx',
  'components/layout/PortalHeaderActions.tsx',
  'components/layout/AppShell.tsx',
  'components/groups/GroupsClient.tsx',
  'components/groups/GroupDetailClient.tsx',
  'components/settings/UserScheduleCalendar.tsx',
  'components/settings/AvailabilitySettings.tsx',
  'components/ui/Button.tsx',
  'components/ui/Notice.tsx',
  'lib/webui/api/client.ts',
  'styles/globals.css',
];

await test('webui core files exist', async () => {
  await Promise.all(
    files.map(async (file) => {
      const contents = await readFile(resolve(root, file), 'utf8');
      assert.ok(contents.length > 0, `${file} is empty`);
    }),
  );
});

await test('globals.css imports tailwind', async () => {
  const globals = await readFile(resolve(root, 'styles/globals.css'), 'utf8');
  assert.match(globals, /@import\s+(['"])tailwindcss\1/);
});
