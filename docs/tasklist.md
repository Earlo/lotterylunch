# Release status — 2 October 2026

This checklist describes the current implementation. Earlier checked lottery CRUD,
scheduler, and separate run pages did not describe shipped code. The
[API reference](api-reference.md) is the endpoint contract.

## Implemented

- [x] Google sign-in and Better Auth schema reconciliation/recovery.
- [x] Group creation, invitations, joining, editing, deletion, and member leave controls.
- [x] Canonical owner protection and explicit ownership transfer.
- [x] Suspension protection and authorized reinstatement.
- [x] Atomic invite use claims and transactional dependent-record deletion.
- [x] Full availability replacement, clearing, and time validation.
- [x] Optional profile clearing and immediate schedule display preference updates.
- [x] Explicit participation, organizer-triggered draws, persisted matches, portal results.
- [x] Availability/history-aware matching with app booking conflict protection.
- [x] Google Calendar OAuth with browser/account binding and one-time state.
- [x] Authorized private ICS exports and manual Google Calendar actions.
- [x] Same-origin browser authentication default.
- [x] Database readiness and production container configuration.
- [x] Unit/security tests and disposable PostgreSQL service/migration regressions.
- [x] Profile-zone availability editing, including daylight-saving transitions.
- [x] Local multi-user browser journey with a different browser/profile time zone.
- [x] Production container startup, database outage readiness, and disposable backup restoration.

## Future product work

- [ ] Background schedules and automatic run execution.
- [ ] Run/match cancellation and external calendar update/removal synchronization.
- [ ] Automatic attendee invitations, email notifications, and reminders.
- [ ] Outlook/Apple OAuth and ICS subscription feeds.
- [ ] Outgoing webhooks, signatures, retries, and safe destination validation.
- [ ] Scoped integration tokens and audit logs.

## Deployment verification

- [ ] Complete real Google sign-in and Calendar consent on the deployment origin.
- [ ] Exercise complete multi-user browser journeys in staging.
- [ ] Inspect target database history and rehearse upgrades on a restored backup.
- [ ] Configure HTTPS ingress, shared rate limiting, secrets, monitoring, and backups.
- [ ] Verify restoration and outage readiness on the chosen deployment host.

These checks need the actual environment and credentials; repository tests do not
mark them complete.
