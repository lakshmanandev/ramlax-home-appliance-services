import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, Check, MessageCircle, X } from 'lucide-react';
import { api } from './api';

type Booking = { _id: string; reference: string; createdAt: string; customer: { name: string; phone: string; email?: string }; service: string; serviceType: string; appliance: Record<string, string>; city: string; area: string; address: string; landmark?: string; preferredDate: string; preferredWindow: string; confirmedDate?: string; confirmedWindow?: string; status: string; cancellationReason?: string; actualPaidAmount?: number; price: { kind: string; amount?: number; currency: string; estimatedTotal?: number; additionalCharges?: { name: string; amount: number }[] }; technician?: { id?: string; name?: string; phone?: string }; statusHistory: { status: string; note?: string; at: string }[] };
type Technician = { _id: string; name: string; phone: string; skills: string[]; cities: string[]; areas: string[]; active: boolean };
type Settings = { appointmentWindows: string[] };
function AdminNav() { return <nav className="admin-nav"><Link to="/admin">Bookings</Link><Link to="/admin/services">Services and pricing</Link><Link to="/admin/locations">Locations</Link><Link to="/admin/technicians">Technicians</Link><Link to="/admin/settings">Business settings</Link></nav>; }
function whatsappFollowUp(booking: Booking) {
  let phone = booking.customer.phone.replace(/\D/g, '');
  if (phone.length === 10) phone = `91${phone}`;
  else if (phone.length === 11 && phone.startsWith('0')) phone = `91${phone.slice(1)}`;
  if (phone.length < 10 || phone.length > 15) return null;
  const date = (value: string) => value ? new Date(`${value}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const appointmentDate = booking.confirmedDate || booking.preferredDate;
  const appointmentWindow = booking.confirmedWindow || booking.preferredWindow;
  const appointment = `${date(appointmentDate)}${appointmentWindow ? `, ${appointmentWindow}` : ''}`;
  const updates: Record<string, string> = {
    requested: `We received your ${booking.serviceType} request for ${booking.service}. Your preferred visit is ${appointment}. We are checking availability and will confirm with you.`,
    confirmed: `Your ${booking.serviceType} appointment for ${booking.service} is confirmed for ${appointment}.`,
    in_progress: `Our team has started work on your ${booking.service} service request.`,
    completed: `Your ${booking.service} service request is marked complete. Please reply if you need any follow-up.`,
    cancelled: `Your ${booking.service} service request has been cancelled. Reply if you have any questions.`,
    rejected: `We are unable to proceed with your ${booking.service} service request. Please reply if you would like to discuss alternatives.`,
  };
  const message = `Hi ${booking.customer.name}, RamLaksh update for request ${booking.reference}: ${updates[booking.status] || `your request status is ${booking.status.replace(/_/g, ' ')}.`}`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export default function AdminBookingDetail() {
  const { id = '' } = useParams();
  const [notice, setNotice] = useState('');
  const [date, setDate] = useState('');
  const [timeWindow, setTimeWindow] = useState('');
  const [reason, setReason] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [payment, setPayment] = useState('');
  const bookingQuery = useQuery<Booking>({ queryKey: ['adminBooking', id], queryFn: async () => (await api.get(`/admin/bookings/${id}`)).data.data, retry: false });
  const techniciansQuery = useQuery<Technician[]>({ queryKey: ['adminTechnicians'], queryFn: async () => (await api.get('/admin/technicians')).data.data, retry: false });
  const settingsQuery = useQuery<Settings>({ queryKey: ['settings'], queryFn: async () => (await api.get('/settings/public')).data.data });
  const booking = bookingQuery.data;
  const customerWhatsApp = booking ? whatsappFollowUp(booking) : null;
  async function schedule(event: FormEvent) {
    event.preventDefault(); setNotice('Saving appointment…');
    try { await api.patch(`/admin/bookings/${id}/schedule`, { date: date || bookingQuery.data?.confirmedDate || bookingQuery.data?.preferredDate, window: timeWindow || bookingQuery.data?.confirmedWindow || bookingQuery.data?.preferredWindow }); setNotice('Appointment confirmed.'); await bookingQuery.refetch(); }
    catch (error) { setNotice((error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Could not confirm appointment.'); }
  }
  async function changeStatus(status: string) {
    if (status === 'cancelled' && (!reason.trim() || !globalThis.window.confirm('Cancel this booking? This status change is recorded in its history.'))) { setNotice('Enter a cancellation reason and confirm the action.'); return; }
    try { await api.patch(`/admin/bookings/${id}/status`, { status, ...(status === 'cancelled' ? { cancellationReason: reason } : {}) }); setNotice(`Booking marked ${status.replace('_', ' ')}.`); await bookingQuery.refetch(); }
    catch (error) { setNotice((error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Could not update booking.'); }
  }
  async function assignTechnician() {
    try { await api.patch(`/admin/bookings/${id}/assignment`, { technicianId }); setNotice('Technician assigned.'); await bookingQuery.refetch(); }
    catch (error) { setNotice((error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Could not assign technician.'); }
  }
  async function recordPayment(event: FormEvent) {
    event.preventDefault();
    try { await api.patch(`/admin/bookings/${id}/payment`, { actualPaidAmount: Number(payment) }); setNotice('Payment amount recorded.'); await bookingQuery.refetch(); }
    catch (error) { setNotice((error as { response?: { data?: { error?: { message?: string } } } }).response?.data?.error?.message || 'Could not record payment. Your account may not have payment permissions.'); }
  }
  if (bookingQuery.isLoading) return <section className="page-section"><p className="loading">Loading booking details…</p></section>;
  if (bookingQuery.isError || !booking) { const status = (bookingQuery.error as { response?: { status?: number } } | null)?.response?.status; return <section className="page-section"><div className="empty-state"><h1>{status === 401 || status === 403 ? 'Administrator access required.' : 'Booking not found.'}</h1>{(status === 401 || status === 403) && <Link className="button" to="/admin/login">Sign in</Link>}<Link className="button button-outline" to="/admin">Back to bookings</Link></div></section>; }
  const eligibleTechnicians = (techniciansQuery.data || []).filter(technician => technician.active && technician.skills.includes(booking.service) && technician.cities.includes(booking.city) && (!technician.areas.length || technician.areas.includes(booking.area)));
  const transitions: Record<string, string[]> = { confirmed: ['in_progress', 'cancelled'], in_progress: ['completed', 'cancelled'] };
  return <section className="page-section"><div className="page-title"><Link className="back-link" to="/admin"><ArrowLeft size={16}/> All bookings</Link><span className="eyebrow">BOOKING DETAILS</span><h1>{booking.reference}</h1><p><span className={`status status-${booking.status}`}>{booking.status.replace('_', ' ')}</span> · Received {new Date(bookingQuery.data.createdAt || Date.now()).toLocaleString()}</p></div><AdminNav/>
    <div className="booking-detail-grid"><div className="detail-list"><h3>Customer and service</h3><div><b>Customer</b> {booking.customer.name}</div><div><b>Phone</b> <a href={`tel:${booking.customer.phone}`}>{booking.customer.phone}</a></div>{booking.customer.email && <div><b>Email</b> {booking.customer.email}</div>}<div><b>Service</b> {booking.service} · {booking.serviceType}</div><div><b>Appliance</b> {Object.entries(booking.appliance || {}).filter(([, value]) => value).map(([key, value]) => `${key}: ${value}`).join(' · ')}</div><div><b>Address</b> {booking.address}{booking.landmark ? ` · ${booking.landmark}` : ''}, {booking.area}, {booking.city}</div></div>
      <div className="detail-list"><h3>Price snapshot</h3><div>{booking.price.kind === 'quote' ? 'Quotation required' : `${booking.price.kind === 'starting' ? 'Starting price' : 'Fixed price'}: ${booking.price.currency} ${booking.price.amount?.toLocaleString()}`}</div>{booking.price.additionalCharges?.map(charge => <div key={charge.name}>{charge.name}: {booking.price.currency} {charge.amount.toLocaleString()}</div>)}{booking.price.estimatedTotal !== undefined && <div><b>Estimated total</b> {booking.price.currency} {booking.price.estimatedTotal.toLocaleString()}</div>}<div><b>Preferred time</b> {booking.preferredDate} · {booking.preferredWindow}</div>{booking.confirmedDate && <div><b>Confirmed appointment</b> {booking.confirmedDate} · {booking.confirmedWindow}</div>}{booking.technician?.name && <div><b>Technician</b> {booking.technician.name} · {booking.technician.phone}</div>}{booking.cancellationReason && <div><b>Cancellation reason</b> {booking.cancellationReason}</div>}</div>
    </div>
    {customerWhatsApp && <div className="customer-follow-up"><a className="button button-outline" href={customerWhatsApp} target="_blank" rel="noreferrer"><MessageCircle size={16}/> Draft WhatsApp follow-up</a><p>Review the prefilled message in WhatsApp and send it when ready.</p></div>}
    {['requested', 'confirmed'].includes(booking.status) && <form className="contact-card schedule-card" onSubmit={schedule}><h2><CalendarClock size={19}/> {booking.status === 'requested' ? 'Confirm appointment' : 'Reschedule appointment'}</h2><p>Current customer preference: {booking.preferredDate} · {booking.preferredWindow}</p><div className="form-grid"><label className="field"><span>Confirmed date *</span><input type="date" required value={date || booking.confirmedDate || booking.preferredDate} onChange={e => setDate(e.target.value)}/></label><label className="field"><span>Confirmed window *</span><select required value={timeWindow || booking.confirmedWindow || ''} onChange={e => setTimeWindow(e.target.value)}><option value="">Choose a configured window</option>{(settingsQuery.data?.appointmentWindows || []).map(item => <option key={item} value={item}>{item}</option>)}</select></label></div>{!settingsQuery.data?.appointmentWindows.length && <p className="inline-error">Configure appointment windows in Business settings first.</p>}<button className="button" disabled={!settingsQuery.data?.appointmentWindows.length}><Check size={16}/>{booking.status === 'requested' ? 'Confirm appointment' : 'Save reschedule'}</button></form>}
    <form className="contact-card schedule-card" onSubmit={event => { event.preventDefault(); assignTechnician(); }}><h2>Technician assignment</h2><p>Only active technicians matching this service and location are shown.</p><label className="field"><span>Eligible technician</span><select value={technicianId || booking.technician?.id || ''} onChange={event => setTechnicianId(event.target.value)}><option value="">Choose technician</option>{eligibleTechnicians.map(technician => <option key={technician._id} value={technician._id}>{technician.name} · {technician.phone}</option>)}</select></label>{techniciansQuery.isError ? <p role="alert" className="inline-error">Technician access is unavailable for this account. An owner or administrator can review the assignment.</p> : !eligibleTechnicians.length && <p>No eligible technicians are currently configured for this service and area.</p>}<button className="button" disabled={techniciansQuery.isError || (!technicianId && !booking.technician?.id) || !eligibleTechnicians.length}>Save assignment</button></form>
    <form className="contact-card schedule-card" onSubmit={recordPayment}><h2>Recorded payment</h2><p>Payments are entered separately from the service price estimate.</p><label className="field"><span>Amount paid ({booking.price.currency})</span><input type="number" min={0} step="0.01" required value={payment || booking.actualPaidAmount?.toString() || ''} onChange={event => setPayment(event.target.value)} /></label><button className="button">Record payment</button></form>
    {transitions[booking.status]?.length > 0 && <div className="contact-card status-actions"><h2>Update work status</h2>{transitions[booking.status].includes('cancelled') && <label className="field"><span>Cancellation reason *</span><textarea rows={2} value={reason} onChange={e => setReason(e.target.value)}/></label>}{transitions[booking.status].map(next => <button key={next} className={`button ${next === 'cancelled' ? 'button-danger' : ''}`} onClick={() => changeStatus(next)}>{next === 'cancelled' ? <X size={16}/> : <Check size={16}/>} Mark {next.replace('_', ' ')}</button>)}</div>}
    <div className="detail-list history-list"><h3>Status history</h3>{booking.statusHistory.map((item, index) => <div key={`${item.at}-${index}`}><span className={`status status-${item.status}`}>{item.status.replace('_', ' ')}</span><span>{item.note || ''}</span><small>{new Date(item.at).toLocaleString()}</small></div>)}</div>{notice && <p className="admin-notice" role="status">{notice}</p>}
  </section>;
}
