import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();

const files = [
  'src/app/(webui)/page.tsx',
  'src/app/(webui)/portal/page.tsx',
  'src/app/(webui)/portal/groups/page.tsx',
  'src/app/(webui)/portal/groups/[groupId]/page.tsx',
  'src/app/(webui)/portal/lotteries/[lotteryId]/page.tsx',
  'src/app/(webui)/portal/runs/[runId]/page.tsx',
  'src/webui/components/layout/AppShell.tsx',
  'src/webui/components/ui/Button.tsx',
  'src/webui/api/client.ts',
  'src/app/globals.css',
];

test('webui core files exist', async () => {
  for (const file of files) {
    const contents = await readFile(resolve(root, file), 'utf8');
    assert.ok(contents.length > 0, `${file} is empty`);
  }
});

test('globals.css imports tailwind', async () => {
  const globals = await readFile(resolve(root, 'src/app/globals.css'), 'utf8');
  assert.match(globals, /@import\s+"tailwindcss"/);
});
