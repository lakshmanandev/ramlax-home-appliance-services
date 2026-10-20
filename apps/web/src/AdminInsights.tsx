import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowUpRight, BadgeDollarSign, Clock3, Gauge, TrendingUp } from 'lucide-react';
import type { BookingView } from '@ramlax/shared';
import { api } from './api';

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

type Review = { _id: string; service: string; rating: number; text: string; displayName: string; approved: boolean; booking?: { reference: string; status: string } };
function Nav() { return <nav className="admin-nav"><Link to="/admin">Bookings</Link><Link to="/admin/services">Services and pricing</Link><Link to="/admin/locations">Locations</Link><Link to="/admin/technicians">Technicians</Link><Link to="/admin/settings">Business settings</Link><Link to="/admin/reviews">Reviews</Link><Link to="/admin/reports">Reports</Link></nav>; }
function useReviews() { return useQuery<Review[]>({ queryKey: ['adminReviews'], queryFn: async () => (await api.get('/admin/reviews')).data.data, retry: false }); }
export function AdminReviews() {
  const query = useReviews(); const [message, setMessage] = useState('');
  if (query.isError) return <section className="page-section"><Nav/><div className="login-card"><h2>Administrator sign in required</h2><Link className="button" to="/admin/login">Sign in</Link></div></section>;
  return <section className="page-section"><span className="eyebrow">RAMLAX ADMIN</span><h1>Customer reviews.</h1><p>Only reviews from verified completed bookings are accepted. Public reviews appear after approval.</p><Nav/>{query.isLoading?<p>Loading reviews…</p>:!query.data?.length?<div className="empty-state"><h2>No reviews submitted</h2><p>Verified customer reviews will appear here for moderation.</p></div>:<div className="review-admin-list">{query.data.map(review=><article className="contact-card" key={review._id}><div className="review-admin-head"><strong>{review.displayName} · {'★'.repeat(review.rating)}{'☆'.repeat(5-review.rating)}</strong><span>{review.approved?'Approved':'Pending'}</span></div><p>{review.text}</p><small>{review.service} · {review.booking?.reference || 'Verified booking'} · {review.booking?.status}</small><div className="form-actions"><button className="button" disabled={review.approved} onClick={async()=>{try{await api.patch(`/admin/reviews/${review._id}`,{approved:true});setMessage('Review approved.');query.refetch()}catch{setMessage('Could not approve this review.')}}}>Approve</button><button className="button button-outline" disabled={!review.approved} onClick={async()=>{try{await api.patch(`/admin/reviews/${review._id}`,{approved:false,moderationNote:'Rejected by administrator'});setMessage('Review rejected.');query.refetch()}catch{setMessage('Could not reject this review.')}}}>Reject</button></div></article>)}</div>}{message&&<p role="status">{message}</p>}</section>;
}
type Report = { from:string; to:string; total:number; byStatus:Record<string,number>; byService:{_id:string;count:number}[]; byCity:{_id:string;count:number}[]; completedJobs:number; cancellationRate:number; estimatedBookingValue:number; actualRecordedPayments:number };
export function AdminReports() {
 const today=new Date().toISOString().slice(0,10); const monthAgo=new Date(Date.now()-30*86400000).toISOString().slice(0,10); const [from,setFrom]=useState(monthAgo); const [to,setTo]=useState(today);
 const query=useQuery<Report>({queryKey:['adminReport',from,to],queryFn:async()=>(await api.get('/admin/reports',{params:{from,to}})).data.data,retry:false});
 if(query.isError)return <section className="page-section"><Nav/><div className="login-card"><h2>Administrator sign in required</h2><Link className="button" to="/admin/login">Sign in</Link></div></section>;
 return <section className="page-section"><span className="eyebrow">RAMLAX ADMIN</span><h1>Booking reports.</h1><p>Database totals for the selected request creation dates.</p><Nav/><form className="admin-filters" onSubmit={e=>e.preventDefault()}><label className="field"><span>From</span><input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="field"><span>To</span><input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></form>{query.isLoading?<p>Loading report…</p>:query.data&&<><div className="report-stat-grid"><article><small>Requests</small><b>{query.data.total}</b></article><article><small>Completed jobs</small><b>{query.data.completedJobs}</b></article><article><small>Cancellation rate</small><b>{(query.data.cancellationRate*100).toFixed(1)}%</b></article><article><small>Recorded payments</small><b>₹{query.data.actualRecordedPayments.toLocaleString('en-IN')}</b></article><article><small>Estimated booking value</small><b>₹{query.data.estimatedBookingValue.toLocaleString('en-IN')}</b></article></div><div className="report-columns"><article className="contact-card"><h2>By service</h2>{query.data.byService.map(row=><p key={row._id}>{row._id}: <b>{row.count}</b></p>)}</article><article className="contact-card"><h2>By city</h2>{query.data.byCity.map(row=><p key={row._id}>{row._id}: <b>{row.count}</b></p>)}</article><article className="contact-card"><h2>By status</h2>{Object.entries(query.data.byStatus).map(([status,count])=><p key={status}>{status}: <b>{count}</b></p>)}</article></div><p className="form-help">Estimated booking value comes from the saved price snapshot. Recorded payments are entered separately and are not inferred from bookings.</p></>}</section>;
}
export default function AdminInsights() {
  const bookingsQuery = useQuery({
    queryKey: ['adminBookingsInsights'],
    queryFn: async () => {
      const response = await api.get('/admin/bookings');
      return response.data.data as BookingView[];
    },
    retry: false,
  });

  const totalRevenue = (bookingsQuery.data ?? []).reduce((sum, booking) => sum + (booking.total.amount || 0), 0);
  const completedBookings = (bookingsQuery.data ?? []).filter(booking => booking.status === 'completed').length;
  const avgTicket = completedBookings ? totalRevenue / completedBookings : 0;
  const weeklyMix = (bookingsQuery.data ?? []).reduce<Record<string, number>>((map, booking) => {
    const date = new Date(booking.createdAt);
    const key = date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    map[key] = (map[key] ?? 0) + 1;
    return map;
  }, {});

  return <section className="page-section"><div className="page-title"><span className="eyebrow">RAMLAX ADMIN</span><h1>Performance insights.</h1><p>Track bookings, revenue and service demand across your RamLax home appliance network.</p></div><nav className="admin-nav"><Link to="/admin">Bookings</Link><Link to="/admin/services">Services and pricing</Link><Link to="/admin/locations">Locations</Link><Link to="/admin/technicians">Technicians</Link><Link to="/admin/settings">Business settings</Link></nav>
    <div className="insights-grid">
      <article className="insight-card accent"><Activity size={18}/><div><span>Bookings</span><strong>{bookingsQuery.data?.length ?? 0}</strong></div><small>All recorded orders</small></article>
      <article className="insight-card"><BadgeDollarSign size={18}/><div><span>Revenue</span><strong>{formatCurrency(totalRevenue)}</strong></div><small>Net booking value</small></article>
      <article className="insight-card"><ArrowUpRight size={18}/><div><span>Avg. ticket</span><strong>{formatCurrency(avgTicket)}</strong></div><small>Completed jobs</small></article>
      <article className="insight-card"><Clock3 size={18}/><div><span>Completion rate</span><strong>{bookingsQuery.data?.length ? `${Math.round((completedBookings / bookingsQuery.data.length) * 100)}%` : '0%'}</strong></div><small>Job lifecycle</small></article>
    </div>
    <div className="insights-panels">
      <div className="panel-card"><div className="panel-header"><Gauge size={16}/> <h3>Multi-city demand</h3></div><ul className="bars">{Object.entries(weeklyMix).slice(-5).map(([label, value]) => <li key={label}><span>{label}</span><div className="meter"><i style={{ width: `${Math.min((value / Math.max(...Object.values(weeklyMix), 1)) * 100, 100)}%` }} /></div><strong>{value}</strong></li>)}</ul></div>
      <div className="panel-card"><div className="panel-header"><TrendingUp size={16}/> <h3>Business pulse</h3></div><ul className="stat-list"><li><span>Completed bookings</span><strong>{completedBookings}</strong></li><li><span>Open bookings</span><strong>{(bookingsQuery.data ?? []).filter(booking => booking.status !== 'completed' && booking.status !== 'cancelled').length}</strong></li><li><span>Average ticket</span><strong>{formatCurrency(avgTicket)}</strong></li><li><span>Service volume</span><strong>{Object.values(weeklyMix).reduce((sum, value) => sum + value, 0)}</strong></li></ul></div>
    </div>
  </section>;
}
