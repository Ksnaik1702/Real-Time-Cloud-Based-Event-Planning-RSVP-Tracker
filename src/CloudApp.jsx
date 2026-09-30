import { useEffect, useRef, useState } from 'react'
import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword,
  signOut, updateProfile,
} from 'firebase/auth'
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore'
import { Activity, Bell, CalendarDays, Check, Cloud, LogOut, MapPin, Plus, Search, Users } from 'lucide-react'
import QRCode from 'qrcode'
import { auth, db } from './firebase'
import { cancelCloudEvent, checkInCloudAttendee, createCloudEvent, createCloudInvites, createCloudReminderIfDue, getCloudCheckinStatus, getCloudInvite, markCloudNotificationRead, postCloudAnnouncement, promoteCloudWaitlist, submitCloudRsvp, subscribeCloudActivity, subscribeCloudAnnouncements, subscribeCloudEvents, subscribeCloudInvites, subscribeCloudNotifications, updateCloudEvent } from './cloudData'

const prettyDate = (value) => new Date(`${value}T12:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })
const prettyTime = (value) => new Date(`2020-01-01T${value}`).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })
const eventHasPassed = (event) => new Date(`${event.date}T${event.endTime || event.time || '23:59'}`).getTime() < Date.now()

export default function CloudApp() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [profileReady, setProfileReady] = useState(false)
  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setUser(nextUser)
    setProfile(null)
    setProfileReady(!nextUser)
    setLoading(false)
  }), [])
  useEffect(() => {
    if (!user) return undefined
    return onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      setProfile(snapshot.exists() ? snapshot.data() : { displayName: user.displayName || user.email, role: 'attendee' })
      setProfileReady(true)
    }, () => setProfileReady(true))
  }, [user])
  if (loading || (user && !profileReady)) return <div className="cloud-loading"><span className="loading-mark"><CalendarDays size={22}/></span><span>Gather is getting things ready…</span></div>
  if (!user) return <AuthScreen />
  return <CloudWorkspace user={user} profile={profile || { displayName: user.displayName || user.email, role: 'attendee' }} />
}

function AuthScreen() {
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [role, setRole] = useState('attendee')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      if (mode === 'signup') {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
        if (name.trim()) await updateProfile(credential.user, { displayName: name.trim() })
        await setDoc(doc(db, 'users', credential.user.uid), { displayName: name.trim() || email.trim(), email: email.trim(), role, createdAt: serverTimestamp() })
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password)
      }
    } catch (failure) {
      setError(authMessage(failure))
    } finally { setBusy(false) }
  }
  return <main className="cloud-auth-page"><div className="cloud-auth-card"><div className="cloud-brand"><span className="brand-mark"><CalendarDays size={19}/></span><span>gather<span className="brand-period">.</span></span></div><div className="cloud-auth-kicker"><Cloud size={14}/> CLOUD WORKSPACE</div><h1>{mode === 'login' ? 'Welcome back.' : 'Let’s get together.'}</h1><p className="cloud-auth-subtitle">{mode === 'login' ? 'Sign in to see your events and RSVP updates.' : 'Create an account to start planning and joining events.'}</p><form onSubmit={submit} className="cloud-auth-form">{mode === 'signup' && <><label className="field-label">Your name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Alex Morgan" required maxLength={80}/></label><label className="field-label">I’m here as<select value={role} onChange={(event) => setRole(event.target.value)}><option value="attendee">Attendee</option><option value="organizer">Organizer</option></select></label></>}<label className="field-label">Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required/></label><label className="field-label">Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 6 characters" minLength="6" required/></label>{error && <p className="cloud-auth-error">{error}</p>}<button className="primary-button cloud-auth-submit" disabled={busy}>{busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}</button></form><p className="cloud-auth-switch">{mode === 'login' ? 'New to Gather?' : 'Already have an account?'} <button onClick={() => {setMode(mode === 'login' ? 'signup' : 'login'); setError('')}}>{mode === 'login' ? 'Create an account' : 'Sign in'}</button></p><p className="cloud-auth-note">Your data is stored in the Firebase project configured for this app.</p></div></main>
}

function CloudWorkspace({ user, profile }) {
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('All events')
  const [attendeeView, setAttendeeView] = useState('Upcoming')
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [loadingEvents, setLoadingEvents] = useState(true)
  const [notifications, setNotifications] = useState([])
  const [showNotifications, setShowNotifications] = useState(false)
  const promoting = useRef(new Set())
  const inviteOpened = useRef(false)
  const role = profile.role || 'attendee'
  const categories = ['All events', 'Community', 'Technology', 'Networking', 'Workshop', 'Social', 'Other']
  useEffect(() => subscribeCloudEvents((rows) => { setEvents(rows); setLoadingEvents(false) }, (failure) => { setError(cloudMessage(failure)); setLoadingEvents(false) }, user.uid), [user.uid])
  useEffect(() => subscribeCloudNotifications(user.uid, setNotifications, (failure) => setError(cloudMessage(failure))), [user.uid])
  useEffect(() => {
    if (role !== 'attendee') return undefined
    const checkReminders = () => events.forEach((event) => createCloudReminderIfDue(user.uid, event).catch((failure) => setError(cloudMessage(failure))))
    checkReminders()
    const timer = window.setInterval(checkReminders, 15 * 60 * 1000)
    return () => window.clearInterval(timer)
  }, [events, role, user.uid])
  useEffect(() => {
    if (role !== 'organizer') return
    for (const event of events) {
      if (event.createdBy !== user.uid || event.status === 'CANCELLED' || !event.counts?.waitlisted) continue
      if ((event.counts.going || 0) >= Number(event.capacity) || promoting.current.has(event.id)) continue
      promoting.current.add(event.id)
      promoteCloudWaitlist(event.id, user.uid).catch((failure) => setError(cloudMessage(failure))).finally(() => promoting.current.delete(event.id))
    }
  }, [events, role, user.uid])
  async function respond(event, status) {
    setError(''); setNotice('')
    try { const token = new URLSearchParams(location.search).get('invite') || ''; const result = await submitCloudRsvp(event.id, user, status, token); setNotice(result.status === 'WAITLISTED' ? `The event is full. You’re #${result.waitlistPosition} on the waitlist.` : status ? `Your response is ${status.toLowerCase().replace('_', ' ')}.` : 'Your response was removed.') }
    catch (failure) { setError(cloudMessage(failure)) }
  }
  async function announce(eventId, message) {
    setError('')
    try { await postCloudAnnouncement(eventId, message); setNotice('Announcement published for your guests.') }
    catch (failure) { setError(cloudMessage(failure)) }
  }
  async function saveEvent(eventId, input) {
    setError('')
    try { await updateCloudEvent(eventId, input, editing); setEditing(null); setNotice('Event details updated.') }
    catch (failure) { setError(cloudMessage(failure)) }
  }
  async function cancelEvent(event) {
    if (!window.confirm(`Cancel “${event.title}”? Attendees will see that it was cancelled.`)) return
    setError('')
    try { await cancelCloudEvent(event.id); setNotice('Event cancelled.'); setSelected((current) => current ? { ...current, status: 'CANCELLED' } : current) }
    catch (failure) { setError(cloudMessage(failure)) }
  }
  const categoryEvents = selectedCategory === 'All events' ? events : events.filter((event) => event.category === selectedCategory)
  const attendeeViews = ['Upcoming', 'My RSVPs', 'Past events']
  const attendeeEvents = role !== 'attendee' ? categoryEvents : categoryEvents.filter((event) => {
    const response = event.userResponse?.status
    if (attendeeView === 'My RSVPs') return Boolean(response)
    if (attendeeView === 'Past events') return eventHasPassed(event)
    return !eventHasPassed(event)
  })
  const visibleEvents = attendeeEvents.filter((event) => `${event.title} ${event.venue} ${event.description || ''}`.toLowerCase().includes(search.toLowerCase()))
  const going = categoryEvents.reduce((sum, event) => sum + (event.counts?.going || 0), 0)
  const maybe = categoryEvents.reduce((sum, event) => sum + (event.counts?.maybe || 0), 0)
  const notGoing = categoryEvents.reduce((sum, event) => sum + (event.counts?.notGoing || 0), 0)
  const waitlisted = categoryEvents.reduce((sum, event) => sum + (event.counts?.waitlisted || 0), 0)
  const capacity = categoryEvents.reduce((sum, event) => sum + Number(event.capacity || 0), 0)
  const responses = going + maybe + notGoing + waitlisted
  const capacityUsed = capacity ? Math.min(100, Math.round(going / capacity * 100)) : 0
  const responseShare = (count) => responses ? Math.round(count / responses * 100) : 0
  const currentTitle = role === 'attendee' && attendeeView !== 'Upcoming'
    ? attendeeView === 'My RSVPs' ? 'My RSVPs' : attendeeView
    : selectedCategory === 'All events' ? 'Upcoming events' : `${selectedCategory} events`
  useEffect(() => {
    const inviteEventId = new URLSearchParams(location.search).get('event')
    if (!inviteOpened.current && inviteEventId) {
      const inviteEvent = events.find((event) => event.id === inviteEventId)
      if (inviteEvent) { setSelected(inviteEvent); inviteOpened.current = true }
    }
  }, [events])
  return <div className="cloud-shell">
    <header className="cloud-topbar"><div className="cloud-brand compact"><span className="brand-mark"><CalendarDays size={18}/></span><span>gather<span className="brand-period">.</span></span></div><div className="cloud-user"><span className="cloud-online"/> Live cloud data <span className="cloud-user-divider"/><span className="cloud-user-name">{profile.displayName || user.email}</span><span className="cloud-role">{role}</span><div className="cloud-notification-wrap"><button className="cloud-notification-trigger" onClick={() => setShowNotifications(!showNotifications)} title="Notifications"><Bell size={17}/>{notifications.some((item) => !item.read) && <i/>}</button>{showNotifications && <div className="cloud-notification-panel"><strong>Notifications</strong>{notifications.length ? notifications.map((item) => <button key={item.id} className={!item.read ? 'unread' : ''} onClick={async () => {try {await markCloudNotificationRead(user.uid,item.id); const match=events.find((event)=>event.id===item.eventId); if(match)setSelected(match); setShowNotifications(false)} catch(failure){setError(cloudMessage(failure))}}}><span>{item.message}</span><small>{events.find((event)=>event.id===item.eventId)?.title || 'Event update'}</small></button>) : <p>You’re all caught up.</p>}</div>}</div><button className="cloud-signout" onClick={() => signOut(auth)} title="Sign out"><LogOut size={16}/></button></div></header>
    <main className="cloud-content">
      <div className="cloud-welcome"><div><h1>Good things are <span>on the calendar.</span></h1><p className="page-subtitle">{role === 'organizer' ? 'Create a gathering and watch responses come in live.' : 'Discover a gathering and let the host know you’re coming.'}</p></div>{role === 'organizer' && <button className="primary-button" onClick={() => setShowCreate(true)}><Plus size={16}/> Create event</button>}</div>
      {(error || notice) && <div className={`cloud-message ${error ? 'is-error' : ''}`}><span>{error || notice}</span><button onClick={() => {setError('');setNotice('')}}>Dismiss</button></div>}
      <section className="cloud-summary"><div className="cloud-summary-copy"><span><Activity size={15}/> LIVE RSVP ACTIVITY</span><h2>{selectedCategory === 'All events' ? <>Every response, <em>in sync.</em></> : <>{selectedCategory}, <em>in sync.</em></>}</h2><p>Updates appear automatically for everyone viewing the event.</p></div><div className="cloud-summary-stat"><strong>{categoryEvents.length}</strong><span>{selectedCategory === 'All events' ? 'upcoming events' : `${selectedCategory.toLowerCase()} events`}</span></div><div className="cloud-summary-stat"><strong>{going}</strong><span>going</span></div><div className="cloud-summary-stat"><strong>{maybe}</strong><span>maybe</span></div><div className="cloud-summary-stat"><strong>{waitlisted}</strong><span>waitlisted</span></div></section>
      {role === 'organizer' && <section className="cloud-analytics" aria-label="Category analytics"><div className="cloud-chart-card"><div className="cloud-chart-title"><div><h3>RSVP distribution</h3><p>{responses} recorded responses</p></div><Activity size={17}/></div><div className="cloud-distribution"><i className="mix-going" style={{width:`${responseShare(going)}%`}}/><i className="mix-maybe" style={{width:`${responseShare(maybe)}%`}}/><i className="mix-no" style={{width:`${responseShare(notGoing)}%`}}/><i className="mix-wait" style={{width:`${responseShare(waitlisted)}%`}}/></div><div className="cloud-chart-legend"><span><i className="mix-going"/>Going <b>{going}</b></span><span><i className="mix-maybe"/>Maybe <b>{maybe}</b></span><span><i className="mix-no"/>Not going <b>{notGoing}</b></span><span><i className="mix-wait"/>Waitlist <b>{waitlisted}</b></span></div></div><div className="cloud-chart-card"><div className="cloud-chart-title"><div><h3>Capacity used</h3><p>{going} of {capacity} places reserved</p></div><Users size={17}/></div><div className="cloud-capacity-track"><i style={{width:`${capacityUsed}%`}}/></div><div className="cloud-capacity-foot"><strong>{capacityUsed}%</strong><span>{Math.max(capacity - going, 0)} places available</span></div></div></section>}
      {role === 'attendee' && <nav className="cloud-category-tabs" aria-label="My event views">{attendeeViews.map((view) => { const count = categoryEvents.filter((event) => view === 'My RSVPs' ? Boolean(event.userResponse?.status) : view === 'Past events' ? eventHasPassed(event) : !eventHasPassed(event)).length; return <button key={view} className={attendeeView === view ? 'active' : ''} onClick={() => setAttendeeView(view)}>{view}<span>{count}</span></button> })}</nav>}
      <nav className="cloud-category-tabs" aria-label="Event categories">{categories.map((category) => { const count = category === 'All events' ? events.length : events.filter((event) => event.category === category).length; return <button key={category} className={selectedCategory === category ? 'active' : ''} onClick={() => setSelectedCategory(category)}>{category}<span>{count}</span></button> })}</nav>
      <div className="cloud-list-heading"><div><h2>{currentTitle}</h2><p>{selectedCategory === 'All events' ? 'Browse every gathering in your workspace.' : `Only ${selectedCategory.toLowerCase()} gatherings appear in this view.`}</p></div><label className="cloud-search"><Search size={15}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search this category" /></label><span>{visibleEvents.length} {visibleEvents.length === 1 ? 'event' : 'events'}</span></div>
      {loadingEvents ? <div className="cloud-empty">Loading events from Firestore…</div> : visibleEvents.length === 0 ? <div className="cloud-empty"><CalendarDays size={23}/><strong>{categoryEvents.length === 0 ? `No ${selectedCategory === 'All events' ? 'published' : selectedCategory.toLowerCase()} events yet` : 'No matching events'}</strong><span>{role === 'organizer' && selectedCategory === 'All events' ? 'Create your first event to get started.' : 'Try another category or check back for new gatherings.'}</span></div> : <div className="cloud-event-grid">{visibleEvents.map((event) => <CloudEventCard key={event.id} event={event} userId={user.uid} onSelect={() => setSelected(event)} />)}</div>}
    </main>
    {showCreate && <CloudCreateModal onClose={() => setShowCreate(false)} onCreate={async (input) => { try { await createCloudEvent({ ...user, displayName: profile.displayName }, input); setShowCreate(false); setNotice('Your event is published.') } catch (failure) { setError(cloudMessage(failure)) } }} />}
    {selected && <CloudEventModal event={events.find((entry) => entry.id === selected.id) || selected} user={user} isOrganizer={selected.createdBy === user.uid} inviteToken={new URLSearchParams(location.search).get('invite') || ''} onClose={() => setSelected(null)} onRespond={respond} onAnnounce={announce} onEdit={() => setEditing(events.find((entry) => entry.id === selected.id) || selected)} onCancel={cancelEvent}/>}
    {editing && <CloudCreateModal event={editing} onClose={() => setEditing(null)} onCreate={(input) => saveEvent(editing.id, input)}/>}
  </div>
}

function CloudEventCard({ event, userId, onSelect }) {
  const counts = event.counts || { going: 0, maybe: 0 }
  const mine = event.createdBy === userId ? null : event.userResponse?.status
  const left = Math.max(Number(event.capacity) - counts.going, 0)
  return <button className={`cloud-event-card ${event.status === 'CANCELLED' ? 'is-cancelled' : ''}`} onClick={onSelect}><div className="cloud-card-art"><span className="cloud-art-category">{event.category}</span><strong>{new Date(`${event.date}T12:00:00`).toLocaleDateString('en', { day: '2-digit' })}</strong><small>{new Date(`${event.date}T12:00:00`).toLocaleDateString('en', { month: 'short' }).toUpperCase()}</small><i className="cloud-art-ring ring-one"/><i className="cloud-art-ring ring-two"/>{event.status === 'CANCELLED' && <span className="cloud-cancelled-pill">CANCELLED</span>}</div><div className="cloud-card-body"><div className="cloud-card-title"><h3>{event.title}</h3>{mine && <span>{mine.toLowerCase().replace('_',' ')}</span>}</div><p><CalendarDays size={14}/>{prettyDate(event.date)} · {prettyTime(event.time)}</p><p><MapPin size={14}/>{event.venue}</p><div className="cloud-card-bottom"><span><Users size={14}/>{counts.going} going · {counts.maybe} maybe</span><small>{event.status === 'CANCELLED' ? 'Cancelled' : left ? `${left} spots left` : 'Full'}</small></div></div></button>
}

function CloudCreateModal({ onClose, onCreate, event = null }) {
  const [form, setForm] = useState(() => event ? {
    title: event.title || '', category: event.category || 'Community', date: event.date || '',
    time: event.time || '18:00', endTime: event.endTime || '20:00', venue: event.venue || '',
    description: event.description || '', capacity: event.capacity || 50, inviteOnly: event.inviteOnly || false,
    registrationDeadline: event.registrationDeadlineAt?.toDate?.().toISOString().slice(0, 10) || '',
  } : { title: '', category: 'Community', date: '', time: '18:00', endTime: '20:00', venue: '', description: '', capacity: 50, registrationDeadline: '', inviteOnly: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) { event.preventDefault(); if (!form.title.trim() || !form.date || !form.venue.trim()) {setError('Add an event name, date, and location.');return} if (form.date < new Date().toISOString().slice(0,10)) {setError('Choose a future date.');return} setBusy(true);setError('');await onCreate({...form,capacity:Number(form.capacity)});setBusy(false) }
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><div className="modal"><div className="modal-header"><div><div className="eyebrow"><span className="eyebrow-line"/>{event ? ' EDIT YOUR EVENT' : ' CREATE A CLOUD EVENT'}</div><h2>{event ? 'Update event details.' : 'Bring people together.'}</h2><p>{event ? 'Changes will appear for attendees right away.' : 'Your event will appear for attendees right away.'}</p></div><button className="icon-button" onClick={onClose} aria-label="Close">×</button></div><form onSubmit={submit}><label className="field-label">Event name<input autoFocus maxLength={80} value={form.title} onChange={(event) => setForm({...form,title:event.target.value})} placeholder="e.g. Friday evening supper club"/></label><div className="form-row"><label className="field-label">Category<select value={form.category} onChange={(event) => setForm({...form,category:event.target.value})}>{['Community','Technology','Networking','Workshop','Social','Other'].map((value) => <option key={value}>{value}</option>)}</select></label><label className="field-label">Capacity<input type="number" min="1" max="10000" value={form.capacity} onChange={(event) => setForm({...form,capacity:event.target.value})}/></label></div><div className="form-row"><label className="field-label">Date<input type="date" min={new Date().toISOString().slice(0,10)} value={form.date} onChange={(event) => setForm({...form,date:event.target.value})}/></label><label className="field-label">Location<input maxLength={160} value={form.venue} onChange={(event) => setForm({...form,venue:event.target.value})} placeholder="Venue or online link"/></label></div><div className="form-row"><label className="field-label">Starts<input type="time" value={form.time} onChange={(event) => setForm({...form,time:event.target.value})}/></label><label className="field-label">Ends<input type="time" value={form.endTime} onChange={(event) => setForm({...form,endTime:event.target.value})}/></label></div><label className="field-label">RSVP deadline <span className="optional">OPTIONAL</span><input type="date" value={form.registrationDeadline} onChange={(event) => setForm({...form,registrationDeadline:event.target.value})}/></label><label className="invite-only-option"><input type="checkbox" checked={form.inviteOnly} onChange={(event) => setForm({...form,inviteOnly:event.target.checked})}/> Require a guest invitation link to RSVP</label><label className="field-label">Description<textarea rows="3" maxLength={400} value={form.description} onChange={(event) => setForm({...form,description:event.target.value})} placeholder="What can guests look forward to?"/></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}><Plus size={15}/>{busy ? 'Saving…' : event ? 'Save changes' : 'Publish event'}</button></div></form></div></div>
}

function CloudEventModal({ event, user, isOrganizer, inviteToken, onClose, onRespond, onAnnounce, onEdit, onCancel }) {
  const [announcement, setAnnouncement] = useState('')
  const [announcements, setAnnouncements] = useState([])
  const [activity, setActivity] = useState([])
  const [invites, setInvites] = useState([])
  const [showInvite, setShowInvite] = useState(false)
  const [checkedIn, setCheckedIn] = useState(false)
  const [checkingIn, setCheckingIn] = useState(false)
  const [checkinError, setCheckinError] = useState('')
  const [inviteInfo, setInviteInfo] = useState(null)
  const [showAnnouncement, setShowAnnouncement] = useState(false)
  const [busy, setBusy] = useState(false)
  const counts = { going: 0, maybe: 0, notGoing: 0, waitlisted: 0, ...(event.counts || {}) }
  async function answer(status) { setBusy(true); await onRespond(event, status); setBusy(false) }
  const mine = isOrganizer ? null : event.userResponse?.status
  const spotsLeft = Math.max(Number(event.capacity) - counts.going, 0)
  const validInvite = !event.inviteOnly || Boolean(inviteInfo)
  useEffect(() => {
    let current = true
    setCheckedIn(false)
    if (isOrganizer || event.userResponse?.status !== 'GOING') return () => { current = false }
    getCloudCheckinStatus(event.id, user.uid).then((value) => { if (current) setCheckedIn(value) }).catch(() => {})
    return () => { current = false }
  }, [event.id, event.userResponse?.status, isOrganizer, user.uid])
  async function checkInSelf() {
    setCheckingIn(true); setCheckinError('')
    try { await checkInCloudAttendee(event.id, user.uid); setCheckedIn(true) }
    catch (failure) { setCheckinError(cloudMessage(failure)) }
    finally { setCheckingIn(false) }
  }
  useEffect(() => subscribeCloudAnnouncements(event.id, setAnnouncements, () => {}), [event.id])
  useEffect(() => isOrganizer ? subscribeCloudActivity(event.id, setActivity, () => {}) : undefined, [event.id, isOrganizer])
  useEffect(() => isOrganizer ? subscribeCloudInvites(event.id, setInvites, () => {}) : undefined, [event.id, isOrganizer])
  useEffect(() => {
    if (!event.inviteOnly || !inviteToken) { setInviteInfo(null); return undefined }
    let current = true
    getCloudInvite(event.id, inviteToken).then((invite) => { if (current) setInviteInfo(invite && invite.email === (user.email || '').toLowerCase() && (!invite.acceptedBy || invite.acceptedBy === user.uid) ? invite : null) }).catch(() => { if (current) setInviteInfo(null) })
    return () => { current = false }
  }, [event.id, event.inviteOnly, inviteToken, user.email, user.uid])
  return <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <aside className="event-drawer">
      <div className="drawer-art cloud-drawer-art">
        <div className="drawer-top"><span className="event-category">{event.category}</span><button className="drawer-close" onClick={onClose} aria-label="Close">×</button></div>
        <div className="drawer-title"><h2>{event.title}</h2><span>{event.organizer} hosts</span></div>
      </div>
      <div className="drawer-content">
        <div className="drawer-meta">
          <div><span className="drawer-meta-icon"><CalendarDays size={17}/></span><span><strong>{new Date(`${event.date}T12:00:00`).toLocaleDateString('en',{month:'long',day:'numeric',year:'numeric'})}</strong><small>{prettyTime(event.time)} – {prettyTime(event.endTime)}</small></span></div>
          <div><span className="drawer-meta-icon"><MapPin size={17}/></span><span><strong>{event.venue}</strong><small>Event location</small></span></div>
          <div><span className="drawer-meta-icon"><Users size={17}/></span><span><strong>{spotsLeft} places available</strong><small>{counts.going} of {event.capacity} places taken · {counts.waitlisted} waitlisted</small></span></div>
        </div>
        <div className="drawer-section"><div className="drawer-section-title"><h3>About this event</h3>{isOrganizer && <button className="quiet-icon" onClick={() => setShowAnnouncement(!showAnnouncement)} title="Post an update">✦</button>}</div><p>{event.description || 'The host has not added a description yet.'}</p></div>
        {announcements.length ? announcements.map((item) => <div className="announcement" key={item.id}><span><strong>{item.title || 'Host update'}</strong></span><p>{item.message}</p></div>) : event.announcement && <div className="announcement"><span><strong>Host update</strong></span><p>{event.announcement}</p></div>}
        {showAnnouncement && <form className="announcement-form" onSubmit={async (e) => {e.preventDefault(); if(announcement.trim()){setBusy(true);await onAnnounce(event.id,announcement.trim());setBusy(false);setAnnouncement('');setShowAnnouncement(false)}}}><label className="field-label">Share an update<textarea rows="3" maxLength={240} value={announcement} onChange={(e)=>setAnnouncement(e.target.value)} placeholder="Venue change, reminder, or note…"/></label><button type="submit" className="secondary-button" disabled={busy}>Publish update</button></form>}
        {isOrganizer && <div className="drawer-section"><h3>Guest responses</h3><div className="rsvp-stats cloud-rsvp-stats"><div><span className="rsvp-number">{counts.going}</span><span className="rsvp-kind">Going</span></div><div><span className="rsvp-number">{counts.maybe}</span><span className="rsvp-kind">Maybe</span></div><div><span className="rsvp-number">{counts.notGoing}</span><span className="rsvp-kind">Can’t go</span></div><div><span className="rsvp-number">{counts.waitlisted}</span><span className="rsvp-kind">Waitlist</span></div></div></div>}
        {isOrganizer && <div className="invite-metrics"><span>{invites.length} invited</span><span>{invites.filter((invite) => invite.status === 'ACCEPTED').length} responded</span><span>{invites.length ? Math.round(invites.filter((invite) => invite.status === 'ACCEPTED').length / invites.length * 100) : 0}% response rate</span><span>{invites.filter((invite) => invite.checkedInAt).length} checked in</span></div>}
        {isOrganizer ? <><CloudGrowthChart activity={activity}/><div className="host-note"><Users size={16}/><span><strong>You’re hosting this event.</strong><small>Guest responses will appear here as they come in.</small></span></div><div className="host-tools"><button className="secondary-button" onClick={onEdit}>Edit event</button><button className="secondary-button" onClick={() => setShowInvite(true)}>Invite guests</button>{event.status !== 'CANCELLED' && <button className="cancel-event-button" onClick={() => onCancel(event)}>Cancel event</button>}</div></> : event.status === 'CANCELLED' ? <div className="event-cancelled-note">This event has been cancelled by its host.</div> : !validInvite ? <div className="event-cancelled-note">This event needs a valid invitation link for RSVP.</div> : <div className="drawer-rsvp"><span className="drawer-rsvp-label">YOUR RESPONSE</span><p>{mine === 'WAITLISTED' ? `You’re #${event.userResponse?.waitlistPosition} on the waitlist.` : mine ? `You said ${mine.toLowerCase().replace('_',' ')}.` : spotsLeft ? 'Will we see you there?' : 'This event is full. Join the waitlist.'}</p><div className="rsvp-actions"><button disabled={busy || mine === 'WAITLISTED'} className={`rsvp-action going ${mine === 'GOING'?'chosen':''}`} onClick={()=>answer(mine==='GOING'?null:'GOING')}>{mine==='GOING'?<Check size={15}/>:null}{mine === 'WAITLISTED' ? 'On waitlist' : spotsLeft ? 'Going' : 'Join waitlist'}</button><button disabled={busy} className={`rsvp-action maybe ${mine==='MAYBE'?'chosen':''}`} onClick={()=>answer(mine==='MAYBE'?null:'MAYBE')}>{mine==='MAYBE'?<Check size={15}/>:null}Maybe</button></div><button className="cant-go" disabled={busy} onClick={()=>answer(mine==='NOT_GOING'||mine==='WAITLISTED'?null:'NOT_GOING')}>{mine==='NOT_GOING'?'Remove your response':mine==='WAITLISTED'?'Leave the waitlist':'Can’t make it? Let the host know'}</button>{mine === 'GOING' && <div className="attendee-checkin">{checkedIn ? <p className="checkin-success">You’re checked in for this event.</p> : <button className="secondary-button" disabled={checkingIn} onClick={checkInSelf}>{checkingIn ? 'Checking in…' : 'Check in to this event'}</button>}{checkinError && <p className="form-error">{checkinError}</p>}</div>}</div>}
      </div>
    </aside>
    {showInvite && <CloudInviteModal event={event} onClose={() => setShowInvite(false)}/>}
  </div>
}

function CloudGrowthChart({ activity }) {
  let going = 0
  const values = activity.map((change) => {
    going += Number(change.isGoing) - Number(change.previousGoing)
    return Math.max(going, 0)
  })
  const max = Math.max(...values, 1)
  const points = values.map((value, index) => `${values.length < 2 ? 8 : 8 + index * 284 / (values.length - 1)},${68 - value / max * 56}`).join(' ')
  return <div className="cloud-growth"><div className="cloud-growth-heading"><strong>RSVP growth</strong><small>{activity.length} response changes</small></div>{values.length ? <svg viewBox="0 0 300 78" role="img" aria-label="Going responses over time"><polyline points={points} fill="none" stroke="#7863d2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><text x="8" y="77">start</text><text x="267" y="77">now</text></svg> : <p>Response activity will appear here as guests reply.</p>}</div>
}

function CloudInviteModal({ event, onClose }) {
  const [csv, setCsv] = useState('')
  const [created, setCreated] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function importFile(file) {
    if (file) setCsv(await file.text())
  }
  async function makeInvites(e) {
    e.preventDefault(); setError('')
    const invitees = csv.split(/\r?\n/).map((line) => line.split(',').map((part) => part.trim().replace(/^"|"$/g, ''))).filter((parts) => parts.some(Boolean)).filter((parts) => !/^name$/i.test(parts[0]) && !/^email$/i.test(parts[0])).map((parts) => parts.length > 1 ? { name: parts[0], email: parts[1] } : { name: '', email: parts[0] }).filter((invitee) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitee.email))
    if (!invitees.length) { setError('Add at least one valid email. Use one email per line or Name,email CSV rows.'); return }
    if (invitees.length > 400) { setError('Create at most 400 invitations at a time.'); return }
    setBusy(true)
    try {
      const links = await createCloudInvites(event.id, invitees)
      const withQr = await Promise.all(links.map(async (invite) => ({ ...invite, qr: await QRCode.toDataURL(invite.url, { width: 180, margin: 1 }) })))
      setCreated(withQr); setCsv('')
    } catch (failure) { setError(cloudMessage(failure)) }
    finally { setBusy(false) }
  }
  return <div className="modal-backdrop invite-modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="modal cloud-invite-modal"><div className="modal-header"><div><div className="eyebrow"><span className="eyebrow-line"/> INVITE YOUR GUESTS</div><h2>Share a personal RSVP link.</h2><p>{event.inviteOnly ? 'Only invited accounts can RSVP to this event.' : 'Each guest gets a unique link and QR code.'}</p></div><button className="icon-button" onClick={onClose} aria-label="Close">×</button></div>{!created.length ? <form onSubmit={makeInvites}><label className="field-label">Choose a guest list CSV file (optional)<input type="file" accept=".csv,text/csv" onChange={(e) => importFile(e.target.files?.[0])}/><small className="invite-hint">CSV means a spreadsheet saved as a .csv file. It should have name,email columns, for example: Komal,komal@example.com. Or skip the file and paste guest names and emails below.</small></label><label className="field-label">Guest list<textarea rows="6" value={csv} onChange={(e) => setCsv(e.target.value)} placeholder={'name,email\nAsha,asha@example.com\nNoah,noah@example.com'}/><small className="invite-hint">You can also enter one email per line.</small></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Close</button><button className="primary-button" disabled={busy}><Plus size={15}/>{busy ? 'Making links…' : 'Create invite links'}</button></div></form> : <><div className="invite-results">{created.map((invite) => <div className="invite-result" key={invite.token}><img src={invite.qr} alt={`QR invitation for ${invite.email}`}/><div><strong>{invite.name || invite.email}</strong><small>{invite.email}</small><input readOnly value={invite.url}/><div><button className="secondary-button" onClick={async () => {try {await navigator.clipboard.writeText(invite.url)} catch {setError('Copy is unavailable here; select the link to copy it.')}}}>Copy link</button><a className="secondary-button" href={invite.qr} download={`gather-invite-${invite.email}.png`}>Download QR</a></div></div></div>)}</div>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button className="secondary-button" onClick={onClose}>Done</button><button className="primary-button" onClick={() => setCreated([])}>Invite more guests</button></div></>}</div></div>
}

function authMessage(error) {
  if (error.code === 'auth/email-already-in-use') return 'That email already has an account. Sign in instead.'
  if (error.code === 'auth/invalid-credential') return 'Email or password is incorrect.'
  if (error.code === 'auth/weak-password') return 'Choose a stronger password with at least six characters.'
  return cloudMessage(error)
}
function cloudMessage(error) {
  if (error.code === 'permission-denied') return 'Firebase denied this action. Check Firestore Rules and the selected account role.'
  if (error.code === 'unavailable') return 'Firebase is temporarily unavailable. Check your connection and try again.'
  return error.message || 'Something went wrong. Please try again.'
}
