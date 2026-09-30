import { applyRsvpChange, countRsvpStatuses } from './logic'

const STORE = 'gather.events.v1'

const seed = [
  { id: 'ev-1', title: 'Design Systems Meetup', category: 'Community', date: '2026-10-12', time: '18:30', endTime: '20:30', venue: 'The Workshop, Bengaluru', description: 'An evening of practical talks, thoughtful discussion, and good company for people who build digital products.', capacity: 80, organizer: 'Product Circle', color: 'violet', status: 'PUBLISHED', rsvps: { demo: 'GOING', maya: 'GOING', arjun: 'MAYBE', sara: 'NOT_GOING' }, announcement: 'Doors open at 6:00 PM. Tea and snacks are included.' },
  { id: 'ev-2', title: 'Cloud Native Day', category: 'Technology', date: '2026-10-18', time: '09:00', endTime: '16:00', venue: 'Online · Live stream', description: 'A one-day introduction to containers, serverless patterns, and building resilient cloud applications.', capacity: 150, organizer: 'Cloud Campus', color: 'blue', status: 'PUBLISHED', rsvps: { maya: 'GOING', arjun: 'GOING', rohan: 'GOING' } },
  { id: 'ev-3', title: 'Founders & Chai', category: 'Networking', date: '2026-10-24', time: '16:00', endTime: '18:00', venue: 'Third Wave Coffee, Indiranagar', description: 'An informal afternoon to share what you are building, meet collaborators, and trade lessons learned.', capacity: 40, organizer: 'Start Together', color: 'orange', status: 'PUBLISHED', rsvps: { demo: 'MAYBE', maya: 'GOING' } },
  { id: 'ev-4', title: 'Product Design Workshop', category: 'Workshop', date: '2026-11-02', time: '10:00', endTime: '13:00', venue: 'Innovation Lab, Bengaluru', description: 'A hands-on workshop on research-led product design. Bring a laptop and a problem you care about.', capacity: 32, organizer: 'Studio North', color: 'green', status: 'PUBLISHED', rsvps: { arjun: 'GOING', sara: 'GOING', maya: 'MAYBE' } },
]

function read() {
  try { return JSON.parse(localStorage.getItem(STORE)) ?? seed } catch { return seed }
}

function publish(events) {
  localStorage.setItem(STORE, JSON.stringify(events))
  window.dispatchEvent(new CustomEvent('gather:events', { detail: events }))
  return events
}

export function subscribeEvents(onChange) {
  onChange(read())
  const local = (event) => onChange(event.detail)
  const crossTab = (event) => { if (event.key === STORE) onChange(read()) }
  window.addEventListener('gather:events', local)
  window.addEventListener('storage', crossTab)
  return () => { window.removeEventListener('gather:events', local); window.removeEventListener('storage', crossTab) }
}

export function createEvent(input) {
  const events = read()
  const event = { ...input, id: crypto.randomUUID(), organizer: 'You', color: ['violet', 'blue', 'orange', 'green'][events.length % 4], status: 'PUBLISHED', rsvps: {} }
  publish([event, ...events])
  return event
}

export function setRsvp(eventId, userId, status) {
  const events = read()
  let result = { ok: false, message: 'Event not found.' }
  const next = events.map((event) => {
    if (event.id !== eventId) return event
    result = applyRsvpChange(event, userId, status)
    return result.ok ? result.event : event
  })
  if (result.ok) publish(next)
  return result
}

export function addAnnouncement(eventId, message) {
  const events = read()
  publish(events.map((event) => event.id === eventId ? { ...event, announcement: message } : event))
}

export function counts(event) {
  return countRsvpStatuses(event.rsvps)
}

export function resetDemo() { localStorage.removeItem(STORE); window.dispatchEvent(new CustomEvent('gather:events', { detail: seed })) }
