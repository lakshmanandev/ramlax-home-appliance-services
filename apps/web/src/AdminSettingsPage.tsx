import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { api } from './api';

type Settings = { phone: string; whatsappPhone: string; email: string; address: string; appointmentWindows: string[]; bookingLeadDays: number; maxAdvanceDays: number };
function AdminNav() { return <nav className="admin-nav"><Link to="/admin">Bookings</Link><Link to="/admin/services">Services and pricing</Link><Link to="/admin/locations">Locations</Link><Link to="/admin/technicians">Technicians</Link><Link to="/admin/settings">Business settings</Link><Link to="/admin/reviews">Reviews</Link><Link to="/admin/reports">Reports</Link></nav>; }

export default function AdminSettingsPage() {
  const query = useQuery<Settings>({ queryKey: ['businessSettings'], queryFn: async () => { await api.get('/admin/services'); return (await api.get('/settings')).data.data; }, retry: false });
  const [form, setForm] = useState<Settings | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => { if (query.data) setForm(query.data); }, [query.data]);
  const save = useMutation({
    mutationFn: async (payload: Settings) => api.put('/settings', payload),
    onSuccess: async () => { setNotice('Business settings saved.'); await query.refetch(); },
    onError: () => setNotice('Could not save settings. Check your access and try again.'),
  });
  const change = <K extends keyof Settings>(key: K, value: Settings[K]) => setForm(current => current ? { ...current, [key]: value } : current);
  const submit = (event: FormEvent) => { event.preventDefault(); if (form) save.mutate(form); };

  return <section className="page-section"><div className="page-title"><span className="eyebrow">RAMLAKSH ADMIN</span><h1>Business settings.</h1><p>Manage the contact details and appointment rules customers see when requesting service.</p></div><AdminNav/>
    {query.isLoading ? <p className="loading">Loading settings…</p> : query.isError ? <div className="login-card"><h2>Could not load business settings.</h2><p>Sign in with an owner or administrator account, then try again.</p><Link className="button" to="/admin/login">Administrator sign in</Link></div> : form && <form className="contact-card settings-form" onSubmit={submit}>
      <h2>Contact details</h2>
      <label className="field"><span>Phone</span><input type="tel" value={form.phone} onChange={event => change('phone', event.target.value)} /></label>
      <label className="field"><span>WhatsApp phone</span><input type="tel" value={form.whatsappPhone} onChange={event => change('whatsappPhone', event.target.value)} /></label>
      <label className="field"><span>Email</span><input type="email" value={form.email} onChange={event => change('email', event.target.value)} /></label>
      <label className="field"><span>Business address</span><textarea rows={3} value={form.address} onChange={event => change('address', event.target.value)} /></label>
      <h2>Booking availability</h2>
      <label className="field"><span>Appointment windows (one per line)</span><textarea rows={4} value={form.appointmentWindows.join('\n')} onChange={event => change('appointmentWindows', event.target.value.split('\n').map(value => value.trim()).filter(Boolean))} /><small>These options appear in the booking form. Leave this empty to pause online booking.</small></label>
      <div className="form-grid"><label className="field"><span>Booking lead time (days)</span><input type="number" min={0} max={60} value={form.bookingLeadDays} onChange={event => change('bookingLeadDays', Number(event.target.value))} /></label><label className="field"><span>Maximum advance booking (days)</span><input type="number" min={1} max={365} value={form.maxAdvanceDays} onChange={event => change('maxAdvanceDays', Number(event.target.value))} /></label></div>
      {notice && <p role="status" className="admin-notice">{notice}</p>}<button className="button" disabled={save.isPending}><Save size={16}/>{save.isPending ? 'Saving…' : 'Save settings'}</button>
    </form>}
  </section>;
}
