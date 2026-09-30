export function countRsvpStatuses(rsvps = {}) {
  const values = Object.values(rsvps)
  return {
    going: values.filter((value) => value === 'GOING').length,
    maybe: values.filter((value) => value === 'MAYBE').length,
    notGoing: values.filter((value) => value === 'NOT_GOING').length,
    total: values.length,
  }
}

export function applyRsvpChange(event, userId, status) {
  if (!event) return { ok: false, message: 'Event not found.' }
  const rsvps = { ...(event.rsvps || {}) }
  const previous = rsvps[userId]
  const going = Object.values(rsvps).filter((value) => value === 'GOING').length
  if (status === 'GOING' && previous !== 'GOING' && going >= Number(event.capacity)) {
    return { ok: false, message: 'This event is full. Try again if a place opens up.' }
  }
  if (status) rsvps[userId] = status
  else delete rsvps[userId]
  return {
    ok: true,
    event: { ...event, rsvps },
    message: status ? `Your response is ${status.toLowerCase().replace('_', ' ')}.` : 'Your response was removed.',
  }
}
