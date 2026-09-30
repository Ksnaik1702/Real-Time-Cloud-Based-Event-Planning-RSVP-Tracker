import { useEffect, useMemo, useState } from 'react'
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check,
  ChevronDown, CircleHelp, Clock3, Cloud, Compass, Download, Ellipsis, Filter,
  LayoutDashboard, LogOut, MapPin, Menu, Plus, Search, Settings2, Sparkles,
  TicketCheck, Users, X,
} from 'lucide-react'
import { addAnnouncement, counts, createEvent, resetDemo, setRsvp, subscribeEvents } from './data'
import { cloudEnabled } from './firebase'
import CloudApp from './CloudApp'

const demoUser = { id: 'demo', name: 'Alex Morgan', initials: 'AM', email: 'alex@example.com' }
const nav = [
  { label: 'Overview', icon: LayoutDashboard },
  { label: 'Discover events', icon: Compass },
  { label: 'My schedule', icon: CalendarDays },
]
const prettyDate = (date) => new Date(`${date}T12:00:00`).toLocaleDateString('en', { month: 'short', day: 'numeric' })
const todayLabel = new Date().toLocaleDateString('en', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()
const prettyTime = (time) => new Date(`2020-01-01T${time}`).toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' })

function DemoApp() {
  const [events, setEvents] = useState([])
  const [section, setSection] = useState('Overview')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All events')
  const [modal, setModal] = useState(false)
  const [selected, setSelected] = useState(null)
  const [toast, setToast] = useState('')
  const [mobileNav, setMobileNav] = useState(false)

  useEffect(() => subscribeEvents(setEvents), [])
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3000); return () => clearTimeout(timer) }, [toast])

  const upcoming = useMemo(() => [...events].filter((event) => event.status === 'PUBLISHED').sort((a, b) => a.date.localeCompare(b.date)), [events])
  const mine = upcoming.filter((event) => ['GOING', 'MAYBE'].includes(event.rsvps?.[demoUser.id]))
  const filtered = upcoming.filter((event) => {
    const matchesText = `${event.title} ${event.category} ${event.venue}`.toLowerCase().includes(query.toLowerCase())
    return matchesText && (category === 'All events' || event.category === category)
  })
  const stats = useMemo(() => events.reduce((all, event) => {
    const total = counts(event)
    all.going += total.going; all.maybe += total.maybe; all.responses += total.total
    return all
  }, { going: 0, maybe: 0, responses: 0 }), [events])

  function respond(event, status) {
    const result = setRsvp(event.id, demoUser.id, status)
    setToast(result.message)
    setSelected((current) => current?.id === event.id ? { ...current, rsvps: { ...current.rsvps, [demoUser.id]: status } } : current)
  }

  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
      <div className="brand"><span className="brand-mark"><CalendarDays size={19} strokeWidth={2.4} /></span><span>gather<span className="brand-period">.</span></span></div>
      <div className="workspace-switch"><span className="workspace-avatar">P</span><span className="workspace-copy"><strong>Personal workspace</strong><small>Free plan</small></span><ChevronDown size={15} /></div>
      <div className="side-label">WORKSPACE</div>
      <nav className="main-nav">{nav.map(({ label, icon: Icon }) => <button key={label} className={`nav-item ${section === label ? 'active' : ''}`} onClick={() => { setSection(label); setMobileNav(false) }}><Icon size={18} /><span>{label}</span>{label === 'My schedule' && mine.length > 0 && <span className="nav-count">{mine.length}</span>}</button>)}</nav>
      <div className="side-label events-label">YOUR EVENTS <button aria-label="Create event" onClick={() => setModal(true)}><Plus size={15} /></button></div>
      <button className="nav-item" onClick={() => { setSection('Overview'); setMobileNav(false) }}><span className="event-dot dot-violet"/><span>All events</span></button>
      {events.slice(0, 3).map((event) => <button key={event.id} className="nav-item event-nav" onClick={() => setSelected(event)}><span className={`event-dot dot-${event.color}`} /><span className="truncate">{event.title}</span></button>)}
      <div className="sidebar-spacer" />
      <div className="side-callout"><div className="callout-icon"><Sparkles size={17} /></div><strong>Make it a great one.</strong><p>Good events start with a thoughtful invite.</p><button onClick={() => setModal(true)}>Create an event <ArrowRight size={14} /></button></div>
      <button className="nav-item help-link"><CircleHelp size={17} /><span>Help & feedback</span></button>
      <div className="profile"><div className="profile-avatar">{demoUser.initials}</div><div className="profile-copy"><strong>{demoUser.name}</strong><small>Organizer</small></div><button className="icon-button profile-more" aria-label="Profile options" onClick={() => setToast('Demo account · alex@example.com')}><Ellipsis size={19} /></button></div>
    </aside>

    <main className="main-area">
      <header className="topbar"><button className="mobile-menu icon-button" onClick={() => setMobileNav(!mobileNav)} aria-label="Open menu"><Menu size={20} /></button><div className="breadcrumb"><span>Workspace</span><span className="crumb-slash">/</span><strong>{section}</strong></div><div className="topbar-actions"><span className={`connection ${cloudEnabled ? 'cloud' : ''}`}><span />{cloudEnabled ? 'Firebase configured · demo data' : 'Local live demo'}</span><button className="icon-button notification-button" aria-label="Notifications" onClick={() => setToast('You’re all caught up!')}><Bell size={18} /><i /></button><div className="top-avatar">{demoUser.initials}</div></div></header>
      <div className="content">
        {section === 'Overview' && <Overview events={upcoming} stats={stats} onCreate={() => setModal(true)} onSelect={setSelected} onDiscover={() => setSection('Discover events')} />}
        {section === 'Discover events' && <EventListing title="Discover events" subtitle="Find your next good thing." events={filtered} query={query} setQuery={setQuery} category={category} setCategory={setCategory} onSelect={setSelected} />}
        {section === 'My schedule' && <EventListing title="My schedule" subtitle="Everything you’ve said yes or maybe to." events={mine} query={query} setQuery={setQuery} category="All events" setCategory={setCategory} onSelect={setSelected} scheduled />}
      </div>
      <footer className="app-footer"><span>© 2026 Gather</span><span className="footer-links"><button onClick={() => setToast('Your data stays in this browser in demo mode.')}>Privacy</button><button onClick={() => setToast('Gather event planning · demo workspace')}>About</button><span className="footer-status"><span /> All systems normal</span></span></footer>
    </main>
    {mobileNav && <button className="scrim" aria-label="Close menu" onClick={() => setMobileNav(false)} />}
    {modal && <CreateModal onClose={() => setModal(false)} onCreate={(input) => { createEvent(input); setModal(false); setToast('Your event is live in this demo.') }} />}
    {selected && <EventDrawer event={events.find((e) => e.id === selected.id) || selected} onClose={() => setSelected(null)} onRespond={respond} onAnnounce={(eventId, text) => { addAnnouncement(eventId, text); setToast('Announcement published for your guests.') }} />}
    {toast && <div className="toast"><span className="toast-check"><Check size={14} /></span>{toast}<button aria-label="Dismiss" onClick={() => setToast('')}><X size={15} /></button></div>}
  </div>
}

function Overview({ events, stats, onCreate, onSelect, onDiscover }) {
  const responseRate = stats.responses ? Math.round(stats.going / stats.responses * 100) : 0
  return <>
    <div className="welcome-row"><div><div className="eyebrow"><span className="eyebrow-line" /> {todayLabel}</div><h1>A good day to <span>get together.</span></h1><p className="page-subtitle">Here’s what’s happening in your workspace.</p></div><button className="primary-button" onClick={onCreate}><Plus size={17} /> Create event</button></div>
    <div className="hero-banner"><div className="hero-text"><div className="hero-kicker"><Sparkles size={14} /> YOUR WORKSPACE, IN SYNC</div><h2>Bring people together.<br /><span>We’ll keep things in order.</span></h2><p>One calm place to plan, invite, and see who’s coming.</p><button className="hero-button" onClick={onDiscover}>Explore events <ArrowRight size={15} /></button></div><div className="hero-visual"><div className="hero-circle circle-one"/><div className="hero-circle circle-two"/><div className="hero-card"><div className="hero-card-top"><span>RSVP snapshot</span><span className="live-pill"><i /> LIVE</span></div><div className="hero-card-number">{stats.going}<small> going</small></div><div className="hero-card-bar"><i style={{ width: `${Math.min(100, stats.going / Math.max(stats.going + stats.maybe, 1) * 100)}%` }} /></div><div className="hero-card-bottom"><span><b className="legend-going"/> Going</span><span><b className="legend-maybe"/> Maybe</span><span>{stats.maybe} maybe</span></div></div><div className="floating-avatar float-a">JM</div><div className="floating-avatar float-b">SK</div><div className="floating-avatar float-c">+{Math.max(stats.going - 2, 0)}</div></div><div className="hero-sparkle sparkle-a">✳</div><div className="hero-sparkle sparkle-b">✦</div></div>
    <div className="section-heading stats-heading"><div><h2>Your workspace at a glance</h2><p>A little momentum goes a long way.</p></div><button className="text-button" onClick={onDiscover}>View analytics <ArrowRight size={15} /></button></div>
    <div className="stats-grid">
      <StatCard label="Upcoming events" value={events.length} change="Ready to welcome guests" icon={CalendarDays} tone="violet" trend="up" />
      <StatCard label="Going" value={stats.going} change="Across all your events" icon={Users} tone="blue" trend="up" />
      <StatCard label="Maybe" value={stats.maybe} change="Still deciding" icon={Activity} tone="orange" trend="flat" />
      <StatCard label="Going share" value={`${responseRate}%`} change="Of all recorded responses" icon={TicketCheck} tone="green" trend="up" />
    </div>
    <div className="section-heading upcoming-heading"><div><div className="title-with-dot"><span className="section-live-dot"/><h2>Coming up</h2></div><p>Your next moments, all in one place.</p></div><button className="text-button" onClick={onDiscover}>See all events <ArrowRight size={15} /></button></div>
    <div className="event-grid">{events.slice(0, 3).map((event) => <EventCard key={event.id} event={event} onClick={() => onSelect(event)} />)}{events.length === 0 && <EmptyState onCreate={onCreate} />}</div>
  </>
}

function StatCard({ label, value, change, icon: Icon, tone, trend }) {
  return <div className="stat-card"><div className="stat-card-top"><span>{label}</span><span className={`stat-icon stat-${tone}`}><Icon size={17} /></span></div><div className="stat-value">{value}</div><div className="stat-change">{trend === 'up' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{change}</div></div>
}

function EventListing({ title, subtitle, events, query, setQuery, category, setCategory, onSelect, scheduled }) {
  const categories = ['All events', 'Community', 'Technology', 'Networking', 'Workshop', 'Social', 'Other']
  return <><div className="listing-title"><div><div className="eyebrow"><span className="eyebrow-line" /> THE GOOD STUFF</div><h1>{title}</h1><p className="page-subtitle">{subtitle}</p></div><span className="listing-total">{events.length} {events.length === 1 ? 'event' : 'events'}</span></div><div className="filter-row"><label className="search-box"><Search size={17} /><input placeholder="Search events, places…" value={query} onChange={(e) => setQuery(e.target.value)} /></label><div className="category-pills">{categories.map((item) => <button className={category === item ? 'selected' : ''} key={item} onClick={() => setCategory(item)}>{item}</button>)}</div><button className="filter-button" onClick={() => setCategory('All events')}><Filter size={16} /> Filters</button></div><div className="listing-grid">{events.map((event) => <EventCard key={event.id} event={event} onClick={() => onSelect(event)} scheduled={scheduled} />)}{events.length === 0 && <div className="empty-list"><div className="empty-icon"><Search size={22} /></div><h3>No events found</h3><p>Try a different search or check back for new events.</p></div>}</div></>
}

function EventCard({ event, onClick, scheduled }) {
  const total = counts(event)
  const mine = event.rsvps?.[demoUser.id]
  return <button className="event-card" onClick={onClick}><div className={`event-art art-${event.color}`}><div className="art-noise"/><div className="art-date"><strong>{new Date(`${event.date}T12:00:00`).toLocaleDateString('en', { day: '2-digit' })}</strong><span>{new Date(`${event.date}T12:00:00`).toLocaleDateString('en', { month: 'short' }).toUpperCase()}</span></div><div className="art-decoration"><span/><span/><span/></div><span className="event-category">{event.category}</span><span className="art-arrow"><ArrowUpRight size={17}/></span></div><div className="event-info"><div className="event-heading"><h3>{event.title}</h3>{scheduled && mine && <span className={`rsvp-badge ${mine.toLowerCase()}`}>{mine === 'GOING' ? 'Going' : 'Maybe'}</span>}</div><div className="event-meta"><span><CalendarDays size={14}/>{prettyDate(event.date)} · {prettyTime(event.time)}</span><span><MapPin size={14}/>{event.venue}</span></div><div className="event-card-footer"><div className="attendee-stack"><span className="tiny-avatar tiny-one">{event.organizer.slice(0,1)}</span><span className="tiny-avatar tiny-two">{demoUser.initials}</span><span className="tiny-avatar tiny-more">+{Math.max(total.going - 1, 0)}</span><span className="attendee-count">{total.going} going</span></div><span className="capacity-label">{Math.max(Number(event.capacity) - total.going, 0)} spots left</span></div></div></button>
}

function EmptyState({ onCreate }) { return <div className="empty-card"><div className="empty-icon"><CalendarDays size={22}/></div><h3>Your calendar has room for something good.</h3><p>Create your first event and start bringing people together.</p><button className="secondary-button" onClick={onCreate}><Plus size={15}/> Create an event</button></div> }

function CreateModal({ onClose, onCreate }) {
  const [form, setForm] = useState({ title: '', category: 'Community', date: '', time: '18:00', endTime: '20:00', venue: '', description: '', capacity: 50 })
  const [error, setError] = useState('')
  function submit(e) { e.preventDefault(); if (!form.title.trim() || !form.date || !form.venue.trim()) { setError('Add an event name, date, and location to continue.'); return } if (form.date < new Date().toISOString().slice(0, 10)) { setError('Choose a date in the future.'); return } if (Number(form.capacity) < 1) { setError('Capacity must be at least one person.'); return } onCreate({ ...form, capacity: Number(form.capacity) }) }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><div className="modal"><div className="modal-header"><div><div className="eyebrow"><span className="eyebrow-line"/> LET’S MAKE A PLAN</div><h2>Create an event</h2><p>Set the scene. You can share it with guests next.</p></div><button className="icon-button" onClick={onClose} aria-label="Close"><X size={19}/></button></div><form onSubmit={submit}><label className="field-label">Event name<input autoFocus maxLength={80} placeholder="e.g. Friday evening supper club" value={form.title} onChange={(e) => setForm({...form, title: e.target.value})}/></label><div className="form-row"><label className="field-label">Category<select value={form.category} onChange={(e) => setForm({...form, category: e.target.value})}>{['Community','Technology','Networking','Workshop','Social','Other'].map((x) => <option key={x}>{x}</option>)}</select></label><label className="field-label">Guest capacity<input type="number" min="1" max="10000" value={form.capacity} onChange={(e) => setForm({...form, capacity: e.target.value})}/></label></div><div className="form-row"><label className="field-label">Date<input type="date" min={new Date().toISOString().slice(0,10)} value={form.date} onChange={(e) => setForm({...form, date: e.target.value})}/></label><label className="field-label">Venue or meeting link<input placeholder="Where should guests go?" value={form.venue} onChange={(e) => setForm({...form, venue: e.target.value})}/></label></div><div className="form-row"><label className="field-label">Starts at<input type="time" value={form.time} onChange={(e) => setForm({...form, time: e.target.value})}/></label><label className="field-label">Ends at<input type="time" value={form.endTime} onChange={(e) => setForm({...form, endTime: e.target.value})}/></label></div><label className="field-label">A little more about it <span className="optional">OPTIONAL</span><textarea rows="3" maxLength="400" placeholder="What can guests look forward to?" value={form.description} onChange={(e) => setForm({...form, description: e.target.value})}/></label>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit"><Plus size={16}/> Publish event</button></div></form></div></div>
}

function EventDrawer({ event, onClose, onRespond, onAnnounce }) {
  const [announcement, setAnnouncement] = useState('')
  const [showAnnouncement, setShowAnnouncement] = useState(false)
  const total = counts(event)
  const mine = event.rsvps?.[demoUser.id]
  const left = Math.max(Number(event.capacity) - total.going, 0)
  return <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><aside className="event-drawer"><div className={`drawer-art art-${event.color}`}><div className="art-noise"/><div className="drawer-top"><span className="event-category">{event.category}</span><button className="drawer-close" onClick={onClose} aria-label="Close"><X size={19}/></button></div><div className="drawer-title"><h2>{event.title}</h2><span>{event.organizer} hosts</span></div></div><div className="drawer-content"><div className="drawer-meta"><div><span className="drawer-meta-icon"><CalendarDays size={17}/></span><span><strong>{new Date(`${event.date}T12:00:00`).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })}</strong><small>{prettyTime(event.time)} – {prettyTime(event.endTime)}</small></span></div><div><span className="drawer-meta-icon"><MapPin size={17}/></span><span><strong>{event.venue}</strong><small>Event location</small></span></div><div><span className="drawer-meta-icon"><Users size={17}/></span><span><strong>{left ? `${left} places available` : 'Event is full'}</strong><small>{total.going} of {event.capacity} places taken</small></span></div></div><div className="drawer-section"><div className="drawer-section-title"><h3>About this event</h3><button className="quiet-icon" onClick={() => setShowAnnouncement(!showAnnouncement)} title="Post an announcement"><Bell size={16}/></button></div><p>{event.description || 'The host hasn’t added a description yet. Check back soon for more details.'}</p></div>{event.announcement && <div className="announcement"><span><Bell size={14}/><strong>Host update</strong></span><p>{event.announcement}</p></div>}{showAnnouncement && <form className="announcement-form" onSubmit={(e) => {e.preventDefault(); if (announcement.trim()) {onAnnounce(event.id, announcement.trim()); setAnnouncement(''); setShowAnnouncement(false)}}}><label className="field-label">Share an update with guests<textarea rows="3" maxLength="240" value={announcement} onChange={(e) => setAnnouncement(e.target.value)} placeholder="Venue change, reminder, or note…" /></label><button className="secondary-button" type="submit">Publish update</button></form>}<div className="drawer-section"><h3>Going so far</h3><div className="rsvp-stats"><div><span className="rsvp-number">{total.going}</span><span className="rsvp-kind"><i className="legend-going"/>Going</span></div><div><span className="rsvp-number">{total.maybe}</span><span className="rsvp-kind"><i className="legend-maybe"/>Maybe</span></div><div><span className="rsvp-number">{total.notGoing}</span><span className="rsvp-kind"><i className="legend-no"/>Can’t go</span></div></div></div><div className="drawer-rsvp"><div><span className="drawer-rsvp-label">YOUR RESPONSE</span><p>{mine ? `You said ${mine === 'GOING' ? 'you’re going' : mine === 'MAYBE' ? 'maybe' : 'you can’t make it'}.` : 'Will we see you there?'}</p></div><div className="rsvp-actions"><button className={`rsvp-action going ${mine === 'GOING' ? 'chosen' : ''}`} onClick={() => onRespond(event, mine === 'GOING' ? null : 'GOING')}>{mine === 'GOING' ? <Check size={15}/> : <TicketCheck size={15}/>} Going</button><button className={`rsvp-action maybe ${mine === 'MAYBE' ? 'chosen' : ''}`} onClick={() => onRespond(event, mine === 'MAYBE' ? null : 'MAYBE')}>{mine === 'MAYBE' ? <Check size={15}/> : null} Maybe</button></div><button className="cant-go" onClick={() => onRespond(event, mine === 'NOT_GOING' ? null : 'NOT_GOING')}>{mine === 'NOT_GOING' ? 'Remove your “can’t go” response' : 'Can’t make it? Let the host know'}</button></div></div></aside></div>
}

export default function App() {
  return cloudEnabled ? <CloudApp /> : <DemoApp />
}
