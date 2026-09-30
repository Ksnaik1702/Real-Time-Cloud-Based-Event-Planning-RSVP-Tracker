import {
  addDoc, collection, deleteField, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, runTransaction, serverTimestamp, Timestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore'
import { auth, db } from './firebase'

export function subscribeCloudEvents(onChange, onError, userId) {
  const eventsQuery = query(collection(db, 'events'), where('status', 'in', ['PUBLISHED', 'FULL', 'CANCELLED']))
  const responseListeners = new Map()
  const responses = new Map()
  let currentEvents = []
  const emit = () => onChange(currentEvents.map((event) => ({ ...event, userResponse: responses.get(event.id) || null })))
  const stopEvents = onSnapshot(eventsQuery, (snapshot) => {
    currentEvents = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }))
      .sort((a, b) => a.date.localeCompare(b.date))
    if (userId) {
      const ids = new Set(currentEvents.map((event) => event.id))
      for (const [eventId, stop] of responseListeners) {
        if (!ids.has(eventId)) { stop(); responseListeners.delete(eventId); responses.delete(eventId) }
      }
      for (const event of currentEvents) {
        if (!responseListeners.has(event.id)) {
          const stop = onSnapshot(doc(db, 'events', event.id, 'rsvps', userId), (response) => {
            responses.set(event.id, response.exists() ? response.data() : null)
            emit()
          }, onError)
          responseListeners.set(event.id, stop)
        }
      }
    }
    emit()
  }, onError)
  return () => { stopEvents(); for (const stop of responseListeners.values()) stop() }
}

export async function createCloudEvent(user, input) {
  const { registrationDeadline, ...details } = input
  const event = {
    ...details,
    ...(registrationDeadline ? { registrationDeadlineAt: Timestamp.fromDate(new Date(`${registrationDeadline}T23:59:59`)) } : {}),
    capacity: Number(details.capacity),
    createdBy: user.uid,
    organizer: user.displayName || user.email,
    counts: { going: 0, maybe: 0, notGoing: 0, waitlisted: 0 },
    waitlistSequence: 0,
    status: 'PUBLISHED',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  return addDoc(collection(db, 'events'), event)
}

export async function createCloudInvites(eventId, invitees) {
  const batch = writeBatch(db)
  const created = invitees.map((invitee) => {
    const token = crypto.randomUUID()
    batch.set(doc(db, 'events', eventId, 'invites', token), {
      token, name: invitee.name || '', email: invitee.email.trim().toLowerCase(), status: 'PENDING', createdAt: serverTimestamp(),
    })
    return { ...invitee, token, url: `${location.origin}/?event=${encodeURIComponent(eventId)}&invite=${encodeURIComponent(token)}` }
  })
  await batch.commit()
  return created
}

export async function getCloudInvite(eventId, token) {
  const snapshot = await getDoc(doc(db, 'events', eventId, 'invites', token))
  return snapshot.exists() ? snapshot.data() : null
}

export function subscribeCloudInvites(eventId, onChange, onError) {
  return onSnapshot(collection(db, 'events', eventId, 'invites'), (snapshot) => onChange(snapshot.docs.map((entry) => entry.data())), onError)
}

export async function getCloudCheckinStatus(eventId, userId) {
  const snapshot = await getDoc(doc(db, 'events', eventId, 'checkins', userId))
  return snapshot.exists()
}

export async function checkInCloudAttendee(eventId, userId) {
  const eventRef = doc(db, 'events', eventId)
  const rsvpRef = doc(db, 'events', eventId, 'rsvps', userId)
  const checkinRef = doc(db, 'events', eventId, 'checkins', userId)
  return runTransaction(db, async (transaction) => {
    const [eventSnapshot, rsvpSnapshot, checkinSnapshot] = await Promise.all([
      transaction.get(eventRef), transaction.get(rsvpRef), transaction.get(checkinRef),
    ])
    if (!eventSnapshot.exists() || eventSnapshot.data().status === 'CANCELLED') throw new Error('This event is no longer available for check-in.')
    if (!rsvpSnapshot.exists() || rsvpSnapshot.data().status !== 'GOING') throw new Error('You need a Going RSVP before checking in.')
    if (checkinSnapshot.exists()) throw new Error('You are already checked in.')

    const event = eventSnapshot.data()
    const rsvp = rsvpSnapshot.data()
    const inviteToken = rsvp.inviteToken || ''
    const inviteRef = inviteToken ? doc(db, 'events', eventId, 'invites', inviteToken) : null
    const inviteSnapshot = inviteRef ? await transaction.get(inviteRef) : null
    if (event.inviteOnly && (!inviteSnapshot?.exists() || inviteSnapshot.data().acceptedBy !== userId)) {
      throw new Error('Check in using the invitation linked to your Going RSVP.')
    }
    if (inviteSnapshot?.exists() && inviteSnapshot.data().acceptedBy === userId && !inviteSnapshot.data().checkedInAt) {
      transaction.update(inviteRef, { checkedInAt: serverTimestamp(), checkedInBy: userId })
    }
    transaction.set(checkinRef, { userId, inviteToken, checkedInBy: userId, checkedInAt: serverTimestamp() })
    return true
  })
}

export async function submitCloudRsvp(eventId, user, status, inviteToken = '') {
  const eventRef = doc(db, 'events', eventId)
  const rsvpRef = doc(db, 'events', eventId, 'rsvps', user.uid)
  const inviteRef = inviteToken ? doc(db, 'events', eventId, 'invites', inviteToken) : null
  const activityRef = doc(collection(db, 'events', eventId, 'activity'))
  const notificationRef = doc(collection(db, 'users', user.uid, 'notifications'))
  const result = await runTransaction(db, async (transaction) => {
    const [eventSnapshot, rsvpSnapshot] = await Promise.all([transaction.get(eventRef), transaction.get(rsvpRef)])
    if (!eventSnapshot.exists()) throw new Error('This event is no longer available.')
    const event = eventSnapshot.data()
    if (event.inviteOnly && !inviteRef) throw new Error('This event requires its invitation link to RSVP.')
    const inviteSnapshot = inviteRef ? await transaction.get(inviteRef) : null
    if (event.inviteOnly && (!inviteSnapshot?.exists() || (inviteSnapshot.data().acceptedBy && inviteSnapshot.data().acceptedBy !== user.uid))) throw new Error('This invitation is invalid or has already been used by someone else.')
    if (event.createdBy === user.uid) throw new Error('You’re hosting this event, so you don’t need to RSVP.')
    if (!['PUBLISHED', 'FULL'].includes(event.status)) throw new Error('This event is not accepting responses.')
    if (event.registrationDeadlineAt && event.registrationDeadlineAt.toDate() < new Date()) {
      throw new Error('The RSVP deadline has passed.')
    }
    const previous = rsvpSnapshot.exists() ? rsvpSnapshot.data().status : null
    if (previous === status || (!previous && !status) || (previous === 'WAITLISTED' && status === 'GOING')) {
      return { ok: true, status: previous, waitlistPosition: rsvpSnapshot.exists() ? rsvpSnapshot.data().waitlistPosition : undefined, freedSeat: false }
    }
    const counts = { going: 0, maybe: 0, notGoing: 0, waitlisted: 0, ...(event.counts || {}) }
    const countFor = (value) => value === 'GOING' ? 'going' : value === 'MAYBE' ? 'maybe' : value === 'NOT_GOING' ? 'notGoing' : value === 'WAITLISTED' ? 'waitlisted' : null
    const oldKey = countFor(previous)
    let nextStatus = status
    let nextPosition = rsvpSnapshot.exists() ? rsvpSnapshot.data().waitlistPosition : undefined
    let waitlistSequence = event.waitlistSequence || 0
    if (status === 'GOING' && previous !== 'GOING' && counts.going >= Number(event.capacity)) {
      nextStatus = 'WAITLISTED'
      nextPosition = ++waitlistSequence
    }
    if (nextStatus === 'WAITLISTED' && previous !== 'WAITLISTED') counts.waitlisted += 1
    const newKey = countFor(nextStatus)
    if (oldKey) counts[oldKey] -= 1
    if (newKey) counts[newKey] += 1
    const eventStatus = counts.going >= Number(event.capacity) ? 'FULL' : 'PUBLISHED'
    transaction.update(eventRef, { counts, status: eventStatus, waitlistSequence, updatedAt: serverTimestamp() })
    if (nextStatus) {
      transaction.set(rsvpRef, {
        userId: user.uid,
        status: nextStatus,
        respondedAt: rsvpSnapshot.exists() ? rsvpSnapshot.data().respondedAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(nextStatus === 'WAITLISTED' ? { waitlistPosition: nextPosition } : {}),
        ...(inviteSnapshot?.exists() ? { inviteToken } : {}),
      })
    } else if (rsvpSnapshot.exists()) {
      transaction.delete(rsvpRef)
    }
    if (inviteSnapshot?.exists() && !inviteSnapshot.data().acceptedBy) {
      transaction.update(inviteRef, { status: 'ACCEPTED', acceptedBy: user.uid, acceptedAt: serverTimestamp() })
    }
    if (previous !== nextStatus) {
      const label = nextStatus === 'WAITLISTED' ? 'You joined the waitlist' : nextStatus ? `Your RSVP is ${nextStatus.toLowerCase().replace('_', ' ')}` : 'Your RSVP was removed'
      transaction.set(notificationRef, { eventId, type: 'rsvp', message: label, read: false, createdAt: serverTimestamp() })
      transaction.set(activityRef, { userId: user.uid, previousStatus: previous || 'NONE', status: nextStatus || 'REMOVED', previousGoing: previous === 'GOING', isGoing: nextStatus === 'GOING', createdAt: serverTimestamp() })
    }
    return { ok: true, status: nextStatus, waitlistPosition: nextPosition, freedSeat: previous === 'GOING' && nextStatus !== 'GOING' }
  })
  return result
}

export async function promoteCloudWaitlist(eventId, organizerId) {
  const eventRef = doc(db, 'events', eventId)
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const queue = await getDocs(query(collection(db, 'events', eventId, 'rsvps'), orderBy('waitlistPosition')))
    const candidate = queue.docs.find((entry) => entry.data().status === 'WAITLISTED')
    if (!candidate) return
    const candidateRef = candidate.ref
    const outcome = await runTransaction(db, async (transaction) => {
      const [eventSnapshot, candidateSnapshot] = await Promise.all([transaction.get(eventRef), transaction.get(candidateRef)])
      if (!eventSnapshot.exists() || !candidateSnapshot.exists()) return 'stale'
      const event = eventSnapshot.data()
      const candidate = candidateSnapshot.data()
      if (event.createdBy !== organizerId) throw new Error('Only the event host can promote the waitlist.')
      if (event.status === 'CANCELLED') return 'full'
      if (candidate.status !== 'WAITLISTED') return 'stale'
      const counts = { going: 0, maybe: 0, notGoing: 0, waitlisted: 0, ...(event.counts || {}) }
      if (counts.going >= Number(event.capacity)) return 'full'
      counts.waitlisted = Math.max(0, counts.waitlisted - 1)
      counts.going += 1
      transaction.update(eventRef, { counts, status: counts.going >= Number(event.capacity) ? 'FULL' : 'PUBLISHED', updatedAt: serverTimestamp() })
      transaction.update(candidateRef, { status: 'GOING', waitlistPosition: deleteField(), updatedAt: serverTimestamp() })
      const notificationRef = doc(collection(db, 'users', candidateSnapshot.id, 'notifications'))
      transaction.set(notificationRef, { eventId, type: 'waitlist', message: 'A place opened and your RSVP is now Going.', read: false, createdAt: serverTimestamp() })
      return 'promoted'
    })
    if (outcome === 'full') return
  }
}

export async function postCloudAnnouncement(eventId, message) {
  const eventRef = doc(db, 'events', eventId)
  const announcementRef = doc(collection(db, 'events', eventId, 'announcements'))
  const batch = writeBatch(db)
  batch.set(announcementRef, { title: 'Event update', message, createdBy: auth.currentUser.uid, createdAt: serverTimestamp() })
  batch.update(eventRef, { announcement: message, updatedAt: serverTimestamp() })
  const attendees = await getDocs(collection(db, 'events', eventId, 'rsvps'))
  for (const attendee of attendees.docs) {
    if (attendee.data().status === 'NOT_GOING') continue
    const notificationRef = doc(collection(db, 'users', attendee.id, 'notifications'))
    batch.set(notificationRef, { eventId, type: 'announcement', message, read: false, createdAt: serverTimestamp() })
  }
  return batch.commit()
}

export function subscribeCloudAnnouncements(eventId, onChange, onError) {
  return onSnapshot(query(collection(db, 'events', eventId, 'announcements'), orderBy('createdAt', 'desc'), limit(20)), (snapshot) => {
    onChange(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })))
  }, onError)
}

export function subscribeCloudActivity(eventId, onChange, onError) {
  return onSnapshot(query(collection(db, 'events', eventId, 'activity'), orderBy('createdAt', 'asc')), (snapshot) => {
    onChange(snapshot.docs.map((entry) => entry.data()))
  }, onError)
}

export function subscribeCloudNotifications(userId, onChange, onError) {
  return onSnapshot(query(collection(db, 'users', userId, 'notifications'), orderBy('createdAt', 'desc'), limit(20)), (snapshot) => {
    onChange(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })))
  }, onError)
}

export function markCloudNotificationRead(userId, notificationId) {
  return updateDoc(doc(db, 'users', userId, 'notifications', notificationId), { read: true })
}

export async function createCloudReminderIfDue(userId, event) {
  if (!['GOING', 'MAYBE'].includes(event.userResponse?.status) || event.status === 'CANCELLED') return false
  const start = new Date(`${event.date}T${event.time || '09:00'}:00`).getTime()
  const remaining = start - Date.now()
  if (remaining <= 0 || remaining > 24 * 60 * 60 * 1000) return false
  const reminderRef = doc(db, 'users', userId, 'notifications', `reminder_${event.id}`)
  return runTransaction(db, async (transaction) => {
    const existing = await transaction.get(reminderRef)
    if (existing.exists()) return false
    transaction.set(reminderRef, { eventId: event.id, type: 'reminder', message: `Reminder: ${event.title} is coming up within 24 hours.`, read: false, createdAt: serverTimestamp() })
    return true
  })
}

export async function updateCloudEvent(eventId, input, existingEvent) {
  const { registrationDeadline, ...details } = input
  const eventRef = doc(db, 'events', eventId)
  const batch = writeBatch(db)
  batch.update(eventRef, {
    ...details,
    ...(registrationDeadline ? { registrationDeadlineAt: Timestamp.fromDate(new Date(`${registrationDeadline}T23:59:59`)) } : { registrationDeadlineAt: null }),
    status: existingEvent.status === 'CANCELLED' ? 'CANCELLED' : (Number(details.capacity) <= (existingEvent.counts?.going || 0) ? 'FULL' : 'PUBLISHED'),
    updatedAt: serverTimestamp(),
  })
  const changed = ['date', 'time', 'venue'].some((key) => existingEvent[key] !== details[key])
  if (changed) {
    const guests = await getDocs(collection(db, 'events', eventId, 'rsvps'))
    for (const guest of guests.docs) {
      if (guest.data().status === 'NOT_GOING') continue
      batch.set(doc(collection(db, 'users', guest.id, 'notifications')), { eventId, type: 'event_update', message: 'The event schedule or location has changed.', read: false, createdAt: serverTimestamp() })
    }
  }
  return batch.commit()
}

export async function cancelCloudEvent(eventId) {
  const batch = writeBatch(db)
  batch.update(doc(db, 'events', eventId), { status: 'CANCELLED', updatedAt: serverTimestamp() })
  const guests = await getDocs(collection(db, 'events', eventId, 'rsvps'))
  for (const guest of guests.docs) {
    if (guest.data().status === 'NOT_GOING') continue
    batch.set(doc(collection(db, 'users', guest.id, 'notifications')), { eventId, type: 'cancelled', message: 'The host cancelled this event.', read: false, createdAt: serverTimestamp() })
  }
  return batch.commit()
}
