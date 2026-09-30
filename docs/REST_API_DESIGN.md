# Firebase REST API design

## Scope

Firebase provides HTTPS REST APIs for Authentication and Cloud Firestore. This project currently calls those services through the Firebase Web SDK, which handles ID-token refresh, Firestore value encoding, transactions, and real-time listeners. The app does not include a separate server exposing custom `/api/...` routes. This document records how the brief's REST operations map to Firebase's managed APIs; it is a design reference, not a claim that a custom backend is deployed.

Firestore REST requests use the base path below and a Firebase Authentication ID token in the `Authorization` header. Firestore Security Rules still authorize user-token requests.

```text
https://firestore.googleapis.com/v1/projects/{projectId}/databases/(default)/documents
Authorization: Bearer {firebaseIdToken}
```

Firebase documents the [Cloud Firestore REST API](https://firebase.google.com/docs/firestore/use-rest-api) and [Firebase Authentication REST API](https://firebase.google.com/docs/reference/rest/auth).

## Authentication

| Operation | Method and endpoint | Request | Successful response | Access and common errors |
| --- | --- | --- | --- | --- |
| Register | `POST https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={webApiKey}` | `email`, `password`, `returnSecureToken: true` | Firebase user ID, ID token, refresh token | HTTPS; `400` for an existing email or invalid credentials |
| Sign in | `POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={webApiKey}` | `email`, `password`, `returnSecureToken: true` | Firebase user ID, ID token, refresh token | HTTPS; `400` for invalid credentials or disabled provider |
| Sign out | Client clears the current Firebase Auth session | No REST request is needed for the web client | Signed-out client state | Protected Firestore calls fail without a valid ID token |

The Web API key identifies the Firebase project; it is not a server secret. Passwords, refresh tokens, and ID tokens must not be committed or written to logs.

## Events

| Operation | Method and endpoint | Request / response | Authorization and expected errors |
| --- | --- | --- | --- |
| List events | `GET /events` | Returns event documents | Firestore Rules limit results to published event data; `401/403` when access is denied |
| Get event | `GET /events/{eventId}` | Returns one event document | Published event or owner; `404` if absent |
| Create event | `POST /events` | Event fields encoded in Firestore REST `fields` format | Organizer role, creator UID, and event fields are checked by Rules; `403` if denied |
| Update event | `PATCH /events/{eventId}?updateMask.fieldPaths=...` | Only the changed fields | Only the event owner may change allowed event fields; `403` if denied |
| Cancel event | `PATCH /events/{eventId}?updateMask.fieldPaths=status` | `status: CANCELLED` | Only the owner; `403` if denied |

## RSVPs and capacity

| Operation | Method and endpoint | Request / response | Authorization and expected errors |
| --- | --- | --- | --- |
| Read one RSVP | `GET /events/{eventId}/rsvps/{userId}` | Returns the signed-in attendee's RSVP | Attendee reads their own RSVP; organizer may read the event's responses; `403` if denied |
| Create or update RSVP | `POST /documents:commit` | Transactional writes to the RSVP document, event counter, activity record, and applicable notifications | Rules verify identity, deadline, status transition, capacity, and matching before/after counts; `400/403/409` on invalid or conflicting writes |
| Remove RSVP | `POST /documents:commit` | Transaction deletes the attendee RSVP and adjusts event counters together | Only the RSVP owner (not the organizer account) may remove it; `403` if denied |
| Read my RSVPs | Query the RSVP documents for events visible to the signed-in account | Returns each matching RSVP and event ID | The current application builds this view from its live event subscriptions; a custom backend endpoint is not present |

Capacity updates must stay in the same Firestore transaction as the RSVP change. A separate read followed by an independent write can overbook the last seat. The current web app uses the Firebase transaction API and Rules rather than hand-building the REST `commit` request.

## Analytics, announcements, and notifications

| Operation | Method and endpoint | Request / response | Authorization and expected errors |
| --- | --- | --- | --- |
| Event analytics | `GET /events/{eventId}` | Reads the event's aggregate counts; response growth is read from `/events/{eventId}/activity` | Organizer UI only; `403` if a user tries to read organizer-only records |
| Publish announcement | `POST /events/{eventId}/announcements` | `title`, `message`, `createdBy`, `createdAt` | Event owner only; `403` if denied, `400` for invalid fields |
| List announcements | `GET /events/{eventId}/announcements` | Returns announcement history | Signed-in event viewers; `403` if denied |
| List notifications | `GET /users/{userId}/notifications` | Returns that user's notification records | Owner only; `403` for another user's path |
| Mark notification read | `PATCH /users/{userId}/notifications/{notificationId}?updateMask.fieldPaths=read` | `{ "read": true }` | Owner only; `403` if denied |

## Status and failure handling

- `200 OK`: read or update succeeded.
- `201 Created`: a document was created.
- `400 Bad Request`: invalid document value or request shape.
- `401 Unauthorized`: the ID token is absent or expired; refresh the sign-in token and retry once.
- `403 Permission Denied`: Firestore Rules rejected the requested operation; do not retry without changing the user action or rule configuration.
- `404 Not Found`: the event, RSVP, or notification does not exist.
- `409 Aborted`: a transaction conflict; retry the entire transaction with fresh reads.
- `429 Resource Exhausted` or `5xx`: back off and retry safe/idempotent work; show a clear error if service does not recover.

The browser SDK already handles token refresh, Firestore serialization, streaming updates, and transaction retries for this app. A separate REST facade would need its own input validation, request limits, CORS policy, structured logging, retries, and deployment before it could replace the SDK calls.
