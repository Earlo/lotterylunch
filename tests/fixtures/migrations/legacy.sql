INSERT INTO "User" ("id", "email", "name", "timezone", "authProvider", "emailVerified", "image", "createdAt", "updatedAt", "shortNoticePreference", "weekStartDay", "clockFormat") VALUES
('11111111-1111-4111-8111-111111111111', 'owner@example.test', 'Legacy Owner', 'Europe/Helsinki', 'google', '2025-05-20 10:00:00', 'https://example.test/owner.png', '2025-05-20 09:00:00', '2025-05-20 10:00:00', 'flexible', 'sunday', 'ampm'),
('22222222-2222-4222-8222-222222222222', 'member@example.test', 'Legacy Member', 'UTC', NULL, NULL, NULL, '2025-05-21 09:00:00', '2025-05-21 10:00:00', 'strict', 'monday', 'h24');

INSERT INTO "Group" ("id", "name", "description", "visibility", "ownerId", "createdAt", "location") VALUES
('33333333-3333-4333-8333-333333333333', 'Legacy Lunch', 'Preserve this group', 'invite_only', '11111111-1111-4111-8111-111111111111', '2025-05-22 12:00:00', 'Helsinki');

INSERT INTO "Membership" ("id", "userId", "groupId", "role", "status", "joinedAt") VALUES
('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', 'owner', 'active', '2025-05-22 12:01:00'),
('55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'admin', 'suspended', '2025-05-23 12:01:00');

INSERT INTO "Account" ("userId", "type", "provider", "providerAccountId", "refresh_token", "access_token", "expires_at", "token_type", "scope", "id_token", "session_state", "createdAt", "updatedAt") VALUES
('11111111-1111-4111-8111-111111111111', 'oauth', 'google', 'google-owner', 'google-refresh', 'google-access', 2000000000, 'Bearer', 'openid profile email', 'google-id', 'legacy-session-state', '2025-05-20 09:00:00', '2025-05-20 10:00:00'),
('22222222-2222-4222-8222-222222222222', 'oauth', 'github', 'github-member', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2025-05-21 09:00:00', '2025-05-21 10:00:00');

INSERT INTO "Session" ("sessionToken", "userId", "expires", "createdAt", "updatedAt") VALUES
('legacy-owner-session', '11111111-1111-4111-8111-111111111111', '2035-05-20 09:00:00', '2025-05-20 09:00:00', '2025-05-20 10:00:00'),
('legacy-member-session', '22222222-2222-4222-8222-222222222222', '2035-05-21 09:00:00', '2025-05-21 09:00:00', '2025-05-21 10:00:00');

INSERT INTO "CalendarConnection" ("id", "userId", "provider", "status", "oauthTokens") VALUES
('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 'google', 'connected', '{"accessToken":"calendar-access"}');

INSERT INTO "AvailabilitySlot" ("id", "userId", "groupId", "startAt", "endAt", "type") VALUES
('77777777-7777-4777-8777-777777777777', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '2035-05-21 09:00:00', '2035-05-21 10:00:00', 'lunch');

INSERT INTO "Match" ("id", "groupId", "scheduledFor", "algorithmVersion", "state") VALUES
('88888888-8888-4888-8888-888888888888', '33333333-3333-4333-8333-333333333333', '2035-05-21 09:00:00', 'legacy-v1', 'scheduled'),
('99999999-9999-4999-8999-999999999999', '33333333-3333-4333-8333-333333333333', '2035-05-22 09:00:00', 'legacy-v1', 'cancelled');

INSERT INTO "LunchEvent" ("id", "matchId", "calendarEventId", "venue", "status") VALUES
('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '88888888-8888-4888-8888-888888888888', 'legacy-calendar-event', 'Legacy Cafe', 'confirmed');

INSERT INTO "VerificationToken" ("identifier", "token", "expires") VALUES
('owner@example.test', 'legacy-verification-token', '2035-05-20 09:00:00');

INSERT INTO "Authenticator" ("credentialID", "userId", "providerAccountId", "credentialPublicKey", "counter", "credentialDeviceType", "credentialBackedUp", "transports") VALUES
('legacy-credential', '11111111-1111-4111-8111-111111111111', 'google-owner', 'legacy-public-key', 7, 'singleDevice', false, 'usb');
