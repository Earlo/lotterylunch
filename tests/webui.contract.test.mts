import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { groupDetailSchema, groupSummarySchema } from '../lib/webui/api/schemas.ts';

const root = process.cwd();

async function loadJson(path: string): Promise<unknown> {
  const contents = await readFile(resolve(root, path), 'utf8');
  return JSON.parse(contents);
}

await test('group list fixture matches expected contract', async () => {
  const groups = groupSummarySchema.array().parse(await loadJson('tests/fixtures/api/groups.json'));
  assert.ok(groups.length > 0);

  const group = groups[0];
  assert.ok(group);
  assert.equal(typeof group.id, 'string');
  assert.equal(typeof group.name, 'string');
  assert.equal(typeof group.visibility, 'string');
  assert.equal(typeof group.createdAt, 'string');
});

await test('group detail fixture matches expected contract', async () => {
  const group = groupDetailSchema.parse(await loadJson('tests/fixtures/api/group-detail.json'));
  assert.equal(typeof group.id, 'string');
  assert.equal(typeof group.name, 'string');
  assert.equal(typeof group.visibility, 'string');
  assert.equal(typeof group.createdAt, 'string');
  assert.equal(typeof group.description, 'string');
});
