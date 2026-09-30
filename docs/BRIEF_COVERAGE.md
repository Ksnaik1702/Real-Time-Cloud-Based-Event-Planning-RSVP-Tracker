# Project brief coverage

This review compares the current app with the supplied project brief. It separates working app features from ideas that are described in the brief but are not implemented. Payment and billing features are excluded as requested.

## Implemented in the app

| Brief requirement | Current implementation |
| --- | --- |
| Organizer and attendee accounts | Firebase email/password sign-in with organizer and attendee roles |
| Cloud event management | Create, edit, and cancel events with date, time, location, category, capacity, and RSVP deadline |
| Event discovery by community/category | All events, Community, Technology, Networking, Workshop, Social, and Other views |
| Attendee event dashboard | Upcoming events, My RSVPs, and Past events filters; Going and Maybe remain RSVP response choices, not separate dashboard tabs |
| RSVP states and duplicate prevention | Going, Maybe, Not Going, and waitlist states; one RSVP document per account and event |
| Real-time cloud updates | Firestore listeners update event, RSVP, announcement, notification, and organizer activity views |
| Capacity and waitlist | Firestore transactions protect seats; FIFO waitlist promotion runs from the organizer dashboard while it is online |
| Organizer analytics | RSVP distribution, capacity use, response growth, invite response rate, and checked-in count; analytics are organizer-only |
| Guest invitations | CSV or pasted guest list creates per-guest invitation links and QR images. The app does not send email. |
| Attendee check-in | A signed-in attendee with a Going RSVP checks themself in; organizers see the checked-in total |
| Event updates and notices | Organizer announcements and in-app notifications; an in-app reminder appears while an attendee has the app open near an event |
| Security and roles | Firestore Rules check account ownership, event ownership, RSVP transitions, invite use, and check-in authorization |
| Local demo, docs, and CI | Browser-local demo, README, project report, interview preparation, and GitHub Actions CI configuration |

## Partially covered or not implemented

| Brief requirement | Status and reason |
| --- | --- |
| Custom REST API server and full endpoint implementation | Not implemented. The Firebase Web SDK talks to Firebase services directly; the app does not expose the brief's `/api/...` routes. A separately hosted API would require a backend deployment and more security work. |
| Full attendee dashboard history | Basic RSVP filters are present; there is no separate detailed past-event history page or event-by-event personal timeline. |
| Complete analytics set | Core counts, distribution, capacity, growth, and invite response rate are present. A separate RSVP timeline and RSVP conversion metric are not. |
| AI attendance prediction | Not implemented. The brief labels this optional; the suggested hosted inference service can incur billing. |
| Multi-user and security integration tests | The repository has small local logic tests. Firebase Rules, simultaneous real accounts, token expiry, outages, and browser reconnection still need integration testing. |
| Local multi-user simulation | The local demo stores data in one browser. Use separate Firebase accounts and browser windows for a real-time demonstration. |
| Public deployment and proof screenshots | Firebase Hosting is configured, but the app has not yet been deployed here. Deployment, screenshots, and a GitHub repository are project-owner publishing steps. |
| Organizer access governance | Organizer registration is open for a classroom demo. A public app should grant organizer roles through an administrator or trusted server. |

## Excluded because they need billing or an external service

- Scheduled cloud functions for reminders and automatic waitlist promotion while the organizer is offline.
- Email, SMS, and push notification delivery.
- Hosted AI inference and a separately hosted backend if the selected host requires a billing account.
- Managed scheduled Firestore backups.

The in-app notices and attendee self check-in work without those services. No payment collection or billing feature is included.

## Before publishing to GitHub

1. Deploy the latest Firestore rules and confirm the attendee self check-in flow works.
2. Run the local test and production build commands listed in the README.
3. Capture real screenshots of organizer and attendee flows, with personal data hidden.
4. Confirm `.env` is excluded from Git and do not add guest email lists, invitation tokens, or service-account keys.
5. Decide whether the course requires a custom REST backend. If it does, the current app is not yet a complete match for that requirement.
