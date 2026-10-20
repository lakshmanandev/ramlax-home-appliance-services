import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, MapPin, Phone, CheckCircle2, XCircle, Clock3, Search, UserRound, Sparkles, ShieldCheck } from 'lucide-react';
import type { BookingStatus, BookingView, BookingIssueKind, TechnicianView } from '@ramlax/shared';
import { api } from './api';

const STATUS = ['pending', 'confirmed', 'assigned', 'on_the_way', 'in_progress', 'completed', 'cancelled'] as const;
type BookingStatusWithWorkflow = BookingStatus | 'pending' | 'assigned' | 'on_the_way';
const statusColors: Record<BookingStatusWithWorkflow, string> = {
  pending: '#eab308',
  confirmed: '#3b82f6',
  assigned: '#8b5cf6',
  on_the_way: '#f97316',
  in_progress: '#22c55e',
  completed: '#16a34a',
  cancelled: '#ef4444',
  requested: '#64748b',
  rejected: '#ef4444',
};

function formatDate(value: string | undefined) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AdminBookings() {
  const [selectedStatus, setSelectedStatus] = useState<BookingStatusWithWorkflow | 'all'>('all');
  const [search, setSearch] = useState('');
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  const bookingsQuery = useQuery({
    queryKey: ['adminBookings', selectedStatus, search],
    queryFn: async () => {
      const response = await api.get('/admin/bookings', { params: { status: selectedStatus === 'all' ? undefined : selectedStatus, search: search || undefined } });
      return response.data.data as BookingView[];
    },
    retry: false,
  });

  const techniciansQuery = useQuery({
    queryKey: ['adminTechnicians'],
    queryFn: async () => {
      const response = await api.get('/admin/technicians');
      return response.data.data as TechnicianView[];
    },
    retry: false,
  });

  const selectedBooking = bookingsQuery.data?.find(booking => booking._id === selectedBookingId) ?? null;

  async function assignTechnician(bookingId: string, technicianId: string) {
    await api.patch(`/admin/bookings/${bookingId}/assign`, { technicianId });
    await bookingsQuery.refetch();
  }

  async function updateStatus(bookingId: string, status: BookingStatusWithWorkflow) {
    await api.patch(`/admin/bookings/${bookingId}/status`, { status });
    await bookingsQuery.refetch();
  }

  async function markResolved(issueId: string, approved: boolean) {
    await api.patch(`/admin/issues/${issueId}`, { resolved: approved, outcome: approved ? 'approved' : 'rejected' });
    await bookingsQuery.refetch();
  }

  const issueKinds: Record<BookingIssueKind, string> = {
    replacement: 'Replacement needed',
    delay: 'Delay',
    quality: 'Quality concern',
    access: 'Access issue',
    other: 'Other issue',
  };

  return (
    <section className="page-section">
      <div className="page-title">
        <span className="eyebrow">RAMLAX ADMIN</span>
        <h1>Bookings overview.</h1>
        <p>Track every service booking, technician assignment and customer issue in real time.</p>
      </div>
      <nav className="admin-nav">
        <Link to="/admin">Bookings</Link>
        <Link to="/admin/services">Services and pricing</Link>
        <Link to="/admin/locations">Locations</Link>
        <Link to="/admin/technicians">Technicians</Link>
        <Link to="/admin/settings">Business settings</Link>
      </nav>

      <div className="admin-toolbar">
        <div className="field search-field">
          <Search size={15}/>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by customer, phone, appliance, service, city" />
        </div>
        <div className="field slim">
          <label>Filter by status</label>
          <select value={selectedStatus} onChange={event => setSelectedStatus(event.target.value as BookingStatusWithWorkflow | 'all')}>
            <option value="all">All bookings</option>
            {STATUS.map(status => <option value={status} key={status}>{status.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>

      {bookingsQuery.isLoading ? (
        <p className="loading">Loading bookings…</p>
      ) : bookingsQuery.isError ? (
        <div className="login-card">
          <h2>Sign in to continue</h2>
          <Link className="button" to="/admin/login">Administrator sign in</Link>
        </div>
      ) : (
        <div className="admin-layout">
          <div className="admin-list">
            <div className="booking-list-header">
              <strong>{bookingsQuery.data?.length ?? 0}</strong>
              <span>open bookings</span>
            </div>
            {(bookingsQuery.data ?? []).map(booking => (
              <button key={booking._id} className={`booking-row ${selectedBookingId === booking._id ? 'selected' : ''}`} onClick={() => setSelectedBookingId(booking._id)}>
                <div className="row-top">
                  <span className="status-pill" style={{ background: `${statusColors[booking.status as BookingStatusWithWorkflow]}22`, color: statusColors[booking.status as BookingStatusWithWorkflow] }}>{booking.status.replace(/_/g, ' ')}</span>
                  <strong>#{booking.bookingId}</strong>
                </div>
                <div className="row-main">
                  <div><UserRound size={14}/><span>{booking.customer.name}</span></div>
                  <div><Phone size={14}/><span>{booking.customer.phone}</span></div>
                  <div><CalendarDays size={14}/><span>{formatDate(booking.createdAt)}</span></div>
                  <div><MapPin size={14}/><span>{booking.location.city}</span></div>
                </div>
              </button>
            ))}
          </div>

          <div className="admin-detail">
            {selectedBooking ? (
              <>
                <div className="detail-header">
                  <div><p className="eyebrow">Booking #{selectedBooking.bookingId}</p><h2>{selectedBooking.customer.name}</h2></div>
                  <span className="status-pill" style={{ background: `${statusColors[selectedBooking.status as BookingStatusWithWorkflow]}22`, color: statusColors[selectedBooking.status as BookingStatusWithWorkflow] }}>{selectedBooking.status.replace(/_/g, ' ')}</span>
                </div>

                <div className="detail-grid">
                  <div className="detail-card">
                    <h3>Customer details</h3>
                    <p><strong>Phone</strong><span>{selectedBooking.customer.phone}</span></p>
                    <p><strong>Email</strong><span>{selectedBooking.customer.email || 'Not provided'}</span></p>
                    <p><strong>Address</strong><span>{selectedBooking.location.address}</span></p>
                    <p><strong>Service</strong><span>{selectedBooking.items.map(item => item.serviceName).join(', ')}</span></p>
                    <p><strong>Brand</strong><span>{selectedBooking.appliance.brand}</span></p>
                  </div>

                  <div className="detail-card">
                    <h3>Service snapshot</h3>
                    {selectedBooking.items.map(item => (
                      <div className="mini-list" key={item._id}>
                        <span><strong>{item.serviceName}</strong><small>{item.itemTypeName}</small></span>
                        <span>{item.qty} x {item.price.currency} {item.price.amount}</span>
                      </div>
                    ))}
                    <div className="totals"><span>Total</span><strong>{selectedBooking.total.currency} {selectedBooking.total.amount}</strong></div>
                  </div>
                </div>

                <div className="detail-card">
                  <h3>Checklist</h3>
                  <div className="checklist">
                    <button onClick={() => updateStatus(selectedBooking._id, 'confirmed')} className={selectedBooking.status === 'confirmed' ? 'active' : ''}><CheckCircle2 size={14}/> Confirm</button>
                    <button onClick={() => updateStatus(selectedBooking._id, 'assigned')} className={selectedBooking.status === 'assigned' ? 'active' : ''}><Clock3 size={14}/> Assign</button>
                    <button onClick={() => updateStatus(selectedBooking._id, 'on_the_way')} className={selectedBooking.status === 'on_the_way' ? 'active' : ''}><Sparkles size={14}/> On the way</button>
                    <button onClick={() => updateStatus(selectedBooking._id, 'in_progress')} className={selectedBooking.status === 'in_progress' ? 'active' : ''}><ShieldCheck size={14}/> In progress</button>
                    <button onClick={() => updateStatus(selectedBooking._id, 'completed')} className={selectedBooking.status === 'completed' ? 'active' : ''}><CheckCircle2 size={14}/> Complete</button>
                    <button onClick={() => updateStatus(selectedBooking._id, 'cancelled')} className={selectedBooking.status === 'cancelled' ? 'active' : ''}><XCircle size={14}/> Cancel</button>
                  </div>
                </div>

                <div className="detail-card">
                  <h3>Technician dispatch</h3>
                  <div className="assign-grid">
                    <select defaultValue={selectedBooking.technician?._id ?? ''} onChange={event => assignTechnician(selectedBooking._id, event.target.value)}>
                      <option value="">Unassigned</option>
                      {(techniciansQuery.data ?? []).map(tech => <option value={tech._id} key={tech._id}>{tech.name}</option>)}
                    </select>
                    <button className="button button-quiet" onClick={() => updateStatus(selectedBooking._id, 'completed')}>Mark complete</button>
                  </div>
                </div>

                {selectedBooking.issues?.length ? (
                  <div className="detail-card">
                    <h3>Open issues</h3>
                    {selectedBooking.issues.map(issue => (
                      <div className="issue-box" key={issue._id}>
                        <div><strong>{issueKinds[issue.kind]}</strong><small>{issue.message}</small></div>
                        <div className="issue-actions">
                          <button className="button button-quiet" onClick={() => markResolved(issue._id, true)}>Approve</button>
                          <button className="button button-danger" onClick={() => markResolved(issue._id, false)}>Reject</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="detail-card">
                    <h3>Service notes</h3>
                    <p>No issues reported.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-state">
                <h3>Select a booking</h3>
                <p>Choose a booking from the list to review the details and status updates.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
