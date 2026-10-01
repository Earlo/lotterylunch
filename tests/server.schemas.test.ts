import assert from 'node:assert/strict';
import test from 'node:test';

import { calendarArtifactDownloadParams } from '@/server/schemas/calendar';
import {
  createMembershipSchema,
  groupIdParamsSchema,
} from '@/server/schemas/memberships';
import { tokenIdParamsSchema } from '@/server/schemas/tokens';
import { webhookIdParamsSchema } from '@/server/schemas/webhooks';

const uuid = '7b3bff00-0c77-4d21-b990-9a05b3c117a2';

test('calendar download params extract the UUID from the whole .ics segment', () => {
  assert.deepEqual(
    calendarArtifactDownloadParams.parse({ artifactId: `${uuid}.ics` }),
    { artifactId: uuid },
  );
  assert.equal(
    calendarArtifactDownloadParams.safeParse({ artifactId: uuid }).success,
    false,
  );
  assert.equal(
    calendarArtifactDownloadParams.safeParse({ artifactId: 'invalid.ics' })
      .success,
    false,
  );
});

test('token and webhook routes accept their generated CUID identifiers', () => {
  const id = 'cm1x4lk9k0000vs9m8oe4eb7q';
  assert.deepEqual(tokenIdParamsSchema.parse({ tokenId: id }), { tokenId: id });
  assert.deepEqual(webhookIdParamsSchema.parse({ webhookId: id }), {
    webhookId: id,
  });
  assert.equal(tokenIdParamsSchema.safeParse({ tokenId: '' }).success, false);
  assert.equal(
    webhookIdParamsSchema.safeParse({ webhookId: 'a'.repeat(129) }).success,
    false,
  );
});

test('membership invitations accept opaque Better Auth user IDs and legacy UUIDs', () => {
  for (const userId of ['F1rP1sRy1aV39HPpvfQdSbj84DKmvgAu', uuid]) {
    assert.deepEqual(createMembershipSchema.parse({ userId }), { userId });
  }
  assert.equal(
    groupIdParamsSchema.safeParse({ groupId: 'not-a-group-uuid' }).success,
    false,
  );
});
