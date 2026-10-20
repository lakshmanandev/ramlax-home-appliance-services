import { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { api } from './api';

const links = [
  ['/admin', 'Bookings', true],
  ['/admin/contacts', 'Customer enquiries'],
  ['/admin/services', 'Services and pricing'],
  ['/admin/locations', 'Locations'],
  ['/admin/technicians', 'Technicians'],
  ['/admin/settings', 'Settings'],
  ['/admin/reviews', 'Reviews'],
  ['/admin/reports', 'Reports'],
] as const;

export function AdminNavigation() {
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [realtimeState, setRealtimeState] = useState<'connecting' | 'live' | 'offline'>('connecting');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(() => typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const newEnquiries = useQuery<{ pagination: { total: number } }>({
    queryKey: ['adminNewEnquiryCount'],
    queryFn: async () => (await api.get('/admin/contacts', { params: { status: 'new', limit: 1 } })).data,
    refetchInterval: 60_000,
    retry: false,
  });
  useEffect(() => {
    const socketOrigin = new URL(api.defaults.baseURL || window.location.origin, window.location.origin).origin;
    const socket = io(socketOrigin, { withCredentials: true, reconnection: true, reconnectionDelayMax: 10_000 });
    const refreshContacts = () => {
      void queryClient.invalidateQueries({ queryKey: ['adminContacts'] });
      void queryClient.invalidateQueries({ queryKey: ['adminNewEnquiryCount'] });
    };
    const refreshBookings = () => {
      void queryClient.invalidateQueries({ queryKey: ['adminBookings'] });
      void queryClient.invalidateQueries({ queryKey: ['adminBookingsInsights'] });
      void queryClient.invalidateQueries({ queryKey: ['adminReport'] });
    };
    const showBrowserAlert = (title: string, body: string) => {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
        new Notification(title, { body, icon: '/favicon.svg' });
      }
    };
    socket.on('connect', () => setRealtimeState('live'));
    socket.on('disconnect', () => setRealtimeState('offline'));
    socket.on('connect_error', () => setRealtimeState('offline'));
    socket.on('admin:contacts:changed', (event: { status?: string }) => {
      refreshContacts();
      if (event.status === 'new') showBrowserAlert('New customer enquiry', 'A customer has sent a message through your website.');
    });
    socket.on('admin:bookings:changed', refreshBookings);
    socket.on('admin:notification', (event: { title?: string }) => {
      void queryClient.invalidateQueries({ queryKey: ['adminNotifications'] });
      showBrowserAlert(event.title || 'Booking updated', 'Open the RamLaksh admin panel to review the update.');
    });
    return () => { socket.removeAllListeners(); socket.disconnect(); };
  }, [queryClient]);
  const signOut = async () => {
    try {
      await api.post('/auth/logout');
      queryClient.clear();
      navigate('/admin/login', { replace: true });
    } catch {
      setError('Could not sign out. Check your connection and try again.');
    }
  };
  const enableBrowserAlerts = async () => {
    if (typeof Notification === 'undefined') return;
    try { setNotificationPermission(await Notification.requestPermission()); }
    catch { setError('Could not enable desktop alerts. Check browser permissions and try again.'); }
  };
  return <>
    <div className="admin-mobile-head"><strong>RamLaksh Admin</strong><button type="button" className="button button-outline" aria-expanded={open} aria-controls="admin-navigation" onClick={() => setOpen(value => !value)}>{open ? 'Close menu' : 'Menu'}</button></div>
    <nav id="admin-navigation" className={`admin-nav admin-sidebar${open ? ' is-open' : ''}`} aria-label="Admin navigation">
      <span className="admin-nav-brand">RamLaksh <small>OPERATIONS</small><span className={`admin-live-indicator is-${realtimeState}`}><i/>{realtimeState === 'live' ? 'Live updates on' : realtimeState === 'connecting' ? 'Connecting live updates' : 'Live updates offline'}</span></span>
      {notificationPermission !== 'unsupported' && <button type="button" className="admin-alert-setup" disabled={notificationPermission !== 'default'} onClick={enableBrowserAlerts}>{notificationPermission === 'granted' ? 'Desktop alerts enabled' : notificationPermission === 'denied' ? 'Desktop alerts blocked in browser' : 'Enable desktop alerts'}</button>}
      {links.map(([to, label, end]) => <NavLink key={to} to={to} end={end} className={({ isActive }) => isActive || (to === '/admin' && (location.pathname === '/admin/bookings' || location.pathname.startsWith('/admin/bookings/'))) ? 'active' : undefined} onClick={() => setOpen(false)}>{label}{to === '/admin/contacts' && !!newEnquiries.data?.pagination.total && <span className="admin-nav-count">{newEnquiries.data.pagination.total > 99 ? '99+' : newEnquiries.data.pagination.total}</span>}</NavLink>)}
      <button className="admin-signout" type="button" onClick={signOut}>Sign out</button>
      {error && <span role="alert" className="admin-nav-error">{error}</span>}
    </nav>
  </>;
}

export default AdminNavigation;
