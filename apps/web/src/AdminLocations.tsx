import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, MapPin } from 'lucide-react';
import type { ServiceView } from '@ramlax/shared';
import { api } from './api';

type City = { _id: string; name: string; slug: string; areas: string[]; services: string[]; active: boolean };
function Nav() { return <nav className="admin-nav"><Link to="/admin">Bookings</Link><Link to="/admin/services">Services and pricing</Link><Link to="/admin/locations">Locations</Link><Link to="/admin/technicians">Technicians</Link><Link to="/admin/settings">Business settings</Link><Link to="/admin/reviews">Reviews</Link><Link to="/admin/reports">Reports</Link></nav>; }

export default function AdminLocations() {
  const query = useQuery<City[]>({ queryKey: ['adminCities'], queryFn: async () => (await api.get('/admin/cities')).data.data, retry: false });
  const servicesQuery = useQuery<ServiceView[]>({ queryKey: ['adminLocationServices'], queryFn: async () => (await api.get('/admin/services')).data.data, retry: false });
  const [name, setName] = useState(''); const [slug, setSlug] = useState(''); const [areas, setAreas] = useState(''); const [services, setServices] = useState<string[]>([]); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setNotice('');
    try {
      await api.post('/admin/cities', { name, slug, areas: areas.split('\n').map(value => value.trim()).filter(Boolean), services, active: true });
      setName(''); setSlug(''); setAreas(''); setServices([]); setNotice('Location added.'); await query.refetch();
    } catch (error) { setNotice((error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Could not add this location.'); }
    finally { setBusy(false); }
  }
  if (query.isError || servicesQuery.isError) { const status = (query.error as { response?: { status?: number } } | null)?.response?.status || (servicesQuery.error as { response?: { status?: number } } | null)?.response?.status; return <section className="page-section"><Nav/><div className="login-card"><h2>{status === 403 ? 'Owner or administrator access required.' : 'Administrator sign in required.'}</h2><Link className="button" to="/admin/login">Sign in</Link></div></section>; }
  return <section className="page-section"><div className="page-title"><span className="eyebrow">RAMLAKSH ADMIN</span><h1>Service locations.</h1><p>Configure the cities and areas customers can select. A location is bookable only when its service coverage is configured too.</p></div><Nav/>
    {query.isLoading ? <p className="loading">Loading locations…</p> : <div className="location-admin-grid"><div className="location-admin-list"><h2>Configured cities</h2>{query.data?.length ? query.data.map(city => <article className="location-admin-card" key={city._id}><div><MapPin size={17}/><strong>{city.name}</strong><span>{city.active ? 'Active' : 'Inactive'}</span></div><p>{city.areas.length ? city.areas.join(', ') : 'City-wide coverage'}</p><small>Services: {city.services.map(slug => servicesQuery.data?.find(service => service.slug === slug)?.name || slug).join(', ') || 'None configured'}</small></article>) : <div className="empty-state"><h3>No service locations yet</h3><p>Add a city and select the configured services that are available there.</p></div>}</div>
      <form className="contact-card" onSubmit={submit}><h2>Add a location</h2><label className="field"><span>City name *</span><input required minLength={2} maxLength={100} value={name} onChange={event => { const next = event.target.value; setName(next); setSlug(next.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')); }} /></label><label className="field"><span>URL slug *</span><input required pattern="[a-z0-9-]+" value={slug} onChange={event => setSlug(event.target.value)} /></label><label className="field"><span>Areas (one per line)</span><textarea rows={5} value={areas} onChange={event => setAreas(event.target.value)} /><small>Leave empty for city-wide coverage.</small></label><fieldset className="service-checks"><legend>Services available in this city *</legend>{(servicesQuery.data || []).filter(service => service.active).map(service => <label className="check-field" key={service.slug}><input type="checkbox" checked={services.includes(service.slug)} onChange={event => setServices(current => event.target.checked ? [...current, service.slug] : current.filter(slugValue => slugValue !== service.slug))}/><span>{service.name}</span></label>)}</fieldset><button className="button" disabled={busy || !services.length}>{busy ? 'Saving…' : 'Add location'} <ArrowRight size={17}/></button>{notice && <p role="status" className="admin-notice">{notice}</p>}</form>
    </div>}
  </section>;
}
