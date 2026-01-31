import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = process.cwd();

async function loadJson(path) {
  const contents = await readFile(resolve(root, path), 'utf8');
  return JSON.parse(contents);
}

test('group list fixture matches expected contract', async () => {
  const groups = await loadJson('tests/fixtures/api/groups.json');
  assert.ok(Array.isArray(groups));
  assert.ok(groups.length > 0);

  const group = groups[0];
  assert.equal(typeof group.id, 'string');
  assert.equal(typeof group.name, 'string');
  assert.equal(typeof group.visibility, 'string');
  assert.equal(typeof group.createdAt, 'string');
});

test('group detail fixture matches expected contract', async () => {
  const group = await loadJson('tests/fixtures/api/group-detail.json');
  assert.equal(typeof group.id, 'string');
  assert.equal(typeof group.name, 'string');
  assert.equal(typeof group.visibility, 'string');
  assert.equal(typeof group.createdAt, 'string');
  assert.equal(typeof group.description, 'string');
});
