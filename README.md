# Real-Time Cloud-Based Event Planning & RSVP Tracker

Gather is a student project for planning events, discovering gatherings, and tracking responses. It has two modes: a local demo that runs without an account, and a Firebase mode with email/password authentication, shared Firestore events, live updates, and transaction-protected RSVP capacity.

## Run the local demo

1. Install Node.js 20 or newer.
2. Open this folder in VS Code.
3. In the integrated terminal, run:

   ```bash
   npm install
   npm run dev
   ```

4. Open the local address printed by Vite, usually `http://localhost:5173`.

Without a `.env` file containing Firebase configuration, Gather uses synthetic sample events and stores changes in this browser. Local demo data does not sync between browsers or computers.

## Enable Firebase mode

1. Create a Firebase project and add a Web App in the Firebase console.
2. Enable **Authentication → Email/Password**.
3. Create a Cloud Firestore database.
4. Copy `.env.example` to `.env` and fill in the Web App configuration values.
5. In a terminal, install the Firebase CLI if needed, select your project, and publish the included security rules:

   ```bash
   npx firebase-tools login
   npx firebase-tools use --add
   npx firebase-tools deploy --only firestore:rules
   ```

6. Restart the Vite development server and reload the page. The app will show the Firebase sign-in screen.
7. Create an account. Choose **Organizer** to publish events or **Attendee** to RSVP.

Firebase Web App config values are intended to be present in browser apps. Firestore Security Rules protect access to event ownership, account roles, RSVPs, and capacity counters. Never add a service account key to this project or commit `.env`.

## Deploy to Firebase Hosting

After configuring `.env` and selecting the Firebase project:

```bash
npm run build
npx firebase-tools deploy --only hosting,firestore:rules
```

The included `firebase.json` publishes the Vite `dist` folder and rewrites app routes to `index.html`. Firebase plan limits and billing requirements can change; check the Firebase console before deploying a public project.

## Features

- Organizer and attendee sign up and sign in with Firebase Authentication
- Organizer event creation with category, schedule, location, capacity, and RSVP deadline
- Organizer event editing and cancellation for events they own
- Attendee event discovery with real-time Firestore updates
- Attendee views for upcoming events, all personal RSVPs, and past events
- Separate All events, Community, Technology, Networking, Workshop, Social, and Other dashboards with per-category search and counts
- Going, Maybe, and Not Going responses, one per user per event
- FIFO waitlist when capacity is full; the host dashboard promotes the first waiter when a place opens
- Firestore transaction updates the RSVP record and event counts atomically
- Security Rules validate ownership, roles, capacity limits, RSVP transitions, and deadlines
- Live event totals and each signed-in user’s RSVP state
- RSVP distribution and capacity-use indicators for the selected category
- Organizer-only RSVP distribution, capacity use, growth chart, and invitee/response/check-in totals
- Per-guest invitation links and QR codes, with CSV import and optional invitation-only RSVPs
- Attendee self check-in after a Going RSVP; organizers can see the checked-in total
- Persistent in-app notices for RSVP changes, waitlist promotion, announcements, event changes, and cancellation
- In-app reminder shown within 24 hours of an event while the attendee app is open
- Hosts see guest response totals and announcement controls; attendees see their own RSVP actions
- Organizer announcements visible on the event page
- Announcement history and an in-app inbox for RSVP confirmations and event updates
- Local browser demo when Firebase credentials are not configured
- Local RSVP logic tests (`npm test`)

## Capacity and duplicate response handling

RSVP records live at `events/{eventId}/rsvps/{userId}`, which gives each signed-in user one response document per event. The RSVP flow reads the event and the user response in one Firestore transaction, checks whether a seat is available, then writes the response and updated counters together. Firestore retries the transaction if another RSVP changed the event while this request was in progress. Rules independently verify the before/after counter change and ensure Going never exceeds capacity.

## Data layout

```text
events/{eventId}
  createdBy, title, date, venue, capacity, counts, status, announcement
  rsvps/{userId}
  invites/{token}
  announcements/{announcementId}
  activity/{changeId}
  checkins/{userId}

users/{userId}
  displayName, email, role
  notifications/{notificationId}
```

## Project structure

```text
src/
  App.jsx       Local demo and mode selection
  CloudApp.jsx  Firebase sign-in, organizer, and attendee screens
  cloudData.js  Firestore listeners and transactional RSVP operations
  data.js       Local demo storage and RSVP behavior
  firebase.js  Firebase app, Auth, and Firestore initialization
  main.jsx      React entry point
  styles.css    Responsive interface styles
firestore.rules Firebase authorization and data validation rules
firebase.json   Firebase Hosting and Firestore configuration
```

## Current scope

Cloud mode supports event, RSVP, invitation, attendee self check-in, dashboard, and in-app notification flows. Guests need an account to RSVP. CSV upload only imports names and email addresses to create unique links and QR codes; it does not send email. The app uses the Firebase Web SDK and Firestore Rules, with real-time Firestore listeners rather than a separate custom REST server. Email/SMS/push delivery, scheduled cloud jobs, managed backups, hosted AI inference, and Cloud Functions are excluded from this no-billing build. An in-app reminder appears while an attendee has the app open within 24 hours of an event. Waitlist promotion runs while the organizer dashboard is online. Organizer sign-up is open for the classroom demo; a public service should grant that role through an administrator or trusted backend.

Firebase Hosting is configured, but the live deployment, GitHub repository, screenshots, and multi-browser proof still need to be completed by the project owner. Read [docs/BRIEF_COVERAGE.md](docs/BRIEF_COVERAGE.md) for a requirement-by-requirement review, [docs/REST_API_DESIGN.md](docs/REST_API_DESIGN.md) for the Firebase API mapping, and [PROJECT_REPORT.md](PROJECT_REPORT.md) for the architecture and scope.

GitHub Actions CI is included at `.github/workflows/ci.yml`; it runs the unit tests and production build for pushes and pull requests.

See [PROJECT_REPORT.md](PROJECT_REPORT.md) for the architecture and [docs/INTERVIEW_PREP.md](docs/INTERVIEW_PREP.md) for project walkthrough answers.
