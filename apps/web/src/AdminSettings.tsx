/* Replaced by AdminSettingsPage, which uses the persisted API schema.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Building2, Save } from 'lucide-react';
import { api } from './api';

type Settings = { phone: string; whatsappPhone: string; email: string; address: string; appointmentWindows: string[]; bookingLeadDays: number; maxAdvanceDays: number };

export default function AdminSettings() {
  const settingsQuery = useQuery({
    queryKey: ['businessSettings'],
    queryFn: async () => {
      const response = await api.get('/settings');
      return response.data.data as Settings;
    },
    retry: false,
  });

  const [form, setForm] = useState<Settings | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => { if (settingsQuery.data) setForm(settingsQuery.data); }, [settingsQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async (payload: Settings) => {
      await api.put('/settings', payload);
    },
    onSuccess: async () => { setNotice('Business settings saved.'); await settingsQuery.refetch(); },
    onError: () => setNotice('Could not save settings. Check your access and try again.'),
  });

  const onChange = <K extends keyof Settings>(key: K, value: Settings[K]) => setForm(current => current ? { ...current, [key]: value } : current);

  return <section className="page-section"><div className="page-title"><span className="eyebrow">RAMLAX ADMIN</span><h1>Business settings.</h1><p>Manage your branch identity and service policies for the RamLax customer experience.</p></div><nav className="admin-nav"><Link to="/admin">Bookings</Link><Link to="/admin/services">Services and pricing</Link><Link to="/admin/locations">Locations</Link><Link to="/admin/technicians">Technicians</Link><Link to="/admin/settings">Business settings</Link></nav>
    {settingsQuery.isLoading ? <p className="loading">Loading settings…</p> : <div className="settings-grid"><div className="panel-card"><div className="panel-header"><Building2 size={16}/> <h3>Brand profile</h3></div><label className="field"><span>Business name</span><input value={form.businessName} onChange={event => onChange('businessName', event.target.value)} /></label><label className="field"><span>Support phone</span><input value={form.contactPhone} onChange={event => onChange('contactPhone', event.target.value)} /></label><label className="field"><span>Support email</span><input type="email" value={form.contactEmail} onChange={event => onChange('contactEmail', event.target.value)} /></label><label className="field"><span>Support hours</span><input value={form.supportHours} onChange={event => onChange('supportHours', event.target.value)} /></label><label className="field"><span>Service radius (km)</span><input type="number" value={form.serviceRadiusKm} onChange={event => onChange('serviceRadiusKm', Number(event.target.value))} /></label></div>
      <div className="panel-card"><div className="panel-header"><ShieldCheck size={16}/> <h3>Coverage and SLA</h3></div><label className="field"><span>Response SLA (hours)</span><input type="number" value={form.sla.responseHours} onChange={event => onChange('sla', { ...form.sla, responseHours: Number(event.target.value) })} /></label><label className="field"><span>Service window (hours)</span><input type="number" value={form.sla.serviceWindowHours} onChange={event => onChange('sla', { ...form.sla, serviceWindowHours: Number(event.target.value) })} /></label><label className="field"><span>GST (%)</span><input type="number" value={form.taxes.gst} onChange={event => onChange('taxes', { ...form.taxes, gst: Number(event.target.value) })} /></label><label className="field"><span>Service charge (%)</span><input type="number" value={form.taxes.serviceCharge} onChange={event => onChange('taxes', { ...form.taxes, serviceCharge: Number(event.target.value) })} /></label></div>
      <div className="panel-card"><div className="panel-header"><Building size={16}/> <h3>Emergency support</h3></div><label className="field checkbox"><input type="checkbox" checked={form.emergency.enabled} onChange={event => onChange('emergency', { ...form.emergency, enabled: event.target.checked })} /><span>Enable emergency booking assistance</span></label><label className="field"><span>Emergency phone</span><input value={form.emergency.phone} onChange={event => onChange('emergency', { ...form.emergency, phone: event.target.value })} /></label></div>
      <div className="panel-card"><div className="panel-header"><Bell size={16}/> <h3>Service experience</h3></div><label className="field"><span>Notification channel</span><input value={form.notificationChannel ?? 'SMS + WhatsApp'} onChange={event => onChange('notificationChannel', event.target.value as string)} /></label><label className="field"><span>Preferred segment</span><input value={form.customerSegment ?? 'Premium home care'} onChange={event => onChange('customerSegment', event.target.value as string)} /></label><label className="field"><span>Brand promise</span><input value={form.brandPromise ?? 'Fast, trusted home appliance care'} onChange={event => onChange('brandPromise', event.target.value as string)} /></label></div>
    </div>}
    <div className="form-actions"><button className="button" onClick={() => saveMutation.mutate(form)}><Save size={16}/> Save changes</button><span className="muted-copy"><Sparkles size={15}/> RamLax operational preferences ready.</span></div>
  </section>;
}
*/
export { default } from './AdminSettingsPage';
