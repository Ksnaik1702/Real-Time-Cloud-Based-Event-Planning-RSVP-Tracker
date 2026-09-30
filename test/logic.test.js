import test from 'node:test'
import assert from 'node:assert/strict'
import { applyRsvpChange, countRsvpStatuses } from '../src/logic.js'

const event = (overrides = {}) => ({ id: 'event-1', capacity: 2, rsvps: {}, ...overrides })

test('accepts a Going response while a seat is available', () => {
  const result = applyRsvpChange(event(), 'attendee-1', 'GOING')
  assert.equal(result.ok, true)
  assert.equal(result.event.rsvps['attendee-1'], 'GOING')
})

test('rejects a new Going response when event capacity is full', () => {
  const fullEvent = event({ rsvps: { 'attendee-1': 'GOING', 'attendee-2': 'GOING' } })
  const result = applyRsvpChange(fullEvent, 'attendee-3', 'GOING')
  assert.equal(result.ok, false)
  assert.equal(result.event, undefined)
})

test('allows an attendee to change Maybe to Going without making a duplicate', () => {
  const maybeEvent = event({ rsvps: { 'attendee-1': 'MAYBE', 'attendee-2': 'GOING' } })
  const result = applyRsvpChange(maybeEvent, 'attendee-1', 'GOING')
  assert.equal(result.ok, true)
  assert.deepEqual(countRsvpStatuses(result.event.rsvps), { going: 2, maybe: 0, notGoing: 0, total: 2 })
})

test('lets a Going attendee remove their response so the seat is released', () => {
  const fullEvent = event({ rsvps: { 'attendee-1': 'GOING', 'attendee-2': 'GOING' } })
  const result = applyRsvpChange(fullEvent, 'attendee-1', null)
  assert.equal(result.ok, true)
  assert.equal('attendee-1' in result.event.rsvps, false)
  assert.equal(countRsvpStatuses(result.event.rsvps).going, 1)
})

test('counts each RSVP status separately', () => {
  assert.deepEqual(countRsvpStatuses({ a: 'GOING', b: 'MAYBE', c: 'NOT_GOING' }), {
    going: 1, maybe: 1, notGoing: 1, total: 3,
  })
})
