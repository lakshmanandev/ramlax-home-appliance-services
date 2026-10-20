import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone } from 'lucide-react';
import { api } from './api';

type ContactStatus = 'new' | 'reviewed' | 'closed';
type Contact = { _id: string; name: string; phone: string; message: string; status: ContactStatus; createdAt: string };
type ContactPage = { data: Contact[]; pagination: { page: number; pages: number; total: number } };

export default function AdminContactsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [busyId, setBusyId] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const queryClient = useQueryClient();
  const query = useQuery<ContactPage>({
    queryKey: ['adminContacts', page, status],
    queryFn: async () => (await api.get('/admin/contacts', { params: { page, limit: 20, status: status || undefined } })).data,
    retry: false,
  });
  const errorStatus = (query.error as { response?: { status?: number } } | null)?.response?.status;
  const updateStatus = async (contact: Contact, nextStatus: ContactStatus) => {
    setBusyId(contact._id);
    setActionMessage('');
    try {
      await api.patch(`/admin/contacts/${contact._id}/status`, { status: nextStatus });
      setActionMessage(`Enquiry marked ${nextStatus}.`);
      await queryClient.invalidateQueries({ queryKey: ['adminNewEnquiryCount'] });
      await query.refetch();
    } catch {
      setActionMessage('Could not update this enquiry. Please try again.');
    } finally {
      setBusyId('');
    }
  };

  return <section className="page-section">
    <div className="page-title"><span className="eyebrow">RAMLAKSH ADMIN</span><h1>Customer enquiries.</h1><p>Website contact form submissions are saved here. Call customers back using the number they provided.</p></div>
    <label className="field contact-status-filter"><span>Filter enquiries</span><select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="">All enquiries</option><option value="new">New</option><option value="reviewed">Reviewed</option><option value="closed">Closed</option></select></label>
    {actionMessage && <p role="status" className="admin-notice">{actionMessage}</p>}
    {query.isLoading ? <p className="loading" role="status">Loading enquiries…</p> : query.isError ? <div className="login-card"><h2>{errorStatus === 403 ? 'Your account cannot access enquiries.' : 'Administrator sign in required.'}</h2><p>{errorStatus === 403 ? 'Ask an account owner to review your permissions.' : 'Sign in to review customer enquiries.'}</p><Link className="button" to="/admin/login">Administrator sign in</Link></div> : query.data?.data.length ? <>
      <div className="contact-inquiry-list">{query.data.data.map(contact => <article className="contact-card" key={contact._id}>
        <div className="contact-inquiry-head"><div><h2>{contact.name}</h2><a href={`tel:${contact.phone.replace(/[^+\d]/g, '')}`}><Phone size={15}/> {contact.phone}</a></div><div className="contact-inquiry-meta"><span className={`inquiry-status inquiry-status-${contact.status}`}>{contact.status}</span><time dateTime={contact.createdAt}>{new Date(contact.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</time></div></div>
        <p>{contact.message}</p>
        <div className="contact-inquiry-actions">{contact.status === 'new' && <button className="button button-outline" disabled={busyId === contact._id} onClick={() => updateStatus(contact, 'reviewed')}>Mark reviewed</button>}{contact.status !== 'closed' && <button className="button button-outline" disabled={busyId === contact._id} onClick={() => updateStatus(contact, 'closed')}>Close enquiry</button>}{contact.status === 'closed' && <button className="button button-outline" disabled={busyId === contact._id} onClick={() => updateStatus(contact, 'new')}>Reopen</button>}</div>
      </article>)}</div>
      <div className="admin-pagination"><span>{query.data.pagination.total} enquiries</span><div><button className="button button-outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Previous</button><span>Page {page} of {Math.max(1, query.data.pagination.pages)}</span><button className="button button-outline" disabled={page >= query.data.pagination.pages} onClick={() => setPage(value => value + 1)}>Next</button></div></div>
    </> : <div className="empty-state"><h2>No enquiries yet</h2><p>New messages sent from the website contact form will appear here.</p></div>}
  </section>;
}
