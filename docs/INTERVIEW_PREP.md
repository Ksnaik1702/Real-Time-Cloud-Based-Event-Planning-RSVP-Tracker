# Interview preparation

## Explain the project

Gather is a real-time event planning and RSVP app. Organizers create and manage events, invite guests with unique links and QR codes, and see RSVP and check-in activity. Attendees sign in, respond, receive in-app updates, and can join a capacity-controlled waitlist. Firebase Authentication identifies users; Cloud Firestore stores events and streams updates to connected screens.

## Why use a cloud database?

Events and RSVP records live in one shared database, so an organizer and attendees can use different devices and still see the same current information. Firestore snapshot listeners push data changes to connected app screens without a manual refresh.

## How are duplicate RSVPs prevented?

Each attendee has one RSVP document at `events/{eventId}/rsvps/{userId}`. The document ID is the signed-in user's ID, so changing an answer updates the existing record instead of creating another RSVP.

## How is capacity enforced under concurrent requests?

The app reads the event and current RSVP in one Firestore transaction, then updates the RSVP and event counters together. If another request changes the event before commit, Firestore retries the transaction against the newer capacity count. Security Rules independently validate the resulting counters.

## How does the waitlist work?

When the event is full, an attendee receives a `WAITLISTED` RSVP with an increasing position. When a place opens, the organizer dashboard selects the earliest position and promotes that guest in a transaction. The dashboard must be online because scheduled server-side work is outside this no-billing build.

## How is the organizer separated from an attendee?

Firebase Authentication supplies the signed-in identity. A profile in `users/{userId}` stores the role. Firestore Rules check ownership and role before allowing event changes, invitations, announcement posts, attendee self check-in, and RSVP updates. An attendee can only create their own check-in after a Going RSVP; organizers see the attendance total. An attendee cannot RSVP to their own event.

## How do unique invitations and attendee check-in work?

The organizer imports guest names and email addresses from a CSV file or pasted list. Each guest gets a random token saved under the event's `invites` collection. The app creates a unique RSVP link and QR image; it does not send the invitation. Invite-only events require a valid token to RSVP. After the attendee has a Going RSVP, they check themself in from their account. The check-in record is tied to that user's RSVP and invitation when one is required. The organizer sees the checked-in total but does not perform the check-in.

## What is real-time in the app?

Firestore `onSnapshot` listeners watch public events, the signed-in user's RSVP, announcements, notifications, and the organizer's RSVP activity. When a record changes, the related dashboard or detail view updates automatically.

## How does the app handle service failures?

The UI shows friendly messages for permission errors and temporary Firebase outages. The local demo can run without Firebase configuration. Production build and unit tests are also configured in GitHub Actions.

## What are the current limits?

The app uses the Firebase client SDK directly rather than a custom REST backend. Waitlist promotion and reminders run while the relevant organizer or attendee app is open. Email, SMS, push delivery, scheduled jobs, managed backups, and hosted AI are excluded because they require billing-enabled cloud services or an external provider. Before public use, organizer role assignment and broad multi-user security testing should be strengthened. See `docs/BRIEF_COVERAGE.md` for the remaining requirements and evidence checklist.
